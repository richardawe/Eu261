/**
 * EU261 Claim Agent — status page logic.
 * Reads ?claim=<id>, fetches status/{id}.json from gh-pages, renders timeline.
 */

const GITHUB_REPO = "richardawe/Eu261";
const STATUS_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/gh-pages/status`;

const STATE_LABELS = {
  "state:intake-complete":    { label: "Received" },
  "state:eligibility-passed": { label: "Eligible ✓" },
  "state:eligibility-failed": { label: "Not eligible" },
  "state:draft-ready":        { label: "Draft ready" },
  "state:draft-approved":     { label: "Draft approved" },
  "state:submitted-airline":  { label: "Submitted to airline" },
  "state:awaiting-airline-2": { label: "Chasing airline" },
  "state:airline-accepted":   { label: "Accepted by airline" },
  "state:airline-rejected":   { label: "Rejected by airline" },
  "state:escalated-neb":      { label: "Escalated to NEB" },
  "state:neb-decided-won":    { label: "NEB ruled in your favour" },
  "state:neb-decided-lost":   { label: "NEB rejected" },
  "state:closed-won":         { label: "Closed — won 🎉" },
  "state:closed-lost":        { label: "Closed — not won" },
  "state:error":              { label: "Error" },
};

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const claimId = params.get("claim");
  const lookupSection = document.getElementById("lookup-section");
  const lookupForm = document.getElementById("lookup-form");
  const claimInput = document.getElementById("claim-input");

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
    const resp = await fetch(`${STATUS_BASE_URL}/${claimId}.json`);
    if (!resp.ok) {
      showBanner("error", resp.status === 404
        ? `No status found for claim #${claimId}. The claim may still be processing.`
        : `Could not load status: HTTP ${resp.status}`);
      return;
    }
    renderStatus(await resp.json());
  } catch (err) {
    showBanner("error", `Could not fetch claim status. (${err.message})`);
  } finally {
    loading.hidden = true;
  }
}

function renderStatus(data) {
  const card = document.getElementById("status-card");
  document.getElementById("status-flight").textContent = `Claim #${data.claim_id}: ${data.flight ?? ""}`;
  const stateInfo = STATE_LABELS[data.current_state] ?? { label: data.current_state };
  document.getElementById("status-state-label").textContent = `Current status: ${stateInfo.label}`;

  const timeline = document.getElementById("status-timeline");
  timeline.innerHTML = "";
  (data.timeline ?? []).forEach((entry) => {
    const info = STATE_LABELS[entry.state] ?? { label: entry.state };
    const isActive = entry.state === data.current_state;
    const isError  = entry.state === "state:error" || entry.state.includes("failed");
    const li = document.createElement("li");
    li.className = "timeline-item";
    li.innerHTML = `
      <div class="timeline-dot ${isError ? "error" : "done"} ${isActive ? "active" : ""}"></div>
      <div class="timeline-content">
        <strong>${info.label}</strong><br />
        <time datetime="${entry.at ?? ""}">${formatDate(entry.at)}</time>
        ${entry.note ? `<p>${escHtml(entry.note)}</p>` : ""}
      </div>`;
    timeline.appendChild(li);
  });

  const ghLink = document.getElementById("status-github-link");
  if (data.github_url) { ghLink.href = data.github_url; ghLink.hidden = false; } else { ghLink.hidden = true; }
  card.hidden = false;
}

function showBanner(type, message) {
  const banner = document.getElementById("status-banner");
  banner.className = `banner ${type}`;
  banner.textContent = message;
  banner.hidden = false;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
  } catch { return iso; }
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
