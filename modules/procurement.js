// CDL — modules/procurement.js
import { supabase, SITES } from "../config.js";
import { logAudit } from "./audit_core.js";
import { ROLES } from "./roles.js";
import { showToast, showModal, closeModal, getCurrentUser } from "../app.js";

const PROCUREMENT_FLOW = ["pending", "pm_approved", "am_approved", "finance_approved", "processing", "ordered", "delivered"];

export async function renderProcurement(container, user) {
  const activeUser = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || user;
  const role = ROLES[activeUser.role] || {};
  const canCreate = ["project_manager", "admin", "company_owner", "ceo", "asset_manager", "procurement_officer", "store_manager"].includes(activeUser.role);
  const siteFilter = role.siteScope === "assigned" ? (activeUser.site_ids || []) : SITES.map(s => s.id);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
      <div>
        <h1 style="font-size:24px;font-weight:700;">Procurement</h1>
        <p style="color:var(--text-200);font-size:14px;">Purchase requests, approvals & supplier management</p>
      </div>
      ${canCreate ? `<button onclick="window._procOpenNew()" class="btn btn-gold">+ New Purchase Request</button>` : ""}
    </div>
    <div id="proc-tabs" style="display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap;">
      ${["Pending", "PM Approved", "AM Approved", "Finance Approved", "Processing", "Ordered", "Delivered"].map((t, i) => `
        <button onclick="window._procLoad('${t.toLowerCase().replace(/ /g, "_")}')" id="proc-tab-${t.toLowerCase().replace(/ /g, "_")}" 
          style="padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:500;${i === 0 ? "background:var(--gold);color:#0a0c10;" : "background:var(--bg-600);color:var(--text-200);"}">
          ${t}
        </button>
      `).join("")}
    </div>
    <div id="proc-list"><div class="spinner" style="margin:60px auto;"></div></div>
  `;

  window._procLoad = (status) => {
    ["pending", "pm_approved", "am_approved", "finance_approved", "processing", "ordered", "delivered"].forEach(s => {
      const b = document.getElementById(`proc-tab-${s}`);
      if (b) {
        b.style.background = s === status ? "var(--gold)" : "var(--bg-600)";
        b.style.color = s === status ? "#0a0c10" : "var(--text-200)";
      }
    });
    fetchProcurement(activeUser, siteFilter, status);
  };

  window._procOpenNew = () => openProcurementModal(activeUser, siteFilter);
  fetchProcurement(activeUser, siteFilter, "pending");
}

async function fetchProcurement(user, siteFilter, status) {
  const list = document.getElementById("proc-list");
  if (!list) return;
  list.innerHTML = `<div class="spinner" style="margin:60px auto;"></div>`;

  try {
    let query = supabase.from("procurement").select("*, sites(name)").eq("status", status).order("created_at", { ascending: false }).limit(50);
    if (Array.isArray(siteFilter) && siteFilter.length > 0) {
      query = query.in("site_id", siteFilter);
    }
    const { data: orders, error } = await query;
    if (error) throw error;

    if (!orders || !orders.length) {
      list.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">No ${status.replace(/_/g, " ")} requests</div>`;
      return;
    }

    list.innerHTML = orders.map(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const canApprove = getNextApprover(status, user.role);
      const siteName = o.sites?.name || SITES.find(s => s.id === o.site_id)?.name || `Site ${o.site_id}`;

      return `
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-weight:600;color:var(--text-100);font-size:14px;">${siteName} · ${items.length} item(s)</div>
              <div style="color:var(--text-200);font-size:12px;margin-top:4px;">
                ${o.supplier ? `Supplier: ${o.supplier} · ` : ""}${new Date(o.created_at).toLocaleDateString("en-KE")}
              </div>
            </div>
            <div style="text-align:right;">
              ${o.total_amount ? `<div style="font-size:18px;font-weight:700;color:var(--gold);">KES ${Number(o.total_amount).toLocaleString()}</div>` : ""}
              <span style="font-size:11px;color:var(--text-300);text-transform:uppercase;">${status.replace(/_/g, " ")}</span>
            </div>
          </div>
          <div style="margin-top:12px;background:var(--bg-700);border-radius:8px;padding:12px;">
            ${items.map(i => `
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-200);margin-bottom:4px;">
                <span>${i.name || i.material_name || "Item"}</span>
                <span>${i.quantity || 1} ${i.unit || "Pcs"} ${i.unit_price ? `@ KES ${Number(i.unit_price).toLocaleString()}` : ""}</span>
              </div>
            `).join("")}
          </div>
          ${o.notes ? `<div style="font-size:12px;color:var(--text-300);margin-top:8px;font-style:italic;">Notes: ${o.notes}</div>` : ""}
          ${o.approval_chain?.length ? `
            <div style="margin-top:10px;font-size:11px;color:var(--text-300);">
              Approved by: ${o.approval_chain.map(a => `${a.by} (${a.role})`).join(" → ")}
            </div>
          ` : ""}
          ${canApprove ? `
            <div style="margin-top:12px;display:flex;gap:8px;">
              <button onclick="window._procApprove('${o.id}','${status}')" class="btn btn-gold" style="font-size:12px;padding:8px 20px;">✓ Approve</button>
              <button onclick="window._procReject('${o.id}')" class="btn btn-ghost" style="font-size:12px;padding:8px 16px;color:var(--red);">Reject</button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

    window._procApprove = (id, currentStatus) => advanceProcurement(id, currentStatus, user);
    window._procReject = (id) => changeProcurementStatus(id, "rejected", user);
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red);">Error: ${err.message}</p>`;
  }
}

