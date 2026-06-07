/**
 * EU261 Claim Agent — intake form logic.
 *
 * On submit the form dispatches a workflow_dispatch event to GitHub Actions.
 * The claim-receiver workflow (which runs with GITHUB_TOKEN server-side)
 * creates the issue.  The browser then polls the public issues API to
 * retrieve the issue number and show it to the user.
 *
 * Token required: fine-grained PAT, permission "Actions: Read and write" only.
 * Worst-case if leaked: attacker can trigger/cancel workflow runs — cannot
 * push code, cannot read secrets, cannot create issues directly.
 */

/** GitHub repository — update this if you fork the project. */
const GITHUB_REPO = "richardawe/Eu261";

/**
 * Fine-grained PAT with actions:write on this repo only.
 * Generate at: GitHub → Settings → Developer settings → Fine-grained tokens
 * Required permission: Repository > Actions > Read and write
 * Replace this placeholder before deploying (injected by pages.yml at build time).
 */
const GITHUB_SUBMISSIONS_TOKEN = "REPLACE_WITH_FINE_GRAINED_PAT";

/** Branch that holds claim-receiver.yml — update after merging to main. */
const DISPATCH_REF = "main";

/** Kept for the manual-fallback URL in the error state. */
const GITHUB_ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues/new`;
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

  form.addEventListener("submit", async (e) => {
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

    // Expose for tests (no navigation side-effect in jsdom).
    form.dataset.generatedTitle = title;
    form.dataset.generatedBody = body;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Submitting…";

    try {
      const workflowFile = "claim-receiver.yml";
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GITHUB_SUBMISSIONS_TOKEN}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            ref: DISPATCH_REF,
            inputs: { title, body },
          }),
        }
      );

      if (res.status !== 204) {
        const detail = await res.text().catch(() => "");
        throw new Error(`GitHub API returned ${res.status}. ${detail}`.trim());
      }

      form.hidden = true;
      showSuccessWaiting();
      pollForIssue(title).then((issue) => {
        if (issue) showSuccess(issue.number, issue.html_url);
        else showSuccessUnknown();
      });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Submit claim";
      const fallbackUrl = buildGitHubURL(title, body);
      showSubmitError(err.message, fallbackUrl);
    }
  });
}

function showSuccessWaiting() {
  const el = document.getElementById("claim-success");
  if (!el) return;
  el.querySelector("#claim-success-body").textContent =
    "Your claim has been received and is being processed. Retrieving your reference number…";
  el.hidden = false;
}

function showSuccess(issueNumber, issueUrl) {
  const el = document.getElementById("claim-success");
  if (!el) return;
  const body = el.querySelector("#claim-success-body");
  body.innerHTML =
    `Your claim has been logged as <a href="${issueUrl}" target="_blank" rel="noopener">#${issueNumber}</a>. ` +
    `Bookmark that link to track progress. Your personal details will be encrypted within a few seconds.`;
}

function showSuccessUnknown() {
  const el = document.getElementById("claim-success");
  if (!el) return;
  el.querySelector("#claim-success-body").innerHTML =
    `Your claim has been received. Check the ` +
    `<a href="https://github.com/${GITHUB_REPO}/issues?labels=claim" target="_blank" rel="noopener">issues list</a> ` +
    `for your reference number — it should appear within 30 seconds.`;
}

async function pollForIssue(title) {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const r = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/issues` +
          `?labels=claim&state=open&per_page=10&sort=created&direction=desc`,
        { headers: { Accept: "application/vnd.github+json" } }
      );
      if (!r.ok) continue;
      const issues = await r.json();
      const found = issues.find((iss) => iss.title === title);
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

function showSubmitError(message, fallbackUrl) {
  const el = document.getElementById("claim-error");
  if (!el) return;
  const msgEl = el.querySelector("#claim-error-message");
  if (msgEl) msgEl.textContent = message;
  const fallback = el.querySelector("#claim-fallback-link");
  if (fallback) fallback.href = fallbackUrl;
  el.hidden = false;
}

// ─────────────────────────────────────────────
// Event type toggle
// ─────────────────────────────────────────────

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
  toggle();
}

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = !visible;
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

/** Builds a manual-fallback GitHub URL (used in the error state only). */
function buildGitHubURL(title, body) {
  const truncatedBody = body.length > MAX_BODY_CHARS
    ? body.slice(0, MAX_BODY_CHARS) + "\n\n<!-- body truncated; please add the rest manually -->"
    : body;

  const params = new URLSearchParams({
    title,
    body: truncatedBody,
    labels: "claim",
  });
  return `${GITHUB_ISSUES_URL}?${params.toString()}`;
}

// Expose pure functions for unit testing (jsdom / Node.js test runner).
if (typeof window !== "undefined") {
  window.buildTitle = buildTitle;
  window.buildBody = buildBody;
  window.buildGitHubURL = buildGitHubURL;
  window.runCustomValidation = runCustomValidation;
  window.GITHUB_REPO = GITHUB_REPO;
  window.MAX_BODY_CHARS = MAX_BODY_CHARS;
}
