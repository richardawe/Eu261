"""British Airways EU261 claim submission adapter.

Uses Playwright to navigate BA's multi-step Customer Relations SPA.

Portal: https://www.britishairways.com/travel/feedbackclaims/public/en_gb/select/dcd

Steps
-----
0. Claim-type selection  (Delayed / Cancelled / Missed connection)
1. Flight details        (flight number → auto-fill route; booking ref; date)
2. Contact details       (first/last name, email)
3. Narrative             (free-text description, built from demand letter)
4. Review & submit
5. Confirmation          (8-digit numeric case number shown on-screen)

No login or CAPTCHA required.  Selectors are role/label/text-based to survive
minor markup changes; CSS fallbacks are provided where needed.

IMPORTANT: Verify selectors against the live site before production use.
Set PLAYWRIGHT_SCREENSHOT_DIR to capture debug screenshots on failure.
"""
from __future__ import annotations

import os
import re

from playwright.async_api import Page, async_playwright

from adapters.base import AirlineAdapter, Pii, SubmissionReceipt
from engine.eligibility import ClaimFacts

_CLAIM_URL = (
    "https://www.britishairways.com/travel/feedbackclaims/public/en_gb/select/dcd"
)

_CLAIM_TYPE_LABEL = {
    "delay": "Delayed flight",
    "cancellation": "Cancelled flight",
    "denied_boarding": "Missed connection",
    "rebooked_earlier": "Cancelled flight",
}

_CASE_RE = re.compile(r"\b\d{8}\b")


class BritishAirwaysAdapter(AirlineAdapter):
    async def submit(
        self,
        facts: ClaimFacts,
        pii: Pii,
        letter: str,
    ) -> SubmissionReceipt:
        screenshot_dir = os.getenv("PLAYWRIGHT_SCREENSHOT_DIR")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            ctx = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                locale="en-GB",
            )
            page = await ctx.new_page()
            try:
                return await self._run(page, facts, pii, letter, screenshot_dir)
            except Exception:
                if screenshot_dir:
                    await page.screenshot(
                        path=f"{screenshot_dir}/ba-error.png", full_page=True
                    )
                raise
            finally:
                await browser.close()

    async def _run(
        self,
        page: Page,
        facts: ClaimFacts,
        pii: Pii,
        letter: str,
        screenshot_dir: str | None,
    ) -> SubmissionReceipt:
        await page.goto(_CLAIM_URL, wait_until="networkidle", timeout=45_000)

        # Step 0 — claim type
        claim_label = _CLAIM_TYPE_LABEL.get(facts.event_type, "Delayed flight")
        await page.get_by_role("radio", name=claim_label).check(timeout=15_000)
        await self._click_next(page)

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/ba-step0.png")

        # Step 1 — flight details
        # Flight number triggers an async lookup; wait for route fields to appear.
        dep_date = facts.scheduled_departure_utc.strftime("%d/%m/%Y")
        await page.get_by_label(re.compile(r"flight\s*number", re.I)).fill(
            facts.flight_number, timeout=10_000
        )
        # Wait for auto-populate to settle before filling the rest
        await page.wait_for_load_state("networkidle", timeout=15_000)

        await page.get_by_label(re.compile(r"booking\s*ref", re.I)).fill(
            pii.booking_reference
        )

        # Date picker: try label first, fall back to input[type=date]
        date_input = page.get_by_label(re.compile(r"date\s*of\s*travel|departure\s*date", re.I))
        if await date_input.count() == 0:
            date_input = page.locator('input[type="date"]').first
        await date_input.fill(dep_date)

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/ba-step1.png")
        await self._click_next(page)

        # Step 2 — contact details
        name_parts = pii.passenger_name.split(maxsplit=1)
        first = name_parts[0]
        last = name_parts[1] if len(name_parts) > 1 else name_parts[0]

        await page.get_by_label(re.compile(r"first\s*name", re.I)).fill(first)
        await page.get_by_label(re.compile(r"(last|sur)\s*name", re.I)).fill(last)
        await page.get_by_label(re.compile(r"email", re.I)).first.fill(pii.email)

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/ba-step2.png")
        await self._click_next(page)

        # Step 3 — narrative (truncated to 2 000 chars; BA imposes a limit)
        narrative = (letter or _default_narrative(facts))[:2_000]
        narrative_field = page.get_by_label(re.compile(r"description|detail|tell\s*us", re.I))
        if await narrative_field.count() == 0:
            narrative_field = page.locator("textarea").first
        await narrative_field.fill(narrative)

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/ba-step3.png")
        await self._click_next(page)

        # Step 4 — review / submit
        submit = page.get_by_role("button", name=re.compile(r"submit|send|confirm", re.I))
        await submit.click(timeout=15_000)
        await page.wait_for_load_state("networkidle", timeout=45_000)

        if screenshot_dir:
            await page.screenshot(path=f"{screenshot_dir}/ba-confirm.png", full_page=True)

        return SubmissionReceipt(
            airline_reference=await self._extract_ref(page),
            confirmation_url=page.url,
        )

    @staticmethod
    async def _click_next(page: Page) -> None:
        """Click the wizard's Next/Continue button and wait for the next step."""
        btn = page.get_by_role("button", name=re.compile(r"next|continue", re.I))
        await btn.click(timeout=10_000)
        await page.wait_for_load_state("networkidle", timeout=20_000)

    @staticmethod
    async def _extract_ref(page: Page) -> str:
        """Scrape the 8-digit numeric case number from the confirmation page."""
        content = await page.content()
        m = _CASE_RE.search(content)
        if m:
            return m.group(0)
        # Fallback: visible heading / paragraph containing digits
        for sel in [
            "h1", "h2", "[class*='case']", "[class*='reference']",
            "[class*='confirm']", "strong",
        ]:
            try:
                els = await page.query_selector_all(sel)
                for el in els:
                    text = (await el.text_content() or "").strip()
                    m2 = _CASE_RE.search(text)
                    if m2:
                        return m2.group(0)
            except Exception:
                continue
        return "PENDING"


def _default_narrative(facts: ClaimFacts) -> str:
    dep = facts.scheduled_departure_utc.strftime("%d %B %Y")
    return (
        f"Flight {facts.flight_number} on {dep} from {facts.departure_iata} "
        f"to {facts.arrival_iata}. Claim type: {facts.event_type.replace('_', ' ')}. "
        f"I am claiming compensation under EC 261/2004 / UK261."
    )
