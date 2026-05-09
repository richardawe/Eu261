"""Ryanair EU261 claim submission adapter.

Uses Playwright to navigate Ryanair's compensation claim portal.

IMPORTANT: Form selectors must be verified against the live site before use.
Set PLAYWRIGHT_SCREENSHOT_DIR to capture debug screenshots on failure.
"""
from __future__ import annotations

import os

from playwright.async_api import Page, async_playwright

from adapters.base import AirlineAdapter, Pii, SubmissionReceipt
from engine.eligibility import ClaimFacts

_CLAIM_URL = "https://www.ryanair.com/gb/en/usefulinfo/help-centre/claims-under-eu261-2004"

_REASON_MAP = {
    "delay": "DELAY",
    "cancellation": "CANCELLATION",
    "denied_boarding": "DENIED_BOARDING",
    "rebooked_earlier": "REROUTING",
}


class RyanairAdapter(AirlineAdapter):
    async def submit(
        self,
        facts: ClaimFacts,
        pii: Pii,
        letter: str,
    ) -> SubmissionReceipt:
        screenshot_dir = os.getenv("PLAYWRIGHT_SCREENSHOT_DIR")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            try:
                return await self._run(page, facts, pii, screenshot_dir)
            except Exception:
                if screenshot_dir:
                    await page.screenshot(
                        path=f"{screenshot_dir}/ryanair-error.png", full_page=True
                    )
                raise
            finally:
                await browser.close()

    async def _run(
        self,
        page: Page,
        facts: ClaimFacts,
        pii: Pii,
        screenshot_dir: str | None,
    ) -> SubmissionReceipt:
        await page.goto(_CLAIM_URL, wait_until="networkidle", timeout=30_000)

        dep_date = facts.scheduled_departure_utc.strftime("%d/%m/%Y")
        name_parts = pii.passenger_name.split(maxsplit=1)
        first = name_parts[0]
        last = name_parts[1] if len(name_parts) > 1 else name_parts[0]

        await page.fill('[name="pnr"], #pnr, [placeholder*="booking"]', pii.booking_reference)
        await page.fill('[name="flightNumber"], #flightNumber', facts.flight_number)
        await page.fill('[name="departureDate"], input[type="date"]', dep_date)
        await page.fill('[name="firstName"], #firstName', first)
        await page.fill('[name="surname"], #surname, [name="lastName"]', last)
        await page.fill('[name="email"], #email', pii.email)

        reason = _REASON_MAP.get(facts.event_type, "DELAY")
        await page.select_option(
            'select[name="claimReason"], #claimReason', reason
        )

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/ryanair-prefill.png")

        await page.click('button[type="submit"]', timeout=10_000)
        await page.wait_for_load_state("networkidle", timeout=30_000)

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/ryanair-confirm.png")

        return SubmissionReceipt(
            airline_reference=await self._extract_ref(page),
            confirmation_url=page.url,
        )

    @staticmethod
    async def _extract_ref(page: Page) -> str:
        for sel in [".case-number", "#caseId", "[data-case-ref]", "text=/CASE-[0-9]+/"]:
            try:
                el = await page.wait_for_selector(sel, timeout=5_000)
                if el:
                    text = (await el.text_content() or "").strip()
                    if text:
                        return text
            except Exception:
                continue
        return "PENDING"
