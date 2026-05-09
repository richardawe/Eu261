#!/usr/bin/env python3
"""Generate a demand letter draft and post it as an issue comment.

Triggered by .github/workflows/draft.yml after state:eligibility-passed.

Env vars:
  ISSUE_BODY           issue body text (post-encryption)
  ISSUE_NUMBER         GitHub issue number
  GITHUB_REPOSITORY    owner/repo
  GH_TOKEN             GitHub token with issues:write
  OPENROUTER_API_KEY   LLM API key
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml
from engine.drafter import draft_letter
from engine.eligibility import evaluate
from scripts.run_eligibility import _parse as parse_facts


def _gh(*args: str) -> None:
    subprocess.run(["gh", *args], check=True)


def _transition(issue: str, repo: str, to_label: str) -> None:
    _gh("issue", "edit", issue, "--add-label", to_label, "--repo", repo)
    subprocess.run(
        ["gh", "issue", "edit", issue, "--remove-label", "state:eligibility-passed",
         "--repo", repo],
        check=False,
    )


async def main() -> None:
    body = os.environ["ISSUE_BODY"]
    issue = os.environ["ISSUE_NUMBER"]
    repo = os.environ["GITHUB_REPOSITORY"]
    rules_path = Path(os.environ.get("RULES_PATH", "rules/eu261-v1.yaml"))

    def _fail(msg: str) -> None:
        _gh("issue", "comment", issue, "--repo", repo, "--body",
            f"## Draft generation failed\n\n{msg}")
        _transition(issue, repo, "state:error")
        sys.exit(1)

    try:
        facts = parse_facts(body)
    except Exception as exc:
        _fail(f"Could not parse claim facts: `{exc}`")

    with rules_path.open() as f:
        rules = yaml.safe_load(f)

    try:
        decision = evaluate(facts, rules)
    except Exception as exc:
        _fail(f"Eligibility engine error: `{exc}`")

    try:
        letter = await draft_letter(facts, decision, claim_id=issue)
    except Exception as exc:
        _fail(f"LLM error: `{exc}`")

    comment = (
        "## Draft demand letter\n\n"
        "The following letter has been drafted based on your claim details. "
        "The bracketed fields `[PASSENGER NAME]`, `[EMAIL ADDRESS]`, and "
        "`[BOOKING REFERENCE]` will be filled in from your encrypted details "
        "when the letter is submitted.\n\n"
        "---\n\n"
        f"```\n{letter}\n```\n\n"
        "---\n\n"
        "_To proceed, an operator will review this draft and add the label "
        "`state:draft-approved`. To request changes, add a comment describing "
        "what to adjust._"
    )
    _gh("issue", "comment", issue, "--repo", repo, "--body", comment)
    _transition(issue, repo, "state:draft-ready")


if __name__ == "__main__":
    asyncio.run(main())
