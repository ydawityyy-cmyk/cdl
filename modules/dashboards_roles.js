// CDL — modules/dashboards_roles.js
// Premium dashboards for: store_manager, storekeeper_*, transfer_officer,
// procurement_officer, data_holder, site_overseer, office_manager, engineer, admin
import { supabase, SITES, LOGO_URL } from "../config.js";
import { ROLES } from "./roles.js";
import { initAIChat } from "./ai_chat.js";
import { MATERIALS_DB } from "../data.js";

// ── Shared Shell ─────────────────────────────────────────────────────────────
function shell(container, user, title, subtitle) {
  const role = ROLES[user.role] || {};
  const color = role.color || "var(--accent-gold)";
  container.innerHTML = `
    <div style="margin-bottom:24px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;">
      <div>
        <div style="font-size:11px;font-weight:600;color:${color};letter-spacing:2px;
          text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
          <span style="width:6px;height:6px;border-radius:50%;background:${color};"></span>
          ${subtitle}
        </div>
        <h1 style="font-size:26px;font-weight:800;color:var(--text-primary);letter-spacing:-0.02em;">${title}</h1>
      </div>
      <img src="${LOGO_URL}" style="height:36px;object-fit:contain;opacity:0.5;" onerror="this.style.display='none'" />
    </div>
    <div id="dash-kpis" class="kpi-grid" style="margin-bottom:24px;"></div>
    <div id="dash-main"></div>`;
}

