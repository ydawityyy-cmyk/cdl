// CDL — modules/transfers.js
import { supabase, SITES } from "../config.js";
import { logAudit } from "./audit_core.js";
import { ROLES } from "./roles.js";
import { showToast, showModal, closeModal, getCurrentUser } from "../app.js";
import { sendNotif } from "./notifs.js";

// Full 5-stage workflow state definition:
// 1. pending -> pm_approved (PM / Admin)
// 2. pm_approved -> preparing (Storekeeper / Admin)
// 3. preparing -> in_transit (Transfer Officer / Admin)
// 4. in_transit -> delivered (Transfer Officer / Admin)
// 5. delivered -> completed (Asset Manager / Admin)
const WORKFLOW_STAGES = [
  { key: "pending", label: "Pending Head of Projects Approval", nextKey: "hop_approved", nextLabel: "✓ Approve Transfer (Head of Projects)", roles: ["head_of_projects", "admin", "company_owner", "ceo"] },
  { key: "hop_approved", label: "Head of Projects Approved", nextKey: "preparing", nextLabel: "📦 Confirm Stock Ready", roles: ["storekeeper_local", "storekeeper_import", "storekeeper_scaffolding", "admin", "company_owner", "ceo"] },
  { key: "pm_approved", label: "Approved", nextKey: "preparing", nextLabel: "📦 Confirm Stock Ready", roles: ["storekeeper_local", "storekeeper_import", "storekeeper_scaffolding", "admin", "company_owner", "ceo"] }, // Backward compat
  { key: "preparing", label: "Stock Prepared", nextKey: "in_transit", nextLabel: "🚚 Mark In Transit (Pickup Signature)", roles: ["transfer_officer", "storekeeper_local", "storekeeper_import", "storekeeper_scaffolding", "admin", "company_owner", "ceo"] },
  { key: "in_transit", label: "In Transit", nextKey: "delivered", nextLabel: "📍 Mark Delivered (Delivery Signature)", roles: ["transfer_officer", "storekeeper_local", "storekeeper_import", "storekeeper_scaffolding", "admin", "company_owner", "ceo"] },
  { key: "delivered", label: "Delivered", nextKey: "completed", nextLabel: "✅ Complete & Move Stock", roles: ["asset_manager", "admin", "company_owner", "ceo"] },
];

