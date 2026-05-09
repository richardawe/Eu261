"""Tests for engine.extractor — LLM-based fact extraction.

Unit tests mock OpenRouter with respx.
The live test (marked @pytest.mark.live) is skipped unless OPENROUTER_API_KEY is set.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx

from engine.eligibility import ClaimFacts
from engine.extractor import ExtractionFailed, extract_facts

UTC = timezone.utc


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=UTC)


_BASE_STRUCTURED = {
    "flight_carrier_iata": "U2",
    "flight_number": "U21234",
    "scheduled_departure_utc": _dt("2024-06-01T10:00"),
    "scheduled_arrival_utc": _dt("2024-06-01T11:30"),
    "departure_iata": "LHR",
    "arrival_iata": "AMS",
    "is_eu_carrier": False,
    # extraordinary_circumstance_confirmed is an LLM-only field;
    # the intake form never sets it, so it must not be in structured_inputs.
}


def _or_response(content: dict | str) -> dict:
    """Build a minimal OpenRouter-compatible response dict."""
    if not isinstance(content, str):
        content = json.dumps(content)
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": content,
                }
            }
        ],
        "model": "google/gemma-2-9b-it:free",
        "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150},
    }


# ---------------------------------------------------------------------------
# Unit tests — mocked OpenRouter
# ---------------------------------------------------------------------------


@respx.mock
@pytest.mark.asyncio
async def test_clean_delay_narrative(tmp_path, monkeypatch):
    """Happy-path: narrative says plane landed 3h 35m late."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    llm_content = {
        "event_type": "delay",
        "actual_arrival_utc": "2024-06-01T15:05:00Z",
        "extraordinary_circumstance_claimed": None,
        "extraordinary_circumstance_confirmed": False,
        "cancellation_notice_days": None,
        "rebooked_departure_utc": None,
        "rebooked_arrival_utc": None,
        "volunteers_solicited": None,
    }
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_or_response(llm_content))
    )

    result = await extract_facts(
        narrative="My easyJet landed at 15:05 instead of 11:30.",
        structured_inputs=_BASE_STRUCTURED,
    )

    assert isinstance(result, ClaimFacts)
    assert result.event_type == "delay"
    assert result.actual_arrival_utc is not None
    assert result.actual_arrival_utc.hour == 15
    # Structured inputs preserved
    assert result.departure_iata == "LHR"
    assert result.arrival_iata == "AMS"


@respx.mock
@pytest.mark.asyncio
async def test_structured_inputs_override_narrative(tmp_path, monkeypatch):
    """Narrative says departure was CDG; structured input says LHR. LHR must win."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    # LLM tries to return different airports — they should be ignored
    llm_content = {
        "event_type": "delay",
        "actual_arrival_utc": "2024-06-01T15:05:00Z",
        "extraordinary_circumstance_claimed": None,
        "extraordinary_circumstance_confirmed": False,
        "cancellation_notice_days": None,
        "rebooked_departure_utc": None,
        "rebooked_arrival_utc": None,
        "volunteers_solicited": None,
        # These are NOT in _LLM_FIELDS so must be stripped:
        "departure_iata": "CDG",
        "arrival_iata": "FCO",
        "flight_carrier_iata": "AF",
    }
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_or_response(llm_content))
    )

    result = await extract_facts(
        narrative="I flew from Paris (CDG) to Rome (FCO) on Air France.",
        structured_inputs=_BASE_STRUCTURED,  # LHR→AMS, U2
    )

    assert isinstance(result, ClaimFacts)
    # Structured inputs must win
    assert result.departure_iata == "LHR"
    assert result.arrival_iata == "AMS"
    assert result.flight_carrier_iata == "U2"


@respx.mock
@pytest.mark.asyncio
async def test_narrative_claiming_eligibility_not_echoed(tmp_path, monkeypatch):
    """Narrative asserts eligibility and amount — LLM must not reflect them."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    # Even if LLM tried to return these, they must not appear on ClaimFacts
    llm_content = {
        "event_type": "delay",
        "actual_arrival_utc": "2024-06-01T15:05:00Z",
        "extraordinary_circumstance_claimed": None,
        "extraordinary_circumstance_confirmed": False,
        "cancellation_notice_days": None,
        "rebooked_departure_utc": None,
        "rebooked_arrival_utc": None,
        "volunteers_solicited": None,
        # Forbidden fields the LLM erroneously added:
        "eligible": True,
        "amount_eur": 600,
        "compensation_due": "yes",
    }
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_or_response(llm_content))
    )

    result = await extract_facts(
        narrative="My flight was 4 hours late. I am definitely owed €600.",
        structured_inputs=_BASE_STRUCTURED,
    )

    assert isinstance(result, ClaimFacts)
    # ClaimFacts has no eligibility fields — verify the model validates cleanly
    assert not hasattr(result, "eligible")
    assert not hasattr(result, "amount_eur")
    assert not hasattr(result, "compensation_due")


