// CDL Site Management v11 — app.js
// Main entry: auth, routing, navigation, modal/toast, 3D shell
import { supabase, APP_NAME, APP_VERSION, SITES } from "./config.js";
import { ROLES } from "./modules/roles.js";
import { checkAccess } from "./modules/nav_guard.js";
import { logAudit } from "./modules/audit_core.js";
import { renderLogin } from "./modules/login_ui.js";
import { initNotifs } from "./modules/notifs.js";
import { initScheduler } from "./modules/scheduler.js";
import { initPWA } from "./modules/pwa.js";
import { triggerLoginPopup } from "./modules/popups.js";

// ─── Session ─────────────────────────────────────────────────────────────────
let currentUser = null;
export function getCurrentUser() { return currentUser; }

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Check for existing Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .eq('is_active', true)
        .single();
      if (profile) { currentUser = profile; showApp(); return; }
    }
  }
  showLoginScreen();
});

// ─── Login ───────────────────────────────────────────────────────────────────
function showLoginScreen() {
  const root = document.getElementById("app-root");
  if (!root) return;
  root.innerHTML = `<div id="login-screen" style="width:100%;min-height:100vh;background:var(--bg-900);"></div>`;
  renderLogin(handleLogin);
}

async function handleLogin(email, password) {
  try {
    // Use Supabase Auth - returns JWT session
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return error.message;
    }

    const { user } = data;
    if (!user) return "Authentication failed.";

    // Fetch user profile from users table to get role, name, site_ids
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile) {
      return "User profile not found or inactive.";
    }

    currentUser = profile;
    // Session is automatically persisted by Supabase client
    // No localStorage of user object needed

    // Update last_login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    await logAudit({ action: "user_login", module: "auth", reason: `Login from ${navigator.userAgent.slice(0, 60)}` });
    showApp();
    return null;
  } catch (err) {
    return `Connection error: ${err.message}`;
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
const fmt = new Intl.DateTimeFormat("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const fmtShort = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", year: "numeric" });
export function todayStr() { return fmt.format(new Date()); }
export function todayShort() { return fmtShort.format(new Date()); }

