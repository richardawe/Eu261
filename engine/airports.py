"""IATA airport lookup backed by a vendored OurAirports CSV."""
from __future__ import annotations

import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_DATA_FILE = Path(__file__).parent / "data" / "airports.csv"


@dataclass(frozen=True, slots=True)
class Airport:
    iata: str
    name: str
    lat: float
    lon: float
    country: str       # ISO 3166-1 alpha-2
    continent: str     # two-letter continent code
    region: str        # "EU" or "OTHER"


@lru_cache(maxsize=1)
def _load_db() -> dict[str, Airport]:
    db: dict[str, Airport] = {}
    with _DATA_FILE.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            iata = row["iata"].strip()
            if not iata:
                continue
            db[iata] = Airport(
                iata=iata,
                name=row["name"],
                lat=float(row["lat"]),
                lon=float(row["lon"]),
                country=row["country"],
                continent=row["continent"],
                region=row["region"],
            )
    return db


def lookup(iata: str) -> Airport:
    """Return an Airport for *iata* (case-insensitive).

    Raises KeyError if not found.
    """
    db = _load_db()
    code = iata.strip().upper()
    if code not in db:
        raise KeyError(f"Unknown IATA code: {iata!r}")
    return db[code]


def is_eu_region(iata: str) -> bool:
    return lookup(iata).region == "EU"
