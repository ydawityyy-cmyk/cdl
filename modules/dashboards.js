// CDL — modules/dashboards.js — Dynamic Dashboard Dispatcher
import { ROLES } from "./roles.js";
import { LOGO_URL } from "../config.js";

export async function renderDashboard(container, user) {
  if (!user) return;

  // Resolve role from ROLES dictionary or dynamically construct custom role descriptor
  let role = ROLES[user.role];
  if (!role) {
    const formattedTitle = (user.role || "Custom Role")
      .replace(/_/g, " ")
      .replace(/\b\w/g, l => l.toUpperCase());

    const hasCustomAI = Array.isArray(user._customPerms) && user._customPerms.includes("ai:access");

    role = {
      label: formattedTitle,
      badge: (user.role || "CUSTOM").replace(/_/g, " ").toUpperCase(),
      color: "var(--accent-gold)",
      icon: "👤",
      dashboardModule: "dashboards_roles",
      siteScope: "assigned",
      aiMsgsPerDay: hasCustomAI ? 20 : 0
    };
  }

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:350px;flex-direction:column;gap:16px;">
      <div style="width:52px;height:52px;background:var(--gold-glow);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;animation:pulse-gold 1.5s ease-in-out infinite;">🏗</div>
      <div class="spinner" style="width:32px;height:32px;border-width:2px;"></div>
      <p style="color:var(--text-300);font-size:13px;font-weight:500;">Loading ${role.label} dashboard…</p>
    </div>
  `;

  try {
    switch (role.dashboardModule) {
      case "dashboards_owner": {
        const { renderOwnerDashboard } = await import("./dashboards_owner.js");
        return renderOwnerDashboard(container, user);
      }
      case "dashboards_ceo": {
        const { renderCEODashboard } = await import("./dashboards_ceo.js");
        return renderCEODashboard(container, user);
      }
      case "dashboards_am": {
        const { renderAMDashboard } = await import("./dashboards_am.js");
        return renderAMDashboard(container, user);
      }
      case "dashboards_pm": {
        const { renderPMDashboard } = await import("./dashboards_pm.js");
        return renderPMDashboard(container, user);
      }
      case "dashboards_finance": {
        const { renderFinanceDashboard } = await import("./dashboards_finance.js");
        return renderFinanceDashboard(container, user);
      }
      case "storekeeper": {
        const { renderStorekeeperDashboard } = await import("./storekeeper.js");
        return renderStorekeeperDashboard(container, user);
      }
      case "dashboards_roles":
      default: {
        const { renderRoleDashboard } = await import("./dashboards_roles.js");
        return renderRoleDashboard(container, user);
      }
    }
  } catch (err) {
    console.error("[Dashboard] Error:", err);
    container.innerHTML = `
      <div class="card" style="padding:40px;text-align:center;">
        <div style="font-size:32px;margin-bottom:12px;color:var(--red);">⚠</div>
        <div style="font-weight:600;color:var(--text-100);margin-bottom:8px;">Dashboard Error</div>
        <div style="font-size:13px;color:var(--text-300);margin-bottom:16px;">${err.message}</div>
        <button onclick="window._navigate('dashboard')" class="btn btn-gold btn-sm">Retry</button>
      </div>
    `;
  }
}
