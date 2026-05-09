"""Tests for engine.distance — great-circle calculations.

Reference distances from published airline sources / OurAirports data.
All tolerances are ±1% (10 km for most routes).
"""
import pytest

from engine.distance import great_circle_km


@pytest.mark.parametrize(
    "iata_a, iata_b, expected_km, description",
    [
        # Short-haul European routes
        ("LHR", "CDG", 348, "London–Paris"),
        ("AMS", "FRA", 367, "Amsterdam–Frankfurt"),
        ("MAD", "BCN", 484, "Madrid–Barcelona"),
        # Medium-haul
        ("LHR", "MAD", 1243, "London–Madrid"),
        ("CDG", "FCO", 1102, "Paris–Rome"),
        ("AMS", "LIS", 1847, "Amsterdam–Lisbon (>1500 km)"),
        # Long-haul (>3500 km)
        ("LHR", "JFK", 5555, "London–New York"),
        ("CDG", "DXB", 5245, "Paris–Dubai"),
        ("AMS", "SIN", 10517, "Amsterdam–Singapore"),
        # Near the 1500 km band boundary
        ("LHR", "ATH", 2430, "London–Athens (~2400 km, band2)"),
    ],
)
def test_great_circle_within_1pct(
    iata_a: str, iata_b: str, expected_km: float, description: str
) -> None:
    result = great_circle_km(iata_a, iata_b)
    tolerance = expected_km * 0.01
    assert abs(result - expected_km) <= tolerance, (
        f"{description}: got {result:.0f} km, expected {expected_km} km "
        f"(±{tolerance:.0f} km)"
    )


def test_symmetry() -> None:
    """Distance A→B must equal distance B→A."""
    d1 = great_circle_km("LHR", "JFK")
    d2 = great_circle_km("JFK", "LHR")
    assert abs(d1 - d2) < 0.001


def test_unknown_iata_raises() -> None:
    with pytest.raises(KeyError, match="Unknown IATA"):
        great_circle_km("LHR", "ZZZ")


def test_same_airport_is_zero() -> None:
    assert great_circle_km("LHR", "LHR") == pytest.approx(0.0, abs=0.1)
