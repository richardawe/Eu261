"""GitHub Issues label-based state machine for claim lifecycle.

States are represented as GitHub label strings (format: "state:<name>").
Only the pure transition logic lives here — no GitHub API calls.
"""
from __future__ import annotations

from typing import Final

# All valid states
STATES: Final[frozenset[str]] = frozenset(
    {
        "state:intake-complete",
        "state:eligibility-passed",
        "state:eligibility-failed",
        "state:draft-ready",
        "state:draft-approved",
        "state:submitted-airline",
        "state:awaiting-airline-2",
        "state:airline-accepted",
        "state:airline-rejected",
        "state:escalated-neb",
        "state:neb-decided-won",
        "state:neb-decided-lost",
        "state:closed-won",
        "state:closed-lost",
        "state:error",
    }
)

# Valid transitions: from_state → set of allowed to_states
_TRANSITIONS: Final[dict[str, frozenset[str]]] = {
    "state:intake-complete": frozenset(
        {
            "state:eligibility-passed",
            "state:eligibility-failed",
            "state:error",
        }
    ),
    "state:eligibility-passed": frozenset(
        {
            "state:draft-ready",
            "state:error",
        }
    ),
    "state:eligibility-failed": frozenset(
        {
            "state:error",  # e.g. if we want to re-evaluate
        }
    ),
    "state:draft-ready": frozenset(
        {
            "state:draft-approved",
            "state:error",
        }
    ),
    "state:draft-approved": frozenset(
        {
            "state:submitted-airline",
            "state:error",
        }
    ),
    "state:submitted-airline": frozenset(
        {
            "state:awaiting-airline-2",
            "state:airline-accepted",
            "state:airline-rejected",
            "state:error",
        }
    ),
    "state:awaiting-airline-2": frozenset(
        {
            "state:airline-accepted",
            "state:airline-rejected",
            "state:error",
        }
    ),
    "state:airline-accepted": frozenset(
        {
            "state:closed-won",
        }
    ),
    "state:airline-rejected": frozenset(
        {
            "state:escalated-neb",
            "state:closed-lost",
            "state:error",
        }
    ),
    "state:escalated-neb": frozenset(
        {
            "state:neb-decided-won",
            "state:neb-decided-lost",
            "state:error",
        }
    ),
    "state:neb-decided-won": frozenset({"state:closed-won"}),
    "state:neb-decided-lost": frozenset({"state:closed-lost"}),
    # Terminal states — no further transitions
    "state:closed-won": frozenset(),
    "state:closed-lost": frozenset(),
    # Error is a pseudo-terminal; allows manual re-entry via any non-terminal
    "state:error": frozenset(
        {
            "state:intake-complete",
            "state:eligibility-passed",
            "state:draft-ready",
            "state:draft-approved",
            "state:submitted-airline",
            "state:awaiting-airline-2",
            "state:escalated-neb",
        }
    ),
}


class InvalidTransitionError(ValueError):
    """Raised when a requested state transition is not allowed."""


def validate_transition(from_state: str, to_state: str) -> None:
    """Raise InvalidTransitionError if the transition is illegal."""
    if from_state not in STATES:
        raise InvalidTransitionError(f"Unknown from_state: {from_state!r}")
    if to_state not in STATES:
        raise InvalidTransitionError(f"Unknown to_state: {to_state!r}")
    allowed = _TRANSITIONS.get(from_state, frozenset())
    if to_state not in allowed:
        raise InvalidTransitionError(
            f"Transition {from_state!r} → {to_state!r} is not allowed. "
            f"Allowed destinations: {sorted(allowed)}"
        )


def allowed_transitions(from_state: str) -> frozenset[str]:
    """Return the set of states reachable from *from_state*."""
    if from_state not in STATES:
        raise InvalidTransitionError(f"Unknown state: {from_state!r}")
    return _TRANSITIONS.get(from_state, frozenset())


def current_state(labels: list[str]) -> str | None:
    """Extract the single state label from a list of GitHub issue labels.

    Returns None if no state label is present.
    Raises ValueError if multiple state labels are present (should not happen).
    """
    state_labels = [lbl for lbl in labels if lbl.startswith("state:")]
    if len(state_labels) == 0:
        return None
    if len(state_labels) > 1:
        raise ValueError(
            f"Issue has multiple state labels (data inconsistency): {state_labels}"
        )
    return state_labels[0]


def next_labels(labels: list[str], to_state: str) -> list[str]:
    """Return a new label list with the current state label replaced by *to_state*.

    Validates the transition before returning.
    Raises InvalidTransitionError on illegal transitions.
    """
    from_state = current_state(labels)
    if from_state is None:
        # No prior state — only allow intake-complete as first state
        if to_state != "state:intake-complete":
            raise InvalidTransitionError(
                f"No current state; only 'state:intake-complete' is valid as first state, "
                f"not {to_state!r}"
            )
        return [lbl for lbl in labels if not lbl.startswith("state:")] + [to_state]
    validate_transition(from_state, to_state)
    return [lbl for lbl in labels if not lbl.startswith("state:")] + [to_state]
