// ============================================================
// CDL Site Management — modules/storekeeper.js
// Storekeeper dashboard: GRN scanner, pending issues, incident reports.
// Each storekeeper type (local/imported/scaffolding) sees ONLY their data.
// ============================================================

import { supabase, SITES } from "../config.js";
import { callAIWithImages } from "./ai_engine.js";
import { logAudit } from "./audit_core.js";
import { showToast, showModal, closeModal } from "../app.js";
import { findMaterial, UNITS } from "../data.js";
import { checkAndQueueNewMaterial } from "./material_approvals.js";

export async function renderStorekeeperDashboard(container, user) {
  const skType = user.storekeeper_type
    || (user.role === "storekeeper_local" ? "local"
    : user.role === "storekeeper_import" ? "imported" : "scaffolding");
  const siteIds = user.site_ids || [];
  const siteParam = siteIds.length ? `site_id=in.(${siteIds.join(",")})` : "site_id=eq.0";
  const siteName = siteIds.map(id => SITES.find(s => s.id === id)?.name || `Site ${id}`).join(", ");
  const typeColors = { local:"var(--accent-green)", imported:"var(--accent-blue)", scaffolding:"var(--accent-orange)" };
  const typeColor = typeColors[skType] || "var(--accent-gold)";

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;color:${typeColor};letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">◆ STOREKEEPER · ${skType.toUpperCase()}</div>
      <h1 style="font-family:var(--font-display);font-size:26px;font-weight:800;">${siteName||"My Site"} — ${skType.charAt(0).toUpperCase()+skType.slice(1)} Materials</h1>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:24px;">
      <div class="card" style="text-align:center;border-top:2px solid ${typeColor};padding:16px;">
        <div style="font-size:24px;margin-bottom:6px;">📦</div>
        <div id="sk-stock-count" style="font-size:22px;font-weight:700;color:${typeColor};font-family:var(--font-display);">—</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Stock Items</div>
      </div>
      <div class="card" style="text-align:center;border-top:2px solid var(--accent-orange);padding:16px;">
        <div style="font-size:24px;margin-bottom:6px;">📋</div>
        <div id="sk-pending-grns" style="font-size:22px;font-weight:700;color:var(--accent-orange);font-family:var(--font-display);">—</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Pending GRNs</div>
      </div>
      <div class="card" style="text-align:center;border-top:2px solid var(--accent-blue);padding:16px;">
        <div style="font-size:24px;margin-bottom:6px;">🚚</div>
        <div id="sk-pending-issues" style="font-size:22px;font-weight:700;color:var(--accent-blue);font-family:var(--font-display);">—</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Pending Issues</div>
      </div>
      <div class="card" style="text-align:center;border-top:2px solid var(--accent-red);padding:16px;">
        <div style="font-size:24px;margin-bottom:6px;">⚠️</div>
        <div id="sk-low-stock" style="font-size:22px;font-weight:700;color:var(--accent-red);font-family:var(--font-display);">—</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Low Stock</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      <button onclick="window.openManualGRN()" class="btn btn-gold">📷 Add Materials / GRN</button>
      <button onclick="window.openManualGRN()" class="btn" style="background:var(--bg-card);border:1px solid var(--border);">✍️ Manual GRN Entry</button>
      <button onclick="window.openIncidentReport()" class="btn btn-danger">🚨 Report Incident</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <div class="card">
        <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px;color:var(--accent-blue);">📋 Pending Issue Requests</h3>
        <div id="sk-issue-list"><div class="spinner" style="margin:30px auto;"></div></div>
      </div>
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="font-family:var(--font-display);font-size:15px;color:${typeColor};">📦 My Stock</h3>
          <input id="sk-search" type="text" placeholder="Search..." onkeyup="window.loadSKStock()"
            style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:12px;width:140px;" />
        </div>
        <div id="sk-stock-list" style="max-height:320px;overflow-y:auto;"></div>
      </div>
    </div>
    <div class="card">
      <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px;">📄 Recent GRNs</h3>
      <div id="sk-grn-list"><div class="spinner" style="margin:30px auto;"></div></div>
    </div>`;

  // Store params for refresh after actions
  window._skParams = { skType, siteParam, typeColor, siteId: siteIds[0] };
  window.loadSKStock = () => loadStock(skType, siteParam, typeColor);
  window.loadSKIssues = () => loadIssueRequests(siteParam);
  window.loadSKGRNs = () => loadRecentGRNs(skType, siteParam);
  window.openGRNScanner = () => openGRNScannerModal(user, skType, siteIds[0]);
  window.openManualGRN = () => openManualGRNModal(user, skType, siteIds[0]);
  window.openIncidentReport = () => openIncidentModal(user, skType, siteIds[0]);
  window.issueStock = (reqId, reqJson) => handleStockIssue(user, reqId, reqJson, skType);

  await Promise.all([
    loadStock(skType, siteParam, typeColor),
    loadIssueRequests(siteParam),
    loadRecentGRNs(skType, siteParam)
  ]);
}

async function loadStock(skType, siteParam, typeColor) {
  try {
    const search = document.getElementById("sk-search")?.value?.toLowerCase() || "";
    const siteIds = siteParam.replace("site_id=in.(", "").replace("site_id=eq.", "").replace(")", "").split(",").map(Number);
    let query = supabase.from("stock").select("*").eq("storekeeper_type", skType).order("material_name", { ascending: true }).limit(200);
    if (siteIds.length === 1) {
      query = query.eq("site_id", siteIds[0]);
    } else if (siteIds.length > 1) {
      query = query.in("site_id", siteIds);
    }
    const { data: items, error } = await query;
    if (error) throw error;
    if (!Array.isArray(items)) items = [];
    if (search) items = items.filter(i => i.material_name?.toLowerCase().includes(search));
    const low = items.filter(i => (i.quantity||0) < 10 && (i.quantity||0) > 0).length;
    const out = items.filter(i => (i.quantity||0) <= 0).length;
    const el = document.getElementById("sk-stock-count"); if (el) el.textContent = items.length;
    const el2 = document.getElementById("sk-low-stock"); if (el2) el2.textContent = low + out;
    const list = document.getElementById("sk-stock-list"); if (!list) return;
    if (!items.length) { list.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No stock items yet.</p>`; return; }
    list.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="border-bottom:1px solid var(--border);">${["Material","Qty","Unit","Status"].map(h=>`<th style="text-align:left;padding:7px 6px;color:var(--text-muted);font-weight:500;">${h}</th>`).join("")}</tr></thead>
      <tbody>${items.map(i=>{
        const qty=i.quantity||0;
        const sc=qty<=0?"var(--accent-red)":qty<10?"var(--accent-orange)":"var(--accent-green)";
        const st=qty<=0?"OUT":qty<10?"LOW":"OK";
        return `<tr style="border-bottom:1px solid rgba(30,35,48,0.3);">
          <td style="padding:7px 6px;color:var(--text-primary);">${i.material_name}</td>
          <td style="padding:7px 6px;color:${sc};font-weight:600;">${qty}</td>
          <td style="padding:7px 6px;color:var(--text-muted);">${i.unit||""}</td>
          <td style="padding:7px 6px;"><span style="background:${sc}22;color:${sc};padding:2px 8px;border-radius:10px;font-size:11px;">${st}</span></td>
        </tr>`;
      }).join("")}</tbody></table>`;
  } catch {}
}

async function loadIssueRequests(siteParam) {
  try {
    const siteIds = siteParam.replace("site_id=in.(", "").replace("site_id=eq.", "").replace(")", "").split(",").map(Number);
    let query = supabase.from("material_requests").select("*").eq("status", "pm_approved").order("created_at", { ascending: true }).limit(30);
    if (siteIds.length === 1) {
      query = query.eq("site_id", siteIds[0]);
    } else if (siteIds.length > 1) {
      query = query.in("site_id", siteIds);
    }
    const { data: arr, error } = await query;
    if (error) throw error;
    const items = arr || [];
    const el = document.getElementById("sk-pending-issues"); if (el) el.textContent = arr.length;
    const list = document.getElementById("sk-issue-list"); if (!list) return;
    if (!arr.length) { list.innerHTML = `<div style="color:var(--accent-green);font-size:13px;text-align:center;padding:20px;">✓ No pending issue requests</div>`; return; }
    list.innerHTML = arr.map(r => `
      <div style="padding:10px;border-radius:8px;border:1px solid var(--border);margin-bottom:8px;background:var(--bg-secondary);">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${r.material_name}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">Qty: ${r.quantity} ${r.unit||""} · ${new Date(r.created_at).toLocaleDateString("en-KE")}</div>
          </div>
          <button onclick="window.issueStock('${r.id}',${JSON.stringify(JSON.stringify(r))})"
            style="background:var(--accent-green);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;white-space:nowrap;">Issue →</button>
        </div>
      </div>`).join("");
  } catch {}
}

async function loadRecentGRNs(skType, siteParam) {
  try {
    const siteIds = siteParam.replace("site_id=in.(", "").replace("site_id=eq.", "").replace(")", "").split(",").map(Number);
    let query = supabase.from("grns").select("*").eq("storekeeper_type", skType).order("created_at", { ascending: false }).limit(10);
    if (siteIds.length === 1) {
      query = query.eq("site_id", siteIds[0]);
    } else if (siteIds.length > 1) {
      query = query.in("site_id", siteIds);
    }
    const { data: arr, error } = await query;
    if (error) throw error;
    const items = arr || [];
    const el = document.getElementById("sk-pending-grns"); if (el) el.textContent = arr.filter(g=>g.status==="pending").length;
    const list = document.getElementById("sk-grn-list"); if (!list) return;
    if (!arr.length) { list.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No GRNs submitted yet.</p>`; return; }
    list.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="border-bottom:1px solid var(--border);">${[(skType === "imported" ? "Container #" : "GRN #"),"Supplier","Items","Value (KES)","Date","Status"].map(h=>`<th style="text-align:left;padding:9px 8px;color:var(--text-muted);font-weight:500;">${h}</th>`).join("")}</tr></thead>
      <tbody>${arr.map(g=>{
        const sc={pending:"var(--accent-orange)",verified:"var(--accent-green)",disputed:"var(--accent-red)"}[g.status]||"var(--text-muted)";
        return `<tr style="border-bottom:1px solid rgba(30,35,48,0.3);">
          <td style="padding:9px 8px;color:var(--accent-gold);font-weight:600;">${g.grn_number||g.id.slice(0,8)}</td>
          <td style="padding:9px 8px;color:var(--text-primary);">${g.supplier||"—"}</td>
          <td style="padding:9px 8px;color:var(--text-secondary);">${Array.isArray(g.items)?g.items.length:"—"}</td>
          <td style="padding:9px 8px;color:var(--accent-green);">${(g.total_value||0).toLocaleString()}</td>
          <td style="padding:9px 8px;color:var(--text-muted);">${new Date(g.created_at).toLocaleDateString("en-KE")}</td>
          <td style="padding:9px 8px;"><span style="background:${sc}22;color:${sc};padding:2px 8px;border-radius:10px;font-size:11px;">${g.status}</span></td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
  } catch {}
}

// ─── GRN Scanner Modal ────────────────────────────────────────
function openGRNScannerModal(user, skType, siteId) {
  let pendingImages = [];
  showModal(`
    <h2 style="font-family:var(--font-display);font-size:20px;font-weight:700;margin-bottom:6px;">📷 GRN Scanner</h2>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Upload delivery note / invoice — AI extracts all line items automatically.</p>
    <div id="grn-step-1">
      <div id="grn-drop" style="border:2px dashed var(--border);border-radius:12px;padding:40px;text-align:center;cursor:pointer;transition:border-color 0.2s;"
        onclick="document.getElementById('grn-file-in').click()"
        ondragover="event.preventDefault();this.style.borderColor='var(--accent-gold)'"
        ondragleave="this.style.borderColor='var(--border)'"
        ondrop="event.preventDefault();window._handleGRNFiles(event.dataTransfer.files)">
        <div style="font-size:48px;margin-bottom:12px;">📄</div>
        <div style="font-size:14px;color:var(--text-primary);font-weight:600;">Drop image here or click to upload</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">JPG, PNG · Multiple pages supported</div>
      </div>
      <input id="grn-file-in" type="file" accept="image/*" multiple style="display:none" onchange="window._handleGRNFiles(this.files)" />
      <div id="grn-thumbs" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;"></div>
      <button id="grn-extract-btn" onclick="window._extractGRN()" style="display:none;width:100%;margin-top:16px;" class="btn btn-gold">✦ Extract with AI →</button>
    </div>
    <div id="grn-step-2" style="display:none;text-align:center;padding:30px 0;">
      <div class="spinner" style="margin:0 auto 16px;"></div>
      <p style="color:var(--text-primary);">AI is reading your document…</p>
    </div>
    <div id="grn-step-3" style="display:none;">
      <h3 style="font-family:var(--font-display);font-size:16px;margin-bottom:14px;color:var(--accent-gold);">✓ Review & Confirm</h3>
      <div id="grn-form"></div>
      <button onclick="window._submitGRN()" class="btn btn-gold" style="width:100%;margin-top:16px;">✓ Submit GRN</button>
    </div>`);

  window._handleGRNFiles = (files) => {
    pendingImages = [];
    const thumbs = document.getElementById("grn-thumbs");
    thumbs.innerHTML = "";
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        pendingImages.push(e.target.result.split(",")[1]);
        const img = document.createElement("img");
        img.src = e.target.result;
        img.style.cssText = "width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);";
        thumbs.appendChild(img);
        document.getElementById("grn-extract-btn").style.display = "block";
      };
      reader.readAsDataURL(file);
    });
  };

  window._extractGRN = async () => {
    if (!pendingImages.length) return;
    document.getElementById("grn-step-1").style.display = "none";
    document.getElementById("grn-step-2").style.display = "block";
    try {
      const result = await callAIWithImages(
        "Extract all data from this delivery/invoice. Return ONLY valid JSON per the spec.",
        pendingImages, getGRNExtractionPrompt()
      );
      let extracted = null;
      try { extracted = JSON.parse((result||"").replace(/```json?\n?|```/g,"").trim()); }
      catch { extracted = { grn_number:null, supplier:null, items:[], notes:"Parse failed — edit manually." }; }
      document.getElementById("grn-step-2").style.display = "none";
      document.getElementById("grn-step-3").style.display = "block";
      renderGRNForm(extracted);
    } catch (err) {
      document.getElementById("grn-step-2").innerHTML = `<p style="color:var(--accent-red);">Extraction failed: ${err.message}</p>`;
    }
  };

  function renderGRNForm(data) {
    window._currentGRNData = data;
    const items = Array.isArray(data.items) ? data.items : [];
    const el = document.getElementById("grn-form");
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div><label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">${skType === "imported" ? "Container Number" : "GRN Number"} *</label>
          <input id="gf-grn" value="${data.grn_number||""}" placeholder="${skType === "imported" ? "Container Number" : "GRN Number"}" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary);font-size:13px;margin-top:4px;"></div>
        <div><label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Invoice # *</label>
          <input id="gf-inv" value="${data.invoice_number||""}" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary);font-size:13px;margin-top:4px;"></div>
        <div><label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Supplier</label>
          <input id="gf-sup" value="${data.supplier||""}" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary);font-size:13px;margin-top:4px;"></div>
        <div><label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Date</label>
          <input id="gf-date" type="date" value="${data.date||new Date().toISOString().split("T")[0]}" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-primary);font-size:13px;margin-top:4px;"></div>
      </div>
      <p style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Line Items (${items.length})</p>
      <div id="gf-items" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;">
        ${items.map((it,i)=>itemRow(it,i)).join("")}
      </div>
      <button onclick="window._addGRNRow()" style="margin-top:8px;background:transparent;border:1px dashed var(--border);border-radius:6px;padding:7px;color:var(--text-muted);cursor:pointer;width:100%;font-size:12px;">+ Add Item</button>`;

    window._addGRNRow = () => {
      const c = document.getElementById("gf-items");
      c.insertAdjacentHTML("beforeend", itemRow({}, c.children.length));
    };
  }

  function itemRow(it, i) {
    return `<div style="display:grid;grid-template-columns:3fr 1fr 1fr 1fr 20px;gap:5px;align-items:center;" data-row="${i}">
      <input placeholder="Material" value="${it.name||""}" data-f="name"
        style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">
      <input placeholder="Qty" type="number" value="${it.quantity||""}" data-f="qty"
        style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">
      <select data-f="unit"
        style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">${UNITS.map(u=>`<option value="${u}" ${u===it.unit?"selected":""}>${u}</option>`).join("")}</select>
      <input placeholder="Price" type="number" value="${it.unit_price||""}" data-f="price"
        style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">
      <button onclick="this.parentElement.remove()" style="background:transparent;border:none;color:var(--accent-red);cursor:pointer;font-size:14px;">✕</button>
    </div>`;
  }

  window._submitGRN = async () => {
    const rows = document.querySelectorAll("[data-row]");
    const items = Array.from(rows).map(r => ({
      name: r.querySelector("[data-f=name]")?.value || "",
      quantity: parseFloat(r.querySelector("[data-f=qty]")?.value) || 0,
      unit: r.querySelector("[data-f=unit]")?.value || "",
      unit_price: parseFloat(r.querySelector("[data-f=price]")?.value) || 0,
    })).filter(i => i.name && i.quantity > 0);
    if (!items.length) { showToast("Add at least one item", "error"); return; }
    const grnNum = document.getElementById("gf-grn")?.value?.trim();
    const supplier = document.getElementById("gf-sup")?.value?.trim();
    const invNum = document.getElementById("gf-inv")?.value?.trim();
    const totalValue = items.reduce((s,i) => s + (i.quantity * i.unit_price), 0);
    const btn = document.querySelector("#grn-step-3 .btn-gold");
    if (!grnNum) { btn && (btn.disabled = false, btn.textContent = "✓ Submit GRN"); showToast(`${skType === "imported" ? "Container Number" : "GRN Number"} is required`, "error"); return; }
    if (!invNum) { btn && (btn.disabled = false, btn.textContent = "✓ Submit GRN"); showToast("Invoice number is required", "error"); return; }
    if (!supplier) { btn && (btn.disabled = false, btn.textContent = "��������✓ Submit GRN"); showToast("Supplier is required", "error"); return; }
    // Check that all items have a unit selected
    for (const item of items) {
      if (!item.unit) { btn && (btn.disabled = false, btn.textContent = "��������✓ Submit GRN"); showToast("Unit is required for all items", "error"); return; }
    }
    if (btn) { btn.disabled = true; btn.textContent = "Submitting…"; }
    try {
      const { data: saved, error } = await supabase.from("grns").insert({
        site_id: siteId,
        grn_number: grnNum,
        invoice_number: invNum,
        supplier,
        items,
        total_value: totalValue,
        storekeeper_type: skType,
        received_by: user.id,
        status: "pending"
      }).select().single();
      if (error) throw error;
      const grnId = saved?.id;
      for (const item of items) await upsertStock(siteId, item, skType, user.id, user);
      await logAudit({ action:"grn_submitted", module:"storekeeper", record_id:grnId, after:{grn_number:grnNum,items:items.length,total:totalValue}, reason:`GRN by ${user.name} for ${supplier}` });
      closeModal();
      showToast(`GRN submitted — ${items.length} items · KES ${totalValue.toLocaleString()}`, "success");
    } catch (err) {
      showToast("Failed: " + err.message, "error");
      if (btn) { btn.disabled = false; btn.textContent = "✓ Submit GRN"; }
    }
  };
}

// ─── Manual GRN ───────────────────────────────────────────────
function openManualGRNModal(user, skType, siteId) {
  showModal(`
    <h2 style="font-family:var(--font-display);font-size:20px;font-weight:700;margin-bottom:6px;">✍️ Manual GRN Entry</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">${skType === "imported" ? "Container Number" : "GRN Number"} *</label>
        <input id="mg-grn" placeholder="${skType === "imported" ? "Container Number" : "GRN-001"}" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;"></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Invoice # *</label>
        <input id="mg-inv" placeholder="INV-001" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;"></div>
      <div style="grid-column:span 2;"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Supplier</label>
        <input id="mg-sup" placeholder="Supplier name" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;"></div>
    </div>
    <p style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Items</p>
    <div id="mg-items" style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;">
      <div style="display:grid;grid-template-columns:3fr 1fr 1fr 1fr 20px;gap:5px;align-items:center;" data-row="0">
        <select data-f="name" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;" onchange="
  const u = window.MATERIALS_DB?.find(m => m.name === this.value)?.unit;
  if (u) {
    const row = this.closest('[data-row]');
    const usel = row?.querySelector('[data-f=unit]');
    if (usel) usel.value = u;
  }
">
  <option value="">— Select Approved Material —</option>
  ${MATERIALS_DB.map(m => `<option value="${m.name}">${m.name} (${m.unit || 'Pcs'})`).join('')}
</select>
        <input placeholder="Qty" type="number" data-f="qty" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">
        <select data-f="unit" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">${UNITS.map(u=>`<option value="${u}">${u}</option>`).join("")}</select>
        <input placeholder="Price" type="number" data-f="price" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">
        <span></span>
      </div>
    </div>
    <button onclick="window._addMGRow()" style="margin-top:8px;background:transparent;border:1px dashed var(--border);border-radius:6px;padding:7px;color:var(--text-muted);cursor:pointer;width:100%;font-size:12px;">+ Add Row</button>
    <button onclick="window._submitManualGRN()" class="btn btn-gold" style="width:100%;margin-top:14px;">✓ Submit GRN</button>`);

  window._addMGRow = () => {
    const c = document.getElementById("mg-items");
    const i = c.children.length;
    c.insertAdjacentHTML("beforeend", `<div style="display:grid;grid-template-columns:3fr 1fr 1fr 1fr 20px;gap:5px;align-items:center;" data-row="${i}">
      <select data-f="name" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;" onchange="
  const u = window.MATERIALS_DB?.find(m => m.name === this.value)?.unit;
  if (u) {
    const row = this.closest('[data-row]');
    const usel = row?.querySelector('[data-f=unit]');
    if (usel) usel.value = u;
  }
">
  <option value="">— Select Approved Material —</option>
  ${MATERIALS_DB.map(m => `<option value="${m.name}">${m.name} (${m.unit || 'Pcs'})`).join('')}
</select>
      <input placeholder="Qty" type="number" data-f="qty" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">
      <select data-f="unit" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">${UNITS.map(u=>`<option value="${u}">${u}</option>`).join("")}</select>
      <input placeholder="Price" type="number" data-f="price" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary);font-size:12px;">
      <button onclick="this.parentElement.remove()" style="background:transparent;border:none;color:var(--accent-red);cursor:pointer;font-size:14px;">✕</button>
    </div>`);
  };

  window._submitManualGRN = async () => {
    const rows = document.querySelectorAll("[data-row]");
    const items = Array.from(rows).map(r=>({
      name:r.querySelector("[data-f=name]")?.value||"",
      quantity:parseFloat(r.querySelector("[data-f=qty]")?.value)||0,
      unit:r.querySelector("[data-f=unit]")?.value||"",
      unit_price:parseFloat(r.querySelector("[data-f=price]")?.value)||0,
    })).filter(i=>i.name&&i.quantity>0);
    if (!items.length) { showToast("Add at least one item with quantity","error"); return; }
    const grnNum=document.getElementById("mg-grn")?.value?.trim();
    const supplier=document.getElementById("mg-sup")?.value?.trim();
    const invNum=document.getElementById("mg-inv")?.value?.trim();
    if (!supplier) { showToast("Supplier is required","error"); return; }
    // Check that all items have a unit selected
    for (const item of items) {
      if (!item.unit) { showToast("Unit is required for all items","error"); return; }
    }
    if (!grnNum) { showToast(`${skType === "imported" ? "Container Number" : "GRN Number"} is required`,"error"); return; }
    if (!invNum) { showToast("Invoice number is required","error"); return; }
    const totalValue=items.reduce((s,i)=>s+(i.quantity*i.unit_price),0);
    try {
      const { data: saved, error } = await supabase.from("grns").insert({
        site_id: siteId,
        grn_number: grnNum,
        invoice_number: invNum,
        supplier,
        items,
        total_value: totalValue,
        storekeeper_type: skType,
        received_by: user.id,
        status: "pending"
      }).select().single();
      if (error) throw error;
      const grnId = saved?.id;
      for (const item of items) await upsertStock(siteId, item, skType, user.id, user);
      await logAudit({ action:"grn_manual", module:"storekeeper", record_id:grnId, after:{grn_number:grnNum,items:items.length}, reason:`Manual GRN by ${user.name}` });
      closeModal();
      showToast(`GRN submitted — ${items.length} items`, "success");
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };
}

// ─── Stock Issue ──────────────────────────────────────────────
async function handleStockIssue(user, reqId, reqJson, skType) {
  let req; try { req = JSON.parse(reqJson); } catch { return; }
  const siteId = req.site_id;
  const { data: stockArr, error: stockErr } = await supabase
    .from("stock")
    .select("*")
    .eq("site_id", siteId)
    .eq("material_name", req.material_name)
    .eq("storekeeper_type", skType)
    .limit(1);
  if (stockErr) throw stockErr;
  const stock = Array.isArray(stockArr) ? stockArr[0] : null;
  const available = stock?.quantity || 0;
  const enough = available >= req.quantity;
  showModal(`
    <h2 style="font-family:var(--font-display);font-size:20px;font-weight:700;margin-bottom:14px;">📦 Issue Material</h2>
    <div style="background:var(--bg-secondary);border-radius:8px;padding:14px;margin-bottom:16px;">
      <div style="font-size:15px;color:var(--text-primary);font-weight:600;">${req.material_name}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">Requested: ${req.quantity} ${req.unit||""}</div>
      <div style="font-size:13px;margin-top:4px;color:${enough?"var(--accent-green)":"var(--accent-red)"};">Available: ${available} ${stock?.unit||""}</div>
    </div>
    ${!enough?`<div style="background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3);border-radius:8px;padding:10px;margin-bottom:16px;color:var(--accent-red);font-size:13px;">⚠️ Insufficient stock. ${available} available, ${req.quantity} requested.</div>`:""}
    <button onclick="window._confirmIssue('${reqId}','${stock?.id||""}',${req.quantity},'${req.material_name.replace(/'/g,"\\'")}')"
      class="btn btn-gold" style="width:100%;" ${enough?"":"disabled"}>✓ Confirm Issue</button>`);

  window._confirmIssue = async (reqId, stockId, qty, name) => {
    try {
      const { error: reqErr } = await supabase
        .from("material_requests")
        .update({
          status: "issued",
          issued_by: user.id,
          issued_at: new Date().toISOString(),
          expires_at: new Date(new Date().setHours(23, 59, 59, 0)).toISOString()
        })
        .eq("id", reqId);
      if (reqErr) throw reqErr;

      if (stockId && stock) {
        const { error: stockErr } = await supabase
          .from("stock")
          .update({
            quantity: Math.max(0, (stock.quantity || 0) - qty),
            last_updated: new Date().toISOString(),
            updated_by: user.id
          })
          .eq("id", stockId);
        if (stockErr) throw stockErr;
      }

      await logAudit({ action: "stock_issued", module: "storekeeper", record_id: reqId, before: { quantity: stock?.quantity }, after: { quantity: (stock?.quantity || 0) - qty }, reason: `Issued ${qty}×${name} by ${user.name}` });
      closeModal();
      showToast(`Issued ${qty} × ${name}`, "success");
      // Refresh the storekeeper dashboard lists
      if (window.loadSKStock) window.loadSKStock();
      if (window.loadSKIssues) window.loadSKIssues();
      if (window.loadSKGRNs) window.loadSKGRNs();
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };
}

// ─── Incident Report ──────────────────────────────────────────
function openIncidentModal(user, skType, siteId) {
  showModal(`
    <h2 style="font-family:var(--font-display);font-size:20px;font-weight:700;margin-bottom:6px;">🚨 Report Incident</h2>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">Report missing, stolen, damaged, or wasted materials.</p>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Incident Type</label>
        <select id="inc-type" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;">
          <option value="missing">Missing</option><option value="stolen">Stolen</option>
          <option value="broken">Broken</option><option value="damaged">Damaged</option>
          <option value="expired">Expired</option><option value="wasted">Wasted</option>
        </select></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Material Name</label>
        <input id="inc-mat" placeholder="e.g. Cement 50kg Bag" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Quantity</label>
          <input id="inc-qty" type="number" placeholder="0" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;"></div>
        <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Est. Value (KES)</label>
          <input id="inc-val" type="number" placeholder="0" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;"></div>
      </div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Reason / Details</label>
        <textarea id="inc-reason" rows="3" placeholder="Describe what happened…" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;resize:vertical;"></textarea></div>
      <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;">Personnel Involved (comma-separated)</label>
        <input id="inc-per" placeholder="e.g. Ali, John" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:9px;color:var(--text-primary);font-size:13px;"></div>
      <button onclick="window._submitIncident()" class="btn btn-danger" style="width:100%;">🚨 Submit Report</button>
    </div>`);

  window._submitIncident = async () => {
    const type = document.getElementById("inc-type")?.value;
    const material = document.getElementById("inc-mat")?.value;
    const qty = parseFloat(document.getElementById("inc-qty")?.value) || 0;
    const value = parseFloat(document.getElementById("inc-val")?.value) || 0;
    const reason = document.getElementById("inc-reason")?.value;
    const personnel = (document.getElementById("inc-per")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!material) { showToast("Enter material name", "error"); return; }
    try {
      const { data: saved, error } = await supabase.from("incidents").insert({
        site_id: siteId,
        reported_by: user.id,
        type,
        material_name: material,
        quantity: qty,
        estimated_value: value,
        reason,
        personnel_involved: personnel,
        status: "pending"
      }).select().single();
      if (error) throw error;
      const incId = saved?.id;
      await logAudit({ action: "incident_reported", module: "storekeeper", record_id: incId, after: { type, material, qty, value }, reason });
      closeModal();
      showToast(`Incident reported: ${type} — ${material}`, "warning");
    } catch(err) { showToast("Failed: " + err.message, "error"); }
  };
}

// ─── Shared: upsert stock after GRN ──────────────────────────
async function upsertStock(siteId, item, skType, userId, userObj) {
  const matched = findMaterial(item.name);

  // Approval gate: check if this is a new material name
  const gate = await checkAndQueueNewMaterial(item.name, siteId, skType, userId, userObj);

  if (gate.isNew && !gate.alreadyQueued) {
    // New material — queued for approval, NOT added to stock yet
    return { queued: true, watchId: gate.watchId };
  }

  // Existing approved stock OR already-queued pending — merge into existing stock
  const { data: existing, error: existingErr } = await supabase
    .from("stock")
    .select("*")
    .eq("site_id", siteId)
    .eq("material_name", item.name)
    .eq("storekeeper_type", skType)
    .limit(1);
  if (existingErr) throw existingErr;

  if (Array.isArray(existing) && existing.length) {
    const cur = existing[0];
    await supabase
      .from("stock")
      .update({
        quantity: (cur.quantity || 0) + item.quantity,
        unit_price: item.unit_price || cur.unit_price,
        last_updated: new Date().toISOString(),
        updated_by: userId
      })
      .eq("id", cur.id);
  } else if (!gate.alreadyQueued) {
    // No existing stock and not queued — create new approved stock row
    await supabase.from("stock").insert({
      site_id: siteId,
      material_name: item.name,
      material_code: matched?.code || null,
      category: matched?.category || "Other",
      quantity: item.quantity,
      unit: item.unit || matched?.unit || "Pcs",
      unit_price: item.unit_price || 0,
      storekeeper_type: skType,
      status: "approved",
      updated_by: userId,
      last_updated: new Date().toISOString()
    });
  }
  // If gate.alreadyQueued, the material is already in the watchlist pending approval — skip stock insert
  return { queued: gate.alreadyQueued, watchId: gate.watchId };
}