// ─── App Shell ───────────────────────────────────────────────────────────────
function showApp() {
  if (!currentUser) { showLoginScreen(); return; }
  const role = ROLES[currentUser.role] || {};
  const nav = buildNav(currentUser, role);
  const roleColor = role.color || "var(--gold)";
  const roleLabel = role.label || currentUser.role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const root = document.getElementById("app-root");
  if (!root) return;

  root.innerHTML = `
    <div style="display:flex;min-height:100vh;background:var(--bg-900);">
      <!-- Sidebar -->
      <aside id="sidebar" style="width:260px;background:var(--bg-800);border-right:1px solid var(--border);
        display:flex;flex-direction:column;position:fixed;top:0;bottom:0;left:0;z-index:100;transition:transform 0.3s;overflow:hidden;">
        <div style="padding:22px 22px 18px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;background:linear-gradient(135deg,#d4af6e,#b8944f);border-radius:12px;
              display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 16px rgba(212,175,110,0.25);">🏗</div>
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--text-100);letter-spacing:-0.02em;">CDL</div>
              <div style="font-size:10px;color:var(--text-300);font-family:var(--font-mono);">${APP_VERSION}</div>
            </div>
          </div>
        </div>
        <div style="padding:10px 16px;">
          <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;
            background:${roleColor}15;border:1px solid ${roleColor}30;">
            <div style="width:6px;height:6px;border-radius:50%;background:${roleColor};"></div>
            <span style="font-size:11px;font-weight:600;color:${roleColor};">${roleLabel}</span>
          </div>
        </div>
        <nav style="flex:1;overflow-y:auto;padding:8px 10px 16px;">${nav}</nav>
        <div style="padding:14px 16px;border-top:1px solid var(--border);background:var(--bg-800);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#d4af6e,#b8944f);
              display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--bg-900);">
              ${currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;color:var(--text-100);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${currentUser.name}</div>
              <div style="font-size:10px;color:var(--text-300);">${currentUser.email.split('@')[0]}</div>
            </div>
            <div style="position:relative;">
              <button onclick="window._toggleNotifs()" style="background:var(--bg-500);border:1px solid var(--border);
                width:34px;height:34px;border-radius:8px;cursor:pointer;color:var(--text-200);font-size:16px;
                display:flex;align-items:center;justify-content:center;">🔔</button>
              <span id="notif-badge" class="hidden" style="position:absolute;top:-5px;right:-5px;
                background:var(--red);color:#fff;font-size:9px;font-weight:700;border-radius:50%;width:16px;height:16px;
                display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-900);"></span>
            </div>
          </div>
          <button onclick="window._logout()" style="width:100%;margin-top:10px;background:transparent;border:1px solid var(--border);
            border-radius:8px;padding:7px;color:var(--text-300);cursor:pointer;font-size:12px;font-weight:500;
            display:flex;align-items:center;justify-content:center;gap:6px;">← Sign Out</button>
        </div>
      </aside>
      <div id="sidebar-overlay" onclick="window._closeSidebar()"></div>
      <div style="margin-left:260px;flex:1;display:flex;flex-direction:column;min-width:0;">
        <header style="height:60px;background:var(--bg-800);border-bottom:1px solid var(--border);
          display:flex;align-items:center;padding:0 28px;gap:16px;position:sticky;top:0;z-index:50;">
          <button id="mobile-menu-btn" onclick="window._toggleSidebar()"
            style="display:none;background:transparent;border:1px solid var(--border);border-radius:8px;
            color:var(--text-200);cursor:pointer;font-size:20px;width:36px;height:36px;align-items:center;justify-content:center;">☰</button>
          <div id="page-title" style="font-size:17px;font-weight:700;color:var(--text-100);flex:1;letter-spacing:-0.02em;"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);"></div>
            <span style="font-size:12px;color:var(--text-300);">${todayStr()}</span>
          </div>
        </header>
        <div id="notif-panel" style="display:none;position:fixed;top:60px;right:20px;width:340px;
          background:var(--bg-600);border:1px solid var(--border-light);border-radius:16px;z-index:200;
          padding:16px;max-height:500px;overflow-y:auto;box-shadow:var(--shadow-lg);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <h2 style="font-size:14px;font-weight:700;color:var(--text-100);margin:0;">Notifications</h2>
            <button onclick="window._markAllRead()" style="background:transparent;border:none;color:var(--gold);cursor:pointer;font-size:11px;">Mark all read</button>
          </div>
          <div id="notif-list"></div>
        </div>
        <main id="page-content" style="flex:1;padding:28px;overflow-y:auto;"></main>
      </div>
    </div>
    <div id="modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:300;align-items:center;justify-content:center;backdrop-filter:blur(8px);">
      <div id="modal-content" style="background:var(--bg-600);border:1px solid var(--border-light);border-radius:20px;padding:28px;max-width:600px;width:92%;max-height:85vh;overflow-y:auto;position:relative;box-shadow:0 24px 80px rgba(0,0,0,0.7),0 0 40px rgba(212,175,110,0.06);">
      </div>
    </div>
    <div id="toast-container" style="position:fixed;bottom:24px;right:24px;z-index:500;display:flex;flex-direction:column;gap:8px;"></div>`;

  navigate("dashboard");
  initNotifs(currentUser);
  initScheduler(currentUser);
  initPWA();
  setTimeout(() => triggerLoginPopup(currentUser), 1200);

  window._logout = logout;
  window._navigate = navigate;
  window._toggleNotifs = toggleNotifs;
  window._closeModal = closeModal;
  window._toggleSidebar = toggleSidebar;
  window._closeSidebar = closeSidebar;
}

// ─── Navigation ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key:"dashboard",   icon:"⊞",  label:"Dashboard" },
  { key:"inventory",   icon:"◩",  label:"Inventory",  noRoles:["storekeeper_local","storekeeper_import","storekeeper_scaffolding","engineer","supervisor","office_manager","site_overseer","procurement_officer","transfer_officer","data_holder"] },
  { key:"grn",         icon:"◎",  label:"GRN Scanner" },
  { key:"requests",    icon:"◫",  label:"Requests",   noRoles:["storekeeper_local","storekeeper_import","storekeeper_scaffolding"] },
  { key:"transfers",   icon:"⇄",  label:"Transfers",  noRoles:["storekeeper_local","storekeeper_import","storekeeper_scaffolding","engineer","finance","supervisor","office_manager","site_overseer","data_holder"] },
  { key:"procurement", icon:"◈",  label:"Procurement",noRoles:["storekeeper_local","storekeeper_import","storekeeper_scaffolding","engineer","supervisor","office_manager","site_overseer","data_holder","project_manager"] },
  { key:"incidents",   icon:"⚠",  label:"Incidents" },
  { key:"reports",     icon:"◳",  label:"Reports" },
  { key:"users",       icon:"◉",  label:"Users",      adminOnly:true },
  { key:"audit", icon:"◇", label:"Audit Log", adminOnly:true },
  { key:"transfer_log", icon:"📋", label:"Transfer Log", adminOnly:true },
  { key:"onboarding", icon:"✦", label:"Storekeeper Onboarding", adminOnly:true },
  { key:"material_approvals", icon:"✓", label:"Material Approvals" },
];

