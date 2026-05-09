"""Receipt artifact writer.

In production (GitHub Actions) receipts are committed to a `receipts/` branch
so the full audit trail is reconstructable from git history alone.
In local development they are written to `receipts/` in the working directory.

Production branch commit is implemented in Phase 6 (adapters_runtime).
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_RECEIPTS_DIR = Path(os.getenv("RECEIPTS_DIR", "receipts"))

# Regexes for best-effort PII scrubbing from receipt payloads.
# These are applied to the serialised JSON string of the request/response.
_PII_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"), "[EMAIL]"),
    # UK/EU phone formats (very rough)
    (re.compile(r"\b(?:\+?[\d\s\-().]{9,16})\b"), "[PHONE]"),
    # Booking reference — 5-8 alphanum (may produce false positives; acceptable)
    # Not redacted here because booking refs appear in the structured non-PII header too.
]


def _redact(text: str) -> str:
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def write_receipt(
    *,
    receipt_type: str,
    claim_id: str | None,
    payload: dict[str, Any],
    redact_pii: bool = True,
) -> Path:
    """Write a receipt JSON to the receipts directory and return its path."""
    # Read at call time so tests can override via env/monkeypatch
    receipts_dir = Path(os.getenv("RECEIPTS_DIR", str(_RECEIPTS_DIR)))
    receipts_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = claim_id or "unknown"
    filename = f"{ts}_{slug}_{receipt_type}.json"
    path = receipts_dir / filename

    serialised = json.dumps(payload, indent=2, default=str)
    if redact_pii:
        serialised = _redact(serialised)

    path.write_text(serialised, encoding="utf-8")
    return path


def read_receipt(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))
