#!/usr/bin/env python3
"""Escalate a rejected claim to the UK CAA NEB.

Triggered by .github/workflows/escalate.yml after state:airline-rejected.

Env vars:
  ISSUE_BODY                issue body text (with encrypted PII)
  ISSUE_NUMBER              GitHub issue number
  GITHUB_REPOSITORY         owner/repo
  GH_TOKEN                  GitHub token with issues:write
  NACL_PRIVATE_KEY          base64 private key for PII decryption
  PLAYWRIGHT_SCREENSHOT_DIR optional path for debug screenshots
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.receipts import write_receipt
from nebs.uk_caa import UkCaaAdapter
from adapters.base import Pii
from scripts.decrypt_pii import decrypt_fields
from scripts.run_eligibility import _parse as parse_facts


def _gh(*args: str) -> None:
    subprocess.run(["gh", *args], check=True)


def _transition(issue: str, repo: str, to_label: str) -> None:
    _gh("issue", "edit", issue, "--add-label", to_label, "--repo", repo)
    subprocess.run(
        ["gh", "issue", "edit", issue, "--remove-label", "state:airline-rejected",
         "--repo", repo],
        check=False,
    )


def _extract_airline_reference(body: str) -> str:
    """Pull the airline reference from the submission comment if present."""
    m = re.search(r"\*\*Airline reference:\*\* `([^`]+)`", body)
    return m.group(1) if m else "UNKNOWN"


async def main() -> None:
    body = os.environ["ISSUE_BODY"]
    issue = os.environ["ISSUE_NUMBER"]
    repo = os.environ["GITHUB_REPOSITORY"]
    priv_key = os.environ["NACL_PRIVATE_KEY"]

    def _fail(msg: str) -> None:
        _gh("issue", "comment", issue, "--repo", repo, "--body",
            f"## NEB escalation failed\n\n{msg}")
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

    # Retrieve airline reference from the issue's comments
    comments_json = subprocess.run(
        ["gh", "issue", "view", issue, "--repo", repo, "--json", "comments",
         "--jq", '[.comments[] | select(.body | contains("Airline reference"))] | last | .body // ""'],
        capture_output=True, text=True,
    ).stdout.strip()
    airline_ref = _extract_airline_reference(comments_json)

    try:
        receipt = await UkCaaAdapter().escalate(facts, pii, airline_ref, letter="")
    except Exception as exc:
        _fail(
            f"CAA adapter error: `{exc}`\n\n"
            f"Screenshots are attached to the workflow run artifacts."
        )

    write_receipt(
        receipt_type="neb_escalation",
        claim_id=issue,
        payload={
            "neb": "uk_caa",
            "reference": receipt.reference,
            "submitted_at": receipt.submitted_at,
            "portal_url": receipt.portal_url,
            "airline_reference": airline_ref,
        },
    )

    portal_line = f"**CAA portal:** {receipt.portal_url}\n\n" if receipt.portal_url else ""
    _gh("issue", "comment", issue, "--repo", repo, "--body",
        f"## Escalated to UK CAA\n\n"
        f"The claim has been submitted to the Civil Aviation Authority (UK NEB).\n\n"
        f"**CAA reference:** `{receipt.reference}`\n\n"
        f"{portal_line}"
        f"_The CAA typically responds within 8 weeks._")
    _transition(issue, repo, "state:escalated-neb")


if __name__ == "__main__":
    asyncio.run(main())