function buildNav(user, role) {
  return NAV_ITEMS
    .filter(item => !item.adminOnly || ["admin","company_owner","ceo"].includes(user.role))
    .filter(item => !item.noRoles || !item.noRoles.includes(user.role))
    .filter(item => checkAccess(item.key, user))
    .map(item => `
      <button onclick="window._navigate('${item.key}')" id="nav-${item.key}" data-nav-item
        style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 14px;
        border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;
        color:var(--text-200);background:transparent;text-align:left;transition:all 0.2s;margin-bottom:2px;">
        <span style="font-size:16px;width:22px;text-align:center;opacity:0.7;">${item.icon}</span>
        <span style="flex:1;">${item.label}</span>
        ${item.key === 'requests' ? `<span id="nav-badge-${item.key}" style="display:none;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;"></span>` : ''}
      </button>`).join("");
}

async function navigate(route) {
  if (!currentUser) return;
  // Always dismiss any open modal before navigating to a new section
  closeModal();
  if (!checkAccess(route, currentUser)) { showToast("Access denied for your role", "error"); return; }
  document.querySelectorAll("[id^='nav-']").forEach(b => { b.classList.remove("active"); b.style.background = "transparent"; b.style.color = "var(--text-200)"; });
  const activeBtn = document.getElementById(`nav-${route}`);
  if (activeBtn) { activeBtn.classList.add("active"); activeBtn.style.background = "var(--gold-glow)"; activeBtn.style.color = "var(--gold)"; }
  const content = document.getElementById("page-content");
  const titleEl = document.getElementById("page-title");
  if (!content) return;
  content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:300px;flex-direction:column;gap:16px;">
    <div style="width:44px;height:44px;background:var(--gold-glow);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;animation:pulse-gold 1.5s ease-in-out infinite;">🏗</div>
    <div class="spinner" style="width:32px;height:32px;border-width:2px;"></div>
    <p style="color:var(--text-300);font-size:12px;">Loading…</p></div>`;
  const titles = { dashboard:"Dashboard", inventory:"Inventory", grn:"GRN Scanner", requests:"Material Requests", transfers:"Transfers", procurement:"Procurement", incidents:"Incidents", reports:"Reports", users:"Users", audit:"Audit Log", transfer_log:"Transfer Log", onboarding:"Storekeeper Onboarding", material_approvals:"Material Approvals" };
  if (titleEl) titleEl.textContent = titles[route] || route;
  try {
    switch (route) {
      case "dashboard": { const { renderDashboard } = await import("./modules/dashboards.js"); await renderDashboard(content, currentUser); break; }
      case "inventory": { const { renderInventory } = await import("./modules/inventory.js"); await renderInventory(content, currentUser); break; }
      case "grn": { const { renderGRN } = await import("./modules/grn.js"); await renderGRN(content, currentUser); break; }
      case "requests": { const { renderRequests } = await import("./modules/requests.js"); await renderRequests(content, currentUser); break; }
      case "transfers": { const { renderTransfers } = await import("./modules/transfers.js"); await renderTransfers(content, currentUser); break; }
      case "procurement": { const { renderProcurement } = await import("./modules/procurement.js"); await renderProcurement(content, currentUser); break; }
      case "incidents": { const { renderIncidents } = await import("./modules/incidents.js"); await renderIncidents(content, currentUser); break; }
      case "reports": { const { renderReports } = await import("./modules/reports.js"); await renderReports(content, currentUser); break; }
      case "users": { const { renderUsers } = await import("./modules/users.js"); await renderUsers(content, currentUser); break; }
      case "audit": { await renderAuditLog(content, currentUser); break; }
      case "transfer_log": { const { renderTransferLog } = await import("./modules/transfers.js"); await renderTransferLog(content, currentUser); break; }
      case "onboarding": { const { renderOnboarding } = await import("./modules/onboarding.js"); await renderOnboarding(content, currentUser); break; }
      case "material_approvals": { const { renderMaterialApprovals } = await import("./modules/material_approvals.js"); await renderMaterialApprovals(content, currentUser); break; }
      default: content.innerHTML = `<div class="card" style="padding:60px;text-align:center;color:var(--text-300);font-size:15px;">Module coming soon</div>`;
    }
  } catch (err) {
    console.error(`[NAV] Error loading ${route}:`, err);
    content.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">
      <div style="font-size:32px;margin-bottom:12px;">⚠</div>
      <div style="font-weight:600;margin-bottom:8px;">Error loading module</div>
      <div style="font-size:13px;color:var(--text-300);">${err.message}</div>
      <button onclick="window._navigate('${route}')" class="btn btn-gold btn-sm" style="margin-top:16px;">Retry</button></div>`;
  }
}

