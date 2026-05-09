"""Tests for scripts/intake_rewrite.py and scripts/run_eligibility.py logic."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.crypto import decrypt_pii, generate_keypair
from scripts.intake_rewrite import rewrite
from scripts.run_eligibility import _format_comment, _parse


# ─────────────────────────────────────────────
# intake_rewrite
# ─────────────────────────────────────────────

_SAMPLE_BODY = """\
## Flight details

**Carrier IATA:** U2
**Flight number:** EZY1234
**Departure airport:** LHR
**Arrival airport:** AMS
**Scheduled departure (UTC):** 2024-06-01T10:00
**Scheduled arrival (UTC):** 2024-06-01T11:30
**Event type:** delay

**Actual arrival (UTC):** 2024-06-01T14:45

## Passenger details (PII — encrypted by intake workflow)

**Passenger name:** Jane Smith
**Email:** jane@example.com
**Booking reference:** ABC123

## Narrative

The plane was delayed due to a technical fault.
"""


class TestIntakeRewrite:
    def setup_method(self):
        self.pub, self.priv = generate_keypair()

    def test_pii_fields_are_encrypted(self):
        result = rewrite(_SAMPLE_BODY, self.pub)
        assert "Jane Smith" not in result
        assert "jane@example.com" not in result
        assert "ABC123" not in result

    def test_non_pii_fields_unchanged(self):
        result = rewrite(_SAMPLE_BODY, self.pub)
        assert "U2" in result
        assert "EZY1234" in result
        assert "LHR" in result

    def test_encrypted_marker_present(self):
        result = rewrite(_SAMPLE_BODY, self.pub)
        assert "[ENCRYPTED:" in result

    def test_roundtrip_decryptable(self):
        import re
        result = rewrite(_SAMPLE_BODY, self.pub)
        # Extract ciphertext for Passenger name
        m = re.search(r"\*\*Passenger name:\*\* \[ENCRYPTED:([^\]]+)\]", result)
        assert m, "Encrypted passenger name not found"
        assert decrypt_pii(m.group(1), self.priv) == "Jane Smith"

    def test_already_encrypted_not_double_encrypted(self):
        once = rewrite(_SAMPLE_BODY, self.pub)
        twice = rewrite(once, self.pub)
        # Applying rewrite a second time should not change the body
        assert once == twice

    def test_narrative_not_modified(self):
        result = rewrite(_SAMPLE_BODY, self.pub)
        assert "technical fault" in result


# ─────────────────────────────────────────────
# run_eligibility — _parse
# ─────────────────────────────────────────────

_ENCRYPTED_BODY = """\
## Flight details

**Carrier IATA:** U2
**Flight number:** EZY1234
**Departure airport:** LHR
**Arrival airport:** AMS
**Scheduled departure (UTC):** 2024-06-01T10:00
**Scheduled arrival (UTC):** 2024-06-01T11:30
**Event type:** delay

**Actual arrival (UTC):** 2024-06-01T14:45

## Passenger details (PII — encrypted by intake workflow)

**Passenger name:** [ENCRYPTED:abc123==]
**Email:** [ENCRYPTED:def456==]
**Booking reference:** [ENCRYPTED:ghi789==]
"""


class TestParse:
    def test_parses_carrier(self):
        facts = _parse(_ENCRYPTED_BODY)
        assert facts.flight_carrier_iata == "U2"

    def test_parses_airports(self):
        facts = _parse(_ENCRYPTED_BODY)
        assert facts.departure_iata == "LHR"
        assert facts.arrival_iata == "AMS"

    def test_parses_datetime(self):
        from datetime import datetime
        facts = _parse(_ENCRYPTED_BODY)
        assert facts.scheduled_departure_utc == datetime(2024, 6, 1, 10, 0)

    def test_parses_actual_arrival(self):
        from datetime import datetime
        facts = _parse(_ENCRYPTED_BODY)
        assert facts.actual_arrival_utc == datetime(2024, 6, 1, 14, 45)

    def test_encrypted_pii_skipped(self):
        facts = _parse(_ENCRYPTED_BODY)
        # PII fields are not on ClaimFacts — confirm parse doesn't crash
        assert facts.flight_carrier_iata == "U2"

    def test_cancellation_notice_days_coerced(self):
        body = _ENCRYPTED_BODY.replace(
            "**Event type:** delay",
            "**Event type:** cancellation\n\n**Cancellation notice (days):** 5",
        ).replace("**Actual arrival (UTC):** 2024-06-01T14:45\n\n", "")
        facts = _parse(body)
        assert facts.cancellation_notice_days == 5

    def test_missing_required_field_raises(self):
        body = "**Event type:** delay\n"  # missing everything else
        with pytest.raises(Exception):
            _parse(body)


# ─────────────────────────────────────────────
# run_eligibility — _format_comment
# ─────────────────────────────────────────────

class TestFormatComment:
    def _decision(self, eligible, amount=None, citations=None, steps=None):
        from engine.eligibility import EligibilityDecision
        return EligibilityDecision(
            eligible=eligible,
            amount_eur=amount,
            rule_citations=citations or ["Art.7(1)(a)"],
            reasoning_steps=steps or ["Distance < 1500 km"],
        )

    def test_eligible_comment_contains_amount(self):
        comment, label = _format_comment(self._decision(True, amount=250))
        assert "250" in comment
        assert label == "state:eligibility-passed"

    def test_ineligible_comment_and_label(self):
        comment, label = _format_comment(self._decision(False))
        assert "Not eligible" in comment
        assert label == "state:eligibility-failed"

    def test_comment_contains_citations(self):
        comment, _ = _format_comment(self._decision(True, 400, citations=["Art.7(1)(b)"]))
        assert "Art.7(1)(b)" in comment

    def test_comment_contains_reasoning(self):
        comment, _ = _format_comment(
            self._decision(False, steps=["Departure not in EU region"])
        )
        assert "Departure not in EU region" in comment
