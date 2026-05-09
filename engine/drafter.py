"""Generate a demand letter draft using the OpenRouter LLM.

PII fields are replaced with bracketed placeholders ([PASSENGER NAME] etc.)
so the letter can be generated without the private key being present.
"""
from __future__ import annotations

from pathlib import Path

import yaml

from engine.eligibility import ClaimFacts, EligibilityDecision
from engine.openrouter import OpenRouterClient

_SYSTEM = """\
You are a specialist paralegal drafting EU Regulation 261/2004 demand letters.

Rules:
1. Use formal UK/EU business letter format: recipient block, [DATE], subject, body, sign-off.
2. Cite specific regulation articles — Art.7 (compensation amounts), Art.5 (cancellation \
rights), Art.9 (right to care) — as applicable to the facts.
3. Use EXACTLY these placeholders; do not invent values:
   [PASSENGER NAME], [EMAIL ADDRESS], [BOOKING REFERENCE]
4. State the exact compensation figure provided; do not recalculate it.
5. Demand payment or written response within 14 days; state that failure will result in \
referral to the relevant National Enforcement Body.
6. 350–450 words. Plain text only — no markdown, no bullet points.
7. Output ONLY the letter. No preamble, no commentary."""


def _user_prompt(facts: ClaimFacts, decision: EligibilityDecision) -> str:
    route = f"{facts.departure_iata}→{facts.arrival_iata}"
    dep = facts.scheduled_departure_utc.strftime("%d %B %Y")

    event_desc = {
        "delay": (
            f"delayed — scheduled arrival "
            f"{facts.scheduled_arrival_utc.strftime('%H:%M UTC')}, "
            f"actual arrival "
            f"{facts.actual_arrival_utc.strftime('%H:%M UTC') if facts.actual_arrival_utc else 'unknown'}"
        ),
        "cancellation": "cancelled",
        "denied_boarding": "subject to involuntary denied boarding",
        "rebooked_earlier": "rebooked to an earlier departure without adequate notice",
    }.get(facts.event_type, facts.event_type)

    citations = "; ".join(decision.rule_citations)

    return (
        f"Flight: {facts.flight_carrier_iata} {facts.flight_number}, {route}, {dep}\n"
        f"Event: The flight was {event_desc}.\n"
        f"Compensation determined: €{decision.amount_eur}\n"
        f"Applicable rules: {citations}\n\n"
        f"Address to: Customer Relations, {facts.flight_carrier_iata} "
        f"(use the IATA code as the airline name; postal address will be added later)."
    )


async def draft_letter(
    facts: ClaimFacts,
    decision: EligibilityDecision,
    *,
    models_path: Path = Path("engine/models.yaml"),
    claim_id: str | None = None,
) -> str:
    """Return the demand letter text with PII placeholders."""
    with models_path.open() as f:
        cfg = yaml.safe_load(f)
    model = cfg["drafting"]["primary"]

    async with OpenRouterClient() as client:
        resp = await client.complete(
            model,
            [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _user_prompt(facts, decision)},
            ],
            claim_id=claim_id,
        )

    return resp["choices"][0]["message"]["content"].strip()
