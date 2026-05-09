/**
 * EU261 Claim Agent — intake form logic.
 *
 * On submit the form does NOT post to a server.  Instead it builds a
 * GitHub "new issue" deep-link with the claim body pre-filled.  The user
 * arrives on GitHub, reviews the pre-populated issue, and clicks Submit.
 *
 * Structured PII fields (name, email, booking ref) are included in the
 * body because the intake workflow rewrites the issue immediately on open,
 * encrypting those fields before any human can see them in the GitHub UI.
 */

/** GitHub repository — update this if you fork the project. */
const GITHUB_REPO = "richardawe/Eu261";
const GITHUB_ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues/new`;

/** Labels applied to every claim issue. */
const CLAIM_LABELS = "claim";

/** Maximum characters we'll put in a GitHub URL body before truncating. */
const MAX_BODY_CHARS = 6000;

// ─────────────────────────────────────────────
// Initialise on DOM ready
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  wireIntakeForm();
  wireEventTypeToggle();
});

// ─────────────────────────────────────────────
// Intake form
// ─────────────────────────────────────────────

function wireIntakeForm() {
  const form = document.getElementById("claim-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const extra = runCustomValidation(form);
    if (extra.length > 0) {
      extra.forEach(({ field, msg }) => showFieldError(form, field, msg));
      return;
    }

    const data = collectFormData(form);
    const title = buildTitle(data);
    const body = buildBody(data);
    const url = buildGitHubURL(title, body);

    // In test environments the form exposes the URL via data attribute
    // so Playwright can inspect it without triggering navigation.
    form.dataset.generatedUrl = url;

    window.location.href = url;
  });
}

/**
 * Show/hide optional fields that depend on the chosen event type.
 */
function wireEventTypeToggle() {
  const select = document.getElementById("event_type");
  if (!select) return;

  const toggle = () => {
    const v = select.value;
    setVisible("actual-arrival-group", v === "delay");
    setVisible("cancellation-notice-group", v === "cancellation");
    setVisible("rebooked-group",
      v === "cancellation" || v === "rebooked_earlier");
  };

  select.addEventListener("change", toggle);
  toggle(); // run on page load
}

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = !visible;
  // Remove required from hidden fields so validation still passes
  el.querySelectorAll("[data-conditionally-required]").forEach((inp) => {
    inp.required = visible;
  });
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

function runCustomValidation(form) {
  const errors = [];
  const get = (name) => form.elements[name]?.value?.trim() ?? "";

  const depDt = get("scheduled_departure_utc");
  const arrDt = get("scheduled_arrival_utc");
  if (depDt && arrDt && arrDt <= depDt) {
    errors.push({
      field: "scheduled_arrival_utc",
      msg: "Scheduled arrival must be after scheduled departure.",
    });
  }

  const eventType = get("event_type");
  if (eventType === "delay") {
    const actualArr = get("actual_arrival_utc");
    if (actualArr && depDt && actualArr <= depDt) {
      errors.push({
        field: "actual_arrival_utc",
        msg: "Actual arrival must be after scheduled departure.",
      });
    }
  }

  const consent = form.elements["consent"];
  if (!consent?.checked) {
    errors.push({ field: "consent", msg: "You must agree to proceed." });
  }

  return errors;
}

function showFieldError(form, fieldName, message) {
  const field = form.elements[fieldName];
  if (!field) return;
  field.setAttribute("aria-invalid", "true");
  let errEl = document.getElementById(`${fieldName}-error`);
  if (!errEl) {
    errEl = document.createElement("small");
    errEl.id = `${fieldName}-error`;
    errEl.className = "field-error";
    field.insertAdjacentElement("afterend", errEl);
  }
  errEl.textContent = message;
}

function clearErrors(form) {
  form.querySelectorAll("[aria-invalid]").forEach((el) =>
    el.removeAttribute("aria-invalid")
  );
  form.querySelectorAll(".field-error").forEach((el) => el.remove());
}

// ─────────────────────────────────────────────
// Data collection
// ─────────────────────────────────────────────

function collectFormData(form) {
  const get = (name) => form.elements[name]?.value?.trim() ?? "";
  const checked = (name) => form.elements[name]?.checked ?? false;

  return {
    // PII (will be encrypted by intake workflow)
    passenger_name: get("passenger_name"),
    email: get("email"),
    booking_reference: get("booking_reference"),
    // Structured non-PII
    carrier_iata: get("carrier_iata").toUpperCase(),
    flight_number: get("flight_number").toUpperCase(),
    scheduled_departure_utc: get("scheduled_departure_utc"),
    scheduled_arrival_utc: get("scheduled_arrival_utc"),
    actual_arrival_utc: get("actual_arrival_utc"),
    departure_iata: get("departure_iata").toUpperCase(),
    arrival_iata: get("arrival_iata").toUpperCase(),
    event_type: get("event_type"),
    cancellation_notice_days: get("cancellation_notice_days"),
    rebooked_departure_utc: get("rebooked_departure_utc"),
    rebooked_arrival_utc: get("rebooked_arrival_utc"),
    narrative: get("narrative"),
    consent: checked("consent"),
  };
}

// ─────────────────────────────────────────────
// Issue content builders
// ─────────────────────────────────────────────

function buildTitle(d) {
  const route = `${d.departure_iata}→${d.arrival_iata}`;
  const depDate = d.scheduled_departure_utc.split("T")[0];
  const event = d.event_type.replace(/_/g, "-");
  return `Claim: ${d.carrier_iata} ${d.flight_number} ${route} ${depDate} [${event}]`;
}

function buildBody(d) {
  const lines = [
    "<!-- EU261 Claim — filed via eu261-agent site -->",
    "",
    "## Flight details",
    "",
    `**Carrier IATA:** ${d.carrier_iata}`,
    `**Flight number:** ${d.flight_number}`,
    `**Departure airport:** ${d.departure_iata}`,
    `**Arrival airport:** ${d.arrival_iata}`,
    `**Scheduled departure (UTC):** ${d.scheduled_departure_utc}`,
    `**Scheduled arrival (UTC):** ${d.scheduled_arrival_utc}`,
    `**Event type:** ${d.event_type}`,
    "",
  ];

  if (d.event_type === "delay" && d.actual_arrival_utc) {
    lines.push(`**Actual arrival (UTC):** ${d.actual_arrival_utc}`, "");
  }
  if (d.event_type === "cancellation" && d.cancellation_notice_days) {
    lines.push(`**Cancellation notice (days):** ${d.cancellation_notice_days}`, "");
  }
  if (d.rebooked_departure_utc || d.rebooked_arrival_utc) {
    if (d.rebooked_departure_utc)
      lines.push(`**Rebooked departure (UTC):** ${d.rebooked_departure_utc}`);
    if (d.rebooked_arrival_utc)
      lines.push(`**Rebooked arrival (UTC):** ${d.rebooked_arrival_utc}`);
    lines.push("");
  }

  lines.push(
    "## Passenger details (PII — encrypted by intake workflow)",
    "",
    `**Passenger name:** ${d.passenger_name}`,
    `**Email:** ${d.email}`,
    `**Booking reference:** ${d.booking_reference}`,
    "",
    "## Narrative",
    "",
    d.narrative,
    "",
    "---",
    "*Filed via [EU261 Claim Agent](https://richardawe.github.io/Eu261) · Not legal advice · No fees*"
  );

  return lines.join("\n");
}

function buildGitHubURL(title, body) {
  const truncatedBody = body.length > MAX_BODY_CHARS
    ? body.slice(0, MAX_BODY_CHARS) + "\n\n<!-- body truncated; please add the rest manually -->"
    : body;

  const params = new URLSearchParams({
    title,
    body: truncatedBody,
    labels: CLAIM_LABELS,
  });
  return `${GITHUB_ISSUES_URL}?${params.toString()}`;
}

// Expose pure functions for unit testing (jsdom / Node.js test runner).
// These are no-ops in production since browsers don't expose window globally.
if (typeof window !== "undefined") {
  window.buildTitle = buildTitle;
  window.buildBody = buildBody;
  window.buildGitHubURL = buildGitHubURL;
  window.runCustomValidation = runCustomValidation;
  window.GITHUB_REPO = GITHUB_REPO;
  window.MAX_BODY_CHARS = MAX_BODY_CHARS;
}