function getNextApprover(status, role) {
  const flow = {
    pending: ["project_manager", "admin", "company_owner", "ceo"],
    pm_approved: ["asset_manager", "admin", "company_owner", "ceo"],
    am_approved: ["finance", "admin", "company_owner", "ceo"],
    finance_approved: ["procurement_officer", "asset_manager", "admin", "company_owner", "ceo"]
  };
  return (flow[status] || []).includes(role);
}

async function advanceProcurement(id, currentStatus, user) {
  const activeUser = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || user;
  const idx = PROCUREMENT_FLOW.indexOf(currentStatus);
  const nextStatus = PROCUREMENT_FLOW[idx + 1];
  if (!nextStatus) {
    showToast("Already at final status", "info");
    return;
  }
  const chainEntry = { by: activeUser.name || "User", role: activeUser.role, at: new Date().toISOString() };

  try {
    const { data: cur, error: fetchErr } = await supabase.from("procurement").select("approval_chain, items, site_id").eq("id", id).single();
    if (fetchErr) throw fetchErr;

    const chain = Array.isArray(cur?.approval_chain) ? [...cur.approval_chain, chainEntry] : [chainEntry];

    if (nextStatus === "delivered" && Array.isArray(cur?.items)) {
      const siteId = cur.site_id;
      for (const item of cur.items) {
        const itemName = item.name || item.material_name;
        const itemQty = parseFloat(item.quantity) || 0;
        if (!itemName || itemQty <= 0) continue;

        const { data: existing } = await supabase.from("stock").select("*").eq("site_id", siteId).eq("material_name", itemName).limit(1);
        if (Array.isArray(existing) && existing.length) {
          const s = existing[0];
          await supabase.from("stock").update({
            quantity: (s.quantity || 0) + itemQty,
            unit_price: item.unit_price || s.unit_price,
            last_updated: new Date().toISOString(),
            updated_by: activeUser.id
          }).eq("id", s.id);
        } else {
          await supabase.from("stock").insert({
            site_id: siteId,
            material_name: itemName,
            quantity: itemQty,
            unit: item.unit || "Pcs",
            unit_price: item.unit_price || 0,
            updated_by: activeUser.id
          });
        }
      }
    }

    const { error: updErr } = await supabase.from("procurement").update({
      status: nextStatus,
      approval_chain: chain
    }).eq("id", id);
    if (updErr) throw updErr;

    await logAudit({
      action: "procurement_approved",
      module: "procurement",
      record_id: id,
      before: { status: currentStatus },
      after: { status: nextStatus, approver: activeUser.name }
    });

    showToast(`Approved → ${nextStatus.replace(/_/g, " ")}${nextStatus === "delivered" ? " (stock added)" : ""}`, "success");
    if (window._procLoad) window._procLoad(currentStatus);
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

async function changeProcurementStatus(id, status, user) {
  const activeUser = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || user;
  try {
    const { error } = await supabase.from("procurement").update({ status }).eq("id", id);
    if (error) throw error;
    await logAudit({ action: `procurement_${status}`, module: "procurement", record_id: id });
    showToast(`Request ${status}`, "success");
    if (window._procLoad) window._procLoad("pending");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

function openProcurementModal(user, siteFilter) {
  const activeUser = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || user;
  const sites = SITES.filter(s => Array.isArray(siteFilter) && siteFilter.includes(s.id));
  const defaultSiteId = sites[0]?.id || SITES[0]?.id || 1;

  let items = [{ name: "", quantity: 1, unit: "Pcs", unit_price: null }];

  const renderItems = () => {
    const el = document.getElementById("proc-items");
    if (!el) return;
    el.innerHTML = items.map((item, i) => `
      <div style="display:grid;grid-template-columns:1fr auto auto auto 24px;gap:8px;margin-bottom:8px;">
        <input type="text" value="${item.name}" onchange="window._procUpdateItem(${i},'name',this.value)" placeholder="Material" style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:12px;">
        <input type="number" value="${item.quantity}" onchange="window._procUpdateItem(${i},'quantity',parseFloat(this.value))" style="width:70px;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:12px;">
        <input type="text" value="${item.unit}" onchange="window._procUpdateItem(${i},'unit',this.value)" placeholder="Unit" style="width:65px;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:12px;">
        <input type="number" value="${item.unit_price || ''}" onchange="window._procUpdateItem(${i},'unit_price',parseFloat(this.value))" placeholder="Price (KES)" style="width:90px;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:12px;">
        <button onclick="window._procRemoveItem(${i})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:16px;">×</button>
      </div>
    `).join("");
  };

  window._procUpdateItem = (i, f, v) => { items[i][f] = v; };
  window._procRemoveItem = (i) => { items.splice(i, 1); renderItems(); };
  window._procAddItem = () => { items.push({ name: "", quantity: 1, unit: "Pcs", unit_price: null }); renderItems(); };

  showModal(`
    <h2 style="margin-bottom:20px;">New Purchase Request</h2>
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="color:var(--text-300);font-size:12px;text-transform:uppercase;font-weight:600;">Site</label>
          <select id="proc-site" style="width:100%;margin-top:6px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
            ${(sites.length ? sites : SITES).map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="color:var(--text-300);font-size:12px;text-transform:uppercase;font-weight:600;">Supplier (optional)</label>
          <input id="proc-supplier" type="text" placeholder="e.g. Nairobi Industrial Fasteners Ltd" style="width:100%;margin-top:6px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <label style="color:var(--text-300);font-size:12px;text-transform:uppercase;font-weight:600;">Items</label>
          <button onclick="window._procAddItem()" type="button" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--gold);cursor:pointer;font-size:11px;">+ Add Item</button>
        </div>
        <div id="proc-items"></div>
      </div>
      <div>
        <label style="color:var(--text-300);font-size:12px;text-transform:uppercase;font-weight:600;">Notes / Rationale</label>
        <textarea id="proc-notes" rows="2" placeholder="e.g. Urgent milestone requirement" style="width:100%;margin-top:6px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);resize:none;"></textarea>
      </div>
      <div style="display:flex;gap:12px;">
        <button id="proc-submit-btn" onclick="window._procSubmit()" class="btn btn-gold" style="flex:1;">Submit for Approval</button>
        <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `);

  renderItems();

  window._procSubmit = async () => {
    const siteId = parseInt(document.getElementById("proc-site").value);
    const supplier = (document.getElementById("proc-supplier")?.value || "").trim();
    const notes = (document.getElementById("proc-notes")?.value || "").trim();

    // Validate: reject negatives, zero quantities, overflow values before persistence
    const rawItems = items.filter(i => i.name && i.name.trim());
    for (const item of rawItems) {
      const qty = Number(item.quantity);
      const price = parseFloat(item.unit_price);
      if (!Number.isFinite(qty) || qty <= 0) {
        showToast('Invalid quantity for "' + item.name + '": must be a positive number (got ' + item.quantity + ')', "error");
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        showToast('Invalid unit price for "' + item.name + '": must be zero or positive (got ' + item.unit_price + ')', "error");
        return;
      }
      if (qty > 999999 || price > 99999999) {
        showToast('Value overflow for "' + item.name + '": quantity or price exceeds allowed limit', "error");
        return;
      }
    }

    const validItems = rawItems.map(i => ({
      name: i.name.trim(),
      quantity: Number(i.quantity),
      unit: (i.unit || "Pcs").trim(),
      unit_price: parseFloat(i.unit_price) || 0
    }));

    if (!validItems.length) {
      showToast("Add at least one item", "error");
      return;
    }

    const total = validItems.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const btn = document.getElementById("proc-submit-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Submitting..."; }

    try {
      const payload = {
        site_id: siteId,
        requested_by: activeUser.id,
        items: validItems,
        supplier: supplier || null,
        notes: notes || null,
        total_amount: total || null,
        status: "pending",
        approval_chain: []
      };

      const { data: saved, error } = await supabase.from("procurement").insert(payload).select().single();
      if (error) throw error;

      await logAudit({
        action: "procurement_created",
        module: "procurement",
        record_id: saved?.id,
        reason: `Purchase request for ${supplier || 'Supplier TBD'} (KES ${total.toLocaleString()})`,
        after: payload
      });

      closeModal();
      showToast("Purchase request submitted successfully!", "success");
      if (window._procLoad) window._procLoad("pending");
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = "Submit for Approval"; }
      showToast(`Error: ${err.message}`, "error");
    }
  };
}
