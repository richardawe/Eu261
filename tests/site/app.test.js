/**
 * Node.js unit tests for site/app.js logic.
 *
 * Tests the pure functions (buildTitle, buildBody, buildGitHubURL,
 * collectFormData, validation) by loading app.js in a jsdom environment
 * that provides a minimal browser-like DOM.
 *
 * Run with:  node --test tests/site/app.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = resolve(__dirname, "../../site");
const APP_JS = readFileSync(resolve(SITE_DIR, "app.js"), "utf-8");

// ─────────────────────────────────────────────
// Helpers — bootstrap a jsdom context with app.js loaded
// ─────────────────────────────────────────────

function makeDOM(bodyHTML = "") {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${bodyHTML}</body></html>`,
    { runScripts: "dangerously", resources: "usable", url: "http://localhost/" }
  );
  // Inject app.js into the window
  dom.window.eval(APP_JS);
  return dom;
}

/** Call the module-level function exposed on window (after eval). */
function fn(dom, name, ...args) {
  return dom.window[name](...args);
}

// ─────────────────────────────────────────────
// buildTitle
// ─────────────────────────────────────────────

describe("buildTitle", () => {
  const dom = makeDOM();

  test("produces expected title for delay", () => {
    const d = {
      carrier_iata: "U2",
      flight_number: "EZY1234",
      departure_iata: "LHR",
      arrival_iata: "AMS",
      scheduled_departure_utc: "2024-06-01T10:00",
      event_type: "delay",
    };
    const title = fn(dom, "buildTitle", d);
    assert.match(title, /U2/);
    assert.match(title, /EZY1234/);
    assert.match(title, /LHR→AMS/);
    assert.match(title, /2024-06-01/);
    assert.match(title, /delay/);
  });

  test("replaces underscores in event_type with hyphens", () => {
    const d = {
      carrier_iata: "FR",
      flight_number: "RYR100",
      departure_iata: "STN",
      arrival_iata: "BCN",
      scheduled_departure_utc: "2024-07-10T08:00",
      event_type: "denied_boarding",
    };
    const title = fn(dom, "buildTitle", d);
    assert.match(title, /denied-boarding/);
    assert.doesNotMatch(title, /denied_boarding/);
  });

  test("includes only date, not time, from scheduled_departure_utc", () => {
    const d = {
      carrier_iata: "BA",
      flight_number: "BA100",
      departure_iata: "LHR",
      arrival_iata: "JFK",
      scheduled_departure_utc: "2024-06-01T09:30",
      event_type: "delay",
    };
    const title = fn(dom, "buildTitle", d);
    assert.match(title, /2024-06-01/);
    assert.doesNotMatch(title, /09:30/);
  });
});

// ─────────────────────────────────────────────
// buildBody
// ─────────────────────────────────────────────

describe("buildBody", () => {
  const dom = makeDOM();

  const baseData = {
    carrier_iata: "U2",
    flight_number: "EZY1234",
    departure_iata: "LHR",
    arrival_iata: "AMS",
    scheduled_departure_utc: "2024-06-01T10:00",
    scheduled_arrival_utc: "2024-06-01T11:30",
    actual_arrival_utc: "2024-06-01T14:45",
    event_type: "delay",
    cancellation_notice_days: "",
    rebooked_departure_utc: "",
    rebooked_arrival_utc: "",
    narrative: "The plane was very late due to a technical fault.",
    passenger_name: "Jane Smith",
    email: "jane@example.com",
    booking_reference: "ABC123",
    consent: true,
  };

  test("contains flight details", () => {
    const body = fn(dom, "buildBody", baseData);
    assert.match(body, /U2/);
    assert.match(body, /EZY1234/);
    assert.match(body, /LHR/);
    assert.match(body, /AMS/);
  });

  test("contains event type", () => {
    const body = fn(dom, "buildBody", baseData);
    assert.match(body, /delay/);
  });

  test("contains narrative verbatim", () => {
    const body = fn(dom, "buildBody", baseData);
    assert.match(body, /technical fault/);
  });

  test("contains PII fields for delay event", () => {
    const body = fn(dom, "buildBody", baseData);
    assert.match(body, /Jane Smith/);
    assert.match(body, /jane@example\.com/);
    assert.match(body, /ABC123/);
  });

  test("includes actual_arrival_utc for delay events", () => {
    const body = fn(dom, "buildBody", { ...baseData, event_type: "delay" });
    assert.match(body, /14:45/);
  });

  test("omits actual_arrival_utc for non-delay events", () => {
    const cancellation = {
      ...baseData,
      event_type: "cancellation",
      actual_arrival_utc: "",
      cancellation_notice_days: "5",
    };
    const body = fn(dom, "buildBody", cancellation);
    assert.match(body, /cancellation/);
    assert.doesNotMatch(body, /Actual arrival/);
  });

  test("includes cancellation notice days when present", () => {
    const d = { ...baseData, event_type: "cancellation", cancellation_notice_days: "3", actual_arrival_utc: "" };
    const body = fn(dom, "buildBody", d);
    assert.match(body, /3/);
    assert.match(body, /notice/i);
  });

  test("includes rebooked times when present", () => {
    const d = {
      ...baseData,
      rebooked_departure_utc: "2024-06-02T10:00",
      rebooked_arrival_utc: "2024-06-02T11:45",
    };
    const body = fn(dom, "buildBody", d);
    assert.match(body, /Rebooked/i);
  });

  test("body is a string", () => {
    assert.equal(typeof fn(dom, "buildBody", baseData), "string");
  });

  test("contains no eligibility judgment", () => {
    const body = fn(dom, "buildBody", baseData);
    // Body must not include any eligibility or amount decision
    assert.doesNotMatch(body, /eligible|compensation.*€|\bowed\b/i);
  });
});

