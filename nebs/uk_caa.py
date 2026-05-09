"""UK Civil Aviation Authority — National Enforcement Body escalation adapter.

Navigates the CAA's online complaint form using Playwright.
Used when the airline rejects or ignores the claim.

IMPORTANT: Form selectors must be verified against the live CAA site.
Set PLAYWRIGHT_SCREENSHOT_DIR to capture debug screenshots on failure.

CAA complaints portal: https://www.caa.co.uk/passengers-and-public/
  resolving-travel-problems/disrupted-travel/complain-about-a-disrupted-flight/
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

from playwright.async_api import Page, async_playwright

from adapters.base import Pii
from engine.eligibility import ClaimFacts

_PORTAL_URL = (
    "https://www.caa.co.uk/passengers-and-public/"
    "resolving-travel-problems/disrupted-travel/"
    "complain-about-a-disrupted-flight/"
)


@dataclass
class NebReceipt:
    reference: str
    submitted_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    portal_url: str | None = None


class UkCaaAdapter:
    """Submit an EU261 escalation to the UK CAA NEB."""

    async def escalate(
        self,
        facts: ClaimFacts,
        pii: Pii,
        airline_reference: str,
        letter: str,
    ) -> NebReceipt:
        screenshot_dir = os.getenv("PLAYWRIGHT_SCREENSHOT_DIR")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            try:
                return await self._run(
                    page, facts, pii, airline_reference, screenshot_dir
                )
            except Exception:
                if screenshot_dir:
                    await page.screenshot(
                        path=f"{screenshot_dir}/uk_caa-error.png", full_page=True
                    )
                raise
            finally:
                await browser.close()

    async def _run(
        self,
        page: Page,
        facts: ClaimFacts,
        pii: Pii,
        airline_reference: str,
        screenshot_dir: str | None,
    ) -> NebReceipt:
        await page.goto(_PORTAL_URL, wait_until="networkidle", timeout=30_000)

        dep_date = facts.scheduled_departure_utc.strftime("%d/%m/%Y")
        name_parts = pii.passenger_name.split(maxsplit=1)
        first = name_parts[0]
        last = name_parts[1] if len(name_parts) > 1 else name_parts[0]

        # Personal details
        await page.fill('[name="firstName"], #firstName', first)
        await page.fill('[name="lastName"], #lastName', last)
        await page.fill('[name="email"], #email', pii.email)

        # Flight details
        await page.fill('[name="flightNumber"], #flightNumber', facts.flight_number)
        await page.fill('[name="departureDate"], #departureDate', dep_date)
        await page.fill(
            '[name="departureAirport"], #departureAirport', facts.departure_iata
        )
        await page.fill(
            '[name="arrivalAirport"], #arrivalAirport', facts.arrival_iata
        )
        await page.fill('[name="airline"], #airline', facts.flight_carrier_iata)
        await page.fill(
            '[name="bookingReference"], #bookingReference', pii.booking_reference
        )

        # Airline's reference and outcome
        await page.fill(
            '[name="airlineReference"], #airlineReference', airline_reference
        )

        # Select complaint type
        type_map = {
            "delay": "delay",
            "cancellation": "cancellation",
            "denied_boarding": "denied-boarding",
            "rebooked_earlier": "rerouting",
        }
        complaint_type = type_map.get(facts.event_type, facts.event_type)
        await page.select_option(
            'select[name="complaintType"], #complaintType', complaint_type
        )

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/uk_caa-prefill.png")

        await page.click('button[type="submit"]', timeout=10_000)
        await page.wait_for_load_state("networkidle", timeout=30_000)

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/uk_caa-confirm.png")

        return NebReceipt(
            reference=await self._extract_ref(page),
            portal_url=page.url,
        )

    @staticmethod
    async def _extract_ref(page: Page) -> str:
        for sel in [".case-reference", "#caseNumber", "[data-ref]"]:
            try:
                el = await page.wait_for_selector(sel, timeout=5_000)
                if el:
                    text = (await el.text_content() or "").strip()
                    if text:
                        return text
            except Exception:
                continue
        return "PENDING"
