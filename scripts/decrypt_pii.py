#!/usr/bin/env python3
"""Decrypt PII fields from an encrypted claim issue body.

Env vars:
  ISSUE_BODY        issue body containing [ENCRYPTED:...] placeholders
  NACL_PRIVATE_KEY  base64 Curve25519 private key (from GitHub Secrets)

Writes JSON to stdout: {"passenger_name": "...", "email": "...", "booking_reference": "..."}
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.crypto import decrypt_pii

_PAT = re.compile(
    r"^\*\*(?P<label>[^*]+):\*\* \[ENCRYPTED:(?P<ct>[^\]]+)\]$",
    re.MULTILINE,
)
_LABEL_MAP = {
    "Passenger name": "passenger_name",
    "Email": "email",
    "Booking reference": "booking_reference",
}


def decrypt_fields(body: str, private_key: str) -> dict[str, str]:
    private_key = private_key.strip()  # guard against copy-paste newlines in GitHub Secrets
    result: dict[str, str] = {}
    for m in _PAT.finditer(body):
        key = _LABEL_MAP.get(m.group("label").strip())
        if key:
            result[key] = decrypt_pii(m.group("ct"), private_key)
    return result


if __name__ == "__main__":
    body = os.environ["ISSUE_BODY"]
    priv = os.environ["NACL_PRIVATE_KEY"]
    pii = decrypt_fields(body, priv)
    if len(pii) < 3:
        print(f"Warning: only {len(pii)}/3 PII fields found", file=sys.stderr)
    print(json.dumps(pii))
