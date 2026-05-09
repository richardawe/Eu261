"""Tests for engine/drafter.py — demand letter generation."""
from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from engine.drafter import _user_prompt, draft_letter
from engine.eligibility import ClaimFacts, EligibilityDecision


def _facts(**kw) -> ClaimFacts:
    base = dict(
        flight_carrier_iata="U2",
        flight_number="EZY1234",
        scheduled_departure_utc=datetime(2024, 6, 1, 10, 0),
        scheduled_arrival_utc=datetime(2024, 6, 1, 11, 30),
        actual_arrival_utc=datetime(2024, 6, 1, 14, 45),
        departure_iata="LHR",
        arrival_iata="AMS",
        event_type="delay",
    )
    base.update(kw)
    return ClaimFacts(**base)


def _decision(**kw) -> EligibilityDecision:
    base = dict(
        eligible=True,
        amount_eur=250,
        rule_citations=["Art.7(1)(a)", "Sturgeon C-402/07"],
        reasoning_steps=["Delay > 3h", "Distance < 1500 km"],
    )
    base.update(kw)
    return EligibilityDecision(**base)


class TestUserPrompt:
    def test_includes_flight_number(self):
        assert "EZY1234" in _user_prompt(_facts(), _decision())

    def test_includes_route(self):
        assert "LHR→AMS" in _user_prompt(_facts(), _decision())

    def test_includes_amount(self):
        assert "250" in _user_prompt(_facts(), _decision())

    def test_includes_citations(self):
        assert "Art.7" in _user_prompt(_facts(), _decision())

    def test_delay_description(self):
        assert "delay" in _user_prompt(_facts(), _decision()).lower()

    def test_cancellation_description(self):
        f = _facts(event_type="cancellation", actual_arrival_utc=None)
        assert "cancel" in _user_prompt(f, _decision()).lower()


class TestDraftLetter:
    def _mock_client(self, text="Dear Sir/Madam,\n\nI am writing to claim compensation..."):
        mock = AsyncMock()
        mock.__aenter__ = AsyncMock(return_value=mock)
        mock.__aexit__ = AsyncMock(return_value=False)
        mock.complete = AsyncMock(return_value={
            "choices": [{"message": {"content": text}}]
        })
        return mock

    @pytest.mark.asyncio
    async def test_returns_string(self, tmp_path):
        models = tmp_path / "models.yaml"
        models.write_text("drafting:\n  primary: test/model\n")
        mock = self._mock_client()
        with patch("engine.drafter.OpenRouterClient", return_value=mock):
            result = await draft_letter(_facts(), _decision(), models_path=models)
        assert isinstance(result, str) and len(result) > 0

    @pytest.mark.asyncio
    async def test_strips_whitespace(self, tmp_path):
        models = tmp_path / "models.yaml"
        models.write_text("drafting:\n  primary: test/model\n")
        mock = self._mock_client("  letter content  \n")
        with patch("engine.drafter.OpenRouterClient", return_value=mock):
            result = await draft_letter(_facts(), _decision(), models_path=models)
        assert result == "letter content"

    @pytest.mark.asyncio
    async def test_uses_configured_model(self, tmp_path):
        models = tmp_path / "models.yaml"
        models.write_text("drafting:\n  primary: custom/model-7b\n")
        mock = self._mock_client()
        with patch("engine.drafter.OpenRouterClient", return_value=mock):
            await draft_letter(_facts(), _decision(), models_path=models)
        assert mock.complete.call_args[0][0] == "custom/model-7b"

    @pytest.mark.asyncio
    async def test_system_prompt_has_pii_placeholders(self, tmp_path):
        models = tmp_path / "models.yaml"
        models.write_text("drafting:\n  primary: test/model\n")
        mock = self._mock_client()
        with patch("engine.drafter.OpenRouterClient", return_value=mock):
            await draft_letter(_facts(), _decision(), models_path=models)
        messages = mock.complete.call_args[0][1]
        system = next(m["content"] for m in messages if m["role"] == "system")
        assert "[PASSENGER NAME]" in system
        assert "[BOOKING REFERENCE]" in system
        assert "[EMAIL ADDRESS]" in system

    @pytest.mark.asyncio
    async def test_passes_claim_id(self, tmp_path):
        models = tmp_path / "models.yaml"
        models.write_text("drafting:\n  primary: test/model\n")
        mock = self._mock_client()
        with patch("engine.drafter.OpenRouterClient", return_value=mock):
            await draft_letter(_facts(), _decision(), models_path=models, claim_id="42")
        assert mock.complete.call_args[1].get("claim_id") == "42"
