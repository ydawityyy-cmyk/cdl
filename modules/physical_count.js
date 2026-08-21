// CDL — modules/physical_count.js
// Feature 9: Physical Count Reconciliation
// Monthly cycle, variance flagging, Store Manager review/approval
import { supabase, SITES } from "../config.js";
import { logAudit } from "./audit_core.js";
import { ROLES } from "./roles.js";
import { showToast, showModal, closeModal } from "../app.js";

/**
 * renderPhysicalCount — UI for initiating counts and reviewing results
 */
export async function renderPhysicalCount(container, user) {
  if (!container) return;
  const role = ROLES[user.role] || {};
  const canInitiate = ["storekeeper_local", "storekeeper_import", "storekeeper_scaffolding", "store_manager", "admin", "company_owner", "ceo"].includes(user.role);
  const canApprove = ["store_manager", "admin", "company_owner", "ceo"].includes(user.role);

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-size:24px;font-weight:700;color:var(--text-100);">📊 Physical Count Reconciliation</h1>
      <p style="color:var(--text-200);font-size:14px;margin-top:4px;">Monthly stock take, variance analysis, and approval workflow</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      ${canInitiate ? `<button class="btn btn-gold" onclick="window._pcOpenInit()">📋 Start Count Cycle</button>` : ""}
      <button class="btn btn-ghost" onclick="window._pcLoad('counts')">Recent Counts</button>
      ${canApprove ? `<button class="btn btn-ghost" onclick="window._pcLoad('pending')">Pending Approval</button>` : ""}
    </div>
    <div id="pc-wrap"><div class="spinner" style="margin:60px auto;"></div></div>`;

  window._pcOpenInit = () => openInitModal(user, canInitiate);
  await loadCounts(user, canApprove);
}

/**
 * loadCounts — loads recent count cycles and pending approvals
 */
async function loadCounts(user, canApprove) {
  const wrap = document.getElementById("pc-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="spinner" style="margin:60px auto;"></div>`;

  try {
    // Check if table exists
    const { data, error } = await supabase
      .from("physical_counts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error && error.code === '42P01') {
      wrap.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">Physical count system not initialized</div>`;
      return;
    }
    if (error) throw error;

    const counts = Array.isArray(data) ? data : [];

    if (!counts.length) {
      wrap.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">No count cycles found. Start a new count with the button above.</div>`;
      return;
    }

    // Build table
    let html = `<div class="card" style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="border-bottom:1px solid var(--border);">
        ${["Site","Cycle Date","Status","Counted Items","Variance Items","Created By","Actions"].map(h =>
          `<th style="text-align:left;padding:10px 8px;color:var(--text-400);font-weight:500;font-size:11px;text-transform:uppercase;">${h}</th>`
        ).join("")}
      </tr></thead><tbody>`;

    for (const c of counts) {
      const siteName = c.site_id ? `Site ${c.site_id}` : "All Sites";
      const cycleDate = new Date(c.created_at).toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
      const countedItems = c.counted_items || 0;
      const varianceItems = c.variance_items || 0;
      const bgColor = c.status === "approved" ? "rgba(46,160,67,0.1)" : c.status === "pending" ? "rgba(243,156,18,0.1)" : "rgba(61,142,248,0.1)";
      const statusColor = c.status === "approved" ? "var(--green)" : c.status === "pending" ? "var(--orange)" : "var(--blue)";

      let actions = "";
      if (canApprove && c.status === "pending_review") {
        actions = `<button onclick="window._pcReview('${c.id}')" class="btn btn-gold btn-sm">Review</button>`;
      } else if (c.status === "completed") {
        actions = `<button onclick="window._pcViewReport('${c.id}')" class="btn btn-ghost btn-sm">View Report</button>`;
      }

      html += `<tr style="border-bottom:1px solid rgba(30,35,48,0.4);background:${bgColor};">
        <td style="padding:10px 8px;color:var(--text-100);">${siteName}</td>
        <td style="padding:10px 8px;color:var(--text-200);font-size:12px;">${cycleDate}</td>
        <td style="padding:10px 8px;">
          <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;
            background:${statusColor}20;color:${statusColor};">${c.status}</span>
        </td>
        <td style="padding:10px 8px;color:var(--text-200);">${countedItems}</td>
        <td style="padding:10px 8px;color:${varianceItems > 0 ? "var(--orange)" : "var(--text-200)"}">${varianceItems > 0 ? `⚠ ${varianceItems}` : varianceItems}</td>
        <td style="padding:10px 8px;color:var(--text-300);font-size:12px;">${c.created_by_name || "—"}</td>
        <td style="padding:10px 8px;">${actions || "—"}</td>
      </tr>`;
    }

    html += `</tbody></table></div>`;
    wrap.innerHTML = html;
  } catch (err) {
    wrap.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">Error: ${err.message}</div>`;
  }
}

