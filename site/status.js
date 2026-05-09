/**
 * EU261 Claim Agent — status page logic.
 *
 * Reads ?claim=<issue_number> from the URL, fetches the public status JSON
 * written by the intake/eligibility workflows to the gh-pages branch, and
 * renders a timeline.
 *
 * Status JSON shape (written by api/status_writer.py):
 * {
 *   "claim_id": "42",
 *   "flight": "U2 EZY1234 LHR→AMS 2024-06-01",
 *   "current_state": "state:eligibility-passed",
 *   "timeline": [
 *     { "state": "state:intake-complete", "at": "2024-06-01T12:00:00Z", "note": "..." },
 *     ...
 *   ],
 *   "github_url": "https://github.com/owner/repo/issues/42"
 * }
 */

const GITHUB_REPO = "richardawe/Eu261";

/** Base URL for status JSON files on the gh-pages branch. */
const STATUS_BASE_URL =
  `https://raw.githubusercontent.com/${GITHUB_REPO}/gh-pages/status`;

// Human-readable labels and descriptions for each state
const STATE_LABELS = {
  "state:intake-complete":    { label: "Received",             desc: "Your claim has been received and is being processed." },
  "state:eligibility-passed": { label: "Eligible ✓",           desc: "You are eligible for compensation under EU261." },
  "state:eligibility-failed": { label: "Not eligible",         desc: "Unfortunately your claim does not meet EU261 criteria. See the issue for details." },
  "state:draft-ready":        { label: "Draft ready",          desc: "A claim letter has been drafted for your review." },
  "state:draft-approved":     { label: "Draft approved",       desc: "You have approved the claim letter." },
  "state:submitted-airline":  { label: "Submitted to airline", desc: "Your claim has been sent to the airline." },
  "state:awaiting-airline-2": { label: "Chasing airline",      desc: "The airline has not responded. A follow-up has been sent." },
  "state:airline-accepted":   { label: "Accepted by airline",  desc: "The airline has agreed to pay. Expect payment within 14 days." },
  "state:airline-rejected":   { label: "Rejected by airline",  desc: "The airline has rejected the claim. We are escalating." },
  "state:escalated-neb":      { label: "Escalated to NEB",     desc: "Your claim has been submitted to the national enforcement body." },
  "state:neb-decided-won":    { label: "NEB ruled in your favour", desc: "The NEB has ordered the airline to pay." },
  "state:neb-decided-lost":   { label: "NEB rejected",         desc: "The NEB did not uphold the claim." },
  "state:closed-won":         { label: "Closed — won 🎉",      desc: "Compensation has been paid. Claim closed." },
  "state:closed-lost":        { label: "Closed — not won",     desc: "All avenues exhausted. Claim closed." },
  "state:error":              { label: "Error",                desc: "Something went wrong. See the GitHub issue for details." },
};

// ─────────────────────────────────────────────
// Initialise
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const claimId = params.get("claim");

  const lookupSection  = document.getElementById("lookup-section");
  const lookupForm     = document.getElementById("lookup-form");
  const claimInput     = document.getElementById("claim-input");

  lookupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = claimInput.value.trim();
    if (id) loadClaim(id);
  });

  if (claimId) {
    lookupSection.hidden = true;
    if (claimInput) claimInput.value = claimId;
    loadClaim(claimId);
  }
});

// ─────────────────────────────────────────────
// Load and render claim
// ─────────────────────────────────────────────

async function loadClaim(claimId) {
  const loading = document.getElementById("status-loading");
  const section = document.getElementById("status-section");
  const banner  = document.getElementById("status-banner");
  const card    = document.getElementById("status-card");

  section.hidden = false;
  loading.hidden = false;
  card.hidden    = true;
  banner.hidden  = true;

  try {
    const url = `${STATUS_BASE_URL}/${claimId}.json`;
    const resp = await fetch(url);

    if (!resp.ok) {
      if (resp.status === 404) {
        showBanner("error",
          `No status found for claim #${claimId}. ` +
          `The claim may still be processing (check back in a few minutes) ` +
          `or the issue number may be incorrect.`
        );
      } else {
        showBanner("error", `Could not load status: HTTP ${resp.status}`);
      }
      return;
    }

    const data = await resp.json();
    renderStatus(data);

  } catch (err) {
    showBanner("error",
      "Could not fetch claim status. " +
      "This may be a network issue or the claim is not yet published. " +
      `(${err.message})`
    );
  } finally {
    loading.hidden = true;
  }
}

function renderStatus(data) {
  const card = document.getElementById("status-card");

  document.getElementById("status-flight").textContent =
    `Claim #${data.claim_id}: ${data.flight ?? ""}`;

  const stateInfo = STATE_LABELS[data.current_state] ?? {
    label: data.current_state,
    desc: "",
  };
  document.getElementById("status-state-label").textContent =
    `Current status: ${stateInfo.label}`;

  const timeline = document.getElementById("status-timeline");
  timeline.innerHTML = "";

  (data.timeline ?? []).forEach((entry) => {
    const info = STATE_LABELS[entry.state] ?? { label: entry.state };
    const isActive = entry.state === data.current_state;
    const isError  = entry.state === "state:error" || entry.state.startsWith("state:eligibility-failed");

    const li = document.createElement("li");
    li.className = "timeline-item";
    li.innerHTML = `
      <div class="timeline-dot ${isError ? "error" : "done"} ${isActive ? "active" : ""}"></div>
      <div class="timeline-content">
        <strong>${info.label}</strong>
        <br />
        <time datetime="${entry.at ?? ""}">${formatDate(entry.at)}</time>
        ${entry.note ? `<p>${escHtml(entry.note)}</p>` : ""}
      </div>
    `;
    timeline.appendChild(li);
  });

  const ghLink = document.getElementById("status-github-link");
  if (data.github_url) {
    ghLink.href = data.github_url;
    ghLink.hidden = false;
  } else {
    ghLink.hidden = true;
  }

  card.hidden = false;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function showBanner(type, message) {
  const banner = document.getElementById("status-banner");
  banner.className = `banner ${type}`;
  banner.textContent = message;
  banner.hidden = false;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso)) + " UTC";
  } catch {
    return iso;
  }
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
