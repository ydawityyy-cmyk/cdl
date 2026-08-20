// CDL — modules/grn.js
import { supabase, SITES } from "../config.js";
import { logAudit } from "./audit_core.js";
import { ROLES } from "./roles.js";
import { scanGRN, renderGRNPreview } from "./ai_grn.js";
import { showToast, showModal, closeModal } from "../app.js";
import { MATERIALS_DB, findMaterial } from "../data.js";

// ─── Perishable Construction Materials Detector ──────────────────────────────
export function isPerishable(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.includes('cement') ||
         lower.includes('sika') ||
         lower.includes('chemical') ||
         lower.includes('admixture') ||
         lower.includes('waterproof') ||
         lower.includes('grout') ||
         lower.includes('epoxy') ||
         lower.includes('resin') ||
         lower.includes('paint') ||
         lower.includes('primer') ||
         lower.includes('sealant') ||
         lower.includes('bitumen') ||
         lower.includes('bonding');
}

const UOM_OPTIONS = ["Pcs", "Bags", "Kgs", "Tonnes", "Litres", "Meters", "M2", "M3", "Rolls", "Boxes", "Sets", "Lengths"];

export async function renderGRN(container, user) {
  const role = ROLES[user.role] || {};
  const siteFilter = role.siteScope === "assigned" ? (user.site_ids || []) : SITES.map(s => s.id);
  const skType = role.storekeeperType || user.storekeeper_type || null;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:16px;">
      <div>
        <h1 style="font-size:24px;font-weight:700;color:var(--text-100);">GRN Scanner & Entry</h1>
        <p style="color:var(--text-200);font-size:14px;margin-top:4px;">Goods Received Notes — AI-Powered Verification + Auto Stock Ingestion</p>
      </div>
      <button onclick="window._grnOpenNew()" class="btn btn-gold">📦 + New GRN</button>
    </div>
    <div id="grn-tabs" style="display:flex;gap:4px;margin-bottom:20px;">
      ${["Pending", "Verified", "Disputed"].map((t, i) => `
        <button onclick="window._grnSwitchTab('${t.toLowerCase()}')" id="grn-tab-${t.toLowerCase()}" 
          style="padding:8px 20px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:500;${i === 0 ? "background:var(--gold);color:#0a0c10;" : "background:var(--bg-600);color:var(--text-200);"}">${t}</button>
      `).join("")}
    </div>
    <div id="grn-list"><div class="spinner" style="margin:60px auto;"></div></div>
  `;

  window._grnSwitchTab = (status) => {
    ["pending", "verified", "disputed"].forEach(s => {
      const btn = document.getElementById(`grn-tab-${s}`);
      if (!btn) return;
      btn.style.background = s === status ? "var(--gold)" : "var(--bg-600)";
      btn.style.color = s === status ? "#0a0c10" : "var(--text-200)";
    });
    loadGRNs(user, siteFilter, status, skType);
  };

  window._grnOpenNew = () => openNewGRNModal(user, siteFilter);
  loadGRNs(user, siteFilter, "pending", skType);
}

async function loadGRNs(user, siteFilter, status, skType) {
  const list = document.getElementById("grn-list");
  if (!list) return;
  list.innerHTML = `<div class="spinner" style="margin:60px auto;"></div>`;

  try {
    let query = supabase.from("grns").select("*,sites(name)").eq("status", status).order("created_at", { ascending: false }).limit(50);
    if (siteFilter.length) query = query.in("site_id", siteFilter);
    if (skType) query = query.eq("storekeeper_type", skType);

    const { data: grns, error } = await query;
    if (error) throw error;

    if (!grns || !grns.length) {
      list.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">No ${status} GRNs</div>`;
      return;
    }

    list.innerHTML = grns.map(g => {
      const items = Array.isArray(g.items) ? g.items : [];
      return `
        <div class="card" style="margin-bottom:12px;cursor:pointer;" onclick="window._grnView('${g.id}')">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-weight:600;color:var(--text-100);font-size:14px;">
                ${g.grn_number || "GRN-" + g.id.substring(0, 8)} · ${g.sites?.name || `Site ${g.site_id}`}
              </div>
              <div style="color:var(--text-200);font-size:12px;margin-top:4px;">
                ${g.supplier || "No supplier"} · ${items.length} item(s) · ${g.storekeeper_type || "–"}
                ${g.invoice_number ? ` · Inv: ${g.invoice_number}` : ""}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="color:var(--gold);font-weight:600;">${g.total_value ? "KES " + Number(g.total_value).toLocaleString() : "—"}</div>
              <div style="color:var(--text-300);font-size:12px;">${new Date(g.created_at).toLocaleDateString("en-KE")}</div>
            </div>
          </div>
          ${status === "pending" && ROLES[user.role]?.canVerifyGRN ? `
            <div style="margin-top:12px;display:flex;gap:8px;">
              <button onclick="event.stopPropagation();window._grnVerify('${g.id}')" class="btn btn-gold" style="font-size:12px;padding:6px 16px;">✓ Verify + Add Stock</button>
              <button onclick="event.stopPropagation();window._grnDispute('${g.id}')" class="btn btn-ghost" style="font-size:12px;padding:6px 16px;color:var(--red);">⚠ Dispute</button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

    window._grnVerify = (id) => verifyAndStockGRN(id, user);
    window._grnDispute = (id) => updateGRNStatus(id, "disputed", user);
    window._grnView = (id) => openViewGRNModal(id, user);
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red);">Error: ${err.message}</p>`;
  }
}