function kpi(icon, value, label, color) {
  return `<div class="stat-card" style="border-top:2px solid ${color};">
    <div style="font-size:20px;margin-bottom:6px;">${icon}</div>
    <div class="stat-value" style="color:${color};font-size:22px;">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}


function siteName(id) { return SITES.find(s => s.id === id)?.name || `#${id}`; }

// ── Main Router ──────────────────────────────────────────────────────────────
export async function renderRoleDashboard(container, user) {
  const role = ROLES[user.role] || {};
  switch (user.role) {
    case "store_manager":          return renderStoreManager(container, user, role);
    case "storekeeper_local":
    case "storekeeper_import":
    case "storekeeper_scaffolding": return renderStorekeeper(container, user, role);
    case "transfer_officer":       return renderTransferOfficer(container, user, role);
    case "procurement_officer":    return renderProcurementOfficer(container, user, role);
    case "data_holder":            return renderDataHolder(container, user, role);
    case "site_overseer":          return renderSiteOverseer(container, user, role);
    case "admin":                  return renderAdminDash(container, user, role);
    default:                       return renderGeneric(container, user, role);
  }
}

// ── STORE MANAGER ────────────────────────────────────────────────────────────
async function renderStoreManager(container, user, role) {
  shell(container, user, "Store Manager", "All Stock · GRN Verification · Low Stock Alerts");
  if (!container) return;
  let stock = [], grns = [];
  try {
    let [stockRes, grnsRes] = await Promise.all([
      supabase.from("stock").select("site_id,quantity,unit_price,material_name,unit").limit(500),
      supabase.from("grns").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(30),
    ]);
  stock = stockRes.data || [];
  grns = grnsRes.data || [];
  } catch (e) { console.error('[SM] data fetch failed', e); }
  const low = stock.filter(i => (i.quantity || 0) < 10 && (i.quantity || 0) > 0);
  const val = stock.reduce((s, i) => s + ((i.quantity || 0) * (i.unit_price || 0)), 0);
  const kpisEl = container.querySelector("#dash-kpis");
  if (!kpisEl) return;
  kpisEl.innerHTML = [
    kpi("⚠️", low.length, "Low Stock", "var(--accent-orange)"),
    kpi("📦", grns.length, "Pending GRNs", "var(--accent-blue)"),
    kpi("🏗", SITES.length, "Sites", "var(--accent-green)"),
    kpi("💰", `KES ${(val / 1e6).toFixed(1)}M`, "Portfolio Value", "var(--accent-gold)"),
  ].join("");

  const main = container.querySelector("#dash-main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card">
        <h3 style="font-size:14px;font-weight:600;color:var(--accent-orange);margin-bottom:14px;">⚠️ Low Stock Items</h3>
        ${low.length ? `<table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);"></th>${
            ["Site","Material","Qty","Unit"].map(h =>
              `<th style="text-align:left;padding:8px;color:var(--text-muted);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">${h}</th>`
            ).join("")}</tr></thead>
          <tbody>${low.slice(0, 10).map(i => `
            <tr style="border-bottom:1px solid rgba(26,31,46,0.4);">
              <td style="padding:8px;color:var(--text-secondary);">${siteName(i.site_id)}</td>
              <td style="padding:8px;color:var(--text-primary);font-weight:500;">${i.material_name}</td>
              <td style="padding:8px;color:${(i.quantity || 0) < 5 ? "var(--accent-red)" : "var(--accent-orange)"};font-weight:600;">${i.quantity}</td>
              <td style="padding:8px;color:var(--text-muted);">${i.unit || ""}</td>
            </tr>`).join("")}
          </tbody></table>`
        : `<div style="text-align:center;padding:30px;color:var(--accent-green);font-size:13px;">✓ All stock levels OK</div>`}
      </div>
      <div class="card">
        <h3 style="font-size:14px;font-weight:600;color:var(--accent-blue);margin-bottom:14px;">📦 Pending GRNs</h3>
        ${grns.length ? grns.slice(0, 8).map(g => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
            <div>
              <div style="font-size:13px;color:var(--text-primary);font-weight:500;">${g.grn_number || "GRN"}</div>
              <div style="font-size:11px;color:var(--text-muted);">${g.supplier || "Unknown"} · ${siteName(g.site_id)}</div>
            </div>
            <span style="font-size:11px;color:var(--accent-orange);background:rgba(251,146,60,0.1);padding:2px 8px;border-radius:10px;">${g.status}</span>
          </div>`).join("")
        : `<div style="text-align:center;padding:30px;color:var(--accent-green);font-size:13px;">✓ No pending GRNs</div>`}
      </div>
    </div>
    <div class="card" style="margin-top:20px;grid-column: 1 / -1;">
      <h3 style="font-size:14px;font-weight:600;color:var(--accent-gold);margin-bottom:14px;">📦 Material Catalog</h3>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <button id="catalog-add-btn" class="btn btn-gold">+ Add New Material</button>
      </div>
      <div id="catalog-content" style="overflow-x:auto;">
        <!-- Catalog will be rendered here -->
      </div>
    </div>`;

  // Material Catalog rendering — defined as proper functions, not inline script
  function renderCatalog() {
    const contentEl = document.getElementById("catalog-content");
    if (!contentEl) return;
    const grouped = {};
    MATERIALS_DB.forEach(m => {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m);
    });
    const sortedCategories = Object.keys(grouped).sort();
    let html = '';
    sortedCategories.forEach(category => {
      const materials = grouped[category];
      html += `<div style="margin-bottom:24px;">
        <h4 style="font-size:16px;font-weight:600;color:var(--accent-gold);margin-bottom:8px;">${category}</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="text-align:left;padding:8px;color:var(--text-muted);font-weight:500;font-size:11px;text-transform:uppercase;">Code</th>
            <th style="text-align:left;padding:8px;color:var(--text-muted);font-weight:500;font-size:11px;text-transform:uppercase;">Name</th>
            <th style="text-align:left;padding:8px;color:var(--text-muted);font-weight:500;font-size:11px;text-transform:uppercase;">Unit</th>
          </tr></thead>
          <tbody>${materials.map(m => `
            <tr style="border-bottom:1px solid rgba(26,31,46,0.4);">
              <td style="padding:8px;color:var(--text-secondary);font-weight:500;">${m.code}</td>
              <td style="padding:8px;color:var(--text-primary);">${m.name}</td>
              <td style="padding:8px;color:var(--text-muted);">${m.unit}</td>
            </tr>`).join("")}
          </tbody></table>
      </div>`;
    });
    contentEl.innerHTML = html || '<div style="text-align:center;padding:20px;color:var(--text-300);">No materials found</div>';
  }

  // Button handler — attach after DOM
  const addBtn = document.getElementById('catalog-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const materialName = prompt('Enter new material name:');
      if (!materialName || materialName.trim() === '') {
        showToast('Material name required', 'error');
        return;
      }
      const trimmedName = materialName.trim();
      const exists = MATERIALS_DB.some(m => m.name.toLowerCase() === trimmedName.toLowerCase());
      if (exists) {
        showToast('Material already exists in catalog', 'warning');
        return;
      }
      const siteIds = user.site_ids || [];
      const siteId = siteIds.length > 0 ? siteIds[0] : 1;
      const storekeeperType = 'local';
      const userInfo = { name: user.name };
      try {
        const result = await checkAndQueueNewMaterial(trimmedName, siteId, storekeeperType, user.id, userInfo);
        if (result.isNew) {
          showToast(`"${trimmedName}" queued for approval.`, 'info');
        } else if (result.alreadyQueued) {
          showToast(`"${trimmedName}" already pending approval.`, 'info');
        } else {
          showToast(`"${trimmedName}" is already in the catalog as approved stock.`, 'info');
        }
        renderCatalog();
      } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
      }
    });
  }

  renderCatalog();

  // AI Chat — only for roles with aiMsgsPerDay > 0
  if (role.aiMsgsPerDay > 0 && !document.getElementById('ai-input')) {
    const main = container.querySelector('#dash-main') || container;
    main.innerHTML += `<div class="card" style="margin-top:20px;">
      
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:700;color:var(--gold);">✦ AI Advisor</span>
          <span style="background:rgba(212,175,110,0.12);color:var(--gold);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">Live Sync</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="window._aiClearChat()" title="Start a fresh chat conversation"
            style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text-200);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-200)'">
            ✨ New Chat / Clear
          </button>
          <span style="color:var(--text-300);font-size:11px;">Unlimited messages</span>
        </div>
      </div>
      <div id="ai-chat-messages" style="height:360px;min-height:240px;max-height:550px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="ai-input" type="text" placeholder="Ask anything…"
          style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;" />
        <button id="ai-send" class="btn btn-gold btn-sm">→</button>
      </div>
    </div>`;
    initAIChat(user);
  }
}