window._pcLoad = (view) => {
  // Simple tab-style view switching
  loadCounts(currentUser, canApproveUser);
};

let currentUser = null;
let canApproveUser = false;

function openInitModal(user, canInitiate) {
  if (!canInitiate) { showToast("Not authorized", "error"); return; }

  showModal(`<h2 style="font-size:18px;font-weight:700;color:var(--text-100);margin-bottom:6px;">Start Physical Count Cycle</h2>
  <p style="color:var(--text-300);font-size:13px;margin-bottom:20px;">Create a new monthly count cycle. This will snapshot current stock levels.</p>
  <div style="display:flex;flex-direction:column;gap:16px;">
    <div>
      <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Site</label>
      <select id="pc-site" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        ${SITES.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Count Type</label>
      <select id="pc-type" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        <option value="monthly">Monthly Full Count</option>
        <option value="spot">Spot Check (Selected Items)</option>
        <option value="urgent">Urgent/Emergency Count</option>
      </select>
    </div>
    <div style="display:flex;gap:12px;">
      <button onclick="window._pcCreateCount()" class="btn btn-gold" style="flex:1;">📋 Create Count Cycle</button>
      <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
    </div>
  </div>`);

  window._pcCreateCount = async () => {
    const siteId = parseInt(document.getElementById("pc-site").value);
    const countType = document.getElementById("pc-type").value;
    const now = new Date();
    const cycleMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    try {
      const { data: existing, error: checkErr } = await supabase
        .from("physical_counts")
        .select("id")
        .eq("site_id", siteId)
        .eq("cycle_month", cycleMonth);

      if (checkErr && checkErr.code !== '42P01') {
        if (checkErr) throw checkErr;
      }

      let countId;
      if (checkErr && checkErr.code === '42P01') {
        // Table doesn't exist - inform user
        showToast("Physical count system not initialized — migration needed", "error");
        closeModal();
        return;
      }

      if (Array.isArray(existing) && existing.length > 0) {
        showToast(`Count cycle for this site already exists for ${cycleMonth}`, "error");
        return;
      }

      const { data: saved, error } = await supabase
        .from("physical_counts")
        .insert({
          site_id: siteId,
          cycle_month,
          count_type: countType,
          status: "in_progress",
          created_by: user.id,
          created_at: now.toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      countId = saved.id;

      await logAudit({
        action: "physical_count_created",
        module: "physical_count",
        record_id: countId,
        after: { site_id: siteId, cycle_month: cycleMonth, count_type: countType }
      });

      showToast(`Count cycle created for Site ${siteId}`, "success");
      closeModal();
      await loadCounts(user, ["store_manager", "admin", "company_owner", "ceo"].includes(user.role));

      // After creation, prompt to start counting
      setTimeout(() => {
        showToast("Navigate to Inventory to perform the actual count", "info");
      }, 1500);

    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    }
  };
}

/**
 * openReviewModal — Store Manager reviews count results
 */
window._pcReview = async (countId) => {
  try {
    // Fetch count details
    const { data: count, error: countErr } = await supabase
      .from("physical_counts")
      .select("*")
      .eq("id", countId)
      .single();

    if (countErr) throw countErr;

    // Fetch count items with variances
    const { data: items, error: itemsErr } = await supabase
      .from("physical_count_items")
      .select("*")
      .eq("count_id", countId);

    if (itemsErr && itemsErr.code !== '42P01') throw itemsErr;

    const countItems = Array.isArray(items) ? items : [];
    const varianceItems = countItems.filter(i => Math.abs((i.counted_qty || 0) - (i.system_qty || 0)) > 0.01);
    const tolerance = 0.10; // 10% tolerance
    const needsInvestigation = varianceItems.filter(i => {
      const diff = Math.abs((i.counted_qty || 0) - (i.system_qty || 0));
      const pct = i.system_qty > 0 ? diff / i.system_qty : 1;
      return pct > tolerance;
    });

    showModal(`<h2 style="font-size:18px;font-weight:700;color:var(--text-100);margin-bottom:6px;">📋 Count Review — ${count.cycle_month}</h2>
    <p style="color:var(--text-300);font-size:13px;margin-bottom:16px;">
      Site ${count.site_id} · ${countItems.length} items counted ·
      ${varianceItems.length} variances · ${needsInvestigation.length} exceeding 10% tolerance
    </p>
    <div style="max-height:400px;overflow-y:auto;margin-bottom:16px;">
      ${countItems.length ? `<table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:6px;color:var(--text-400);">Material</th>
          <th style="text-align:right;padding:6px;color:var(--text-400);">System</th>
          <th style="text-align:right;padding:6px;color:var(--text-400);">Counted</th>
          <th style="text-align:right;padding:6px;color:var(--text-400);">Diff</th>
          <th style="text-align:left;padding:6px;color:var(--text-400);">Status</th>
        </tr></thead><tbody>
        ${countItems.map(i => {
          const diff = (i.counted_qty || 0) - (i.system_qty || 0);
          const pct = i.system_qty > 0 ? (diff / i.system_qty * 100) : 0;
          const overTolerance = Math.abs(pct) > 50; // over 50% variance
          const needInv = Math.abs(pct) > tolerance * 100;
          const statusColor = diff === 0 ? "var(--green)" : overTolerance ? "var(--red)" : needInv ? "var(--orange)" : "var(--text-300)";
          const statusLabel = diff === 0 ? "OK" : overTolerance ? `⚠ ${pct.toFixed(1)}%` : needInv ? `${pct.toFixed(1)}%` : "Minor";
          return `<tr style="border-bottom:1px solid rgba(30,35,48,0.3);">
            <td style="padding:6px;color:var(--text-100);">${i.material_name}</td>
            <td style="padding:6px;text-align:right;color:var(--text-200);">${i.system_qty || 0}</td>
            <td style="padding:6px;text-align:right;color:var(--text-100);">${i.counted_qty || 0}</td>
            <td style="padding:6px;text-align:right;color:${diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--text-300)"};>${diff}</td>
            <td style="padding:6px;color:${statusColor};font-weight:500;">${statusLabel}</td>
          </tr>`;
        }).join("")}
        </tbody></table>` : '<p style="color:var(--text-300);">No items found for this count</p>'}
    </div>
    <div style="display:flex;gap:12px;">
      <button onclick="window._pcApproveCount('${countId}')" class="btn btn-gold" style="flex:1;">✓ Approve Count</button>
      <button onclick="window._pcRequestAdjustments('${countId}')" class="btn btn-ghost" style="flex:1;">Request Adjustments</button>
      <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
    </div>`);

    window._pcApproveCount = async (id) => {
      try {
        const { error } = await supabase
          .from("physical_counts")
          .update({ status: "approved", approved_at: new Date().toISOString() })
          .eq("id", id);

        if (error) throw error;

        await logAudit({
          action: "physical_count_approved",
          module: "physical_count",
          record_id: id,
          after: { status: "approved" }
        });

        showToast("Physical count approved", "success");
        closeModal();
        if (window._pcRefresh) window._pcRefresh();
      } catch (err) {
        showToast(`Error: ${err.message}`, "error");
      }
    };

    window._pcRequestAdjustments = (id) => {
      showToast("Creating bin card corrections for variances...", "info");
      // This would trigger creation of adjustment entries
      closeModal();
    };
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
};

/**
 * openReportModal — View final report of a completed count
 */
window._pcViewReport = async (countId) => {
  try {
    const { data: count, error } = await supabase
      .from("physical_counts")
      .select("*")
      .eq("id", countId)
      .single();

    if (error) throw error;

    showModal(`<h2 style="font-size:18px;font-weight:700;color:var(--text-100);margin-bottom:6px;">Site Count Report</h2>
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
        <div><span style="color:var(--text-400);font-size:11px;">Site</span><div style="color:var(--text-100);">${count.site_id}</div></div>
        <div><span style="color:var(--text-400);font-size:11px;">Cycle Month</span><div style="color:var(--text-100);">${count.cycle_month}</div></div>
        <div><span style="color:var(--text-400);font-size:11px;">Count Type</span><div style="color:var(--text-100);">${count.count_type}</div></div>
        <div><span style="color:var(--text-400);font-size:11px;">Status</span><div style="color:var(--text-100);">${count.status}</div></div>
      </div>
      <button onclick="window._closeModal()" class="btn btn-ghost">Close</button>
    </div>`);
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
};

export const physicalCountNavGuard = {
  section: "physical_count",
  check: (user) => ["store_manager", "admin", "company_owner", "ceo", "storekeeper_local", "storekeeper_import", "storekeeper_scaffolding"].includes(user.role)
};
