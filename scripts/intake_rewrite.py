#!/usr/bin/env python3
"""Encrypt PII fields in a claim issue body in-place.

Env vars:
  ISSUE_BODY       raw issue body text
  NACL_PUBLIC_KEY  base64 Curve25519 public key

Writes rewritten body to stdout (UTF-8).
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.crypto import encrypt_pii

_PII_LABELS = ("Passenger name", "Email", "Booking reference")
_PAT = re.compile(
    r"^(\*\*(?:" + "|".join(re.escape(f) for f in _PII_LABELS) + r"):\*\*) (.+)$",
    re.MULTILINE,
)


def rewrite(body: str, public_key: str) -> str:
    def _sub(m: re.Match) -> str:
        label, value = m.group(1), m.group(2).strip()
        if value.startswith("[ENCRYPTED:"):
            return m.group(0)
        return f"{label} [ENCRYPTED:{encrypt_pii(value, public_key)}]"

    return _PAT.sub(_sub, body)


if __name__ == "__main__":
    sys.stdout.write(rewrite(os.environ["ISSUE_BODY"], os.environ["NACL_PUBLIC_KEY"]))