// ─────────────────────────────────────────────
// buildGitHubURL
// ─────────────────────────────────────────────

describe("buildGitHubURL", () => {
  const dom = makeDOM();

  test("URL starts with GitHub issues endpoint", () => {
    const url = fn(dom, "buildGitHubURL", "Test title", "Test body");
    assert.match(url, /^https:\/\/github\.com\//);
    assert.match(url, /issues\/new/);
  });

  test("URL contains encoded title", () => {
    const url = fn(dom, "buildGitHubURL", "My Claim Title", "body");
    assert.match(url, /My\+Claim\+Title|My%20Claim%20Title/);
  });

  test("URL contains body parameter", () => {
    const url = fn(dom, "buildGitHubURL", "title", "claim body text");
    assert.match(url, /body=/);
  });

  test("URL contains labels parameter", () => {
    const url = fn(dom, "buildGitHubURL", "title", "body");
    assert.match(url, /labels=/);
  });

  test("very long body is truncated to stay under MAX_BODY_CHARS", () => {
    const longBody = "x".repeat(10000);
    const url = fn(dom, "buildGitHubURL", "title", longBody);
    // URL should exist and not exceed a sensible length
    assert.ok(url.length < 20000, `URL too long: ${url.length} chars`);
    // The body parameter value should indicate truncation
    assert.match(url, /truncated|x{100}/);
  });
});

// ─────────────────────────────────────────────
// runCustomValidation (exposed via window in tests)
// ─────────────────────────────────────────────

describe("runCustomValidation", () => {
  function makeForm(fields) {
    const inputs = Object.entries(fields)
      .map(([name, value]) => {
        if (typeof value === "boolean") {
          return `<input name="${name}" type="checkbox" ${value ? "checked" : ""} />`;
        }
        return `<input name="${name}" value="${value}" />`;
      })
      .join("");
    const bodyHTML = `<form id="claim-form">${inputs}</form>`;
    const dom = makeDOM(bodyHTML);
    const form = dom.window.document.getElementById("claim-form");
    return { dom, form };
  }

  test("returns no errors for valid data", () => {
    const { dom, form } = makeForm({
      scheduled_departure_utc: "2024-06-01T10:00",
      scheduled_arrival_utc: "2024-06-01T13:00",
      event_type: "delay",
      actual_arrival_utc: "2024-06-01T14:00",
      consent: true,
    });
    const errors = fn(dom, "runCustomValidation", form);
    assert.equal(errors.length, 0);
  });

  test("returns error when arrival is before departure", () => {
    const { dom, form } = makeForm({
      scheduled_departure_utc: "2024-06-01T10:00",
      scheduled_arrival_utc: "2024-06-01T09:00",  // before departure
      event_type: "delay",
      consent: true,
    });
    const errors = fn(dom, "runCustomValidation", form);
    const fields = errors.map((e) => e.field);
    assert.ok(fields.includes("scheduled_arrival_utc"), "Expected arrival-before-departure error");
  });

  test("returns error when consent not ticked", () => {
    const { dom, form } = makeForm({
      scheduled_departure_utc: "2024-06-01T10:00",
      scheduled_arrival_utc: "2024-06-01T13:00",
      event_type: "delay",
      consent: false,
    });
    const errors = fn(dom, "runCustomValidation", form);
    const fields = errors.map((e) => e.field);
    assert.ok(fields.includes("consent"), "Expected consent error");
  });

  test("each error has field and msg", () => {
    const { dom, form } = makeForm({
      scheduled_departure_utc: "2024-06-01T10:00",
      scheduled_arrival_utc: "2024-06-01T09:00",
      event_type: "delay",
      consent: false,
    });
    const errors = fn(dom, "runCustomValidation", form);
    for (const err of errors) {
      assert.ok(err.field, "Error missing field");
      assert.ok(err.msg, "Error missing msg");
    }
  });
});

// ─────────────────────────────────────────────
// GITHUB_REPO constant
// ─────────────────────────────────────────────

describe("configuration", () => {
  const dom = makeDOM();

  test("GITHUB_REPO is set and non-empty", () => {
    const repo = dom.window.GITHUB_REPO;
    assert.ok(repo && repo.length > 0, "GITHUB_REPO must be set");
    assert.match(repo, /\w+\/\w+/, "GITHUB_REPO must be owner/repo format");
  });

  test("MAX_BODY_CHARS is a positive number", () => {
    const max = dom.window.MAX_BODY_CHARS;
    assert.ok(typeof max === "number" && max > 0, "MAX_BODY_CHARS must be positive");
  });
});
