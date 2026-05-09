"""Tests for engine.state — label-based state machine."""
import pytest

from engine.state import (
    InvalidTransitionError,
    allowed_transitions,
    current_state,
    next_labels,
    validate_transition,
)


# ---------------------------------------------------------------------------
# validate_transition
# ---------------------------------------------------------------------------

class TestValidTransitions:
    def test_intake_to_eligibility_passed(self):
        validate_transition("state:intake-complete", "state:eligibility-passed")

    def test_intake_to_eligibility_failed(self):
        validate_transition("state:intake-complete", "state:eligibility-failed")

    def test_intake_to_error(self):
        validate_transition("state:intake-complete", "state:error")

    def test_eligibility_passed_to_draft_ready(self):
        validate_transition("state:eligibility-passed", "state:draft-ready")

    def test_draft_ready_to_draft_approved(self):
        validate_transition("state:draft-ready", "state:draft-approved")

    def test_draft_approved_to_submitted(self):
        validate_transition("state:draft-approved", "state:submitted-airline")

    def test_submitted_to_awaiting_2(self):
        validate_transition("state:submitted-airline", "state:awaiting-airline-2")

    def test_submitted_to_accepted(self):
        validate_transition("state:submitted-airline", "state:airline-accepted")

    def test_submitted_to_rejected(self):
        validate_transition("state:submitted-airline", "state:airline-rejected")

    def test_awaiting_2_to_accepted(self):
        validate_transition("state:awaiting-airline-2", "state:airline-accepted")

    def test_awaiting_2_to_rejected(self):
        validate_transition("state:awaiting-airline-2", "state:airline-rejected")

    def test_accepted_to_closed_won(self):
        validate_transition("state:airline-accepted", "state:closed-won")

    def test_rejected_to_escalated_neb(self):
        validate_transition("state:airline-rejected", "state:escalated-neb")

    def test_rejected_to_closed_lost(self):
        validate_transition("state:airline-rejected", "state:closed-lost")

    def test_escalated_to_neb_decided_won(self):
        validate_transition("state:escalated-neb", "state:neb-decided-won")

    def test_escalated_to_neb_decided_lost(self):
        validate_transition("state:escalated-neb", "state:neb-decided-lost")

    def test_neb_decided_won_to_closed_won(self):
        validate_transition("state:neb-decided-won", "state:closed-won")

    def test_neb_decided_lost_to_closed_lost(self):
        validate_transition("state:neb-decided-lost", "state:closed-lost")

    def test_error_to_intake(self):
        validate_transition("state:error", "state:intake-complete")


class TestInvalidTransitions:
    def test_intake_to_draft(self):
        with pytest.raises(InvalidTransitionError):
            validate_transition("state:intake-complete", "state:draft-ready")

    def test_intake_to_submitted(self):
        with pytest.raises(InvalidTransitionError):
            validate_transition("state:intake-complete", "state:submitted-airline")

    def test_closed_won_to_anything(self):
        with pytest.raises(InvalidTransitionError):
            validate_transition("state:closed-won", "state:intake-complete")

    def test_closed_lost_to_anything(self):
        with pytest.raises(InvalidTransitionError):
            validate_transition("state:closed-lost", "state:eligibility-passed")

    def test_eligibility_failed_to_draft(self):
        with pytest.raises(InvalidTransitionError):
            validate_transition("state:eligibility-failed", "state:draft-ready")

    def test_airline_accepted_to_rejected(self):
        with pytest.raises(InvalidTransitionError):
            validate_transition("state:airline-accepted", "state:airline-rejected")

    def test_unknown_from_state(self):
        with pytest.raises(InvalidTransitionError, match="Unknown from_state"):
            validate_transition("state:nonexistent", "state:intake-complete")

    def test_unknown_to_state(self):
        with pytest.raises(InvalidTransitionError, match="Unknown to_state"):
            validate_transition("state:intake-complete", "state:nonexistent")


# ---------------------------------------------------------------------------
# current_state
# ---------------------------------------------------------------------------

class TestCurrentState:
    def test_extracts_state_label(self):
        labels = ["claim", "state:intake-complete", "carrier:FR"]
        assert current_state(labels) == "state:intake-complete"

    def test_returns_none_if_no_state(self):
        assert current_state(["claim", "bug"]) is None

    def test_raises_on_multiple_states(self):
        labels = ["state:intake-complete", "state:draft-ready"]
        with pytest.raises(ValueError, match="multiple state labels"):
            current_state(labels)

    def test_empty_labels(self):
        assert current_state([]) is None


# ---------------------------------------------------------------------------
# next_labels
# ---------------------------------------------------------------------------

class TestNextLabels:
    def test_replaces_state_label(self):
        labels = ["claim", "state:intake-complete", "carrier:U2"]
        result = next_labels(labels, "state:eligibility-passed")
        assert "state:eligibility-passed" in result
        assert "state:intake-complete" not in result
        assert "claim" in result
        assert "carrier:U2" in result

    def test_only_one_state_in_result(self):
        labels = ["state:draft-ready"]
        result = next_labels(labels, "state:draft-approved")
        state_labels = [l for l in result if l.startswith("state:")]
        assert len(state_labels) == 1

    def test_first_transition_no_prior_state(self):
        labels = ["claim", "carrier:FR"]
        result = next_labels(labels, "state:intake-complete")
        assert "state:intake-complete" in result

    def test_illegal_first_transition_raises(self):
        with pytest.raises(InvalidTransitionError):
            next_labels(["claim"], "state:draft-ready")

    def test_illegal_transition_raises(self):
        with pytest.raises(InvalidTransitionError):
            next_labels(["state:intake-complete"], "state:submitted-airline")


# ---------------------------------------------------------------------------
# allowed_transitions
# ---------------------------------------------------------------------------

class TestAllowedTransitions:
    def test_intake_has_correct_transitions(self):
        allowed = allowed_transitions("state:intake-complete")
        assert "state:eligibility-passed" in allowed
        assert "state:eligibility-failed" in allowed
        assert "state:draft-ready" not in allowed

    def test_terminal_state_has_no_transitions(self):
        assert allowed_transitions("state:closed-won") == frozenset()
        assert allowed_transitions("state:closed-lost") == frozenset()

    def test_unknown_state_raises(self):
        with pytest.raises(InvalidTransitionError, match="Unknown state"):
            allowed_transitions("state:bogus")
