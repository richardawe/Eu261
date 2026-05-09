"""Thin async OpenRouter client with retry, receipt logging, and PII redaction."""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import Any

import httpx
import yaml

from engine.receipts import write_receipt

_BASE_URL = "https://openrouter.ai/api/v1"
_MODELS_FILE = Path(__file__).parent / "models.yaml"

# Retry on transient errors
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 4


def load_model_config() -> dict[str, Any]:
    with _MODELS_FILE.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


class OpenRouterError(RuntimeError):
    """Raised when OpenRouter returns a non-retryable error."""

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"OpenRouter HTTP {status}: {body[:200]}")
        self.status = status
        self.body = body


class OpenRouterClient:
    """Async OpenRouter client.

    Usage::

        async with OpenRouterClient() as client:
            response = await client.complete(model="...", messages=[...])
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self._http: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "OpenRouterClient":
        self._http = httpx.AsyncClient(
            base_url=_BASE_URL,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "HTTP-Referer": "https://github.com/richardawe/eu261",
                "X-Title": "EU261 Claim Agent",
            },
            timeout=60.0,
        )
        return self

    async def __aexit__(self, *_: object) -> None:
        if self._http:
            await self._http.aclose()
            self._http = None

    async def complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        response_format: dict[str, str] | None = None,
        claim_id: str | None = None,
    ) -> dict[str, Any]:
        """Call the chat/completions endpoint and return the raw response dict.

        Retries on 429/5xx with exponential backoff (2s, 4s, 8s, 16s).
        Logs full request and response (PII redacted) as a receipt.
        Raises OpenRouterError on non-retryable errors.
        """
        assert self._http is not None, "Use as async context manager"

        payload: dict[str, Any] = {"model": model, "messages": messages}
        if response_format:
            payload["response_format"] = response_format

        last_exc: Exception | None = None
        for attempt in range(_MAX_ATTEMPTS):
            t0 = time.monotonic()
            try:
                resp = await self._http.post("/chat/completions", json=payload)
            except httpx.HTTPError as exc:
                last_exc = exc
                await asyncio.sleep(2**attempt)
                continue

            latency_ms = int((time.monotonic() - t0) * 1000)

            if resp.status_code in _RETRYABLE_STATUS:
                last_exc = OpenRouterError(resp.status_code, resp.text)
                await asyncio.sleep(2**attempt)
                continue

            if not resp.is_success:
                raise OpenRouterError(resp.status_code, resp.text)

            result = resp.json()
            _log_receipt(
                claim_id=claim_id,
                model=model,
                payload=payload,
                result=result,
                latency_ms=latency_ms,
            )
            return result

        raise OpenRouterError(0, f"Exhausted retries: {last_exc}") from last_exc


def _log_receipt(
    *,
    claim_id: str | None,
    model: str,
    payload: dict[str, Any],
    result: dict[str, Any],
    latency_ms: int,
) -> None:
    write_receipt(
        receipt_type="openrouter",
        claim_id=claim_id,
        payload={
            "model": model,
            "latency_ms": latency_ms,
            "request": payload,
            "response": result,
        },
        redact_pii=True,
    )
