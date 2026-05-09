"""Deterministic EU261 eligibility engine.

All threshold and amount values come from the loaded RuleSet (YAML).
No LLM calls; no network.  Pure function: evaluate(facts, rules) → decision.
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, field_validator

from engine.airports import is_eu_region, lookup
from engine.distance import great_circle_km

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

EventType = Literal["delay", "cancellation", "denied_boarding", "rebooked_earlier"]


class ClaimFacts(BaseModel):
    """Structured facts about a claim.  All structured inputs are required.
    Narrative fields (extracted by LLM) are optional at this layer.
    """

    # Core flight data
    flight_carrier_iata: str
    flight_number: str
    scheduled_departure_utc: datetime
    scheduled_arrival_utc: datetime
    departure_iata: str
    arrival_iata: str

    # Event
    event_type: EventType

    # Delay-specific (hours at destination vs scheduled arrival)
    actual_arrival_utc: datetime | None = None

    # Cancellation-specific
    cancellation_notice_days: int | None = None

    # Rebooking info (for cancellations and rebooked_earlier)
    rebooked_departure_utc: datetime | None = None
    rebooked_arrival_utc: datetime | None = None

    # Denied-boarding specific
    volunteers_solicited: bool | None = None

    # Carrier info (supplied by caller; not derived here)
    is_eu_carrier: bool = False

    # Extraordinary circumstances
    extraordinary_circumstance_claimed: str | None = None
    extraordinary_circumstance_confirmed: bool = False

    @field_validator("departure_iata", "arrival_iata", mode="before")
    @classmethod
    def _upper_iata(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("flight_carrier_iata", mode="before")
    @classmethod
    def _upper_carrier(cls, v: str) -> str:
        return v.strip().upper()


class EligibilityDecision(BaseModel):
    eligible: bool
    amount_eur: int | None
    rule_citations: list[str]
    reasoning_steps: list[str]


# ---------------------------------------------------------------------------
# Rule set loading
# ---------------------------------------------------------------------------

_RULES_DIR = Path(__file__).parent.parent / "rules"


def load_rules(path: Path | None = None) -> dict[str, Any]:
    """Load and return the raw rule YAML as a dict."""
    target = path or (_RULES_DIR / "eu261-v1.yaml")
    with target.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


# ---------------------------------------------------------------------------
# Core evaluation
# ---------------------------------------------------------------------------

def evaluate(facts: ClaimFacts, rules: dict[str, Any] | None = None) -> EligibilityDecision:
    """Evaluate *facts* against *rules* and return a deterministic decision.

    Parameters
    ----------
    facts:
        A validated ClaimFacts instance.
    rules:
        Parsed YAML rule dict.  Defaults to eu261-v1.yaml if not supplied.
    """
    if rules is None:
        rules = load_rules()

    citations: list[str] = []
    steps: list[str] = []

    # ------------------------------------------------------------------
    # Step 1: Scope check
    # ------------------------------------------------------------------
    dep_eu = is_eu_region(facts.departure_iata)
    arr_eu = is_eu_region(facts.arrival_iata)

    in_scope = False
    for scope_cond in rules["scope"]["applies_if_any"]:
        if scope_cond.get("departure_region") == "EU" and dep_eu:
            in_scope = True
            citations.append(scope_cond["id"])
            steps.append(
                f"Scope: departure airport {facts.departure_iata} is in EU region "
                f"({scope_cond['legal_basis']})"
            )
            break
        if (
            scope_cond.get("arrival_region") == "EU"
            and scope_cond.get("carrier_is_eu") is True
            and arr_eu
            and facts.is_eu_carrier
        ):
            in_scope = True
            citations.append(scope_cond["id"])
            steps.append(
                f"Scope: arrival airport {facts.arrival_iata} is in EU region and "
                f"carrier {facts.flight_carrier_iata} is EU-licensed "
                f"({scope_cond['legal_basis']})"
            )
            break

    if not in_scope:
        steps.append(
            f"Scope: departure {facts.departure_iata} (EU={dep_eu}), "
            f"arrival {facts.arrival_iata} (EU={arr_eu}), "
            f"EU carrier={facts.is_eu_carrier}. No scope condition met."
        )
        return EligibilityDecision(
            eligible=False,
            amount_eur=None,
            rule_citations=citations,
            reasoning_steps=steps,
        )

    # ------------------------------------------------------------------
    # Step 2: Extraordinary circumstances
    # ------------------------------------------------------------------
    if facts.extraordinary_circumstance_confirmed:
        steps.append(
            f"Extraordinary circumstance confirmed: "
            f"{facts.extraordinary_circumstance_claimed!r}. Compensation excluded."
        )
        citations.append("ec.confirmed")
        return EligibilityDecision(
            eligible=False,
            amount_eur=None,
            rule_citations=citations,
            reasoning_steps=steps,
        )

    # ------------------------------------------------------------------
    # Step 3: Event-type eligibility check
    # ------------------------------------------------------------------
    event = facts.event_type
    qe = rules["qualifying_events"]

    if event == "delay":
        eligible, sub_citations, sub_steps = _check_delay(facts, qe["delay"])
    elif event == "cancellation":
        eligible, sub_citations, sub_steps = _check_cancellation(facts, qe["cancellation"])
    elif event == "denied_boarding":
        eligible, sub_citations, sub_steps = _check_denied_boarding(facts, qe["denied_boarding"])
    elif event == "rebooked_earlier":
        eligible, sub_citations, sub_steps = _check_rebooked_earlier(facts, qe["rebooked_earlier"])
    else:
        return EligibilityDecision(
            eligible=False,
            amount_eur=None,
            rule_citations=citations,
            reasoning_steps=steps + [f"Unknown event type: {event!r}"],
        )

    citations.extend(sub_citations)
    steps.extend(sub_steps)

    if not eligible:
        return EligibilityDecision(
            eligible=False,
            amount_eur=None,
            rule_citations=citations,
            reasoning_steps=steps,
        )

    # ------------------------------------------------------------------
    # Step 4: Calculate distance and determine amount band
    # ------------------------------------------------------------------
    dist_km = great_circle_km(facts.departure_iata, facts.arrival_iata)
    steps.append(
        f"Distance {facts.departure_iata}→{facts.arrival_iata}: {dist_km:.0f} km"
    )

    intra_eu = dep_eu and arr_eu
    steps.append(f"Intra-EU route: {intra_eu}")

    band, amount_eur = _determine_band(dist_km, intra_eu, rules["amounts_eur"]["bands"])
    citations.append(band["id"])
    steps.append(
        f"Amount band: {band['label']} → €{amount_eur} "
        f"({band['description']}, {band['legal_basis']})"
    )

    # ------------------------------------------------------------------
    # Step 5: Check for 50% reduction (only for cancellation / rebooked_earlier)
    # ------------------------------------------------------------------
    if event in ("cancellation", "rebooked_earlier") and facts.rebooked_arrival_utc is not None:
        reduction_cfg = rules["amounts_eur"]["reduction_50pct"]
        if event in reduction_cfg.get("applies_to_events", []):
            extra_hours = _rebooked_arrival_delay_hours(
                facts.scheduled_arrival_utc, facts.rebooked_arrival_utc
            )
            threshold = _get_reduction_threshold(band["label"], reduction_cfg["thresholds"])
            if threshold is not None and extra_hours <= threshold:
                original_amount = amount_eur
                amount_eur = amount_eur // 2
                citations.append("amount.reduction_50pct")
                steps.append(
                    f"50% reduction applied: rebooked arrival is only {extra_hours:.1f}h late "
                    f"(threshold {threshold}h). €{original_amount} → €{amount_eur} "
                    f"({reduction_cfg['legal_basis']})"
                )

    return EligibilityDecision(
        eligible=True,
        amount_eur=amount_eur,
        rule_citations=citations,
        reasoning_steps=steps,
    )


# ---------------------------------------------------------------------------
# Event-specific helpers
# ---------------------------------------------------------------------------

def _check_delay(
    facts: ClaimFacts, rule: dict[str, Any]
) -> tuple[bool, list[str], list[str]]:
    citations: list[str] = []
    steps: list[str] = []
    min_hours: float = rule["min_arrival_delay_hours"]

    if facts.actual_arrival_utc is None:
        steps.append("Delay check: actual_arrival_utc not provided; cannot determine delay.")
        return False, citations, steps

    delay_hours = (
        facts.actual_arrival_utc - facts.scheduled_arrival_utc
    ).total_seconds() / 3600.0

    steps.append(
        f"Delay at destination: {delay_hours:.2f}h "
        f"(threshold: {min_hours}h per {rule['legal_basis']})"
    )

    if delay_hours >= min_hours:
        citations.append(rule["id"])
        steps.append(f"Delay ≥ {min_hours}h threshold — eligible.")
        return True, citations, steps

    steps.append(f"Delay < {min_hours}h threshold — not eligible.")
    return False, citations, steps


def _check_cancellation(
    facts: ClaimFacts, rule: dict[str, Any]
) -> tuple[bool, list[str], list[str]]:
    citations: list[str] = []
    steps: list[str] = []

    notice = facts.cancellation_notice_days

    if notice is None:
        steps.append(
            "Cancellation: notice_days not supplied; cannot evaluate exclusions — "
            "treating as eligible (worst case for airline)."
        )
        citations.append(rule["id"])
        return True, citations, steps

    rebooked_dep_early: float | None = None
    rebooked_arr_late: float | None = None

    if facts.rebooked_departure_utc is not None:
        rebooked_dep_early = max(
            0.0,
            (facts.scheduled_departure_utc - facts.rebooked_departure_utc).total_seconds()
            / 3600.0,
        )
    if facts.rebooked_arrival_utc is not None:
        rebooked_arr_late = (
            facts.rebooked_arrival_utc - facts.scheduled_arrival_utc
        ).total_seconds() / 3600.0

    for exc in rule["not_eligible_if"]:
        exc_id: str = exc["id"]
        # notice_days_gte
        if "notice_days_gte" in exc and notice < exc["notice_days_gte"]:
            continue
        if "notice_days_lt" in exc and notice >= exc["notice_days_lt"]:
            continue
        # Rebooking conditions — only apply exclusion if rebooking conditions also met
        if "rebooked_departs_hours_early_max" in exc:
            if rebooked_dep_early is None:
                # No rebooking info — exclusion doesn't apply (passenger not rebooked)
                continue
            if rebooked_dep_early > exc["rebooked_departs_hours_early_max"]:
                continue
        if "rebooked_arrives_hours_late_max" in exc:
            if rebooked_arr_late is None:
                continue
            if rebooked_arr_late > exc["rebooked_arrives_hours_late_max"]:
                continue
        # All conditions matched — exclusion applies, not eligible
        citations.append(exc_id)
        steps.append(
            f"Cancellation exclusion matched: {exc['description']} "
            f"(notice={notice}d, dep_early={rebooked_dep_early}, arr_late={rebooked_arr_late}h) "
            f"[{exc['legal_basis']}] — not eligible."
        )
        return False, citations, steps

    citations.append(rule["id"])
    steps.append(
        f"No cancellation exclusion matched (notice={notice}d) — eligible."
    )
    return True, citations, steps


def _check_denied_boarding(
    facts: ClaimFacts, rule: dict[str, Any]
) -> tuple[bool, list[str], list[str]]:
    citations: list[str] = []
    steps: list[str] = []

    if rule.get("volunteers_must_be_solicited_first") and facts.volunteers_solicited is False:
        steps.append(
            "Denied boarding: volunteers were not solicited first — "
            "this may affect eligibility; flagging for review."
        )
    citations.append(rule["id"])
    steps.append(
        f"Denied boarding: eligible (volunteers_solicited={facts.volunteers_solicited}). "
        f"[{rule['legal_basis']}]"
    )
    return True, citations, steps


def _check_rebooked_earlier(
    facts: ClaimFacts, rule: dict[str, Any]
) -> tuple[bool, list[str], list[str]]:
    citations: list[str] = []
    steps: list[str] = []
    min_hours: float = rule["min_hours_departure_earlier"]

    if facts.rebooked_departure_utc is None:
        steps.append(
            "Rebooked-earlier: rebooked_departure_utc not provided — cannot evaluate."
        )
        return False, citations, steps

    hours_early = (
        facts.scheduled_departure_utc - facts.rebooked_departure_utc
    ).total_seconds() / 3600.0

    steps.append(
        f"Rebooked {hours_early:.1f}h earlier than scheduled "
        f"(threshold: {min_hours}h per {rule['legal_basis']})"
    )

    if hours_early >= min_hours:
        citations.append(rule["id"])
        steps.append(f"Advance ≥ {min_hours}h — eligible.")
        return True, citations, steps

    steps.append(f"Advance < {min_hours}h — not eligible.")
    return False, citations, steps


# ---------------------------------------------------------------------------
# Amount-band helpers
# ---------------------------------------------------------------------------

def _determine_band(
    dist_km: float, intra_eu: bool, bands: list[dict[str, Any]]
) -> tuple[dict[str, Any], int]:
    """Return the matching band dict and the base amount in EUR."""
    for band in bands:
        min_km: float = band.get("min_distance_km", 0)
        max_km: float = band.get("max_distance_km", float("inf"))
        if dist_km < min_km or dist_km > max_km:
            continue
        intra_eu_only: bool | None = band.get("intra_eu_only")
        if intra_eu_only is True and not intra_eu:
            continue
        if intra_eu_only is False and intra_eu:
            continue
        return band, band["amount_eur"]
    # Fallback: long-haul band (should never be reached with complete rule set)
    last = bands[-1]
    return last, last["amount_eur"]


def _rebooked_arrival_delay_hours(scheduled: datetime, rebooked: datetime) -> float:
    return (rebooked - scheduled).total_seconds() / 3600.0


def _get_reduction_threshold(
    band_label: str, thresholds: list[dict[str, Any]]
) -> float | None:
    for t in thresholds:
        if t.get("band_label") == band_label:
            return float(t["max_extra_arrival_hours"])
    return None


# ---------------------------------------------------------------------------
# CLI entry point  (python -m engine.eligibility examples/sample_facts.json)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    if len(sys.argv) < 2:
        print("Usage: python -m engine.eligibility <facts.json>")
        sys.exit(1)

    facts_path = Path(sys.argv[1])
    raw = json.loads(facts_path.read_text())
    facts = ClaimFacts.model_validate(raw)
    rules = load_rules()
    decision = evaluate(facts, rules)
    print(decision.model_dump_json(indent=2))
