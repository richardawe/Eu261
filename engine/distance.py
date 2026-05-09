"""Great-circle distance between two IATA airports using geographiclib."""
from __future__ import annotations

from geographiclib.geodesic import Geodesic

from engine.airports import lookup

_WGS84 = Geodesic.WGS84


def great_circle_km(iata_a: str, iata_b: str) -> float:
    """Return great-circle distance in kilometres between two IATA airports."""
    a = lookup(iata_a)
    b = lookup(iata_b)
    result = _WGS84.Inverse(a.lat, a.lon, b.lat, b.lon)
    return result["s12"] / 1000.0
