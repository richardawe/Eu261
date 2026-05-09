"""Tests for engine.eligibility — the deterministic rules engine.

All amounts and thresholds are loaded from rules/eu261-v1.yaml.
No LLM calls, no network.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from engine.eligibility import ClaimFacts, EligibilityDecision, evaluate, load_rules

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

UTC = timezone.utc

_RULES = load_rules()


def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=UTC)


def _base_facts(**overrides) -> ClaimFacts:
    """Return a minimal EU-departure, delay scenario that is eligible (3h+ delay)."""
    defaults = dict(
        flight_carrier_iata="U2",
        flight_number="U21234",
        scheduled_departure_utc=_dt("2024-06-01T10:00"),
        scheduled_arrival_utc=_dt("2024-06-01T11:30"),  # 1.5h flight LHR→AMS
        actual_arrival_utc=_dt("2024-06-01T14:35"),      # 3h 5m late
        departure_iata="LHR",
        arrival_iata="AMS",
        event_type="delay",
        is_eu_carrier=False,
        extraordinary_circumstance_confirmed=False,
    )
    defaults.update(overrides)
    return ClaimFacts.model_validate(defaults)


# ---------------------------------------------------------------------------
# Delay scenarios
# ---------------------------------------------------------------------------

class TestDelay:
    def test_3h_delay_short_haul_gives_250(self):
        # LHR→AMS ~358 km → band1 → €250
        facts = _base_facts(
            scheduled_arrival_utc=_dt("2024-06-01T11:30"),
            actual_arrival_utc=_dt("2024-06-01T14:35"),  # 3h 5m
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is True
        assert d.amount_eur == 250

    def test_4h_delay_long_haul_gives_600(self):
        # LHR→JFK ~5541 km → band3 → €600
        facts = _base_facts(
            departure_iata="LHR",
            arrival_iata="JFK",
            scheduled_arrival_utc=_dt("2024-06-01T18:00"),
            actual_arrival_utc=_dt("2024-06-01T22:05"),  # 4h 5m
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is True
        assert d.amount_eur == 600

    def test_2h59m_delay_not_eligible(self):
        facts = _base_facts(
            scheduled_arrival_utc=_dt("2024-06-01T11:30"),
            actual_arrival_utc=_dt("2024-06-01T14:29"),  # 2h 59m
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is False
        assert d.amount_eur is None

    def test_exactly_3h_delay_eligible(self):
        facts = _base_facts(
            scheduled_arrival_utc=_dt("2024-06-01T11:30"),
            actual_arrival_utc=_dt("2024-06-01T14:30"),  # exactly 3h
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is True

    def test_medium_intra_eu_gives_400(self):
        # AMS→LIS ~1866 km, intra-EU → band2_intra_eu → €400
        facts = _base_facts(
            departure_iata="AMS",
            arrival_iata="LIS",
            scheduled_arrival_utc=_dt("2024-06-01T14:00"),
            actual_arrival_utc=_dt("2024-06-01T17:05"),  # 3h 5m
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is True
        assert d.amount_eur == 400

    def test_delay_out_of_scope_non_eu_carrier_non_eu_departure(self):
        # JFK→BOS, non-EU carrier, non-EU departure → not in scope
        facts = _base_facts(
            departure_iata="JFK",
            arrival_iata="BOS",
            is_eu_carrier=False,
            scheduled_arrival_utc=_dt("2024-06-01T12:00"),
            actual_arrival_utc=_dt("2024-06-01T15:05"),  # 3h 5m
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is False
        assert "scope" in " ".join(d.reasoning_steps).lower()

    def test_delay_eu_carrier_arrives_eu_in_scope(self):
        # JFK→LHR, EU carrier → arrival at EU airport on EU carrier → in scope
        facts = _base_facts(
            departure_iata="JFK",
            arrival_iata="LHR",
            is_eu_carrier=True,
            scheduled_arrival_utc=_dt("2024-06-01T18:00"),
            actual_arrival_utc=_dt("2024-06-01T21:05"),  # 3h 5m
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is True
        assert d.amount_eur == 600  # JFK→LHR >3500 km

    def test_extraordinary_circumstance_excludes_compensation(self):
        facts = _base_facts(
            extraordinary_circumstance_confirmed=True,
            extraordinary_circumstance_claimed="ATC strike",
            actual_arrival_utc=_dt("2024-06-01T15:30"),  # 4h late
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is False
        assert d.amount_eur is None

    def test_no_actual_arrival_not_eligible(self):
        facts = _base_facts(actual_arrival_utc=None)
        d = evaluate(facts, _RULES)
        assert d.eligible is False

    def test_rule_citations_present(self):
        facts = _base_facts(
            scheduled_arrival_utc=_dt("2024-06-01T11:30"),
            actual_arrival_utc=_dt("2024-06-01T14:35"),
        )
        d = evaluate(facts, _RULES)
        assert len(d.rule_citations) >= 2  # at least scope + event + band
        assert any("scope" in c for c in d.rule_citations)
        assert any("amount" in c for c in d.rule_citations)


# ---------------------------------------------------------------------------
# Cancellation scenarios
# ---------------------------------------------------------------------------

class TestCancellation:
    def _cancel_facts(self, **overrides) -> ClaimFacts:
        defaults = dict(
            flight_carrier_iata="FR",
            flight_number="FR9001",
            scheduled_departure_utc=_dt("2024-06-15T08:00"),
            scheduled_arrival_utc=_dt("2024-06-15T10:30"),
            actual_arrival_utc=None,
            departure_iata="STN",
            arrival_iata="ALC",
            event_type="cancellation",
            is_eu_carrier=True,
            extraordinary_circumstance_confirmed=False,
        )
        defaults.update(overrides)
        return ClaimFacts.model_validate(defaults)

    def test_cancellation_7_days_notice_eligible(self):
        # 7 days notice, no rebooking info → check "not_eligible_if" clauses
        # 7-13 days clause requires rebooked info; without it, exclusion doesn't apply
        facts = self._cancel_facts(cancellation_notice_days=7)
        d = evaluate(facts, _RULES)
        assert d.eligible is True

    def test_cancellation_21_days_notice_not_eligible(self):
        facts = self._cancel_facts(cancellation_notice_days=21)
        d = evaluate(facts, _RULES)
        assert d.eligible is False

    def test_cancellation_14_days_notice_not_eligible(self):
        facts = self._cancel_facts(cancellation_notice_days=14)
        d = evaluate(facts, _RULES)
        assert d.eligible is False

    def test_cancellation_13_days_notice_eligible_no_rebook(self):
        # 13 days, no rebooking → exclusion condition requires rebook, so eligible
        facts = self._cancel_facts(cancellation_notice_days=13)
        d = evaluate(facts, _RULES)
        assert d.eligible is True

    def test_cancellation_13_days_rebooked_within_limits_not_eligible(self):
        # 13 days notice, rebooked: departs 1.5h early, arrives 3h late
        facts = self._cancel_facts(
            cancellation_notice_days=10,
            rebooked_departure_utc=_dt("2024-06-15T06:30"),  # 1.5h early
            rebooked_arrival_utc=_dt("2024-06-15T13:30"),    # 3h late
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is False

    def test_cancellation_6_days_notice_eligible_without_rebook(self):
        facts = self._cancel_facts(cancellation_notice_days=6)
        d = evaluate(facts, _RULES)
        assert d.eligible is True

    def test_cancellation_3_days_rebooked_outside_limits_eligible(self):
        # 3 days notice, rebooked but 5h late — exclusion threshold is ≤2h late
        facts = self._cancel_facts(
            cancellation_notice_days=3,
            rebooked_departure_utc=_dt("2024-06-15T07:45"),  # 15 min early
            rebooked_arrival_utc=_dt("2024-06-15T15:30"),    # 5h late → exceeds 2h limit
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is True

    def test_cancellation_extraordinary_not_eligible(self):
        facts = self._cancel_facts(
            cancellation_notice_days=1,
            extraordinary_circumstance_confirmed=True,
            extraordinary_circumstance_claimed="volcano ash cloud",
        )
        d = evaluate(facts, _RULES)
        assert d.eligible is False

    def test_cancellation_amount_short_haul(self):
        # STN→ALC ~1770 km, EU→EU → intra-EU band2 → €400? No: STN is GB, ALC is ES
        # GB and ES are both EU region → intra-EU → band2_intra_eu → €400
        facts = self._cancel_facts(cancellation_notice_days=3)
        d = evaluate(facts, _RULES)
        assert d.eligible is True
        assert d.amount_eur == 400  # STN–ALC ~1770 km, intra-EU

    def test_cancellation_50pct_reduction_when_rebooked_on_time(self):
        # Short-haul (LHR→CDG ~348 km), 3 days notice.
        # Rebooked departs 1.5h BEFORE scheduled (>1h so full Art.5(1)(c)(iii) exclusion
        # does NOT apply — that exclusion requires depart ≤1h early AND arrive ≤2h late).
        # Rebooked arrives 1h late (≤2h short-haul threshold) → Art.7(2) 50% reduction.
        # Expected: eligible with €125 (50% of €250).
        facts = ClaimFacts.model_validate(dict(
            flight_carrier_iata="BA",
            flight_number="BA304",
            scheduled_departure_utc=_dt("2024-06-15T09:00"),
            scheduled_arrival_utc=_dt("2024-06-15T11:30"),
            actual_arrival_utc=None,
            departure_iata="LHR",
            arrival_iata="CDG",
            event_type="cancellation",
            is_eu_carrier=True,
            cancellation_notice_days=3,
            rebooked_departure_utc=_dt("2024-06-15T07:30"),  # 1.5h early → fails ≤1h condition
            rebooked_arrival_utc=_dt("2024-06-15T12:30"),    # 1h late → ≤2h threshold
            extraordinary_circumstance_confirmed=False,
        ))
        d = evaluate(facts, _RULES)
        assert d.eligible is True
        assert d.amount_eur == 125  # 50% of €250


# ---------------------------------------------------------------------------
# Denied boarding
# ---------------------------------------------------------------------------

class TestDeniedBoarding:
    def test_denied_boarding_eligible(self):
        facts = ClaimFacts.model_validate(dict(
            flight_carrier_iata="LH",
            flight_number="LH100",
            scheduled_departure_utc=_dt("2024-06-15T07:00"),
            scheduled_arrival_utc=_dt("2024-06-15T09:30"),
            actual_arrival_utc=None,
            departure_iata="FRA",
            arrival_iata="LHR",
            event_type="denied_boarding",
            is_eu_carrier=True,
            extraordinary_circumstance_confirmed=False,
        ))
        d = evaluate(facts, _RULES)
        assert d.eligible is True
        # FRA→LHR ~640 km → €250
        assert d.amount_eur == 250


# ---------------------------------------------------------------------------
# Rebooked earlier
# ---------------------------------------------------------------------------

class TestRebookedEarlier:
    def test_rebooked_2h_earlier_eligible(self):
        facts = ClaimFacts.model_validate(dict(
            flight_carrier_iata="U2",
            flight_number="U21500",
            scheduled_departure_utc=_dt("2024-06-15T12:00"),
            scheduled_arrival_utc=_dt("2024-06-15T14:00"),
            actual_arrival_utc=None,
            departure_iata="LGW",
            arrival_iata="AMS",
            event_type="rebooked_earlier",
            is_eu_carrier=False,
            rebooked_departure_utc=_dt("2024-06-15T09:45"),  # 2h15m earlier
            extraordinary_circumstance_confirmed=False,
        ))
        d = evaluate(facts, _RULES)
        assert d.eligible is True

    def test_rebooked_1h_earlier_not_eligible(self):
        facts = ClaimFacts.model_validate(dict(
            flight_carrier_iata="U2",
            flight_number="U21500",
            scheduled_departure_utc=_dt("2024-06-15T12:00"),
            scheduled_arrival_utc=_dt("2024-06-15T14:00"),
            actual_arrival_utc=None,
            departure_iata="LGW",
            arrival_iata="AMS",
            event_type="rebooked_earlier",
            is_eu_carrier=False,
            rebooked_departure_utc=_dt("2024-06-15T11:10"),  # only 50 min earlier
            extraordinary_circumstance_confirmed=False,
        ))
        d = evaluate(facts, _RULES)
        assert d.eligible is False


# ---------------------------------------------------------------------------
# Reasoning and citation quality
# ---------------------------------------------------------------------------

class TestReasoningQuality:
    def test_reasoning_steps_non_empty_for_eligible(self):
        facts = _base_facts(
            scheduled_arrival_utc=_dt("2024-06-01T11:30"),
            actual_arrival_utc=_dt("2024-06-01T14:35"),
        )
        d = evaluate(facts, _RULES)
        assert len(d.reasoning_steps) >= 3

    def test_reasoning_steps_non_empty_for_ineligible(self):
        facts = _base_facts(
            scheduled_arrival_utc=_dt("2024-06-01T11:30"),
            actual_arrival_utc=_dt("2024-06-01T14:25"),  # < 3h
        )
        d = evaluate(facts, _RULES)
        assert len(d.reasoning_steps) >= 2
        assert d.eligible is False

    def test_out_of_scope_has_no_citations_except_scope(self):
        facts = _base_facts(
            departure_iata="JFK",
            arrival_iata="BOS",
            is_eu_carrier=False,
            scheduled_arrival_utc=_dt("2024-06-01T12:00"),
            actual_arrival_utc=_dt("2024-06-01T15:05"),
        )
        d = evaluate(facts, _RULES)
        assert not d.eligible
        # No amount band citation should be present
        assert not any("amount" in c for c in d.rule_citations)
