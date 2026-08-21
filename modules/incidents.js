// CDL — modules/incidents.js
import { supabase, SITES } from "../config.js";
import { logAudit } from "./audit_core.js";
import { ROLES } from "./roles.js";
import { showToast, showModal, closeModal, getCurrentUser } from "../app.js";

const INCIDENT_TYPES = ["missing", "stolen", "broken", "damaged", "expired", "wasted"];
const PM_DECISIONS = ["payable", "negligence", "operational_loss", "insurance", "investigating", "cleared"];

export async function renderIncidents(container, user) {
  const activeUser = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || user;
  const role = ROLES[activeUser.role] || {};
  const canCreate = role.canCreateIncident !== false;
  const canResolve = role.canResolveIncident || ["project_manager", "admin", "company_owner", "ceo", "site_overseer"].includes(activeUser.role);
  const siteFilter = role.siteScope === "assigned" ? (activeUser.site_ids || []) : SITES.map(s => s.id);

  container.innerHTML = `
    <div style="margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1 style="font-size:24px;font-weight:700;color:var(--text-100);">Incident Reports</h1>
        <p style="color:var(--text-200);font-size:13px;margin-top:4px;">Track missing, damaged, and stolen materials</p>
      </div>
      ${canCreate ? `<button class="btn btn-danger" onclick="window._incOpenNew()">⚠ Report Incident</button>` : ""}
    </div>
    <div style="display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap;">
      ${["Pending", "Under Review", "Resolved", "Escalated"].map((t, i) => {
        const key = t.toLowerCase().replace(" ", "_");
        return `<button onclick="window._incLoad('${key}')" id="inc-tab-${key}" 
          style="padding:7px 16px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:500;${i === 0 ? "background:var(--red);color:#fff;" : "background:var(--bg-600);color:var(--text-200);"}">
          ${t}
        </button>`;
      }).join("")}
    </div>
    <div id="inc-list"><div class="spinner" style="margin:60px auto;"></div></div>
  `;

  window._incLoad = (status) => {
    ["pending", "under_review", "resolved", "escalated"].forEach(s => {
      const b = document.getElementById(`inc-tab-${s}`);
      if (b) {
        b.style.background = s === status ? "var(--red)" : "var(--bg-600)";
        b.style.color = s === status ? "#fff" : "var(--text-200)";
      }
    });
    fetchIncidents(activeUser, siteFilter, status, canResolve);
  };

  window._incOpenNew = () => openIncidentModal(activeUser, siteFilter);
  fetchIncidents(activeUser, siteFilter, "pending", canResolve);
}

async function fetchIncidents(user, siteFilter, status, canResolve) {
  const list = document.getElementById("inc-list");
  if (!list) return;
  list.innerHTML = `<div class="spinner" style="margin:60px auto;"></div>`;

  try {
    let query = supabase.from("incidents").select("*, sites(name)").eq("status", status).order("created_at", { ascending: false }).limit(50);
    if (Array.isArray(siteFilter) && siteFilter.length > 0) {
      query = query.in("site_id", siteFilter);
    }
    const { data: incidents, error } = await query;
    if (error) throw error;

    if (!incidents || !incidents.length) {
      list.innerHTML = `<div class="card" style="text-align:center;padding:50px;color:var(--text-300);"><div style="font-size:32px;margin-bottom:8px;">✓</div><div>No ${status.replace(/_/g, " ")} incidents</div></div>`;
      return;
    }

    const typeColors = { missing: "var(--orange)", stolen: "var(--red)", broken: "var(--blue)", damaged: "var(--orange)", expired: "var(--text-300)", wasted: "var(--text-300)" };

    list.innerHTML = incidents.map(inc => {
      const tc = typeColors[inc.type] || "var(--text-300)";
      const siteName = inc.sites?.name || SITES.find(s => s.id === inc.site_id)?.name || `Site ${inc.site_id}`;

      return `
        <div class="card" style="margin-bottom:12px;border-left:3px solid ${tc};">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span class="badge" style="background:${tc}20;color:${tc};">${inc.type}</span>
                <span style="font-size:14px;font-weight:600;color:var(--text-100);">${inc.material_name}</span>
              </div>
              <div style="color:var(--text-200);font-size:12px;margin-top:4px;">
                ${siteName} · Qty: ${inc.quantity || "—"} · ${new Date(inc.created_at).toLocaleDateString("en-KE")}
              </div>
              ${inc.reason ? `<div style="color:var(--text-300);font-size:12px;margin-top:4px;">${inc.reason}</div>` : ""}
            </div>
            ${inc.estimated_value ? `<div style="color:var(--red);font-weight:600;font-size:13px;">KES ${Number(inc.estimated_value).toLocaleString()}</div>` : ""}
          </div>
          ${canResolve && status === "pending" ? `
            <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
              <select id="dec-${inc.id}" style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-100);font-size:12px;flex:1;">
                ${PM_DECISIONS.map(d => `<option value="${d}">${d.replace(/_/g, " ")}</option>`).join("")}
              </select>
              <button onclick="window._incResolve('${inc.id}')" class="btn btn-gold btn-sm">Resolve</button>
            </div>
          ` : ""}
          ${inc.pm_decision ? `<div style="margin-top:8px;font-size:12px;color:var(--green);">Decision: <strong>${inc.pm_decision.replace(/_/g, " ")}</strong></div>` : ""}
        </div>
      `;
    }).join("");

    window._incResolve = async (id) => {
      const decision = document.getElementById(`dec-${id}`)?.value;
      try {
        const { error } = await supabase.from("incidents").update({
          pm_decision: decision,
          status: "resolved",
          pm_resolved_at: new Date().toISOString()
        }).eq("id", id);
        if (error) throw error;
        await logAudit({ action: "incident_resolved", module: "incidents", record_id: id, after: { decision } });
        showToast("Incident resolved", "success");
        if (window._incLoad) window._incLoad("pending");
      } catch (err) {
        showToast(`Error: ${err.message}`, "error");
      }
    };
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red);">Error: ${err.message}</p>`;
  }
}