// ── STOREKEEPER ──────────────────────────────────────────────────────────────
async function renderStorekeeper(container, user, role) {
  const typeLabel = { storekeeper_local: "Local", storekeeper_import: "Imported", storekeeper_scaffolding: "Scaffolding" }[user.role];
  const siteIds = user.site_ids || [];
  shell(container, user, `Storekeeper · ${typeLabel}`, "GRN Scanner · Issue Requests · No AI");
  const skType = role.storekeeperType || "local";
  const siteParam = siteIds.length ? `site_id=in.(${siteIds.join(",")})&` : "";
  const stockRes = await supabase.from("stock").select("*").eq("storekeeper_type", skType).limit(100);
  stock = stockRes.data || [];
  container.querySelector("#dash-kpis").innerHTML = [
    kpi("📦", stock.length, "Items Tracked", "var(--accent-blue)"),
    kpi("⚠️", stock.filter(i => (i.quantity || 0) < 10).length, "Low Stock", "var(--accent-orange)"),
  ].join("");
  const main = container.querySelector("#dash-main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:40px;margin-bottom:12px;">📷</div>
        <h3 style="font-weight:600;margin-bottom:8px;color:var(--text-primary);">Scan Delivery Document</h3>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px;">Photo → AI extracts all items</p>
        <button onclick="window._navigate('grn')" class="btn btn-gold">Open GRN Scanner</button>
      </div>
      <div class="card">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:14px;color:var(--text-primary);">📦 My Stock</h3>
        ${stock.length ? `<table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            ${["Material","Qty","Status"].map(h => `<th style="text-align:left;padding:8px;color:var(--text-muted);font-size:11px;text-transform:uppercase;">${h}</th>`).join("")}
          </tr></thead>
          <tbody>${stock.slice(0, 12).map(i => {
            const q = i.quantity || 0;
            const c = q <= 0 ? "var(--accent-red)" : q < 10 ? "var(--accent-orange)" : "var(--accent-green)";
            const s = q <= 0 ? "OUT" : q < 10 ? "LOW" : "OK";
            return `<tr style="border-bottom:1px solid rgba(26,31,46,0.3);">
              <td style="padding:8px;color:var(--text-primary);">${i.material_name}</td>
              <td style="padding:8px;color:${c};font-weight:600;">${q}</td>
              <td style="padding:8px;"><span class="badge" style="background:${c}20;color:${c};">${s}</span></td>
            </tr>`;
          }).join("")}
          </tbody></table>`
        : `<div style="text-align:center;padding:30px;color:var(--text-muted);">No stock yet. Scan a GRN to add items.</div>`}
      </div>
    </div>`;
}

// ── TRANSFER OFFICER ─────────────────────────────────────────────────────────
async function renderTransferOfficer(container, user, role) {
  shell(container, user, "Transfer Officer", "Active Transfers · Pickup & Delivery");
  const transfersRes = await supabase.from("transfers").select("*").in("status", ["am_approved", "preparing", "picked_up", "in_transit", "delivered"]).limit(50);
  const transfers = transfersRes.data || [];
  const active = transfers.filter(t => !["completed", "rejected"].includes(t.status));
  container.querySelector("#dash-kpis").innerHTML = [
    kpi("🚚", active.length, "Active Transfers", "var(--accent-blue)"),
    kpi("📦", active.filter(t => t.status === "am_approved" || t.status === "preparing").length, "Awaiting Pickup", "var(--accent-orange)"),
    kpi("🚀", active.filter(t => t.status === "in_transit").length, "In Transit", "var(--accent-green)"),
  ].join("");
  const main = container.querySelector("#dash-main");
  if (!main) return;
  main.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;color:var(--text-primary);">🚚 My Active Transfers</h3>
        <button onclick="window._navigate('transfers')" class="btn btn-gold btn-sm">Open Transfers →</button>
      </div>
      ${active.length ? active.slice(0, 8).map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-size:13px;color:var(--text-primary);font-weight:500;">
              ${siteName(t.from_site_id)} → ${siteName(t.to_site_id)}
            </div>
            <div style="font-size:11px;color:var(--text-muted);">${Array.isArray(t.items) ? t.items.length : 0} item(s)</div>
          </div>
          <span class="badge badge-blue">${t.status?.replace(/_/g, " ")}</span>
        </div>`).join("")
      : `<div style="text-align:center;padding:40px;color:var(--accent-green);font-size:13px;">✓ No active transfers</div>`}
    </div>`;
  // AI Chat — only for roles with aiMsgsPerDay > 0
  if (role.aiMsgsPerDay > 0 && !document.getElementById('ai-input')) {
    const main = container.querySelector('#dash-main') || container;
    main.innerHTML += `<div class="card" style="margin-top:20px;">
      
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:700;color:var(--gold);">✦ AI Advisor</span>
          <span style="background:rgba(212,175,110,0.12);color:var(--gold);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">Live Sync</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="window._aiClearChat()" title="Start a fresh chat conversation"
            style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text-200);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-200)'">
            ✨ New Chat / Clear
          </button>
          <span style="color:var(--text-300);font-size:11px;">Unlimited messages</span>
        </div>
      </div>
      <div id="ai-chat-messages" style="height:360px;min-height:240px;max-height:550px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="ai-input" type="text" placeholder="Ask anything…"
          style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;" />
        <button id="ai-send" class="btn btn-gold btn-sm">→</button>
      </div>
    </div>`;
    initAIChat(user);
  }
}

// ── PROCUREMENT OFFICER ──────────────────────────────────────────────────────
async function renderProcurementOfficer(container, user, role) {
  shell(container, user, "Procurement Officer", "AM-Approved Purchase Requests");
  const procRes = await supabase.from("procurement").select("*").eq("status", "am_approved").order("created_at", { ascending: false }).limit(50);
  const proc = procRes.data || [];
  container.querySelector("#dash-kpis").innerHTML = [
    kpi("🛒", proc.length, "Ready to Action", "var(--accent-orange)"),
    kpi("💰", `KES ${proc.reduce((s, p) => s + (p.total_amount || 0), 0).toLocaleString()}`, "Total Value", "var(--accent-gold)"),
  ].join("");
  const main = container.querySelector("#dash-main");
  if (!main) return;
  main.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;color:var(--text-primary);">🛒 AM-Approved Requests</h3>
        <button onclick="window._navigate('procurement')" class="btn btn-gold btn-sm">Open Procurement →</button>
      </div>
      ${proc.length ? proc.slice(0, 8).map(p => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-size:13px;color:var(--text-primary);font-weight:500;">${p.supplier || "Supplier TBD"}</div>
            <div style="font-size:11px;color:var(--text-muted);">${siteName(p.site_id)} · ${Array.isArray(p.items) ? p.items.length : 0} items</div>
          </div>
          <div style="text-align:right;">
            <div style="color:var(--accent-gold);font-weight:600;font-size:13px;">KES ${(p.total_amount || 0).toLocaleString()}</div>
            <span class="badge badge-orange">${p.status?.replace(/_/g, " ")}</span>
          </div>
        </div>`).join("")
      : `<div style="text-align:center;padding:40px;color:var(--text-muted);">No AM-approved requests yet</div>`}
    </div>`;
  // AI Chat — only for roles with aiMsgsPerDay > 0
  if (role.aiMsgsPerDay > 0 && !document.getElementById('ai-input')) {
    const main = container.querySelector('#dash-main') || container;
    main.innerHTML += `<div class="card" style="margin-top:20px;">
      
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:700;color:var(--gold);">✦ AI Advisor</span>
          <span style="background:rgba(212,175,110,0.12);color:var(--gold);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">Live Sync</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="window._aiClearChat()" title="Start a fresh chat conversation"
            style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text-200);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-200)'">
            ✨ New Chat / Clear
          </button>
          <span style="color:var(--text-300);font-size:11px;">Unlimited messages</span>
        </div>
      </div>
      <div id="ai-chat-messages" style="height:360px;min-height:240px;max-height:550px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="ai-input" type="text" placeholder="Ask anything…"
          style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;" />
        <button id="ai-send" class="btn btn-gold btn-sm">→</button>
      </div>
    </div>`;
    initAIChat(user);
  }
}

// ── DATA HOLDER ──────────────────────────────────────────────────────────────
async function renderDataHolder(container, user, role) {
  shell(container, user, "Data Holder", "GRN Verification · Discrepancy Flagging");
  const grnsRes = await supabase.from("grns").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(30);
  grns = grnsRes.data || [];
  container.querySelector("#dash-kpis").innerHTML = [
    kpi("📦", grns.length, "GRNs to Verify", "var(--accent-blue)"),
  ].join("");
  const main = container.querySelector("#dash-main");
  if (!main) return;
  main.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;color:var(--text-primary);">📦 GRN Verification Queue</h3>
        <button onclick="window._navigate('grn')" class="btn btn-gold btn-sm">Open GRN Panel →</button>
      </div>
      ${grns.length ? grns.slice(0, 8).map(g => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-size:13px;color:var(--text-primary);font-weight:500;">${g.grn_number || "GRN"} · ${g.supplier || "Unknown"}</div>
            <div style="font-size:11px;color:var(--text-muted);">${siteName(g.site_id)} · ${new Date(g.created_at).toLocaleDateString("en-KE")}</div>
          </div>
          <button onclick="window.verifyGRN('${g.id}')" class="btn btn-gold btn-sm">Verify</button>
        </div>`).join("")
      : `<div style="text-align:center;padding:40px;color:var(--accent-green);font-size:13px;">✓ Verification queue clear</div>`}
    </div>`;
  // AI Chat — only for roles with aiMsgsPerDay > 0
  if (role.aiMsgsPerDay > 0 && !document.getElementById('ai-input')) {
    const main = container.querySelector('#dash-main') || container;
    main.innerHTML += `<div class="card" style="margin-top:20px;">
      
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:700;color:var(--gold);">✦ AI Advisor</span>
          <span style="background:rgba(212,175,110,0.12);color:var(--gold);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">Live Sync</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="window._aiClearChat()" title="Start a fresh chat conversation"
            style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text-200);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-200)'">
            ✨ New Chat / Clear
          </button>
          <span style="color:var(--text-300);font-size:11px;">Unlimited messages</span>
        </div>
      </div>
      <div id="ai-chat-messages" style="height:360px;min-height:240px;max-height:550px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="ai-input" type="text" placeholder="Ask anything…"
          style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;" />
        <button id="ai-send" class="btn btn-gold btn-sm">→</button>
      </div>
    </div>`;
    initAIChat(user);
  }
}

// ── SITE OVERSEER ────────────────────────────────────────────────────────────
async function renderSiteOverseer(container, user, role) {
  shell(container, user, "Site Overseer", "PM KPI Grid · Cross-Site Metrics");
  const [requestsRes, incidentsRes] = await Promise.all([
    supabase.from("material_requests").select("site_id,status").limit(200),
    supabase.from("incidents").select("site_id,status").limit(100),
  ]);
  const requests = requestsRes.data || [];
  const incidents = incidentsRes.data || [];
  container.querySelector("#dash-kpis").innerHTML = [
    kpi("📋", requests.length, "Total Requests", "var(--accent-blue)"),
    kpi("🚨", incidents.filter(i => i.status === "pending").length, "Open Incidents", "var(--accent-red)"),
    kpi("🏗", SITES.length, "Sites Monitored", "var(--accent-green)"),
  ].join("");
  const main = container.querySelector("#dash-main");
  if (!main) return;
  main.innerHTML = `
    <div class="card">
      <h3 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:20px;">🏗 Site PM Performance</h3>
      ${SITES.map(s => {
        const sReqs = requests.filter(r => r.site_id === s.id);
        const done = sReqs.filter(r => ["issued", "completed", "collected"].includes(r.status)).length;
        const pct = sReqs.length ? Math.round((done / sReqs.length) * 100) : 0;
        const pc = pct >= 80 ? "var(--accent-green)" : pct >= 50 ? "var(--accent-gold)" : pct >= 30 ? "var(--accent-orange)" : "var(--accent-red)";
        return `<div style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:13px;color:var(--text-secondary);font-weight:500;">${s.name}</span>
            <span style="font-size:12px;color:${pc};font-weight:600;font-family:'JetBrains Mono',monospace;">${pct}%</span>
          </div>
          <div class="progress-track" style="height:6px;">
            <div class="progress-fill" style="width:${pct}%;background:${pc};"></div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${done}/${sReqs.length} requests fulfilled</div>
        </div>`;
      }).join("")}
    </div>`;
  // AI Chat — only for roles with aiMsgsPerDay > 0
  if (role.aiMsgsPerDay > 0 && !document.getElementById('ai-input')) {
    const main = container.querySelector('#dash-main') || container;
    main.innerHTML += `<div class="card" style="margin-top:20px;">
      
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:700;color:var(--gold);">✦ AI Advisor</span>
          <span style="background:rgba(212,175,110,0.12);color:var(--gold);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">Live Sync</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="window._aiClearChat()" title="Start a fresh chat conversation"
            style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text-200);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-200)'">
            ✨ New Chat / Clear
          </button>
          <span style="color:var(--text-300);font-size:11px;">Unlimited messages</span>
        </div>
      </div>
      <div id="ai-chat-messages" style="height:360px;min-height:240px;max-height:550px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="ai-input" type="text" placeholder="Ask anything…"
          style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;" />
        <button id="ai-send" class="btn btn-gold btn-sm">→</button>
      </div>
    </div>`;
    initAIChat(user);
  }
}

// ── ADMIN DASH ───────────────────────────────────────────────────────────────
async function renderAdminDash(container, user, role) {
  shell(container, user, "Admin", "Full System Access · User & Site Management");
  if (!container) return;
  let users = [], sites = [];
  try {
    const [usersRes, sitesRes] = await Promise.all([
      supabase.from("users").select("id,name,role,is_active,email").limit(200),
      supabase.from("sites").select("id,name,is_active").limit(20),
    ]);
    users = usersRes.data || [];
    sites = sitesRes.data || [];
  } catch (e) { console.error('[ADMIN] data fetch failed', e); }
  const activeUsers = users.filter(u => u.is_active).length;
  const kpisEl = container.querySelector("#dash-kpis");
  if (!kpisEl) return;
  kpisEl.innerHTML = [
    kpi("👥", users.length, "Total Users", "var(--accent-blue)"),
    kpi("✅", activeUsers, "Active Users", "var(--accent-green)"),
    kpi("🏗", sites.length, "Sites", "var(--accent-gold)"),
    kpi("🔍", "View", "Audit Log", "var(--accent-purple)"),
  ].join("");

  const roleDist = {};
  users.forEach(u => { roleDist[u.role] = (roleDist[u.role] || 0) + 1; });

  const main = container.querySelector("#dash-main");
  if (!main) return;
  main.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <div class="card hover-lift" style="cursor:pointer;" onclick="window._navigate('users')">
        <div style="font-size:32px;margin-bottom:12px;">👥</div>
        <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);">Manage Users</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-top:6px;">Create, edit and disable user accounts</p>
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">
          ${Object.entries(roleDist).slice(0, 5).map(([r, c]) =>
            `<span class="badge badge-gold">${c}×${r.replace(/_/g, " ")}</span>`
          ).join("")}
        </div>
      </div>
      <div class="card hover-lift" style="cursor:pointer;" onclick="window._navigate('audit')">
        <div style="font-size:32px;margin-bottom:12px;">🔍</div>
        <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);">Audit Log</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-top:6px;">Immutable record of every system action</p>
        <div style="margin-top:12px;">
          <span class="badge badge-purple">🔐 Encrypted</span>
          <span class="badge badge-green" style="margin-left:4px;">Tamper-proof</span>
        </div>
      </div>
    </div>`;
  // AI Chat — only for roles with aiMsgsPerDay > 0
  if (role.aiMsgsPerDay > 0 && !document.getElementById('ai-input')) {
    main.innerHTML += `<div class="card" style="margin-top:20px;">
      
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:700;color:var(--gold);">✦ AI Advisor</span>
          <span style="background:rgba(212,175,110,0.12);color:var(--gold);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">Live Sync</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="window._aiClearChat()" title="Start a fresh chat conversation"
            style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text-200);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-200)'">
            ✨ New Chat / Clear
          </button>
          <span style="color:var(--text-300);font-size:11px;">Unlimited messages</span>
        </div>
      </div>
      <div id="ai-chat-messages" style="height:360px;min-height:240px;max-height:550px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="ai-input" type="text" placeholder="Ask about system status, users, stock…"
          style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;" />
        <button id="ai-send" class="btn btn-gold btn-sm">→</button>
      </div>
    </div>`;
    initAIChat(user);

    // ── SYSTEM SETTINGS CARD (Gemini API Key) ──
    const settingsCard = document.createElement('div');
    settingsCard.className = 'card';
    settingsCard.style.cssText = 'margin-top:20px;';
    settingsCard.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;">⚙️</span>
          <div>
            <h3 style="font-size:14px;font-weight:700;color:var(--text-100);margin:0;">System Settings — Gemini AI</h3>
            <div style="font-size:11px;color:var(--text-400);margin-top:2px;">Configures live conversational AI for all CDL dashboards</div>
          </div>
        </div>
        <span style="background:rgba(61,142,248,0.12);color:#3d8ef8;font-size:10px;padding:3px 8px;border-radius:4px;font-weight:600;">ADMIN EXCLUSIVE</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-200);display:block;margin-bottom:6px;">
            🤖 Google Gemini API Key
          </label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input id="gemini-key-input" type="password" placeholder="AIzaSy... (paste your Gemini API key here)"
              style="flex:1;min-width:240px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text-100);font-size:13px;font-family:monospace;" />
            <button id="gemini-key-save"
              style="background:var(--gold);color:#0a0c10;border:none;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
              💾 Save Key
            </button>
            <button id="gemini-key-test"
              style="background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--text-200);cursor:pointer;">
              🧪 Test AI Connection
            </button>
          </div>
          <div id="gemini-key-status" style="margin-top:8px;font-size:12px;color:var(--text-400);">Checking active API key status…</div>
        </div>

        <div style="background:rgba(212,175,110,0.06);border:1px solid rgba(212,175,110,0.2);border-radius:8px;padding:12px;">
          <div style="font-size:12px;color:var(--text-300);line-height:1.7;">
            💡 <strong>Get a free key in 30 seconds:</strong>
            1. Visit <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--gold);text-decoration:underline;">aistudio.google.com/apikey</a>
            2. Click <strong>"Create API Key"</strong>
            3. Paste key above and click <strong>Save Key</strong>.
            <em>Free tier: 1,500 queries/day with zero billing required.</em>
          </div>
        </div>
      </div>
    `;

    main.appendChild(settingsCard);

    // Load active key status from Supabase
    (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', 'gemini_api_key').limit(1);
        const statusEl = document.getElementById('gemini-key-status');
        const inputEl = document.getElementById('gemini-key-input');
        const val = data?.[0]?.value?.trim();
        if (statusEl) {
          if (val) {
            statusEl.innerHTML = '<span style="color:#2ecc71;">✅ <strong>Gemini key active</strong> — AI Advisor is powered by Google Gemini (key: …' + val.slice(-6) + ')</span>';
            if (inputEl) inputEl.placeholder = 'Current key active: …' + val.slice(-6) + ' (paste new to replace)';
          } else {
            statusEl.innerHTML = '<span style="color:var(--gold);">⚠️ No key set — AI is using built-in reasoning engine. Add key to unlock full smart assistant.</span>';
          }
        }
      } catch (e) {
        const s = document.getElementById('gemini-key-status');
        if (s) s.textContent = 'Settings status: ' + e.message;
      }
    })();

    document.getElementById('gemini-key-save')?.addEventListener('click', async () => {
      const input = document.getElementById('gemini-key-input');
      const status = document.getElementById('gemini-key-status');
      const btn = document.getElementById('gemini-key-save');
      const val = input?.value?.trim();
      if (!val) { if (status) { status.innerHTML = '<span style="color:#e74c3c;">❌ Please paste your API key first</span>'; } return; }
      if (!val.startsWith('AIzaSy')) { if (status) { status.innerHTML = '<span style="color:#e74c3c;">❌ Gemini API keys start with AIzaSy — check your copied key</span>'; } return; }
      if (btn) btn.textContent = '⏳ Saving…';
      try {
        const { error } = await supabase.from('app_settings').upsert({ key: 'gemini_api_key', value: val, description: 'Google Gemini API key', updated_at: new Date().toISOString() });
        if (error) throw error;
        if (status) status.innerHTML = '<span style="color:#2ecc71;">✅ <strong>Key saved!</strong> AI Advisor now uses Gemini for all responses (…' + val.slice(-6) + ')</span>';
        if (input) { input.value = ''; input.placeholder = 'Active key: …' + val.slice(-6) + ' (paste new to replace)'; }
      } catch (e2) {
        if (status) status.innerHTML = '<span style="color:#e74c3c;">❌ Save failed: ' + e2.message + '</span>';
      }
      if (btn) btn.textContent = '💾 Save Key';
    });

    document.getElementById('gemini-key-test')?.addEventListener('click', async () => {
      const status = document.getElementById('gemini-key-status');
      if (status) status.innerHTML = '<span style="color:var(--text-400);">🧪 Testing AI connection…</span>';
      try {
        const token = (await supabase.auth.getSession())?.data?.session?.access_token || '';
        const res = await fetch('/.netlify/functions/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ prompt: 'hello briefly confirm you are working and which model you are using' })
        });
        const d = await res.json();
        const powered = (d.powered || '').includes('gemini') ? '🤖 Gemini AI' : '⚙️ Built-in Engine';
        if (status) status.innerHTML = '<span style="color:' + ((d.powered||'').includes('gemini') ? '#2ecc71' : 'var(--gold)') + '">' + powered + ' is active: <em>"' + (d.reply||'').slice(0, 100) + '…"</em></span>';
      } catch (e3) {
        if (status) status.innerHTML = '<span style="color:#e74c3c;">❌ Test failed: ' + e3.message + '</span>';
      }
    });

    // ─── 👥 User Directory & Access Control (SEC-01 Hardened) ──────────────────
    const userDirWrapper = document.createElement('div');
    userDirWrapper.style.cssText = 'margin-top:24px;';
    userDirWrapper.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <span style="font-size:22px;">👥</span>
          <h3 style="margin:0;font-size:1rem;font-weight:700;color:var(--text-primary)">User Directory & Security</h3>
          <span style="margin-left:auto;font-size:0.73rem;color:var(--text-muted);">Admin · CEO · Owner only</span>
          <button id="userdir-refresh-btn" style="padding:5px 12px;border-radius:8px;border:1px solid #6366f1;background:transparent;color:#818cf8;cursor:pointer;font-size:0.78rem;font-weight:600;margin-left:8px;">↻ Refresh</button>
        </div>
        <p style="color:var(--text-muted);font-size:0.8rem;margin:0 0 14px;">
          Authorized users and authentication status in Supabase. Passwords are securely hashed by Supabase Auth.
        </p>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.81rem;">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:600;">Name</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:600;">Email</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:600;">Role</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:600;">Status</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:600;">Assigned Sites</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:600;">Actions</th>
              </tr>
            </thead>
            <tbody id="userdir-tbody">
              <tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text-muted);">Loading users…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (main) main.appendChild(userDirWrapper);

    async function loadUserDirectory() {
      const tbody = document.getElementById('userdir-tbody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text-muted);">Loading users…</td></tr>';
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id,name,email,role,is_active,site_ids,created_at')
          .order('role', { ascending: true })
          .order('name', { ascending: true });
        if (error) throw error;
        if (!data || !data.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text-muted);">No users found.</td></tr>';
          return;
        }
        tbody.innerHTML = data.map(u => {
          const siteNames = (u.site_ids || []).map(sid => SITES.find(s => s.id === sid)?.name || '#' + sid).join(', ') || 'Portfolio / All';
          const isActive = u.is_active !== false;
          return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.15s;"
                onmouseover="this.style.background='rgba(255,255,255,0.04)'"
                onmouseout="this.style.background=''">
              <td style="padding:8px 10px;font-weight:600;color:var(--text-primary);">${u.name || 'Unnamed User'}</td>
              <td style="padding:8px 10px;color:var(--text-muted);font-family:monospace;font-size:0.78rem;">${u.email}</td>
              <td style="padding:8px 10px;">
                <span style="background:rgba(99,102,241,0.15);color:#818cf8;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;">
                  ${(u.role || '').replace(/_/g,' ')}
                </span>
              </td>
              <td style="padding:8px 10px;">
                <span style="background:${isActive ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)'};color:${isActive ? '#2ecc71' : '#e74c3c'};padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;">
                  ${isActive ? '● Active' : '○ Inactive'}
                </span>
              </td>
              <td style="padding:8px 10px;color:var(--text-muted);font-size:0.76rem;">${siteNames}</td>
              <td style="padding:8px 10px;">
                <button onclick="window._navigate('users')" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:3px 8px;color:var(--text-primary);cursor:pointer;font-size:0.75rem;">
                  Manage
                </button>
              </td>
            </tr>
          `;
        }).join('');
      } catch(err) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#f87171;">Error loading users: ${err.message}</td></tr>`;
      }
    }

    loadUserDirectory();
    document.getElementById('userdir-refresh-btn')?.addEventListener('click', loadUserDirectory);
    // ─── end User Directory ───────────────────────────────────────────────────

  }
}