// ─── Audit Log Viewer ─────────────────────────────────────────────────────────
async function renderAuditLog(container, user) {
  if (!container) return;
  container.innerHTML = `<div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;">
    <div><h1 style="font-size:24px;font-weight:700;color:var(--text-100);">Audit Log</h1><p style="color:var(--text-200);font-size:13px;">Immutable record of all system actions</p></div>
  </div><div id="audit-rows"><div class="spinner" style="margin:60px auto;"></div></div>`;
  let rows = [];
  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);
    rows = data || [];
    if (error) console.error('[AUDIT] fetch error:', error);
    if (!Array.isArray(rows)) rows = [];
  } catch (e) { console.error('[AUDIT] fetch failed', e); }
  const el = container ? container.querySelector("#audit-rows") : null;
  if (!el) return;
  if (!rows.length) { el.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-300);">No audit entries yet</div>`; return; }
  const actionColors = { user_login:"var(--gold)", stock_created:"var(--green)", stock_adjusted:"var(--blue)", stock_issued:"var(--orange)", grn_submitted:"var(--blue)", grn_verified:"var(--green)", request_created:"var(--blue)", request_pm_approved:"var(--green)", request_issued:"var(--orange)", request_expired:"var(--red)", transfer_created:"var(--blue)", transfer_advanced:"var(--green)", transfer_completed:"var(--teal)", procurement_created:"var(--blue)", procurement_approved:"var(--green)", incident_reported:"var(--red)", incident_resolved:"var(--teal)", unauthorized_access_attempt:"var(--red)", user_created:"var(--green)", user_updated:"var(--blue)" };
  el.innerHTML = `<div class="card" style="overflow-x:auto;border-radius:12px;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="border-bottom:1px solid var(--border);">
        ${["Time","Actor","Role","Action","Module","Reason"].map(h => `<th style="text-align:left;padding:12px 10px;color:var(--text-400);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">${h}</th>`).join("")}
      </tr></thead>
      <tbody>${rows.map(r => {
        const ac = actionColors[r.action] || "var(--text-300)";
        return `<tr style="border-bottom:1px solid rgba(26,31,46,0.4);">
          <td style="padding:12px 10px;color:var(--text-300);white-space:nowrap;font-family:var(--font-mono);font-size:11px;">${new Date(r.timestamp).toLocaleString("en-KE")}</td>
          <td style="padding:12px 10px;color:var(--text-200);font-weight:500;">${r.actor_name || "—"}</td>
          <td style="padding:12px 10px;color:var(--text-300);font-size:11px;">${r.actor_role || "—"}</td>
          <td style="padding:12px 10px;color:${ac};font-weight:600;font-size:11px;">${r.action}</td>
          <td style="padding:12px 10px;color:var(--text-200);">${r.module || "—"}</td>
          <td style="padding:12px 10px;color:var(--text-300);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.reason || "—"}</td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
export function showModal(html) {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  if (!overlay || !content) return;
  content.innerHTML = `<button onclick="window._closeModal()" style="position:absolute;top:18px;right:18px;background:var(--bg-500);
    border:1px solid var(--border);width:32px;height:32px;border-radius:8px;color:var(--text-300);
    cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>${html}`;
  overlay.style.display = "flex";
  content.classList.add("modal-enter");
}

export function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.style.display = "none";
}

const colorMap = { success: "var(--green)", error: "var(--red)", warning: "var(--orange)", info: "var(--blue)" };
const iconMap = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const c = colorMap[type] || "var(--gold)";
  const toast = document.createElement("div");
  toast.className = "toast-enter";
  toast.style.cssText = `background:var(--bg-600);border:1px solid ${c}30;border-left:3px solid ${c};
    border-radius:8px;padding:12px 18px;color:var(--text-100);font-size:13px;
    display:flex;align-items:center;gap:10px;min-width:260px;max-width:400px;
    box-shadow:0 8px 32px rgba(0,0,0,0.5);font-weight:500;`;
  toast.innerHTML = `<span style="color:${c};font-weight:700;font-size:14px;">${iconMap[type] || "•"}</span><span style="flex:1;">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.transition = "all 0.3s"; toast.style.opacity = "0"; toast.style.transform = "translateX(20px)"; setTimeout(() => toast.remove(), 300); }, 3500);
}

function toggleNotifs() { const p = document.getElementById("notif-panel"); if (p) p.style.display = p.style.display === "none" ? "block" : "none"; }
function toggleSidebar() { const s = document.getElementById("sidebar"); const o = document.getElementById("sidebar-overlay"); if (s && o) { s.classList.toggle("open"); o.classList.toggle("active"); } }
function closeSidebar() { const s = document.getElementById("sidebar"); const o = document.getElementById("sidebar-overlay"); if (s && o) { s.classList.remove("open"); o.classList.remove("active"); } }

function logout() {
  currentUser = null;
  supabase.auth.signOut();
  showLoginScreen();
}
