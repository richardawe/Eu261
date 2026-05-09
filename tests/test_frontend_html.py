"""HTML structure tests for the static site.

Validates that all required elements, form fields, aria attributes,
and metadata are present in each page without running a browser.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import pytest

SITE = Path(__file__).parent.parent / "site"


# ─────────────────────────────────────────────
# Minimal DOM extraction helper
# ─────────────────────────────────────────────

class _Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.elements: list[dict[str, Any]] = []
        self._stack: list[dict[str, Any]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node: dict[str, Any] = {
            "tag": tag,
            "attrs": dict(attrs),
            "text": "",
            "children": [],
        }
        if self._stack:
            self._stack[-1]["children"].append(node)
        else:
            self.elements.append(node)
        self._stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        if self._stack and self._stack[-1]["tag"] == tag:
            self._stack.pop()

    def handle_data(self, data: str) -> None:
        if self._stack:
            self._stack[-1]["text"] += data


def _parse(filename: str) -> tuple[_Parser, str]:
    path = SITE / filename
    html = path.read_text(encoding="utf-8")
    p = _Parser()
    p.feed(html)
    return p, html


def _find_all(elements: list[dict], tag: str) -> list[dict]:
    results = []
    for el in elements:
        if el["tag"] == tag:
            results.append(el)
        results.extend(_find_all(el["children"], tag))
    return results


def _find_by_id(elements: list[dict], id_val: str) -> dict | None:
    for el in elements:
        if el["attrs"].get("id") == id_val:
            return el
        found = _find_by_id(el["children"], id_val)
        if found:
            return found
    return None


def _find_by_attr(elements: list[dict], tag: str, attr: str, val: str) -> list[dict]:
    results = []
    for el in elements:
        if el["tag"] == tag and el["attrs"].get(attr) == val:
            results.append(el)
        results.extend(_find_by_attr(el["children"], tag, attr, val))
    return results


# ─────────────────────────────────────────────
# index.html
# ─────────────────────────────────────────────

class TestIndexPage:
    @pytest.fixture(autouse=True)
    def _parse(self):
        self.p, self.html = _parse("index.html")

    def test_has_title(self):
        titles = _find_all(self.p.elements, "title")
        assert titles, "Missing <title>"
        assert "EU261" in titles[0]["text"]

    def test_has_h1(self):
        h1s = _find_all(self.p.elements, "h1")
        assert h1s, "Missing <h1>"

    def test_pico_css_loaded(self):
        links = _find_all(self.p.elements, "link")
        hrefs = [l["attrs"].get("href", "") for l in links]
        assert any("pico" in h for h in hrefs), "Pico.css CDN link missing"

    def test_cta_link_to_intake(self):
        """Landing page must have a link to intake.html."""
        anchors = _find_all(self.p.elements, "a")
        hrefs = [a["attrs"].get("href", "") for a in anchors]
        assert any("intake.html" in h for h in hrefs), "No link to intake.html"

    def test_link_to_status(self):
        anchors = _find_all(self.p.elements, "a")
        hrefs = [a["attrs"].get("href", "") for a in anchors]
        assert any("status.html" in h for h in hrefs), "No link to status.html"

    def test_has_disclaimer_section(self):
        assert "not legal advice" in self.html.lower()

    def test_has_privacy_link(self):
        assert "PRIVACY.md" in self.html or "privacy" in self.html.lower()

    def test_has_terms_link(self):
        assert "TERMS.md" in self.html or "terms" in self.html.lower()

    def test_no_fee_mention(self):
        """Page must explicitly state there are no fees."""
        assert re.search(r"no.{0,20}fee|free", self.html, re.IGNORECASE), \
            "No mention of 'no fees' or 'free'"

    def test_viewport_meta(self):
        metas = _find_all(self.p.elements, "meta")
        viewports = [m for m in metas if m["attrs"].get("name") == "viewport"]
        assert viewports, "Missing <meta name=viewport>"

    def test_mobile_friendly_styles_linked(self):
        links = _find_all(self.p.elements, "link")
        hrefs = [l["attrs"].get("href", "") for l in links]
        assert any("styles.css" in h for h in hrefs), "Local styles.css not linked"


# ─────────────────────────────────────────────
# intake.html
# ─────────────────────────────────────────────

class TestIntakePage:
    @pytest.fixture(autouse=True)
    def _parse(self):
        self.p, self.html = _parse("intake.html")

    def test_has_form(self):
        forms = _find_by_attr(self.p.elements, "form", "id", "claim-form")
        assert forms is not None, "Form with id='claim-form' missing"

    def test_required_flight_fields_present(self):
        required_names = [
            "carrier_iata",
            "flight_number",
            "departure_iata",
            "arrival_iata",
            "scheduled_departure_utc",
            "scheduled_arrival_utc",
        ]
        for name in required_names:
            inputs = _find_by_attr(self.p.elements, "input", "name", name)
            assert inputs, f"Missing required input: name='{name}'"

    def test_event_type_select_present(self):
        selects = _find_by_attr(self.p.elements, "select", "name", "event_type")
        assert selects is not None, "Missing event_type select"

    def test_event_type_options_correct(self):
        options = _find_all(self.p.elements, "option")
        values = [o["attrs"].get("value", "") for o in options]
        for expected in ("delay", "cancellation", "denied_boarding", "rebooked_earlier"):
            assert expected in values, f"event_type option '{expected}' missing"

    def test_pii_fields_present(self):
        for name in ("passenger_name", "email", "booking_reference"):
            inputs = _find_by_attr(self.p.elements, "input", "name", name)
            assert inputs, f"PII field missing: name='{name}'"

    def test_narrative_textarea_present(self):
        textareas = _find_by_attr(self.p.elements, "textarea", "name", "narrative")
        assert textareas is not None, "Narrative textarea missing"

    def test_consent_checkbox_present(self):
        inputs = _find_by_attr(self.p.elements, "input", "name", "consent")
        assert inputs, "Consent checkbox missing"
        assert inputs[0]["attrs"].get("type") == "checkbox"

    def test_consent_is_required(self):
        inputs = _find_by_attr(self.p.elements, "input", "name", "consent")
        assert inputs, "Consent checkbox missing"
        assert "required" in inputs[0]["attrs"], "Consent checkbox is not required"

    def test_conditional_groups_have_hidden(self):
        """Conditional field groups must start hidden."""
        for gid in ("actual-arrival-group", "cancellation-notice-group", "rebooked-group"):
            el = _find_by_id(self.p.elements, gid)
            assert el is not None, f"Conditional group '{gid}' missing"
            assert "hidden" in el["attrs"], f"Group '{gid}' should start hidden"

    def test_app_js_linked(self):
        scripts = _find_all(self.p.elements, "script")
        srcs = [s["attrs"].get("src", "") for s in scripts]
        assert any("app.js" in s for s in srcs), "app.js not linked"

    def test_privacy_link_present(self):
        assert "PRIVACY.md" in self.html or "privacy" in self.html.lower()

    def test_pii_notice_present(self):
        """Users must be informed their PII will be encrypted."""
        assert re.search(r"encrypt", self.html, re.IGNORECASE), \
            "No mention of encryption for PII fields"

    def test_no_server_post(self):
        """Form must not have action pointing to a server endpoint."""
        forms = _find_all(self.p.elements, "form")
        for form in forms:
            action = form["attrs"].get("action", "")
            assert not action.startswith("http"), \
                f"Form has a server action: {action!r}"


# ─────────────────────────────────────────────
# status.html
# ─────────────────────────────────────────────

class TestStatusPage:
    @pytest.fixture(autouse=True)
    def _parse(self):
        self.p, self.html = _parse("status.html")

    def test_has_lookup_form(self):
        form = _find_by_id(self.p.elements, "lookup-form")
        assert form is not None, "Lookup form missing"

    def test_status_section_starts_hidden(self):
        section = _find_by_id(self.p.elements, "status-section")
        assert section is not None
        assert "hidden" in section["attrs"], "Status section should start hidden"

    def test_loading_indicator_present(self):
        el = _find_by_id(self.p.elements, "status-loading")
        assert el is not None, "Loading indicator missing"

    def test_timeline_element_present(self):
        el = _find_by_id(self.p.elements, "status-timeline")
        assert el is not None, "Timeline element missing"

    def test_status_js_linked(self):
        scripts = _find_all(self.p.elements, "script")
        srcs = [s["attrs"].get("src", "") for s in scripts]
        assert any("status.js" in s for s in srcs), "status.js not linked"

    def test_aria_live_on_status_section(self):
        section = _find_by_id(self.p.elements, "status-section")
        assert section is not None
        assert section["attrs"].get("aria-live"), "Status section missing aria-live"

    def test_has_link_to_new_claim(self):
        anchors = _find_all(self.p.elements, "a")
        hrefs = [a["attrs"].get("href", "") for a in anchors]
        assert any("intake.html" in h for h in hrefs), "No link to intake.html"


# ─────────────────────────────────────────────
# styles.css — smoke checks
# ─────────────────────────────────────────────

class TestStyles:
    @pytest.fixture(autouse=True)
    def _load(self):
        self.css = (SITE / "styles.css").read_text(encoding="utf-8")

    def test_mobile_breakpoint_defined(self):
        assert "@media" in self.css, "No @media query in styles.css"

    def test_timeline_styles_present(self):
        assert ".timeline" in self.css

    def test_banner_styles_present(self):
        assert ".banner" in self.css

    def test_hero_styles_present(self):
        assert ".hero" in self.css
