#!/usr/bin/env python3
"""Evaluate EU261 eligibility for a claim issue and post the decision.

Parses claim facts from the issue body (structured markdown fields only —
PII fields are already encrypted and are irrelevant to eligibility).
Calls the deterministic rules engine, then posts a comment and updates labels.

Env vars:
  ISSUE_BODY          full issue body text
  ISSUE_NUMBER        GitHub issue number (string)
  GITHUB_REPOSITORY   owner/repo
  GH_TOKEN            GitHub token with issues:write
  RULES_PATH          optional path to eu261 rules YAML
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml
from engine.eligibility import ClaimFacts, EligibilityDecision, evaluate

# Maps markdown bold labels → ClaimFacts field names
_FIELD_MAP: dict[str, str] = {
    "Carrier IATA": "flight_carrier_iata",
    "Flight number": "flight_number",
    "Departure airport": "departure_iata",
    "Arrival airport": "arrival_iata",
    "Scheduled departure (UTC)": "scheduled_departure_utc",
    "Scheduled arrival (UTC)": "scheduled_arrival_utc",
    "Event type": "event_type",
    "Actual arrival (UTC)": "actual_arrival_utc",
    "Cancellation notice (days)": "cancellation_notice_days",
    "Rebooked departure (UTC)": "rebooked_departure_utc",
    "Rebooked arrival (UTC)": "rebooked_arrival_utc",
}
_FIELD_PAT = re.compile(r"^\*\*([^*]+):\*\*\s*(.+)$", re.MULTILINE)
_DT_FIELDS = {
    "scheduled_departure_utc",
    "scheduled_arrival_utc",
    "actual_arrival_utc",
    "rebooked_departure_utc",
    "rebooked_arrival_utc",
}


def _parse(body: str) -> ClaimFacts:
    raw: dict = {}
    for m in _FIELD_PAT.finditer(body):
        label = m.group(1).strip()
        value = m.group(2).strip()
        key = _FIELD_MAP.get(label)
        if key is None or value.startswith("[ENCRYPTED:"):
            continue
        if key in _DT_FIELDS:
            raw[key] = value  # Pydantic coerces ISO strings
        elif key == "cancellation_notice_days":
            try:
                raw[key] = int(value)
            except ValueError:
                pass
        else:
            raw[key] = value
    return ClaimFacts(**raw)


def _format_comment(decision: EligibilityDecision) -> tuple[str, str]:
    """Return (comment_markdown, next_state_label)."""
    citations = "\n".join(f"- {c}" for c in decision.rule_citations)
    steps = "\n".join(f"- {s}" for s in decision.reasoning_steps)

    if decision.eligible:
        amt = decision.amount_eur or "TBD"
        comment = (
            f"## Eligible — €{amt} compensation\n\n"
            f"### Rule citations\n{citations}\n\n"
            f"### Reasoning\n{steps}\n\n"
            f"_Next: a draft demand letter will be prepared for your review._"
        )
        return comment, "state:eligibility-passed"

    comment = (
        f"## Not eligible under EU 261/2004\n\n"
        f"### Rule citations\n{citations}\n\n"
        f"### Reasoning\n{steps}\n\n"
        f"_This decision is based on the information provided. "
        f"If you believe this is incorrect, please add a comment with additional details._"
    )
    return comment, "state:eligibility-failed"


def _gh(*args: str) -> None:
    subprocess.run(["gh", *args], check=True)


def _transition(issue: str, repo: str, next_label: str) -> None:
    _gh("issue", "edit", issue, "--add-label", next_label, "--repo", repo)
    # Best-effort removal of previous state — don't fail the workflow if absent
    subprocess.run(
        ["gh", "issue", "edit", issue, "--remove-label", "state:intake-complete", "--repo", repo],
        check=False,
    )


def main() -> None:
    body = os.environ["ISSUE_BODY"]
    issue = os.environ["ISSUE_NUMBER"]
    repo = os.environ["GITHUB_REPOSITORY"]
    rules_path = Path(os.environ.get("RULES_PATH", "rules/eu261-v1.yaml"))

    try:
        facts = _parse(body)
    except Exception as exc:
        _gh(
            "issue", "comment", issue, "--repo", repo,
            "--body",
            f"## Eligibility check failed\n\n"
            f"Could not parse claim facts from the issue body: `{exc}`\n\n"
            f"Please ensure all required flight fields are filled in.",
        )
        _transition(issue, repo, "state:error")
        sys.exit(1)

    with rules_path.open() as f:
        rules = yaml.safe_load(f)

    try:
        decision = evaluate(facts, rules)
    except Exception as exc:
        _gh(
            "issue", "comment", issue, "--repo", repo,
            "--body", f"## Eligibility check failed\n\nEngine error: `{exc}`",
        )
        _transition(issue, repo, "state:error")
        sys.exit(1)

    comment, next_label = _format_comment(decision)
    _gh("issue", "comment", issue, "--repo", repo, "--body", comment)
    _transition(issue, repo, next_label)


if __name__ == "__main__":
    main()
