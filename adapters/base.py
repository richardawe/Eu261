"""Abstract base class and shared types for airline claim submission adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone

from engine.eligibility import ClaimFacts


@dataclass
class Pii:
    """Decrypted PII needed to submit the claim on the claimant's behalf."""
    passenger_name: str
    email: str
    booking_reference: str


@dataclass
class SubmissionReceipt:
    """Record of a successful submission to an airline."""
    airline_reference: str
    submitted_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    confirmation_url: str | None = None
    extra: dict = field(default_factory=dict)


class AirlineAdapter(ABC):
    """Submit a claim to an airline and return a receipt."""

    @abstractmethod
    async def submit(
        self,
        facts: ClaimFacts,
        pii: Pii,
        letter: str,
    ) -> SubmissionReceipt: ...
