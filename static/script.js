/* ============================================================
   LeadFlow — Client Lead Management System
   Frontend ↔ Flask REST API (SQLite backend)
   ============================================================ */

const API = "/api";

// ── In-memory cache of leads from the server ─────────────────
let leads = [];

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  fetchLeads();
  setupSidebar();

  // Enter key triggers addLead from any form input
  ["leadName", "leadEmail", "leadSource"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter") addLead(); });
  });
});

// ── API helper ────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── fetchLeads()  — GET /api/leads ───────────────────────────
async function fetchLeads() {
  showLoading(true);
  try {
    leads = await apiFetch("/leads");
    displayLeads();
  } catch (err) {
    showError("Could not load leads: " + err.message);
    showLoading(false);
  }
}

// ── addLead()  — POST /api/leads ──────────────────────────────
async function addLead() {
  const nameInput   = document.getElementById("leadName");
  const emailInput  = document.getElementById("leadEmail");
  const sourceInput = document.getElementById("leadSource");

  const name   = nameInput.value.trim();
  const email  = emailInput.value.trim();
  const source = sourceInput.value.trim();

  // Client-side validation
  if (!name || !email || !source) {
    showError("Please fill in all fields before adding a lead.");
    return;
  }
  if (!isValidEmail(email)) {
    showError("Please enter a valid email address.");
    return;
  }

  clearError();

  try {
    const newLead = await apiFetch("/leads", {
      method: "POST",
      body: JSON.stringify({ name, email, source }),
    });

    leads.unshift(newLead);      // prepend so it appears at top
    displayLeads();

    nameInput.value   = "";
    emailInput.value  = "";
    sourceInput.value = "";
    nameInput.focus();
  } catch (err) {
    showError(err.message);
  }
}

// ── displayLeads()  — render table from local cache ───────────
function displayLeads() {
  const tbody      = document.getElementById("leadsTableBody");
  const emptyState = document.getElementById("emptyState");
  const tableWrap  = document.getElementById("tableWrap");
  const loadingEl  = document.getElementById("loadingState");
  const query      = (document.getElementById("searchInput")?.value || "").toLowerCase();

  if (loadingEl) loadingEl.style.display = "none";

  const filtered = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(query) ||
      l.email.toLowerCase().includes(query) ||
      l.source.toLowerCase().includes(query)
  );

  updateStats();

  document.getElementById("leadCountBadge").textContent =
    `${filtered.length} lead${filtered.length !== 1 ? "s" : ""}`;

  if (filtered.length === 0) {
    emptyState.style.display = "flex";
    tableWrap.style.display  = "none";
    tbody.innerHTML = "";
    return;
  }

  emptyState.style.display = "none";
  tableWrap.style.display  = "block";

  tbody.innerHTML = filtered
    .map(
      (lead, idx) => `
    <tr data-id="${lead.id}">
      <td><span class="row-num">${idx + 1}</span></td>
      <td>
        <div class="lead-name-cell">
          <div class="lead-avatar">${initials(lead.name)}</div>
          <div>
            <div class="lead-name">${escHtml(lead.name)}</div>
            <div class="lead-email">${escHtml(lead.email)}</div>
          </div>
        </div>
      </td>
      <td>${escHtml(lead.email)}</td>
      <td><span class="source-badge">${escHtml(lead.source)}</span></td>
      <td>
        <select
          class="status-select ${statusClass(lead.status)}"
          onchange="updateStatus(${lead.id}, this.value)"
        >
          <option value="New"       ${lead.status === "New"       ? "selected" : ""}>🔵 New</option>
          <option value="Contacted" ${lead.status === "Contacted" ? "selected" : ""}>🟡 Contacted</option>
          <option value="Converted" ${lead.status === "Converted" ? "selected" : ""}>🟢 Converted</option>
        </select>
      </td>
      <td>
        <input
          type="text"
          class="note-input"
          placeholder="Add note…"
          value="${escHtml(lead.note || "")}"
          onblur="addNote(${lead.id}, this.value)"
          onkeydown="if(event.key==='Enter') this.blur()"
        />
      </td>
      <td>
        <button class="btn-delete" onclick="deleteLead(${lead.id})">Delete</button>
      </td>
    </tr>
  `
    )
    .join("");
}

// ── updateStatus()  — PATCH /api/leads/:id ───────────────────
async function updateStatus(id, newStatus) {
  try {
    const updated = await apiFetch(`/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    const idx = leads.findIndex((l) => l.id === id);
    if (idx !== -1) leads[idx] = updated;
    displayLeads();
  } catch (err) {
    showError("Could not update status: " + err.message);
  }
}

// ── addNote()  — PATCH /api/leads/:id ────────────────────────
async function addNote(id, noteText) {
  try {
    const updated = await apiFetch(`/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ note: noteText.trim() }),
    });
    const idx = leads.findIndex((l) => l.id === id);
    if (idx !== -1) leads[idx] = updated;
    updateStats();                 // update counts without re-rendering table (avoids focus loss)
  } catch (err) {
    showError("Could not save note: " + err.message);
  }
}

// ── deleteLead()  — DELETE /api/leads/:id ────────────────────
async function deleteLead(id) {
  try {
    await apiFetch(`/leads/${id}`, { method: "DELETE" });
    leads = leads.filter((l) => l.id !== id);
    displayLeads();
  } catch (err) {
    showError("Could not delete lead: " + err.message);
  }
}

// ── updateStats()  — derive counts from local cache ──────────
function updateStats() {
  const total   = leads.length;
  const numNew  = leads.filter((l) => l.status === "New").length;
  const numCont = leads.filter((l) => l.status === "Contacted").length;
  const numConv = leads.filter((l) => l.status === "Converted").length;

  document.getElementById("totalCount").textContent     = total;
  document.getElementById("convertedCount").textContent = numConv;
  document.getElementById("countNew").textContent       = numNew;
  document.getElementById("countContacted").textContent = numCont;
  document.getElementById("countConverted").textContent = numConv;

  const pct = (n) => (total === 0 ? "0%" : Math.round((n / total) * 100) + "%");
  document.getElementById("barNew").style.width       = pct(numNew);
  document.getElementById("barContacted").style.width = pct(numCont);
  document.getElementById("barConverted").style.width = pct(numConv);
}

// ── Sidebar (mobile) ─────────────────────────────────────────
function setupSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const hamBtn  = document.getElementById("hamburgerBtn");

  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  hamBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  });
}

// ── UI helpers ────────────────────────────────────────────────
function showLoading(show) {
  const el = document.getElementById("loadingState");
  if (el) el.style.display = show ? "flex" : "none";
}

function showError(msg) {
  const el = document.getElementById("formError");
  if (!el) return;
  el.textContent = msg;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.textContent = ""; }, 5000);
}

function clearError() {
  const el = document.getElementById("formError");
  if (el) el.textContent = "";
}

// ── Pure helpers ──────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function initials(name) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function statusClass(status) {
  return { New: "status-new", Contacted: "status-contacted", Converted: "status-converted" }[status] || "status-new";
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}