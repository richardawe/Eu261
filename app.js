/**
 * EU261 Claim Agent — intake form logic.
 *
 * On submit the form does NOT post to a server.  Instead it builds a
 * GitHub “new issue” deep-link with the claim body pre-filled.  The user
 * arrives on GitHub, reviews the pre-populated issue, and clicks Submit.
 */

const GITHUB_REPO = "richardawe/Eu261";
const GITHUB_ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues/new`;
const CLAIM_LABELS = "claim";
const MAX_BODY_CHARS = 6000;

document.addEventListener("DOMContentLoaded", () => {
  wireIntakeForm();
  wireEventTypeToggle();
});

function wireIntakeForm() {
  const form = document.getElementById("claim-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const extra = runCustomValidation(form);
    if (extra.length > 0) { extra.forEach(({ field, msg }) => showFieldError(form, field, msg)); return; }
    const data = collectFormData(form);
    const url = buildGitHubURL(buildTitle(data), buildBody(data));
    form.dataset.generatedUrl = url;
    window.location.href = url;
  });
}

function wireEventTypeToggle() {
  const select = document.getElementById("event_type");
  if (!select) return;
  const toggle = () => {
    const v = select.value;
    setVisible("actual-arrival-group", v === "delay");
    setVisible("cancellation-notice-group", v === "cancellation");
    setVisible("rebooked-group", v === "cancellation" || v === "rebooked_earlier");
  };
  select.addEventListener("change", toggle);
  toggle();
}

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = !visible;
  el.querySelectorAll("[data-conditionally-required]").forEach((inp) => { inp.required = visible; });
}

function runCustomValidation(form) {
  const errors = [];
  const get = (name) => form.elements[name]?.value?.trim() ?? "";
  const depDt = get("scheduled_departure_utc");
  const arrDt = get("scheduled_arrival_utc");
  if (depDt && arrDt && arrDt <= depDt)
    errors.push({ field: "scheduled_arrival_utc", msg: "Scheduled arrival must be after scheduled departure." });
  if (get("event_type") === "delay") {
    const actualArr = get("actual_arrival_utc");
    if (actualArr && depDt && actualArr <= depDt)
      errors.push({ field: "actual_arrival_utc", msg: "Actual arrival must be after scheduled departure." });
  }
  if (!form.elements["consent"]?.checked)
    errors.push({ field: "consent", msg: "You must agree to proceed." });
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
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field-error").forEach((el) => el.remove());
}

function collectFormData(form) {
  const get = (name) => form.elements[name]?.value?.trim() ?? "";
  const checked = (name) => form.elements[name]?.checked ?? false;
  return {
    passenger_name: get("passenger_name"),
    email: get("email"),
    booking_reference: get("booking_reference"),
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

function buildTitle(d) {
  return `Claim: ${d.carrier_iata} ${d.flight_number} ${d.departure_iata}→${d.arrival_iata} ${d.scheduled_departure_utc.split("T")[0]} [${d.event_type.replace(/_/g, "-")}]`;
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
  if (d.event_type === "delay" && d.actual_arrival_utc)
    lines.push(`**Actual arrival (UTC):** ${d.actual_arrival_utc}`, "");
  if (d.event_type === "cancellation" && d.cancellation_notice_days)
    lines.push(`**Cancellation notice (days):** ${d.cancellation_notice_days}`, "");
  if (d.rebooked_departure_utc || d.rebooked_arrival_utc) {
    if (d.rebooked_departure_utc) lines.push(`**Rebooked departure (UTC):** ${d.rebooked_departure_utc}`);
    if (d.rebooked_arrival_utc) lines.push(`**Rebooked arrival (UTC):** ${d.rebooked_arrival_utc}`);
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
  const params = new URLSearchParams({ title, body: truncatedBody, labels: CLAIM_LABELS });
  return `${GITHUB_ISSUES_URL}?${params.toString()}`;
}

if (typeof window !== "undefined") {
  window.buildTitle = buildTitle;
  window.buildBody = buildBody;
  window.buildGitHubURL = buildGitHubURL;
  window.runCustomValidation = runCustomValidation;
  window.GITHUB_REPO = GITHUB_REPO;
  window.MAX_BODY_CHARS = MAX_BODY_CHARS;
}