const DISPLAY_STEPS = [
  { key: "pm_approved", label: "PM Approved" },
  { key: "preparing", label: "Stock Prepared" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Completed" }
];

export async function renderTransfers(container, user) {
  if (!container) return;
  const role = ROLES[user.role] || {};
  const canCreate = role.canCreateTransfer || user.role === "admin" || (Array.isArray(user.custom_perms) && user.custom_perms.includes("transfers:create"));
  const siteFilter = role.siteScope === "assigned" ? (user.site_ids || []) : SITES.map(s => s.id);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
      <div>
        <h1 style="font-size:24px;font-weight:700;">Material Transfers</h1>
        <p style="color:var(--text-200);font-size:14px;">5-Step Approval Workflow with Live Stock Tracking</p>
      </div>
      ${canCreate ? `<button onclick="window._tfOpenNew()" class="btn btn-gold">+ New Transfer</button>` : ""}
    </div>
    <div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:8px;margin-bottom:24px;">
      ${DISPLAY_STEPS.map((s, i) => `
        <div style="display:flex;align-items:center;gap:4px;white-space:nowrap;">
          <span style="width:24px;height:24px;border-radius:50%;background:var(--bg-600);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--gold);">${i + 1}</span>
          <span style="font-size:11px;color:var(--text-300);">${s.label}</span>
          ${i < DISPLAY_STEPS.length - 1 ? `<span style="color:var(--border);">›</span>` : ""}
        </div>
      `).join("")}
    </div>
    <div id="tf-tabs" style="display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap;">
      ${["Active", "Completed", "Rejected"].map((t, i) => `
        <button onclick="window._tfLoad('${t.toLowerCase()}')" id="tf-tab-${t.toLowerCase()}" style="padding:8px 20px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:500;${i === 0 ? "background:var(--gold);color:#0a0c10;" : "background:var(--bg-600);color:var(--text-200);"}">${t}</button>
      `).join("")}
    </div>
    <div id="tf-list"><div class="spinner" style="margin:60px auto;"></div></div>
  `;

  window._tfLoad = (tab) => {
    ["active", "completed", "rejected"].forEach(t => {
      const b = document.getElementById(`tf-tab-${t}`);
      if (b) {
        b.style.background = t === tab ? "var(--gold)" : "var(--bg-600)";
        b.style.color = t === tab ? "#0a0c10" : "var(--text-200)";
      }
    });
    fetchTransfers(user, siteFilter, tab);
  };
  window._tfOpenNew = () => openNewTransferModal(user, siteFilter);
  fetchTransfers(user, siteFilter, "active");
}

async function fetchTransfers(user, siteFilter, tab) {
  const list = document.getElementById("tf-list");
  if (!list) return;
  list.innerHTML = `<div class="spinner" style="margin:60px auto;"></div>`;

  const activeStatuses = ["pending", "pm_approved", "preparing", "in_transit", "delivered"];
  let query = supabase.from('transfers').select('*').order('created_at', { ascending: false }).limit(50);
  if (tab === 'active') {
    query = query.in('status', activeStatuses);
  } else {
    query = query.eq('status', tab);
  }

  try {
    const { data: transfers, error } = await query;
    if (error) throw error;
    if (!transfers || !transfers.length) {
      list.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">No ${tab} transfers</div>`;
      return;
    }

    list.innerHTML = transfers.map(tf => {
      const fromSite = SITES.find(s => s.id === tf.from_site_id)?.name || `Site ${tf.from_site_id}`;
      const toSite = SITES.find(s => s.id === tf.to_site_id)?.name || `Site ${tf.to_site_id}`;
      
      const currentStage = WORKFLOW_STAGES.find(s => s.key === tf.status);
      const stageIdx = WORKFLOW_STAGES.findIndex(s => s.key === tf.status);
      const progress = stageIdx >= 0 ? Math.round(((stageIdx + 1) / WORKFLOW_STAGES.length) * 100) : (tf.status === 'completed' ? 100 : 10);
      const items = Array.isArray(tf.items) ? tf.items : [];
      
      // Check if current user can advance this transfer
      let canAdvance = false;
      if (currentStage) {
        const isRolePermitted = currentStage.roles.includes(user.role) || user.role === "admin" || user.role === "company_owner" || user.role === "ceo";
        if (isRolePermitted) {
          // If project manager, ensure they manage from_site or to_site (or have admin access)
          if (user.role === "project_manager" && Array.isArray(user.site_ids) && user.site_ids.length > 0) {
            canAdvance = user.site_ids.includes(tf.from_site_id) || user.site_ids.includes(tf.to_site_id);
          } else {
            canAdvance = true;
          }
        }
      }

      return `
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-100);">${fromSite} → ${toSite}</div>
              <div style="color:var(--text-300);font-size:12px;margin-top:4px;">
                <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-400);background:var(--bg-700);padding:2px 6px;border-radius:4px;margin-right:6px;">${tf.id ? tf.id.slice(0, 8) : ''}</span>
                ${items.length} item(s) · Created ${tf.created_at ? new Date(tf.created_at).toLocaleDateString("en-KE") : ""}
              </div>
            </div>
            <span style="padding:4px 12px;border-radius:12px;font-size:12px;background:rgba(200,169,110,0.1);color:var(--gold);">
              ${currentStage ? currentStage.label : (tf.status?.replace(/_/g, " ") || "pending")}
            </span>
          </div>
          <div style="background:var(--bg-700);border-radius:4px;height:4px;margin-bottom:12px;">
            <div style="background:var(--gold);width:${progress}%;height:4px;border-radius:4px;transition:width 0.3s;"></div>
          </div>
          <div style="font-size:12px;color:var(--text-200);margin-bottom:12px;">
            ${items.slice(0, 3).map(i => `${i.quantity || i.qty || "?"} ${i.unit || ""} ${i.name || i.material_name || ""}`).join(" · ")}${items.length > 3 ? ` +${items.length - 3} more` : ""}
          </div>
          ${tf.notes ? `<div style="font-size:12px;color:var(--text-300);margin-bottom:12px;font-style:italic;">Notes: ${tf.notes}</div>` : ""}
          ${canAdvance && tab === "active" && currentStage ? `
            <button onclick="window._tfAdvance('${tf.id}','${tf.status}')" class="btn btn-gold" style="font-size:12px;padding:8px 20px;">
              ${currentStage.nextLabel}
            </button>
          ` : ""}
        </div>
      `;
    }).join("");

    window._tfAdvance = (id, status) => advanceTransferStep(id, status, user);
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red);">Error: ${err.message}</p>`;
  }
}