@respx.mock
@pytest.mark.asyncio
async def test_garbage_input_returns_extraction_failed_after_retry(
    tmp_path, monkeypatch
):
    """Both primary and fallback return non-JSON → ExtractionFailed, not exception."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    # Both calls return garbage
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_or_response("this is not json !!!"))
    )

    result = await extract_facts(
        narrative="aaaa bbbb cccc — total garbage input with no flight info",
        structured_inputs=_BASE_STRUCTURED,
    )

    assert isinstance(result, ExtractionFailed)
    assert "non-JSON" in result.reason
    assert len(result.attempt_models) == 2  # primary + fallback both tried


@respx.mock
@pytest.mark.asyncio
async def test_primary_fails_validation_fallback_succeeds(tmp_path, monkeypatch):
    """Primary returns invalid JSON structure; fallback returns valid JSON."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    valid_llm_content = {
        "event_type": "delay",
        "actual_arrival_utc": "2024-06-01T14:45:00Z",
        "extraordinary_circumstance_claimed": None,
        "extraordinary_circumstance_confirmed": False,
        "cancellation_notice_days": None,
        "rebooked_departure_utc": None,
        "rebooked_arrival_utc": None,
        "volunteers_solicited": None,
    }

    call_count = 0

    def _side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # Primary returns invalid JSON (not a valid object)
            return httpx.Response(200, json=_or_response("not-json"))
        # Fallback returns valid response
        return httpx.Response(200, json=_or_response(valid_llm_content))

    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        side_effect=_side_effect
    )

    result = await extract_facts(
        narrative="My flight landed 3h15m late.",
        structured_inputs=_BASE_STRUCTURED,
    )

    assert isinstance(result, ClaimFacts)
    assert result.event_type == "delay"
    assert call_count == 2  # primary + fallback


@respx.mock
@pytest.mark.asyncio
async def test_extraordinary_circumstance_weather_sets_confirmed_true(
    tmp_path, monkeypatch
):
    """Volcanic ash → LLM sets extraordinary_circumstance_confirmed=True."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    llm_content = {
        "event_type": "delay",
        "actual_arrival_utc": "2024-06-01T20:00:00Z",
        "extraordinary_circumstance_claimed": "volcanic ash cloud",
        "extraordinary_circumstance_confirmed": True,
        "cancellation_notice_days": None,
        "rebooked_departure_utc": None,
        "rebooked_arrival_utc": None,
        "volunteers_solicited": None,
    }
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_or_response(llm_content))
    )

    result = await extract_facts(
        narrative="Our flight was diverted for 8 hours due to the Icelandic volcanic ash cloud.",
        structured_inputs=_BASE_STRUCTURED,
    )

    assert isinstance(result, ClaimFacts)
    assert result.extraordinary_circumstance_confirmed is True
    assert result.extraordinary_circumstance_claimed == "volcanic ash cloud"


@respx.mock
@pytest.mark.asyncio
async def test_cancellation_with_rebooking(tmp_path, monkeypatch):
    """Cancellation narrative: notice days and rebooked times extracted."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    llm_content = {
        "event_type": "cancellation",
        "actual_arrival_utc": None,
        "extraordinary_circumstance_claimed": None,
        "extraordinary_circumstance_confirmed": False,
        "cancellation_notice_days": 3,
        "rebooked_departure_utc": "2024-06-02T10:00:00Z",
        "rebooked_arrival_utc": "2024-06-02T11:45:00Z",
        "volunteers_solicited": None,
    }
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_or_response(llm_content))
    )

    result = await extract_facts(
        narrative="Ryanair cancelled 3 days out, rebooked me the next day.",
        structured_inputs={
            **_BASE_STRUCTURED,
            "scheduled_departure_utc": _dt("2024-06-01T10:00"),
            "scheduled_arrival_utc": _dt("2024-06-01T11:30"),
        },
    )

    assert isinstance(result, ClaimFacts)
    assert result.event_type == "cancellation"
    assert result.cancellation_notice_days == 3
    assert result.rebooked_departure_utc is not None
    assert result.rebooked_arrival_utc is not None


@respx.mock
@pytest.mark.asyncio
async def test_receipt_file_written(tmp_path, monkeypatch):
    """A receipt JSON must be written for each OpenRouter call."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    llm_content = {
        "event_type": "delay",
        "actual_arrival_utc": "2024-06-01T15:00:00Z",
        "extraordinary_circumstance_claimed": None,
        "extraordinary_circumstance_confirmed": False,
        "cancellation_notice_days": None,
        "rebooked_departure_utc": None,
        "rebooked_arrival_utc": None,
        "volunteers_solicited": None,
    }
    respx.post("https://openrouter.ai/api/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_or_response(llm_content))
    )

    await extract_facts(
        narrative="Flight was 3.5 hours late.",
        structured_inputs=_BASE_STRUCTURED,
        claim_id="test-001",
    )

    receipts = list(tmp_path.glob("*openrouter*.json"))
    assert len(receipts) >= 1


# ---------------------------------------------------------------------------
# Live test — skipped unless OPENROUTER_API_KEY is set
# ---------------------------------------------------------------------------

@pytest.mark.live
@pytest.mark.asyncio
async def test_live_extraction_produces_valid_facts(tmp_path, monkeypatch):
    """Real OpenRouter call — only runs when OPENROUTER_API_KEY is in the env."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        pytest.skip("OPENROUTER_API_KEY not set")

    monkeypatch.setenv("RECEIPTS_DIR", str(tmp_path))

    result = await extract_facts(
        narrative=(
            "My easyJet flight EZY1234 from Gatwick to Amsterdam on 1 June 2024 "
            "was delayed. We were supposed to arrive at 11:30 UTC but actually "
            "landed at 15:05 UTC. The captain blamed a technical issue with the "
            "aircraft. No extraordinary circumstances were mentioned by the airline."
        ),
        structured_inputs=_BASE_STRUCTURED,
        claim_id="live-test-001",
    )

    assert isinstance(result, ClaimFacts), (
        f"Expected ClaimFacts, got ExtractionFailed: {result}"
    )
    assert result.event_type == "delay"
    # Receipt must exist
    receipts = list(tmp_path.glob("*openrouter*.json"))
    assert len(receipts) >= 1
