# EU261 Auto-Claim Agent

Agentic system that files EU Regulation 261/2004 flight delay and cancellation
compensation claims on behalf of passengers.

> **Status: Phase 1 complete — deterministic rules engine.**
> Phases 2–12 are in progress.

## What it does

- Evaluates claim eligibility using a deterministic Python rules engine against
  a versioned YAML rule set (no LLM eligibility decisions).
- Extracts structured facts from a passenger's free-text narrative via LLM.
- Manages claim lifecycle as GitHub Issues with encrypted PII.
- Submits claims to airlines via web-form, email, or API adapters.
- Escalates to National Enforcement Bodies (UK CAA initially) on rejection.
- Exposes a JSON API for AI agent callers with JWT consent tokens.

## Non-negotiables

- Eligibility is decided by code, not AI.
- All thresholds and amounts live in `rules/`, never hardcoded.
- Human must confirm before any submission.
- PII is libsodium-encrypted in GitHub Issues.
- No fees, no commission, no payment handling.

## Quick start (developers)

```bash
# Install dependencies
pip install -e ".[dev]"

# Run the deterministic eligibility engine on a sample claim
python -m engine.eligibility examples/sample_facts.json

# Run all tests
pytest

# Run with coverage
pytest --cov=engine --cov=workflows_lib --cov-report=term-missing
```

## Repository layout

```
rules/             Versioned YAML rule sets (thresholds, amounts, limitation periods)
engine/            Deterministic eligibility engine, LLM extractor, crypto, state machine
adapters/          Per-airline YAML adapter configs
adapters_runtime/  Playwright/SMTP/HTTP adapter runtimes
workflows_lib/     Python called by GitHub Actions workflows
api/               Agent API (OpenAPI spec + handlers)
site/              GitHub Pages static site
tests/             pytest test suite
.github/           Issue templates and Actions workflows
docs/              Architecture, adapter authoring, agent API guides
```

## Architecture

See `docs/architecture.md` for the full data-flow diagram.

## Adding an airline adapter

See `docs/adapter-authoring.md`.

## Agent API

See `docs/agent-api.md` for the consent-token flow and OpenAPI spec.

## License

MIT — see `LICENSE`. Not legal advice. See `TERMS.md`.