function openIncidentModal(user, siteFilter) {
  const activeUser = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || user;
  const sites = SITES.filter(s => Array.isArray(siteFilter) && siteFilter.includes(s.id));

  showModal(`
    <h2 style="font-size:18px;font-weight:700;color:var(--text-100);margin-bottom:6px;">Report Incident</h2>
    <p style="color:var(--text-300);font-size:13px;margin-bottom:20px;">Report missing, stolen, damaged, or wasted materials.</p>
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Site</label>
          <select id="inc-site" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
            ${(sites.length ? sites : SITES).map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Type</label>
          <select id="inc-type" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
            ${INCIDENT_TYPES.map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div>
        <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Material Name *</label>
        <input id="inc-material" type="text" placeholder="e.g. Copper Earthing Strip 25x3mm" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Quantity</label>
          <input id="inc-qty" type="number" min="0" value="1" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        </div>
        <div>
          <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Est. Value (KES)</label>
          <input id="inc-value" type="number" min="0" placeholder="0" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        </div>
      </div>
      <div>
        <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Reason / Description</label>
        <textarea id="inc-reason" rows="3" placeholder="Provide details of the incident..." style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);resize:none;"></textarea>
      </div>
      <div style="display:flex;gap:12px;">
        <button id="inc-submit-btn" onclick="window._incSubmit()" class="btn btn-danger" style="flex:1;">⚠ Report Incident</button>
        <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `);

  window._incSubmit = async () => {
    const siteId = parseInt(document.getElementById("inc-site").value);
    const type = document.getElementById("inc-type").value;
    const material = (document.getElementById("inc-material")?.value || "").trim();
    const qty = parseFloat(document.getElementById("inc-qty")?.value) || null;
    const value = parseFloat(document.getElementById("inc-value")?.value) || null;
    const reason = (document.getElementById("inc-reason")?.value || "").trim();

    if (!material) {
      showToast("Material name required", "error");
      return;
    }

    const btn = document.getElementById("inc-submit-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Submitting..."; }

    try {
      const payload = {
        site_id: siteId,
        reported_by: activeUser.id,
        type,
        material_name: material,
        quantity: qty,
        estimated_value: value,
        reason: reason || null,
        status: "pending"
      };

      const { data: saved, error } = await supabase.from("incidents").insert(payload).select().single();
      if (error) throw error;

      await logAudit({
        action: "incident_reported",
        module: "incidents",
        record_id: saved?.id,
        reason: `${type.toUpperCase()} incident: ${material} at Site ${siteId}`,
        after: payload
      });

      closeModal();
      showToast("Incident reported successfully", "warning");
      if (window._incLoad) window._incLoad("pending");
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = "⚠ Report Incident"; }
      showToast(`Error: ${err.message}`, "error");
    }
  };
}