async function advanceTransferStep(id, currentStatus, user) {
  const activeUser = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || user;
  const currentStage = WORKFLOW_STAGES.find(s => s.key === currentStatus);
  if (!currentStage || !currentStage.nextKey) {
    showToast("Transfer is already at final step", "info");
    return;
  }

  try {
    if (currentStage.nextKey === "completed") {
      await completeTransfer(id, user);
      return;
    }

    const { data: tf, error } = await supabase.from('transfers').select('step_log, from_site_id, to_site_id, items').eq('id', id).single();
    if (error) throw error;

    const stepLog = Array.isArray(tf?.step_log) ? tf.step_log : [];
    const actorName = activeUser.name || activeUser.email || "User";
    const actorRole = activeUser.role || "admin";
    stepLog.push({ step: currentStage.nextKey, by: actorName, role: actorRole, at: new Date().toISOString() });

    const { error: updErr } = await supabase.from('transfers').update({ status: currentStage.nextKey, step_log: stepLog }).eq('id', id);
    if (updErr) throw updErr;

    const fromSiteName = SITES.find(s => s.id === tf?.from_site_id)?.name || `Site ${tf?.from_site_id}`;
    const toSiteName = SITES.find(s => s.id === tf?.to_site_id)?.name || `Site ${tf?.to_site_id}`;

    await logAudit({
      action: "transfer_advanced",
      module: "transfers",
      record_id: id,
      reason: `Advanced to ${currentStage.nextKey} | ${fromSiteName} → ${toSiteName}`,
      before: { status: currentStatus },
      after: { status: currentStage.nextKey }
    });

    showToast(`Transfer advanced: ${currentStage.nextLabel}`, "success");

    // Notifications
    if (currentStage.nextKey === "pm_approved") {
      const { data: sks } = await supabase.from('users').select('id,name').eq('role', 'storekeeper_local').or('role.eq.storekeeper_import,role.eq.storekeeper_scaffolding').eq('is_active', true);
      if (Array.isArray(sks)) {
        for (const sk of sks) {
          await sendNotif(sk.id, `📋 Transfer Approved - Prepare Stock`, `Transfer ${id.slice(0,8)} from ${fromSiteName} to ${toSiteName} is approved and ready for stock preparation`, "transfer_approved", id);
        }
      }
    } else if (currentStage.nextKey === "delivered") {
      const { data: pms } = await supabase.from('users').select('id,name').eq('role', 'project_manager').eq('is_active', true);
      if (Array.isArray(pms)) {
        for (const pm of pms) {
          await sendNotif(pm.id, `🚚 Transfer Delivered`, `Transfer ${id.slice(0,8)} from ${fromSiteName} to ${toSiteName} has been delivered`, "transfer_delivered", id);
        }
      }
    }

    if (window._tfLoad) window._tfLoad("active");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

async function completeTransfer(id, user) {
  const activeUser = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || user;
  try {
    const { data: tf, error } = await supabase.from('transfers').select('*').eq('id', id).single();
    if (error || !tf) {
      showToast("Transfer not found", "error");
      return;
    }

    const fromSiteName = SITES.find(s => s.id === tf.from_site_id)?.name || `Site ${tf.from_site_id}`;
    const toSiteName = SITES.find(s => s.id === tf.to_site_id)?.name || `Site ${tf.to_site_id}`;
    const items = Array.isArray(tf.items) ? tf.items : [];

    for (const item of items) {
      const itemName = item.name || item.material_name;
      const itemQty = parseFloat(item.quantity || item.qty) || 0;
      const itemUnit = item.unit || "Pcs";
      if (!itemName || itemQty <= 0) continue;

      const baseName = itemName.replace(/\s*\([^)]*\)/g, '').trim();

      // 1. Source site stock deduction
      let srcStock = null;
      const { data: exactSrc } = await supabase.from('stock').select('*').eq('site_id', tf.from_site_id).eq('material_name', itemName);
      if (Array.isArray(exactSrc) && exactSrc.length) {
        srcStock = exactSrc[0];
      } else {
        const { data: partialSrc } = await supabase.from('stock').select('*').eq('site_id', tf.from_site_id).ilike('material_name', `${baseName}%`);
        if (Array.isArray(partialSrc) && partialSrc.length) {
          srcStock = partialSrc[0];
        }
      }

      if (srcStock) {
        const newQty = Math.max(0, (Number(srcStock.quantity) || 0) - itemQty);
        const { error: updErr } = await supabase.from('stock').update({
          quantity: newQty,
          last_updated: new Date().toISOString(),
          updated_by: activeUser.id
        }).eq('id', srcStock.id);
        if (updErr) console.warn('[TRANSFER] Source stock deduction error:', updErr);
      }

      // 2. Destination site stock addition
      let dstStock = null;
      const { data: exactDst } = await supabase.from('stock').select('*').eq('site_id', tf.to_site_id).eq('material_name', itemName);
      if (Array.isArray(exactDst) && exactDst.length) {
        dstStock = exactDst[0];
      } else {
        const { data: partialDst } = await supabase.from('stock').select('*').eq('site_id', tf.to_site_id).ilike('material_name', `${baseName}%`);
        if (Array.isArray(partialDst) && partialDst.length) {
          dstStock = partialDst[0];
        }
      }

      if (dstStock) {
        const newQty = (Number(dstStock.quantity) || 0) + itemQty;
        const { error: updErr2 } = await supabase.from('stock').update({
          quantity: newQty,
          last_updated: new Date().toISOString(),
          updated_by: (activeUser?.id || user?.id)
        }).eq('id', dstStock.id);
        if (updErr2) console.warn('[TRANSFER] Destination stock update error:', updErr2);
      } else {
        const { error: insErr } = await supabase.from('stock').insert({
          site_id: tf.to_site_id,
          material_name: itemName,
          quantity: itemQty,
          unit: itemUnit,
          category: item.category || null,
          updated_by: (activeUser?.id || user?.id)
        });
        if (insErr) console.warn('[TRANSFER] Destination stock insert error:', insErr);
      }
    }

    const stepLog = Array.isArray(tf.step_log) ? tf.step_log : [];
    stepLog.push({ step: "completed", by: activeUser.name || activeUser.email || "User", role: activeUser.role || "admin", at: new Date().toISOString() });

    const { error: updErr3 } = await supabase.from('transfers').update({
      status: "completed",
      step_log: stepLog,
      completed_at: new Date().toISOString()
    }).eq('id', id);

    if (updErr3) throw updErr3;

    const itemSummary = items.map(i => `${i.quantity || i.qty || 0} ${i.unit || ''} ${i.name || i.material_name || ''}`).join(", ");

    await logAudit({
      action: "transfer_completed",
      module: "transfers",
      record_id: id,
      reason: `Transfer completed: ${fromSiteName} → ${toSiteName} | ${items.length} item(s): ${itemSummary}`,
      after: { from: tf.from_site_id, to: tf.to_site_id, items_count: items.length, items: items }
    });

    showToast(`Transfer completed — ${items.length} item(s) moved to ${toSiteName}`, "success");

    if (window._tfLoad) window._tfLoad("completed");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

// Robust catalog item matcher that handles exact names, batch tags (Batch #BRH-8021), and normalized stems
function findStockMatch(val, stockList) {
  if (!val || !Array.isArray(stockList)) return null;
  const clean = val.trim().toLowerCase();
  const baseClean = clean.replace(/\s*\([^)]*\)/g, '').trim();

  // Try exact match first
  let match = stockList.find(s => (s.material_name || '').trim().toLowerCase() === clean);
  if (match) return match;

  // Try base match
  match = stockList.find(s => {
    const sName = (s.material_name || '').trim().toLowerCase();
    const sBase = sName.replace(/\s*\([^)]*\)/g, '').trim();
    return sBase === baseClean || clean.startsWith(sBase) || sName.startsWith(baseClean);
  });
  return match || null;
}

async function openNewTransferModal(user, siteFilter) {
  // Source sites: locked to user's assigned sites (prevents source forgery)
  const fromSites = SITES.filter(s => siteFilter.includes(s.id));
  // Destination sites: ALL active sites — PM must be able to request transfer to any site
  const allSites = [...SITES];
  const sites = fromSites; // backward compat alias for datalist
  const initialFromSite = fromSites[0]?.id || 1;
  const initialToSite = allSites.find(s => s.id !== initialFromSite)?.id || allSites[0]?.id || 2;

  let siteStock = [];
  try {
    const { data } = await supabase.from('stock').select('id,material_name,quantity,unit,category').eq('site_id', initialFromSite).order('material_name', { ascending: true });
    if (Array.isArray(data)) siteStock = data;
  } catch (_) {}

  let items = [{ name: "", quantity: 1, unit: "Pcs", stockId: null }];

  const renderItems = () => {
    const el = document.getElementById("tf-items-list");
    if (!el) return;
    el.innerHTML = items.map((item, i) => `
      <div style="display:grid;grid-template-columns:1fr 100px 80px 32px;gap:8px;align-items:center;margin-bottom:8px;">
        <div style="position:relative;">
          <input list="tf-stock-datalist" type="text" value="${item.name || ''}" 
            onchange="window._tfSelectStockItem(${i}, this.value)"
            oninput="window._tfUpdateItem(${i}, 'name', this.value)" 
            placeholder="Select or type material..." 
            style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-100);font-size:13px;">
        </div>
        <input type="number" value="${item.quantity || 1}" min="0.1" step="any" 
          oninput="window._tfUpdateItem(${i}, 'quantity', parseFloat(this.value)||0)" 
          placeholder="Qty" 
          style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-100);font-size:13px;">
        <input type="text" value="${item.unit || 'Pcs'}" 
          oninput="window._tfUpdateItem(${i}, 'unit', this.value)" 
          placeholder="Unit" 
          style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-100);font-size:13px;">
        <button type="button" onclick="window._tfRemoveItem(${i})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:18px;line-height:1;">×</button>
      </div>
    `).join("");
  };

  const updateDatalist = () => {
    const dl = document.getElementById("tf-stock-datalist");
    if (!dl) return;
    dl.innerHTML = siteStock.map(s => `<option value="${s.material_name}">Avail: ${s.quantity} ${s.unit || ''}</option>`).join("");
  };

  window._tfOnFromSiteChange = async (fromId) => {
    try {
      const { data } = await supabase.from('stock').select('id,material_name,quantity,unit,category').eq('site_id', parseInt(fromId)).order('material_name', { ascending: true });
      siteStock = Array.isArray(data) ? data : [];
      updateDatalist();
    } catch (_) {}
  };

  window._tfSelectStockItem = (i, val) => {
    const matched = findStockMatch(val, siteStock);
    if (matched && items[i]) {
      items[i].name = matched.material_name;
      items[i].unit = matched.unit || items[i].unit || "Pcs";
      items[i].stockId = matched.id;
      renderItems();
    }
  };

  window._tfUpdateItem = (i, field, val) => {
    if (items[i]) {
      items[i][field] = val;
      if (field === 'name' && typeof val === 'string') {
        const matched = findStockMatch(val, siteStock);
        if (matched) {
          items[i].unit = matched.unit || items[i].unit || "Pcs";
          items[i].stockId = matched.id;
          const unitInputs = document.querySelectorAll("#tf-items-list input[placeholder='Unit']");
          if (unitInputs && unitInputs[i]) {
            unitInputs[i].value = items[i].unit;
          }
        }
      }
    }
  };

  window._tfRemoveItem = (i) => {
    if (items.length > 1) {
      items.splice(i, 1);
      renderItems();
    }
  };

  window._tfAddItem = () => {
    items.push({ name: "", quantity: 1, unit: "Pcs", stockId: null });
    renderItems();
  };

  showModal(`
    <h2 style="margin-bottom:20px;">New Material Transfer</h2>
    <datalist id="tf-stock-datalist"></datalist>
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="color:var(--text-300);font-size:12px;text-transform:uppercase;font-weight:600;">From Site (Source)</label>
          <select id="tf-from" onchange="window._tfOnFromSiteChange(this.value)" style="width:100%;margin-top:6px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
            ${sites.map(s => `<option value="${s.id}" ${s.id === initialFromSite ? 'selected' : ''}>${s.name}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="color:var(--text-300);font-size:12px;text-transform:uppercase;font-weight:600;">To Site (Destination)</label>
          <select id="tf-to" style="width:100%;margin-top:6px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
            ${allSites.map(s => `<option value="${s.id}" ${s.id === initialToSite ? 'selected' : ''}>${s.name}</option>`).join("")}
          </select>
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <label style="color:var(--text-300);font-size:12px;text-transform:uppercase;font-weight:600;">Materials to Transfer</label>
          <button type="button" onclick="window._tfAddItem()" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 12px;color:var(--gold);cursor:pointer;font-size:12px;">+ Add Item</button>
        </div>
        <div id="tf-items-list"></div>
      </div>
      <div>
        <label style="color:var(--text-300);font-size:12px;text-transform:uppercase;font-weight:600;">Transfer Notes / Purpose</label>
        <textarea id="tf-notes" rows="2" placeholder="e.g. Urgent structural material transfer for foundation pour" style="width:100%;margin-top:6px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);resize:none;font-size:13px;"></textarea>
      </div>
      <div style="display:flex;gap:12px;">
        <button id="tf-submit-btn" onclick="window._tfSubmit()" class="btn btn-gold" style="flex:1;">Submit Transfer Request</button>
        <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `);

  renderItems();
  updateDatalist();

  window._tfSubmit = async () => {
    const fromSite = parseInt(document.getElementById("tf-from").value);
    const toSite = parseInt(document.getElementById("tf-to").value);
    const notes = (document.getElementById("tf-notes")?.value || "").trim();

    if (fromSite === toSite) {
      showToast("From and To sites must be different", "error");
      return;
    }

    const validItems = items
      .filter(i => i.name && i.name.trim())
      .map(i => ({
        name: i.name.trim(),
        quantity: Math.max(0.1, Number(i.quantity) || 1),
        unit: (i.unit || "Pcs").trim()
      }));

    if (!validItems.length) {
      showToast("Please add at least one valid item name", "error");
      return;
    }

    const submitBtn = document.getElementById("tf-submit-btn");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting..."; }

    try {
      const payload = {
        from_site_id: fromSite,
        to_site_id: toSite,
        items: validItems,
        notes: notes || null,
        status: "pending",
        step_log: [{ step: "created", by: user.name || "User", role: user.role || "admin", at: new Date().toISOString() }]
      };

      const { data: saved, error: insErr } = await supabase
        .from('transfers')
        .insert(payload)
        .select()
        .single();

      if (insErr) throw insErr;
      if (!saved) throw new Error("Transfer was not created — no response received.");

      const recordId = saved.id;
      const fromSiteName = SITES.find(s => s.id === fromSite)?.name || `Site ${fromSite}`;
      const toSiteName = SITES.find(s => s.id === toSite)?.name || `Site ${toSite}`;
      const itemSummary = validItems.map(i => `${i.quantity} ${i.unit} ${i.name}`).join(", ");

      await logAudit({
        action: "transfer_created",
        module: "transfers",
        record_id: recordId,
        reason: `Transfer: ${fromSiteName} → ${toSiteName} | ${validItems.length} item(s): ${itemSummary}`,
        after: { from: fromSite, to: toSite, items_count: validItems.length, items: validItems }
      });

      closeModal();
      showToast("Transfer request submitted successfully!", "success");
      fetchTransfers(user, siteFilter, "active");
    } catch (err) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit Transfer Request"; }
      showToast(`Error: ${err.message || 'Failed to create transfer'}`, "error");
    }
  };
}

// ── Feature 2: Standardized Inter-Site Transfer Log ────────────
export async function renderTransferLog(container, user) {
  if (!container) return;
  const statusLabels = [
    { value: "all", label: "All Statuses" },
    { value: "pending", label: "Pending PM Approval" },
    { value: "pm_approved", label: "PM Approved" },
    { value: "preparing", label: "Stock Prepared" },
    { value: "in_transit", label: "In Transit" },
    { value: "delivered", label: "Delivered" },
    { value: "completed", label: "Completed" },
    { value: "rejected", label: "Rejected" },
  ];

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-size:24px;font-weight:700;">Transfer Log</h1>
      <p style="color:var(--text-200);font-size:14px;">Standardized record of all inter-site material transfers across the network</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">
      <select id="tl-status" onchange="window._tlRefresh()" style="background:var(--bg-600);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-100);font-size:13px;min-width:160px;">
        ${statusLabels.map(s => `<option value="${s.value}">${s.label}</option>`).join("")}
      </select>
      <input id="tl-search" type="text" placeholder="Search transfer ID or site..." onkeyup="window._tlRefresh()"
        style="background:var(--bg-600);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-100);font-size:13px;min-width:220px;" />
      <button onclick="window._tlRefresh()" class="btn btn-ghost" style="font-size:12px;">↻ Refresh</button>
    </div>
    <div id="tl-table" style="overflow-x:auto;"></div>
  `;

  window._tlRefresh = () => loadTransferLog();
  loadTransferLog();
}

async function loadTransferLog() {
  const el = document.getElementById("tl-table");
  if (!el) return;
  el.innerHTML = `<div class="spinner" style="margin:40px auto;"></div>`;

  const statusFilter = document.getElementById("tl-status")?.value || "all";
  const searchFilter = (document.getElementById("tl-search")?.value || "").toLowerCase().trim();

  let query = supabase.from('transfers').select('*').order('created_at', { ascending: false }).limit(100);
  if (statusFilter !== "all") {
    query = query.eq('status', statusFilter);
  }

  try {
    const { data: rows, error } = await query;
    if (error) throw error;
    
    let list = rows || [];
    if (searchFilter) {
      list = list.filter(r => {
        const fromSite = SITES.find(s => s.id === r.from_site_id)?.name || '';
        const toSite = SITES.find(s => s.id === r.to_site_id)?.name || '';
        return (r.id && r.id.toLowerCase().includes(searchFilter)) ||
               fromSite.toLowerCase().includes(searchFilter) ||
               toSite.toLowerCase().includes(searchFilter);
      });
    }

    if (!list.length) {
      el.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">No transfers match your criteria</div>`;
      return;
    }

    el.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);background:var(--bg-700);">
              <th style="padding:12px 14px;text-align:left;color:var(--text-400);font-size:11px;text-transform:uppercase;">ID</th>
              <th style="padding:12px 14px;text-align:left;color:var(--text-400);font-size:11px;text-transform:uppercase;">Route</th>
              <th style="padding:12px 14px;text-align:left;color:var(--text-400);font-size:11px;text-transform:uppercase;">Items</th>
              <th style="padding:12px 14px;text-align:left;color:var(--text-400);font-size:11px;text-transform:uppercase;">Status</th>
              <th style="padding:12px 14px;text-align:left;color:var(--text-400);font-size:11px;text-transform:uppercase;">Created</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => {
              const fromSite = SITES.find(s => s.id === r.from_site_id)?.name || `Site ${r.from_site_id}`;
              const toSite = SITES.find(s => s.id === r.to_site_id)?.name || `Site ${r.to_site_id}`;
              const items = Array.isArray(r.items) ? r.items : [];
              return `
                <tr style="border-bottom:1px solid rgba(26,31,46,0.4);">
                  <td style="padding:12px 14px;font-family:var(--font-mono);font-size:11px;color:var(--text-300);">${r.id ? r.id.slice(0, 8) : '—'}</td>
                  <td style="padding:12px 14px;color:var(--text-100);font-weight:500;">${fromSite} → ${toSite}</td>
                  <td style="padding:12px 14px;color:var(--text-200);">${items.map(i => `${i.quantity || i.qty || 1} ${i.unit || ''} ${i.name || i.material_name || ''}`).join(', ') || '—'}</td>
                  <td style="padding:12px 14px;"><span style="padding:3px 10px;border-radius:10px;font-size:11px;background:rgba(200,169,110,0.1);color:var(--gold);">${r.status?.replace(/_/g, ' ') || 'pending'}</span></td>
                  <td style="padding:12px 14px;color:var(--text-300);font-size:12px;">${r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : '—'}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p style="color:var(--red);">Error loading transfer log: ${err.message}</p>`;
  }
}
