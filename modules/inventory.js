// CDL — modules/inventory.js
import { supabase, SITES } from "../config.js";
import { logAudit } from "./audit_core.js";
import { ROLES } from "./roles.js";
import { findMaterial, MATERIALS_DB, CATEGORIES } from "../data.js";
import { showToast, showModal, closeModal } from "../app.js";

export async function renderInventory(container, user) {
  if (!container) return;
  const role = ROLES[user.role] || {};
  const isReadOnly = !role.canEditInventory;
  const isGlobalRole = ['admin', 'company_owner', 'ceo', 'asset_manager', 'finance', 'office_manager', 'site_overseer'].includes(user.role);
  const siteFilter = (!isGlobalRole && Array.isArray(user.site_ids) && user.site_ids.length > 0)
    ? user.site_ids
    : SITES.map(s => s.id);
  container.innerHTML = `<div style="margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;"><div><h1 style="font-size:24px;font-weight:700;color:var(--text-100);">Stock Inventory</h1><p style="color:var(--text-200);font-size:13px;margin-top:4px;">Manage materials across all sites</p></div>${!isReadOnly ? `<button class="btn btn-gold" onclick="window._invShowAdd()">+ Add Stock</button>` : ""}</div><div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center;"><select id="inv-site" onchange="window._invLoad()" style="background:var(--bg-600);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-100);font-size:13px;min-width:140px;">${siteFilter.length > 1 ? '<option value="">All Sites</option>' : ''}${SITES.filter(s => siteFilter.includes(s.id)).map(s => `<option value="${s.id}">${s.name}</option>`).join("")}</select><select id="inv-category" onchange="window._invLoad()" style="background:var(--bg-600);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-100);font-size:13px;"><option value="">All Categories</option>${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("")}</select><select id="inv-type" onchange="window._invLoad()" style="background:var(--bg-600);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-100);font-size:13px;"><option value="">All Types</option><option value="local">Local</option><option value="imported">Imported</option><option value="scaffolding">Scaffolding</option></select><div style="flex:1;min-width:200px;"><input id="inv-search" type="text" placeholder="🔍 Search materials…" onkeyup="window._invLoad()" style="width:100%;background:var(--bg-600);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-100);font-size:13px;"></div></div><div id="inv-stats" class="kpi-grid" style="margin-bottom:20px;"></div><div id="inv-table-wrap"><div class="spinner" style="margin:60px auto;"></div></div>`;
  window._invLoad = () => loadInventoryData(user, siteFilter, isReadOnly);
  window._invShowAdd = () => showAddStockModal(user, siteFilter);
  window._invRefresh = () => loadInventoryData(user, siteFilter, isReadOnly);
  loadInventoryData(user, siteFilter, isReadOnly);
}

async function loadInventoryData(user, siteFilter, isReadOnly) {
  const siteId = document.getElementById("inv-site")?.value;
  const category = document.getElementById("inv-category")?.value;
  const type = document.getElementById("inv-type")?.value;
  const search = document.getElementById("inv-search")?.value?.toLowerCase();
  try {
    let query = supabase.from("stock").select("*,sites(name)").order("material_name", { ascending: true }).limit(200);
    // Feature 5: Requesters (read-only) can only see approved/available materials
    if (isReadOnly) query = query.eq("status", "approved");
    if (siteId) query = query.eq("site_id", parseInt(siteId)); else if (siteFilter?.length) query = query.in("site_id", siteFilter);
    if (category) query = query.eq("category", category);
    if (type) query = query.eq("storekeeper_type", type);
    const { data: items, error } = await query;
    if (error) throw error;
    let arr = Array.isArray(items) ? items : [];
    if (search) arr = arr.filter(i => i.material_name?.toLowerCase().includes(search));
    renderInvStats(arr); renderInvTable(arr, user, isReadOnly);
  } catch (err) { const wrap = document.getElementById("inv-table-wrap"); if (wrap) wrap.innerHTML = `<p style="color:var(--red);">Error: ${err.message}</p>`; }
}

function renderInvStats(items) {
  const total = items.length;
  const lowStock = items.filter(i => (i.quantity||0) < 10 && (i.quantity||0) > 0).length;
  const outStock = items.filter(i => (i.quantity||0) <= 0).length;
  const totalVal = items.reduce((s,i) => s + ((i.quantity||0)*(i.unit_price||0)), 0);
  const el = document.getElementById("inv-stats"); if (!el) return;
  el.innerHTML = [["📦",total,"Total Items","var(--blue)"],["⚠️",lowStock,"Low Stock","var(--orange)"],["🚫",outStock,"Out of Stock","var(--red)"],["💰",`KES ${totalVal.toLocaleString()}`,"Total Value","var(--green)"]].map(([icon,val,label,color]) => `<div class="stat-card" style="border-top:2px solid ${color};padding:16px;text-align:center;"><div style="font-size:20px;margin-bottom:4px;">${icon}</div><div class="stat-value" style="color:${color};font-size:20px;">${val}</div><div class="stat-label">${label}</div></div>`).join("");
}

