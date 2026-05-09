#!/usr/bin/env python3
"""Submit an approved claim to the airline using the appropriate adapter.

Triggered by .github/workflows/submit.yml after state:draft-approved.

Env vars:
  ISSUE_BODY                issue body (with encrypted PII)
  ISSUE_NUMBER              GitHub issue number
  GITHUB_REPOSITORY         owner/repo
  GH_TOKEN                  GitHub token with issues:write
  NACL_PRIVATE_KEY          base64 private key for PII decryption
  DRAFT_LETTER              approved demand letter text
  PLAYWRIGHT_SCREENSHOT_DIR optional path for debug screenshots
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from adapters import get_adapter
from adapters.base import Pii
from engine.receipts import write_receipt
from scripts.decrypt_pii import decrypt_fields
from scripts.run_eligibility import _parse as parse_facts


def _gh(*args: str) -> None:
    subprocess.run(["gh", *args], check=True)


def _transition(issue: str, repo: str, to_label: str) -> None:
    _gh("issue", "edit", issue, "--add-label", to_label, "--repo", repo)
    subprocess.run(
        ["gh", "issue", "edit", issue, "--remove-label", "state:draft-approved",
         "--repo", repo],
        check=False,
    )


async def main() -> None:
    body = os.environ["ISSUE_BODY"]
    issue = os.environ["ISSUE_NUMBER"]
    repo = os.environ["GITHUB_REPOSITORY"]
    priv_key = os.environ["NACL_PRIVATE_KEY"]
    letter = os.environ.get("DRAFT_LETTER", "")

    def _fail(msg: str) -> None:
        _gh("issue", "comment", issue, "--repo", repo, "--body",
            f"## Submission failed\n\n{msg}")
        _transition(issue, repo, "state:error")
        sys.exit(1)

    try:
        facts = parse_facts(body)
    except Exception as exc:
        _fail(f"Could not parse claim facts: `{exc}`")

    try:
        pii_dict = decrypt_fields(body, priv_key)
        pii = Pii(**pii_dict)
    except Exception as exc:
        _fail(f"Could not decrypt PII: `{exc}`")

    adapter_cls = get_adapter(facts.flight_carrier_iata)
    if adapter_cls is None:
        _fail(
            f"No adapter available for carrier `{facts.flight_carrier_iata}`. "
            f"Manual submission required.\n\n"
            f"Supported carriers: U2 (easyJet), FR (Ryanair)."
        )

    try:
        receipt = await adapter_cls().submit(facts, pii, letter)
    except Exception as exc:
        _fail(
            f"Adapter error: `{exc}`\n\n"
            f"Debug screenshots (if enabled) are attached to the workflow run artifacts."
        )

    write_receipt(
        receipt_type="airline_submission",
        claim_id=issue,
        payload={
            "airline_reference": receipt.airline_reference,
            "submitted_at": receipt.submitted_at,
            "confirmation_url": receipt.confirmation_url,
            "carrier": facts.flight_carrier_iata,
        },
    )

    confirm_url_line = (
        f"**Confirmation URL:** {receipt.confirmation_url}\n\n"
        if receipt.confirmation_url else ""
    )
    _gh("issue", "comment", issue, "--repo", repo, "--body",
        f"## Submitted to airline\n\n"
        f"The claim has been filed with {facts.flight_carrier_iata}.\n\n"
        f"**Airline reference:** `{receipt.airline_reference}`\n\n"
        f"{confirm_url_line}"
        f"_The airline has 14 days to respond. "
        f"If no response is received, the claim will be escalated to the NEB._")
    _transition(issue, repo, "state:submitted-airline")


if __name__ == "__main__":
    asyncio.run(main())
