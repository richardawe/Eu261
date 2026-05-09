#!/usr/bin/env python3
"""Write a claim status JSON to gh-pages/status/{issue}.json via GitHub Contents API.

Called from state-transition workflow steps so the status page can show progress.

Env vars:
  ISSUE_NUMBER         GitHub issue number (= claim ID)
  ISSUE_BODY           issue body text
  CURRENT_STATE        current state label (e.g. state:intake-complete)
  GITHUB_REPOSITORY    owner/repo
  GH_TOKEN             GitHub token with contents:write on gh-pages
"""
from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.run_eligibility import _FIELD_MAP, _FIELD_PAT

_STATE_LABELS = {
    "state:intake-complete": "Received",
    "state:eligibility-passed": "Eligible",
    "state:eligibility-failed": "Not eligible",
    "state:draft-ready": "Draft ready for review",
    "state:draft-approved": "Draft approved",
    "state:submitted-airline": "Submitted to airline",
    "state:awaiting-airline-2": "Awaiting airline follow-up",
    "state:airline-accepted": "Airline accepted",
    "state:airline-rejected": "Airline rejected",
    "state:escalated-neb": "Escalated to NEB",
    "state:neb-decided-won": "NEB ruled in your favour",
    "state:neb-decided-lost": "NEB ruled against you",
    "state:closed-won": "Closed — compensation received",
    "state:closed-lost": "Closed — unsuccessful",
    "state:error": "Processing error",
}


def _parse_flight(body: str) -> str:
    raw: dict[str, str] = {}
    for m in _FIELD_PAT.finditer(body):
        label = m.group(1).strip()
        value = m.group(2).strip()
        key = _FIELD_MAP.get(label)
        if key and not value.startswith("[ENCRYPTED:"):
            raw[key] = value
    carrier = raw.get("flight_carrier_iata", "")
    flight = raw.get("flight_number", "")
    dep = raw.get("departure_iata", "")
    arr = raw.get("arrival_iata", "")
    date = raw.get("scheduled_departure_utc", "")[:10]
    return f"{carrier} {flight} {dep}→{arr} {date}".strip()


def _push_to_gh_pages(repo: str, issue: str, payload: dict) -> None:
    content_b64 = base64.b64encode(
        json.dumps(payload, indent=2).encode()
    ).decode()
    path = f"status/{issue}.json"

    # Check if the file already exists (need its SHA for an update)
    existing = subprocess.run(
        [
            "gh", "api",
            f"repos/{repo}/contents/{path}",
            "-H", "Accept: application/vnd.github+json",
            "--jq", ".sha",
            "-f", "ref=gh-pages",
        ],
        capture_output=True, text=True,
    )
    sha = existing.stdout.strip()

    args = [
        "gh", "api",
        f"repos/{repo}/contents/{path}",
        "--method", "PUT",
        "-H", "Accept: application/vnd.github+json",
        "-f", f"message=chore: update claim #{issue} status [skip ci]",
        "-f", f"content={content_b64}",
        "-f", "branch=gh-pages",
    ]
    if sha:
        args += ["-f", f"sha={sha}"]

    subprocess.run(args, check=True)


def main() -> None:
    issue = os.environ["ISSUE_NUMBER"]
    body = os.environ["ISSUE_BODY"]
    state = os.environ["CURRENT_STATE"]
    repo = os.environ["GITHUB_REPOSITORY"]
    now = datetime.now(timezone.utc).isoformat()

    status = {
        "claim_id": issue,
        "state": state,
        "state_label": _STATE_LABELS.get(state, state),
        "flight": _parse_flight(body),
        "updated_at": now,
        "timeline": [
            {
                "state": state,
                "state_label": _STATE_LABELS.get(state, state),
                "at": now,
            }
        ],
    }

    _push_to_gh_pages(repo, issue, status)
    print(f"Status written: claim #{issue} → {state}")


if __name__ == "__main__":
    main()