async function verifyAndStockGRN(id, user) {
  try {
    const { data: grn, error: grnErr } = await supabase.from("grns").select("*").eq("id", id).single();
    if (grnErr || !grn) { showToast("GRN not found", "error"); return; }
    const items = Array.isArray(grn.items) ? grn.items : [];
    const skType = grn.storekeeper_type || "local";
    const siteId = grn.site_id;
    let stockAdded = 0;

    for (const item of items) {
      const itemName = item.name || item.material_name;
      const itemQty = parseFloat(item.quantity || item.qty) || 0;
      if (!itemName || itemQty <= 0) continue;

      const mat = findMaterial(itemName);
      const { data: existing, error: chkErr } = await supabase
        .from("stock")
        .select("*")
        .eq("site_id", siteId)
        .eq("material_name", itemName)
        .eq("storekeeper_type", skType)
        .limit(1);

      if (chkErr) throw chkErr;

      if (existing && existing.length) {
        const cur = existing[0];
        const { error: updErr } = await supabase
          .from("stock")
          .update({
            quantity: (cur.quantity || 0) + itemQty,
            unit_price: item.unit_price || cur.unit_price,
            last_updated: new Date().toISOString(),
            updated_by: user.id
          })
          .eq("id", cur.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from("stock")
          .insert({
            site_id: siteId,
            material_name: itemName,
            material_code: item.code || mat?.code || null,
            category: item.category || mat?.category || "Other",
            quantity: itemQty,
            unit: item.unit || mat?.unit || "Pcs",
            unit_price: item.unit_price || 0,
            storekeeper_type: skType,
            updated_by: user.id
          });
        if (insErr) throw insErr;
      }
      stockAdded++;
    }

    const { error: grnUpdErr } = await supabase
      .from("grns")
      .update({ status: "verified", verified_by: user.id, verified_at: new Date().toISOString() })
      .eq("id", id);
    if (grnUpdErr) throw grnUpdErr;

    await logAudit({ action: "grn_verified", module: "grn", record_id: id, after: { items: stockAdded, site_id: siteId, supplier: grn.supplier } });
    showToast(`GRN verified — ${stockAdded} item(s) added to inventory`, "success");
    closeModal();
    window._grnSwitchTab("verified");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

let grnItems = [];

async function openNewGRNModal(user, siteFilter) {
  grnItems = [
    { name: "", code: "", quantity: 1, unit: "Pcs", unit_price: 0, total_price: 0 }
  ];
  const canAddNewMaterial = ["store_manager", "admin", "company_owner"].includes(user.role);

  showModal(`
    <h2 style="margin-bottom:6px;font-size:18px;font-weight:700;color:var(--text-100);">New Goods Received Note (GRN)</h2>
    <p style="color:var(--text-300);font-size:13px;margin-bottom:18px;">Record incoming deliveries with itemized materials and verification details.</p>
    
    <!-- AI Extraction Dropzone -->
    <div style="background:var(--bg-700);border:2px dashed var(--border);border-radius:12px;padding:20px;text-align:center;cursor:pointer;margin-bottom:16px;" onclick="document.getElementById('grn-files').click()">
      <div style="font-size:26px;margin-bottom:4px;">📷</div>
      <div style="color:var(--text-100);font-size:13px;font-weight:600;">Click to upload delivery note / invoice</div>
      <div style="color:var(--text-300);font-size:11px;margin-top:2px;">AI will scan and pre-fill document details & line items automatically</div>
      <input id="grn-files" type="file" accept="image/*,application/pdf" multiple style="display:none;" onchange="window._grnProcessFiles(this.files)">
    </div>
    <div id="grn-ai-preview" style="margin-bottom:12px;"></div>

    <!-- Header Details -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div>
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Destination Site</label>
        <select id="g-site" style="width:100%;margin-top:4px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:9px;color:var(--text-100);">
          ${SITES.filter(s => siteFilter.includes(s.id)).map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
        </select>
      </div>
      <div>
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Storekeeper Section / Type</label>
        <select id="g-type" style="width:100%;margin-top:4px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:9px;color:var(--text-100);">
          <option value="local">Local Materials</option>
          <option value="imported">Imported Materials</option>
          <option value="scaffolding">Scaffolding / Formwork</option>
        </select>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div>
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">GRN / Delivery Note #</label>
        <input id="g-grn" type="text" placeholder="e.g. DN-90821 / GRN-001" style="width:100%;margin-top:4px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:9px;color:var(--text-100);">
      </div>
      <div>
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Invoice Number</label>
        <input id="g-inv" type="text" placeholder="e.g. INV-2026-441" style="width:100%;margin-top:4px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:9px;color:var(--text-100);">
      </div>
    </div>

    <div style="margin-bottom:16px;">
      <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Supplier / Vendor</label>
      <input id="g-supplier" type="text" placeholder="e.g. Bamburi Cement, Devki Steel, Hardware Ltd" style="width:100%;margin-top:4px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:9px;color:var(--text-100);">
    </div>

    <!-- Items Section -->
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:600;color:var(--text-100);text-transform:uppercase;letter-spacing:0.5px;">Material Line Items</span>
        <button type="button" onclick="window._grnAddItemRow()" class="btn btn-ghost" style="font-size:12px;padding:4px 10px;color:var(--gold);">+ Add Line Item</button>
      </div>

      <datalist id="materials-datalist">
        ${MATERIALS_DB.map(m => `<option value="${m.name}">${m.code ? m.code + ' — ' : ''}${m.unit || ''}</option>`).join("")}
      </datalist>

      <div style="background:var(--bg-700);border:1px solid var(--border);border-radius:10px;padding:12px;max-height:220px;overflow-y:auto;">
        <div id="grn-items-container" style="display:flex;flex-direction:column;gap:10px;"></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:0 4px;">
        <span style="font-size:12px;color:var(--text-300);" id="grn-items-count">1 item(s)</span>
        <div style="font-size:13px;font-weight:600;color:var(--text-100);">
          Estimated Value: <span id="grn-total-val" style="color:var(--gold);">KES 0</span>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:12px;margin-top:8px;">
      <button onclick="window._grnSave()" class="btn btn-gold" style="flex:1;">Submit GRN for Verification</button>
      <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
    </div>
  `);

  renderGRNItemRows(canAddNewMaterial);

  window._grnAddItemRow = () => {
    grnItems.push({ name: "", code: "", quantity: 1, unit: "Pcs", unit_price: 0, total_price: 0 });
    renderGRNItemRows(canAddNewMaterial);
  };

  window._grnRemoveItemRow = (idx) => {
    if (grnItems.length > 1) {
      grnItems.splice(idx, 1);
      renderGRNItemRows(canAddNewMaterial);
    }
  };

  window._grnUpdateItem = (idx, field, val) => {
    if (!grnItems[idx]) return;

    // Material name change: validate access for non-store-managers
    if (field === "name" && val.trim().length > 0) {
      const _grnContainer = document.getElementById("grn-items-container");
      const canAddNew = _grnContainer?.dataset?.canAddNew === "1";
      if (!canAddNew) {
        const knownNames = MATERIALS_DB.map(m => m.name.toLowerCase());
        if (!knownNames.includes(val.trim().toLowerCase())) {
          showToast("Only the Store Manager can add new material names. Please select from the list.", "error");
          grnItems[idx][field] = "";
          renderGRNItemRows(false);
          return;
        }
      }
    }

    grnItems[idx][field] = val;

    // Auto-fill UOM and unit price from MATERIALS_DB if known
    if (field === "name") {
      const match = findMaterial(val);
      if (match) {
        if (match.code) grnItems[idx].code = match.code;
        if (match.unit) grnItems[idx].unit = match.unit;
        if (match.unit_price && !grnItems[idx].unit_price) grnItems[idx].unit_price = match.unit_price;
        const _c2 = document.getElementById("grn-items-container");
        renderGRNItemRows(_c2?.dataset?.canAddNew === "1");
        return;
      }
    }

    const q = parseFloat(grnItems[idx].quantity) || 0;
    const p = parseFloat(grnItems[idx].unit_price) || 0;
    grnItems[idx].total_price = q * p;
    updateGRNCalculations();
  };

  window._grnProcessFiles = async (files) => {
    const preview = document.getElementById("grn-ai-preview");
    preview.innerHTML = `<div style="text-align:center;padding:16px;color:var(--gold);">🔍 AI scanning document and extracting materials…</div>`;
    const grnData = await scanGRN(files);
    if (grnData && !grnData.error) {
      renderGRNPreview(grnData, "grn-ai-preview");
      if (grnData.grn_number) document.getElementById("g-grn").value = grnData.grn_number;
      if (grnData.invoice_number) document.getElementById("g-inv").value = grnData.invoice_number;
      if (grnData.supplier) document.getElementById("g-supplier").value = grnData.supplier;
      if (Array.isArray(grnData.items) && grnData.items.length > 0) {
        grnItems = grnData.items.map(i => ({
          name: i.name || i.material_name || "",
          code: i.code || "",
          quantity: parseFloat(i.quantity || i.qty) || 1,
          unit: i.unit || "Pcs",
          unit_price: parseFloat(i.unit_price) || 0,
          total_price: (parseFloat(i.quantity || 1) * parseFloat(i.unit_price || 0))
        }));
        renderGRNItemRows(canAddNewMaterial);
      }
    } else {
      renderGRNPreview(grnData, "grn-ai-preview");
    }
  };

  window._grnSave = async () => {
    const siteId = parseInt(document.getElementById("g-site").value);
    const type = document.getElementById("g-type").value;
    const grnNum = document.getElementById("g-grn").value.trim();
    const invNum = document.getElementById("g-inv").value.trim();
    const supplier = document.getElementById("g-supplier").value.trim();

    if (!siteId) { showToast("Select a destination site", "error"); return; }
    if (!supplier) { showToast("Supplier / Vendor name is required", "error"); return; }
    if (!grnNum && !invNum) { showToast("Provide at least a GRN / Delivery Note # or Invoice Number", "error"); return; }
    
    // Validate line items
    const validItems = grnItems.filter(i => (i.name || "").trim().length > 0 && parseFloat(i.quantity) > 0);
    if (!validItems.length) {
      showToast("Add at least one material item with a name and valid quantity", "error");
      return;
    }

    // Check for perishable items requiring expiry date
    for (const item of validItems) {
      if (isPerishable(item.name) && !item.expiry_date) {
        showToast(`Expiry date is mandatory for perishable item: "${item.name}"`, "error");
        return;
      }
    }

    const totalVal = validItems.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);

    const payload = {
      site_id: siteId,
      grn_number: grnNum || null,
      invoice_number: invNum || null,
      supplier: supplier || null,
      storekeeper_type: type,
      items: validItems,
      total_value: totalVal > 0 ? totalVal : null,
      received_by: user.id,
      status: "pending"
    };

    try {
      const { data, error } = await supabase.from("grns").insert(payload).select().single();
      if (error) throw error;
      await logAudit({ action: "grn_created", module: "grn", record_id: data?.id, after: payload });
      closeModal();
      showToast(`GRN created with ${validItems.length} item(s) — pending verification`, "success");
      loadGRNs(user, siteFilter, "pending", type);
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    }
  };
}

function renderGRNItemRows(canAddNewMaterial) {
  const container = document.getElementById("grn-items-container");
  if (!container) return;

  container.dataset.canAddNew = canAddNewMaterial ? "1" : "0";
  const knownNames = MATERIALS_DB.map(m => m.name);

  container.innerHTML = grnItems.map((item, idx) => {
    const perishable = isPerishable(item.name);
    const hasName = (item.name || "").trim().length > 0;
    
    return `
      <div style="background:rgba(0,0,0,0.25);border:1px solid ${perishable ? 'rgba(212,175,110,0.35)' : 'var(--border)'};border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;">
        <div style="display:grid;grid-template-columns:2fr 0.8fr 1fr 1fr 28px;gap:8px;align-items:center;">
          <div>
            ${canAddNewMaterial
              ? `<input type="text" list="materials-datalist" placeholder="Material Name (or type new)" value="${item.name || ""}"
                   onchange="window._grnUpdateItem(${idx}, 'name', this.value)"
                   oninput="window._grnUpdateItem(${idx}, 'name', this.value)"
                   style="width:100%;background:var(--bg-800);border:1px solid var(--border);border-radius:6px;padding:7px 8px;color:var(--text-100);font-size:12px;" />`
              : `<select onchange="window._grnUpdateItem(${idx}, 'name', this.value)"
                   style="width:100%;background:var(--bg-800);border:1px solid var(--border);border-radius:6px;padding:7px 4px;color:var(--text-100);font-size:12px;">
                   <option value="">— Select Material —</option>
                   ${knownNames.map(n => `<option value="${n}" ${item.name === n ? "selected" : ""}>${n}</option>`).join("")}
                 </select>`
            }
          </div>
          <div>
            <input type="number" min="0.1" step="any" placeholder="Qty" value="${item.quantity || 1}"
              oninput="window._grnUpdateItem(${idx}, 'quantity', this.value)"
              style="width:100%;background:var(--bg-800);border:1px solid var(--border);border-radius:6px;padding:7px 8px;color:var(--text-100);font-size:12px;" />
          </div>
          <div>
            <select onchange="window._grnUpdateItem(${idx}, 'unit', this.value)"
              style="width:100%;background:var(--bg-800);border:1px solid var(--border);border-radius:6px;padding:7px 4px;color:var(--text-100);font-size:12px;">
              ${UOM_OPTIONS.map(u => `<option value="${u}" ${item.unit === u ? "selected" : ""}>${u}</option>`).join("")}
            </select>
          </div>
          <div>
            <input type="number" min="0" step="any" placeholder="Unit KES" value="${item.unit_price || 0}"
              oninput="window._grnUpdateItem(${idx}, 'unit_price', this.value)"
              style="width:100%;background:var(--bg-800);border:1px solid var(--border);border-radius:6px;padding:7px 8px;color:var(--text-100);font-size:12px;" />
          </div>
          <div>
            ${grnItems.length > 1 ? `
              <button type="button" onclick="window._grnRemoveItemRow(${idx})" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:14px;">✕</button>
            ` : `<span style="color:var(--text-400);font-size:12px;">–</span>`}
          </div>
        </div>

        <!-- Shelf Life & Batch Dates with Non-Perishable (PPR/Steel) Hint -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:11px;background:rgba(0,0,0,0.18);padding:6px 10px;border-radius:6px;">
          <div style="display:flex;align-items:center;gap:6px;">
            ${perishable ? `
              <span style="color:var(--gold);font-weight:600;">⏳ Perishable Item (Mfg & Exp Dates Mandatory *)</span>
            ` : hasName ? `
              <span style="color:var(--text-300);">💡 Non-Perishable (e.g. PPR pipes, steel, ballast — No expiry date needed)</span>
            ` : `
              <span style="color:var(--text-300);">Batch / Expiry Dates (optional for non-perishables):</span>
            `}
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="display:flex;align-items:center;gap:4px;">
              <label style="color:var(--text-400);font-size:10px;">Mfg:</label>
              <input type="date" value="${item.production_date || ""}"
                onchange="window._grnUpdateItem(${idx}, 'production_date', this.value)"
                style="background:var(--bg-800);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text-100);font-size:11px;" />
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
              <label style="color:var(--text-400);font-size:10px;">Exp:</label>
              <input type="date" value="${item.expiry_date || ""}"
                onchange="window._grnUpdateItem(${idx}, 'expiry_date', this.value)"
                style="background:var(--bg-800);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text-100);font-size:11px;" />
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  updateGRNCalculations();
}

function updateGRNCalculations() {
  const countEl = document.getElementById("grn-items-count");
  const totalEl = document.getElementById("grn-total-val");
  if (!countEl || !totalEl) return;

  const validItems = grnItems.filter(i => (i.name || "").trim().length > 0);
  const total = grnItems.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0)), 0);

  countEl.textContent = `${validItems.length} valid item(s)`;
  totalEl.textContent = `KES ${Math.round(total).toLocaleString()}`;
}

async function updateGRNStatus(id, status, user) {
  try {
    const { error } = await supabase.from("grns").update({ status }).eq("id", id);
    if (error) throw error;
    await logAudit({ action: `grn_${status}`, module: "grn", record_id: id, after: { status } });
    showToast(`GRN ${status}`, status === "verified" ? "success" : "warning");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

async function openViewGRNModal(id, user) {
  showModal(`<div class="spinner" style="margin:40px auto;"></div>`);
  try {
    const { data: grn, error: grnErr } = await supabase.from("grns").select("*,sites(name)").eq("id", id).single();
    if (grnErr || !grn) { showToast("GRN not found", "error"); return; }
    const items = Array.isArray(grn.items) ? grn.items : [];

    showModal(`
      <h2 style="margin-bottom:16px;font-size:18px;font-weight:700;color:var(--text-100);">GRN: ${grn.grn_number || grn.id.slice(0, 8)}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;background:var(--bg-700);padding:14px;border-radius:10px;border:1px solid var(--border);">
        ${[
          ["Site", grn.sites?.name || `Site ${grn.site_id}`],
          ["Supplier", grn.supplier || "—"],
          ["GRN #", grn.grn_number || "—"],
          ["Invoice #", grn.invoice_number || "—"],
          ["Section Type", grn.storekeeper_type || "—"],
          ["Status", grn.status?.toUpperCase()],
          ["Total Value", grn.total_value ? `KES ${Number(grn.total_value).toLocaleString()}` : "—"],
          ["Date Received", new Date(grn.created_at).toLocaleDateString("en-KE")]
        ].map(([l, v]) => `
          <div>
            <span style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${l}</span>
            <div style="color:var(--text-100);font-weight:500;font-size:13px;margin-top:2px;">${v}</div>
          </div>
        `).join("")}
      </div>

      <h3 style="font-size:14px;font-weight:600;margin-bottom:10px;color:var(--text-100);">Itemized Materials</h3>
      ${items.length ? `
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:16px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:var(--bg-700);border-bottom:1px solid var(--border);">
                ${["Material Item", "Qty", "UOM", "Unit Price", "Total"].map(h => `
                  <th style="text-align:left;padding:8px 10px;color:var(--text-300);font-weight:500;">${h}</th>
                `).join("")}
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr style="border-bottom:1px solid rgba(30,35,48,0.4);">
                  <td style="padding:8px 10px;color:var(--text-100);font-weight:500;">${item.name || item.material_name || "—"}</td>
                  <td style="padding:8px 10px;color:var(--text-100);">${item.quantity || "—"}</td>
                  <td style="padding:8px 10px;color:var(--text-200);">${item.unit || "—"}</td>
                  <td style="padding:8px 10px;color:var(--text-200);">${item.unit_price ? "KES " + Number(item.unit_price).toLocaleString() : "—"}</td>
                  <td style="padding:8px 10px;color:var(--gold);font-weight:600;">${item.total_price ? "KES " + Number(item.total_price).toLocaleString() : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<p style="color:var(--text-300);font-size:13px;margin-bottom:16px;">No line items recorded.</p>`}

      <div style="display:flex;gap:12px;">
        <button onclick="window._closeModal()" class="btn btn-ghost" style="flex:1;">Close</button>
      </div>
    `);
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
    closeModal();
  }
}
