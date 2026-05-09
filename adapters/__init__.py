"""Airline adapter registry.

Maps carrier IATA codes to the adapter class that handles claim submission.
Add new carriers by importing their adapter and adding the code here.
"""
from __future__ import annotations

from adapters.easyjet import EasyJetAdapter
from adapters.ryanair import RyanairAdapter
from adapters.base import AirlineAdapter

_REGISTRY: dict[str, type[AirlineAdapter]] = {
    "U2": EasyJetAdapter,   # easyJet
    "EZY": EasyJetAdapter,
    "FR": RyanairAdapter,   # Ryanair
    "RYR": RyanairAdapter,
}


def get_adapter(carrier_iata: str) -> type[AirlineAdapter] | None:
    """Return the adapter class for *carrier_iata*, or None if unsupported."""
    return _REGISTRY.get(carrier_iata.upper())