// ── GENERIC FALLBACK ─────────────────────────────────────────────────────────
async function renderGeneric(container, user, role) {
  shell(container, user, role.label || user.role, "Dashboard");
  const main = container.querySelector("#dash-main");
  if (!main) return;
  const hasAI = (role.aiMsgsPerDay || 0) > 0;
  main.innerHTML = `<div class="card" style="text-align:center;padding:60px;">
    <div style="font-size:40px;margin-bottom:12px;">👤</div>
    <h3 style="font-size:16px;font-weight:600;color:var(--text-primary);">${role.label || user.role}</h3>
    <p style="color:var(--text-muted);margin-top:8px;">Use the navigation to access your modules.</p>
  </div>`;
  if (hasAI) {
    main.innerHTML += `<div class="card" style="margin-top:20px;">
      
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:700;color:var(--gold);">✦ AI Advisor</span>
          <span style="background:rgba(212,175,110,0.12);color:var(--gold);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">Live Sync</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="window._aiClearChat()" title="Start a fresh chat conversation"
            style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text-200);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-200)'">
            ✨ New Chat / Clear
          </button>
          <span style="color:var(--text-300);font-size:11px;">Unlimited messages</span>
        </div>
      </div>
      <div id="ai-chat-messages" style="height:360px;min-height:240px;max-height:550px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="ai-input" type="text" placeholder="Ask anything…"
          style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;" />
        <button id="ai-send" class="btn btn-gold btn-sm">→</button>
      </div>
    </div>`;
    initAIChat(user);
  }
}