function renderInvTable(items, user, isReadOnly) {
  const wrap = document.getElementById("inv-table-wrap"); if (!wrap) return;
  if (!items.length) { wrap.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);"><div style="font-size:32px;margin-bottom:12px;">📭</div><div>No stock items found</div></div>`; return; }
  wrap.innerHTML = `<div class="card no-hover-transform" style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="border-bottom:1px solid var(--border);">${["Site","Material","Category","Type","Qty","Unit","Price","Value","Status","Actions"].map(h=>`<th style="text-align:left;padding:12px 8px;color:var(--text-400);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">${h}</th>`).join("")}</tr></thead><tbody>${items.map(item => {const qty=item.quantity||0;const isPending=item.status==="pending";const sc=isPending?"var(--orange)":qty<=0?"var(--red)":qty<10?"var(--orange)":"var(--green)";const st=isPending?"Pending Approval":qty<=0?"Out":qty<10?"Low":"OK";const val=qty*(item.unit_price||0);return `<tr style="border-bottom:1px solid rgba(30,35,48,0.4);${isPending?'opacity:0.7;':''}"><td style="padding:10px 8px;color:var(--text-200);">${item.sites?.name||`Site ${item.site_id}`}</td><td style="padding:10px 8px;color:var(--text-100);font-weight:500;">${item.material_name}</td><td style="padding:10px 8px;color:var(--text-200);">${item.category||"—"}</td><td style="padding:10px 8px;"><span class="badge badge-blue">${item.storekeeper_type||"—"}</span></td><td style="padding:10px 8px;font-weight:700;color:${sc};">${qty}</td><td style="padding:10px 8px;color:var(--text-300);">${item.unit||"—"}</td><td style="padding:10px 8px;">${item.unit_price?"KES "+Number(item.unit_price).toLocaleString():"—"}</td><td style="padding:10px 8px;color:var(--gold);">${val?"KES "+val.toLocaleString():"—"}</td><td style="padding:10px 8px;"><span class="badge" style="background:${sc}20;color:${sc};">${st}</span></td><td style="padding:10px 8px;">${!isReadOnly&&!isPending?`<button onclick="window._invAdjust('${item.id}','${item.material_name.replace(/'/g,"\\'")}',${qty},'${item.unit||""}')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px;">Adjust</button>`:""}</td></tr>`;}).join("")}</tbody></table></div>`;
  window._invAdjust = (id,name,qty,unit) => showAdjustModal(id,name,qty,unit,user);
}

function showAddStockModal(user, siteFilter) {
  showModal(`<h2 style="font-size:18px;font-weight:700;color:var(--text-100);margin-bottom:20px;">Add Stock Item</h2><div style="display:flex;flex-direction:column;gap:16px;"><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Site</label><select id="m-site" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">${SITES.filter(s=>siteFilter.includes(s.id)).map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select></div><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Material Name</label><input id="m-name" type="text" list="mat-list" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);"><datalist id="mat-list">${MATERIALS_DB.slice(0,100).map(m=>`<option value="${m.name}">`).join("")}</datalist></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;"><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Quantity</label><input id="m-qty" type="number" min="0" value="0" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);"></div><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Unit Price (KES)</label><input id="m-price" type="number" min="0" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);"></div><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Type</label><select id="m-type" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);"><option value="local">Local</option><option value="imported">Imported</option><option value="scaffolding">Scaffolding</option></select></div></div><div style="display:flex;gap:12px;"><button onclick="window._invSaveStock()" class="btn btn-gold" style="flex:1;">Save Stock</button><button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button></div></div>`);
  window._invSaveStock = async () => {
    const name = document.getElementById("m-name").value.trim();
    const siteId = parseInt(document.getElementById("m-site").value);
    const qty = parseFloat(document.getElementById("m-qty").value) || 0;
    const price = parseFloat(document.getElementById("m-price").value) || null;
    const type = document.getElementById("m-type").value;
    if (!name) { showToast("Material name required", "error"); return; }
    const mat = findMaterial(name);
    const payload = { site_id: siteId, material_name: name, material_code: mat?.code || null, category: mat?.category || null, quantity: qty, unit: mat?.unit || null, unit_price: price, storekeeper_type: type, opening_balance_value: qty, updated_by: user.id };
    try {
      const { data, error } = await supabase.from("stock").insert(payload).select().single();
      if (error) throw error;
      await logAudit({ action: "stock_created", module: "inventory", record_id: data?.id, after: payload, reason: `Opening balance set for ${name}` });
      closeModal();
      showToast("Stock added", "success");
      if (window._invRefresh) window._invRefresh();
    } catch(err) { showToast(`Error: ${err.message}`, "error"); }
  };
}

function showAdjustModal(id, name, qty, unit, user) {
  showModal(`<h2 style="font-size:18px;font-weight:700;color:var(--text-100);margin-bottom:6px;">Adjust Stock</h2><p style="color:var(--text-200);font-size:13px;margin-bottom:16px;">${name} · Current: <strong style="color:var(--gold);">${qty} ${unit}</strong></p><div style="display:flex;flex-direction:column;gap:16px;"><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">New Quantity</label><input id="adj-qty" type="number" value="${qty}" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);"></div><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Reason</label><textarea id="adj-reason" rows="2" placeholder="Reason for adjustment…" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);resize:none;"></textarea></div><div style="display:flex;gap:12px;"><button onclick="window._invApplyAdjust('${id}',${qty})" class="btn btn-gold" style="flex:1;">Apply</button><button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button></div></div>`);
  window._invApplyAdjust = async (stockId, oldQty) => {
    const newQty = parseFloat(document.getElementById("adj-qty").value);
    const reason = document.getElementById("adj-reason").value.trim();
    if (isNaN(newQty)) { showToast("Invalid quantity", "error"); return; }
    try {
      const { error } = await supabase.from("stock").update({ quantity: newQty, last_updated: new Date().toISOString(), updated_by: user.id }).eq("id", stockId);
      if (error) throw error;
      await logAudit({ action: "stock_adjusted", module: "inventory", record_id: stockId, before: { quantity: oldQty, reason }, after: { quantity: newQty }, reason });
      closeModal();
      showToast("Stock updated", "success");
      if (window._invRefresh) window._invRefresh();
    } catch(err) { showToast(`Error: ${err.message}`, "error"); }
  };
}
