"""LLM-based fact extractor.

Turns a passenger's free-text narrative into the subset of ClaimFacts fields
that cannot be reliably captured by a structured form.  Structured inputs
(flight number, dates, airports) always override anything the LLM produces.

The LLM is NEVER asked to decide eligibility or compute amounts.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ValidationError

from engine.eligibility import ClaimFacts
from engine.openrouter import OpenRouterClient, load_model_config

# ---------------------------------------------------------------------------
# Return types
# ---------------------------------------------------------------------------


class ExtractionFailed(BaseModel):
    reason: str
    raw_output: str
    attempt_models: list[str]


ExtractionResult = ClaimFacts | ExtractionFailed

# ---------------------------------------------------------------------------
# Fields the LLM is allowed to populate (everything else comes from the form)
# ---------------------------------------------------------------------------

_LLM_FIELDS = {
    "event_type",
    "actual_arrival_utc",
    "extraordinary_circumstance_claimed",
    "extraordinary_circumstance_confirmed",
    "cancellation_notice_days",
    "rebooked_departure_utc",
    "rebooked_arrival_utc",
    "volunteers_solicited",
}

# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a data-extraction assistant for EU flight disruption claims.
Your ONLY job is to extract factual information from the passenger's narrative.
You must NOT decide whether a claim is eligible or what compensation is owed.
You must NOT invent facts that are not stated or clearly implied.
You must return a single valid JSON object matching the schema below.

SCHEMA (all fields optional unless marked required):
{
  "event_type": "<required: one of delay|cancellation|denied_boarding|rebooked_earlier>",
  "actual_arrival_utc": "<ISO 8601 UTC datetime or null — when the plane actually arrived>",
  "extraordinary_circumstance_claimed": "<string or null — exact reason given by airline, if any>",
  "extraordinary_circumstance_confirmed": <boolean — true only if the narrative clearly states \
an event beyond the airline's control (e.g. volcanic ash, ATC strike); \
false for routine technical faults or airline strikes>,
  "cancellation_notice_days": <integer or null — days before departure the cancellation was communicated>,
  "rebooked_departure_utc": "<ISO 8601 UTC datetime or null — rebooked flight departure>",
  "rebooked_arrival_utc": "<ISO 8601 UTC datetime or null — rebooked flight arrival>",
  "volunteers_solicited": <boolean or null — for denied boarding: were volunteers asked first>
}

RULES:
1. Output ONLY the JSON object, no prose, no markdown fences.
2. Use null for unknown fields.
3. All datetime values must include a UTC offset (append Z if the narrative implies UTC/local \
and no offset is given).
4. Do NOT add an "eligible" field, an "amount" field, or any eligibility reasoning.
5. "extraordinary_circumstance_confirmed" = true only for clearly extraordinary events \
(weather above airline planning thresholds, ATC strikes, security incidents, \
bird strikes). Routine technical faults, airline staff strikes, and crew \
shortages are NOT extraordinary per CJEU case law — set false for these.
"""

_FEW_SHOT_EXAMPLES: list[dict[str, str]] = [
    {
        "role": "user",
        "content": (
            "My easyJet flight from LGW to AMS on 12 March 2024 was delayed. "
            "We were supposed to land at 14:30 but didn't touch down until 18:05. "
            "The captain said there was a technical problem with the aircraft."
        ),
    },
    {
        "role": "assistant",
        "content": json.dumps(
            {
                "event_type": "delay",
                "actual_arrival_utc": "2024-03-12T18:05:00Z",
                "extraordinary_circumstance_claimed": "technical problem with the aircraft",
                "extraordinary_circumstance_confirmed": False,
                "cancellation_notice_days": None,
                "rebooked_departure_utc": None,
                "rebooked_arrival_utc": None,
                "volunteers_solicited": None,
            }
        ),
    },
    {
        "role": "user",
        "content": (
            "Ryanair cancelled my STN-BCN flight the evening before departure — "
            "so about 12 hours' notice. They put me on a flight the next morning "
            "departing at 06:00 instead of my original 07:30, arriving BCN at 09:30 "
            "versus my original 10:00. The reason given was ATC restrictions."
        ),
    },
    {
        "role": "assistant",
        "content": json.dumps(
            {
                "event_type": "cancellation",
                "actual_arrival_utc": None,
                "extraordinary_circumstance_claimed": "ATC restrictions",
                "extraordinary_circumstance_confirmed": True,
                "cancellation_notice_days": 0,
                "rebooked_departure_utc": "2024-01-01T06:00:00Z",
                "rebooked_arrival_utc": "2024-01-01T09:30:00Z",
                "volunteers_solicited": None,
            }
        ),
    },
    {
        "role": "user",
        "content": (
            "I was denied boarding on my BA flight LHR-CDG because it was overbooked. "
            "They did ask first for volunteers but nobody came forward, then they "
            "bumped me. I am absolutely entitled to €250 compensation."
        ),
    },
    {
        "role": "assistant",
        "content": json.dumps(
            {
                "event_type": "denied_boarding",
                "actual_arrival_utc": None,
                "extraordinary_circumstance_claimed": None,
                "extraordinary_circumstance_confirmed": False,
                "cancellation_notice_days": None,
                "rebooked_departure_utc": None,
                "rebooked_arrival_utc": None,
                "volunteers_solicited": True,
            }
        ),
    },
    {
        "role": "user",
        "content": (
            "Wizz Air moved my flight forward by 3 hours without telling me until "
            "I got the email two days before. My original departure was 15:00, "
            "the new one is 12:00, arriving at 14:30 instead of 17:30."
        ),
    },
    {
        "role": "assistant",
        "content": json.dumps(
            {
                "event_type": "rebooked_earlier",
                "actual_arrival_utc": None,
                "extraordinary_circumstance_claimed": None,
                "extraordinary_circumstance_confirmed": False,
                "cancellation_notice_days": None,
                "rebooked_departure_utc": "2024-01-01T12:00:00Z",
                "rebooked_arrival_utc": "2024-01-01T14:30:00Z",
                "volunteers_solicited": None,
            }
        ),
    },
]

# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------


async def extract_facts(
    narrative: str,
    structured_inputs: dict[str, Any],
    *,
    claim_id: str | None = None,
    client: OpenRouterClient | None = None,
) -> ExtractionResult:
    """Extract narrative-only fields and merge with authoritative structured inputs.

    Parameters
    ----------
    narrative:
        Free-text passenger description.
    structured_inputs:
        Form fields already collected (flight number, dates, airports, etc.).
        These override anything the LLM extracts.
    claim_id:
        Used for receipt filenames.
    client:
        Optional pre-constructed OpenRouterClient (useful in tests / callers
        that manage the session lifecycle).
    """
    models = load_model_config()
    primary = models["extraction"]["primary"]
    fallback = models["extraction"]["fallback"]

    messages = _build_messages(narrative)

    # Two-attempt strategy: primary model, then fallback on validation failure.
    attempt_models: list[str] = []

    async def _try(model: str, raw: str | None = None) -> ExtractionResult:
        attempt_models.append(model)
        if raw is None:
            raw = await _call(model, messages, claim_id=claim_id, client=client)
        return _parse_and_merge(raw, structured_inputs, attempt_models)

    result = await _try(primary)
    if isinstance(result, ExtractionFailed):
        # First attempt failed — retry with fallback model
        result = await _try(fallback)

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_messages(narrative: str) -> list[dict[str, str]]:
    return (
        [{"role": "system", "content": _SYSTEM_PROMPT}]
        + _FEW_SHOT_EXAMPLES
        + [{"role": "user", "content": narrative.strip()}]
    )


async def _call(
    model: str,
    messages: list[dict[str, str]],
    *,
    claim_id: str | None,
    client: OpenRouterClient | None,
) -> str:
    response_format = {"type": "json_object"}
    if client is not None:
        resp = await client.complete(
            model,
            messages,
            response_format=response_format,
            claim_id=claim_id,
        )
    else:
        async with OpenRouterClient() as c:
            resp = await c.complete(
                model,
                messages,
                response_format=response_format,
                claim_id=claim_id,
            )

    # Standard OpenAI-compatible response shape
    return resp["choices"][0]["message"]["content"]


def _parse_and_merge(
    raw: str,
    structured_inputs: dict[str, Any],
    attempt_models: list[str],
) -> ExtractionResult:
    """Parse LLM JSON, drop disallowed fields, merge with structured inputs."""
    try:
        extracted: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        return ExtractionFailed(
            reason="LLM returned non-JSON output",
            raw_output=raw,
            attempt_models=list(attempt_models),
        )

    # Strip any fields the LLM was forbidden from producing
    allowed = {k: v for k, v in extracted.items() if k in _LLM_FIELDS}

    # Parse datetime strings that the LLM may have returned
    for dt_field in (
        "actual_arrival_utc",
        "rebooked_departure_utc",
        "rebooked_arrival_utc",
    ):
        val = allowed.get(dt_field)
        if val and isinstance(val, str):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                allowed[dt_field] = dt
            except ValueError:
                allowed[dt_field] = None

    # Structured inputs always win — merge with LLM-extracted fields as base
    merged = {**allowed, **structured_inputs}

    # Convert any string datetimes that arrived in structured_inputs
    for dt_field in (
        "scheduled_departure_utc",
        "scheduled_arrival_utc",
        "actual_arrival_utc",
        "rebooked_departure_utc",
        "rebooked_arrival_utc",
    ):
        val = merged.get(dt_field)
        if val and isinstance(val, str):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                merged[dt_field] = dt
            except ValueError:
                pass

    try:
        return ClaimFacts.model_validate(merged)
    except ValidationError as exc:
        return ExtractionFailed(
            reason=f"Pydantic validation failed: {exc}",
            raw_output=raw,
            attempt_models=list(attempt_models),
        )
