// ============================================================
// CDL Site Management v10 — modules/material_approvals.js
// Feature 4: Material Approval Gate (Watcher)
// New material names not in MATERIALS_DB get "pending" status
// until approved by an admin/store_manager.
// ============================================================

import { supabase } from "../config.js";
import { findMaterial } from "../data.js";
import { logAudit } from "./audit_core.js";
import { sendNotif } from "./notifs.js";
import { showToast } from "../app.js";
import { ROLES } from "./roles.js";

/**
 * checkAndQueueNewMaterial — the approval gate.
 *
 * Called before upsertStock when a storekeeper adds material via GRN.
 * If the material name already exists as *approved* stock for this site+type,
 * returns { isNew: false, stockId } so the caller can do a normal merge.
 * If the name is new, creates a material_watchlist entry and returns
 * { isNew: true, watchId } — the stock is NOT inserted; it waits for approval.
 */
export async function checkAndQueueNewMaterial(materialName, siteId, skType, userId, userInfo, customMeta = {}) {
  try {
    // Check if exact name exists as approved stock for this site+type
    const { data: existing, error: chkErr } = await supabase
      .from("stock")
      .select("id,status")
      .eq("site_id", siteId)
      .eq("material_name", materialName)
      .eq("storekeeper_type", skType)
      .eq("status", "approved")
      .limit(1);
    if (chkErr && chkErr.code !== '42703') throw chkErr; // ignore missing status column
    if (Array.isArray(existing) && existing.length > 0) {
      return { isNew: false, stockId: existing[0].id };
    }

    // Fallback: if status column missing (migration_v10 not applied), retry without filter
    if (chkErr && chkErr.code === '42703') {
      const { data: existingRetry, error: retryErr } = await supabase
        .from("stock")
        .select("id")
        .eq("site_id", siteId)
        .eq("material_name", materialName)
        .eq("storekeeper_type", skType)
        .limit(1);
      if (retryErr) throw retryErr;
      if (Array.isArray(existingRetry) && existingRetry.length > 0) {
        return { isNew: false, stockId: existingRetry[0].id };
      }
    }

    // Also check pending watchlist entries for the same name (dedup)
    const { data: dupes, error: dupErr } = await supabase
      .from("material_watchlist")
      .select("id")
      .eq("site_id", siteId)
      .eq("storekeeper_type", skType)
      .eq("material_name", materialName)
      .eq("status", "pending")
      .limit(1);
    if (dupErr) throw dupErr;
    if (Array.isArray(dupes) && dupes.length > 0) {
      // Already queued by another storekeeper — treat as "not new stock yet"
      return { isNew: false, watchId: dupes[0].id, alreadyQueued: true };
    }

    // New material — queue for approval
    // Priority: user's explicit customMeta > data.js lookup > fallback defaults
    // Prevents the AquaLock bug: Plumbing/Rolls must not become Waterproofing/Pcs
    const matched = findMaterial(materialName);
    const resolvedCategory = (customMeta && customMeta.category) ? customMeta.category : (matched?.category || "Other");
    const resolvedUnit = (customMeta && customMeta.unit) ? customMeta.unit : (matched?.unit || "Pcs");
    const resolvedCode = (customMeta && customMeta.code) ? customMeta.code : (matched?.code || null);

    const { data: saved, error: insErr } = await supabase
      .from("material_watchlist")
      .insert({
        material_name: materialName,
        material_code: resolvedCode,
        category: resolvedCategory,
        unit: resolvedUnit,
        site_id: siteId,
        storekeeper_type: skType,
        proposed_by: userId,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insErr) throw insErr;
    const watchId = saved?.id;

    if (watchId) {
      await logAudit({
        action: "material_queued",
        module: "material_approvals",
        record_id: watchId,
        after: { material_name: materialName, site_id: siteId, storekeeper_type: skType },
        reason: `New material proposed by ${userInfo?.name || userId}`,
      });

      // Notify admins / store_managers that approval is needed
      const approverRoles = ["admin", "store_manager"];
      const { data: approvers, error: notifErr } = await supabase
        .from("users")
        .select("id")
        .in("role", approverRoles);
      if (notifErr) throw notifErr;
      if (Array.isArray(approvers)) {
        for (const approver of approvers) {
          await sendNotif(
            approver.id,
            "Material Approval Needed",
            `"${materialName}" was proposed by ${userInfo?.name || "a storekeeper"}. Review in Material Approvals.`,
            "approval",
            watchId,
            "material_watchlist"
          );
        }
      }
    }

    return { isNew: true, watchId, alreadyQueued: false };
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
    return { isNew: false, error: err.message };
  }
}

/**
 * renderMaterialApprovals — UI for admin/store_manager to review pending materials.
 */
export async function renderMaterialApprovals(container, user) {
  if (!container) return;

  const role = ROLES[user.role] || {};
  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-size:24px;font-weight:700;color:var(--text-100);">✦ Material Approvals</h1>
      <p style="color:var(--text-200);font-size:14px;margin-top:4px;">Review pending material proposals from storekeepers</p>
    </div>
    <div id="material-approvals-wrap">
      <div class="spinner" style="margin:60px auto;"></div>
    </div>`;

  await loadPendingMaterials(user);
  window._materialApprovalsRefresh = () => loadPendingMaterials(user);
}

/**
 * loadPendingMaterials — fetches all pending watchlist entries and renders them.
 */
async function loadPendingMaterials(user) {
  const wrap = document.getElementById("material-approvals-wrap");
  if (!wrap) return;

  wrap.innerHTML = `<div class="spinner" style="margin:60px auto;"></div>`;

  try {
    const { data: items, error } = await supabase
      .from("material_watchlist")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    // Migration v10 not applied - table does not exist yet
    if (error && error.code === '42P01') {
      wrap.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">No pending material approvals</div>';
      return;
    }
    if (error) throw error;
    const arr = Array.isArray(items) ? items : [];

    if (!arr.length) {
      wrap.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">
        ✓ No pending material approvals
      </div>`;
      return;
    }

    wrap.innerHTML = `<div class="card" style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          ${["Material","Site","Type","Unit","Proposed By","Proposed","Actions"].map(h =>
            `<th style="text-align:left;padding:10px 8px;color:var(--text-400);font-weight:500;font-size:11px;text-transform:uppercase;">${h}</th>`
          ).join("")}
        </tr></thead>
        <tbody>${arr.map(w => {
          const escName = w.material_name.replace(/'/g, "\\'").replace(/"/g, '\\"');
          const siteName = w.site_id ? `Site ${w.site_id}` : "All Sites";
          let bg, col;
          if (w.storekeeper_type === "local") { bg = "rgba(46,160,67,0.15)"; col = "var(--accent-green)"; }
          else if (w.storekeeper_type === "imported") { bg = "rgba(61,142,248,0.15)"; col = "var(--accent-blue)"; }
          else { bg = "rgba(243,156,18,0.15)"; col = "var(--orange)"; }
          const propDate = new Date(w.created_at).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
          return `
          <tr style="border-bottom:1px solid rgba(30,35,48,0.4);">
            <td style="padding:10px 8px;font-weight:500;color:var(--text-100);">${w.material_name}</td>
            <td style="padding:10px 8px;color:var(--text-200);">${w.site_id ? `Site ${w.site_id}` : "All Sites"}</td>
            <td style="padding:10px 8px;">
              <span style="padding:2px 8px;border-radius:10px;font-size:11px;
                background:${bg}
                color:${col};">
                ${w.storekeeper_type}
              </span>
            </td>
            <td style="padding:10px 8px;color:var(--text-300);">${w.unit || "—"}</td>
            <td style="padding:10px 8px;color:var(--text-200);font-size:12px;">${w.proposed_by_name || "—"}</td>
            <td style="padding:10px 8px;color:var(--text-300);font-size:11px;font-family:var(--font-mono);">${propDate}</td>
            <td style="padding:10px 8px;display:flex;gap:6px;">
              <button onclick="window._approveMaterial('${w.id}', '${escName}')"
                class="btn btn-gold btn-sm" style="font-size:11px;padding:4px 10px;">✓ Approve</button>
              <button onclick="window._rejectMaterial('${w.id}')"
                class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px;">✕ Reject</button>
            </td>
          </tr>`;
        }).join("")}
        </tbody>
      </table>
    </div>`;

    window._approveMaterial = (watchId, materialName) => approveMaterial(watchId, materialName, user);
    window._rejectMaterial = (watchId) => rejectMaterial(watchId, user);
  } catch (err) {
    wrap.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">
      Error: ${err.message}
    </div>`;
  }
}

/**
 * approveMaterial — sets watchlist entry to 'approved', then creates the
 * actual stock row with status='approved' so it's visible to requesters.
 */
async function approveMaterial(watchId, materialName, user) {
  try {
    // Fetch the full watchlist entry
    const { data: entries, error: fetchErr } = await supabase
      .from("material_watchlist")
      .select("*")
      .eq("id", watchId)
      .single();
    if (fetchErr && fetchErr.code === '42P01') { showToast("Watchlist table not available yet", "error"); return; }
    if (fetchErr) throw fetchErr;
    const entry = entries;
    if (!entry) { showToast("Watchlist entry not found", "error"); return; }

    // Check if approved stock already exists (race condition guard)
    const { data: existing, error: existingErr } = await supabase
      .from("stock")
      .select("id")
      .eq("site_id", entry.site_id)
      .eq("material_name", materialName)
      .eq("storekeeper_type", entry.storekeeper_type)
      .eq("status", "approved")
      .limit(1);
    let existingArr = [];
    if (!existingErr) { existingArr = Array.isArray(existing) ? existing : []; }
    else if (existingErr.code === '42703') { // fallback: status column missing
      const { data: retryData, error: retryErr } = await supabase
        .from("stock")
        .select("id")
        .eq("site_id", entry.site_id)
        .eq("material_name", materialName)
        .eq("storekeeper_type", entry.storekeeper_type)
        .limit(1);
      if (!retryErr) existingArr = Array.isArray(retryData) ? retryData : [];
    }

    if (Array.isArray(existingArr) && existingArr.length > 0) {
      // Approved stock already exists — reject the watchlist entry instead
      const { error: rejErr } = await supabase
        .from("material_watchlist")
        .update({ status: "rejected", approved_by: user.id, approved_at: new Date().toISOString(), rejection_reason: "Stock already exists as approved." })
        .eq("id", watchId);
      if (rejErr) throw rejErr;
    } else {
      // Create the actual stock row with status='approved'
      const { error: insErr } = await supabase
        .from("stock")
        .insert({
          site_id: entry.site_id,
          material_name: entry.material_name,
          material_code: entry.material_code,
          category: entry.category,
          unit: entry.unit,
          quantity: 0,     // storekeeper already added the quantity via GRN; just create the approved master row
          unit_price: 0,
          storekeeper_type: entry.storekeeper_type,
          status: "approved",
          updated_by: user.id,
          last_updated: new Date().toISOString(),
        });
      if (insErr) throw insErr;

      // Mark watchlist as approved
      const { error: updErr } = await supabase
        .from("material_watchlist")
        .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
        .eq("id", watchId);
      if (updErr) throw updErr;
    }

    await logAudit({
      action: "material_approved",
      module: "material_approvals",
      record_id: watchId,
      after: { material_name: materialName, approved_by: user.id },
      reason: `Material approved by ${user.name}`,
    });

    showToast(`"${materialName}" approved — now visible in inventory`, "success");
    if (window._materialApprovalsRefresh) window._materialApprovalsRefresh();
  } catch (err) {
    showToast(`Approval failed: ${err.message}`, "error");
  }
}

/**
 * rejectMaterial — marks a watchlist entry as rejected with optional reason.
 */
async function rejectMaterial(watchId, user) {
  try {
    const { error } = await supabase
      .from("material_watchlist")
      .update({
        status: "rejected",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", watchId);
    if (error) throw error;

    await logAudit({
      action: "material_rejected",
      module: "material_approvals",
      record_id: watchId,
      after: { rejected_by: user.id },
      reason: `Material rejected by ${user.name}`,
    });

    showToast("Material rejected", "success");
    if (window._materialApprovalsRefresh) window._materialApprovalsRefresh();
  } catch (err) {
    showToast(`Rejection failed: ${err.message}`, "error");
  }
}