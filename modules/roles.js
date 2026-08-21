
const head_of_projects = {
  label: "Head of Projects",
  color: "#8e44ad",
  dashboardModule: "dashboards_pm",
  siteScope: "all",
  canApproveTransfers: true,
  canApproveRequests: true,
  canResolveIncident: true,
  canSeeAllFinancials: true,
  showPopups: true,
  aiMsgsPerDay: 7,
};
// ============================================================
// CDL Site Management v10 — modules/roles.js
// Role definitions, permission flags, and email log scoping.
// ============================================================

// ── Individual Role Definitions ───────────────────────────────

const company_owner = {
  label: "Company Owner",
  color: "#c8a96e",
  dashboardModule: "dashboards_owner",
  siteScope: "all",
  canApproveProcurement: true,
  canUnlockOpeningBalance: true,
  canManageSites: true,
  canGrantBudgetAccess: true,
  canSeeBudget: true,
  canSeeAllFinancials: true,
  canResolveIncident: true,
  showPopups: true,
  aiMsgsPerDay: 20,
  // Executive roles are read-only + AI advisor only — NO write access to any operational data
  canCreateRequest: false,
  canApproveRequests: false,
  canIssueStock: false,
  canCreateTransfer: false,
  canApproveTransfers: false,
  canEditInventory: false,
  canVerifyGRN: false,
  canApproveStockAdjustments: false,
  canScanGRN: false,
  canCreateIncident: false,
  canCreateProcurement: false,
};

const ceo = {
  label: "CEO",
  color: "#3d8ef8",
  dashboardModule: "dashboards_ceo",
  siteScope: "all",
  canApproveProcurement: true,
  canUnlockOpeningBalance: true,
  canManageSites: true,
  canGrantBudgetAccess: true,
  canSeeBudget: true,
  canResolveIncident: true,
  showPopups: true,
  aiMsgsPerDay: 7,
  // Executive roles are read-only + AI advisor only — NO write access to any operational data
  canCreateRequest: false,
  canApproveRequests: false,
  canIssueStock: false,
  canCreateTransfer: false,
  canApproveTransfers: false,
  canEditInventory: false,
  canVerifyGRN: false,
  canApproveStockAdjustments: false,
  canScanGRN: false,
  canCreateIncident: false,
  canCreateProcurement: false,
};

const office_manager = {
  label: "Office Manager",
  color: "#9b59b6",
  dashboardModule: "dashboards_roles",
  siteScope: "all",
  showPopups: false,
  aiMsgsPerDay: 0,
};

const asset_manager = {
  label: "Asset Manager",
  color: "#2ecc71",
  dashboardModule: "dashboards_am",
  siteScope: "all",
  canApproveProcurement: true,
  canApproveTransfers: true,
  canResolveIncident: true,
  showPopups: true,
  aiMsgsPerDay: 7,
  // NOTE: NO budget access unless granted by CEO
  // Executive roles are read-only + AI advisor only — NO write access to operational data
  canCreateRequest: false,
  canApproveRequests: false,
  canIssueStock: false,
  canCreateTransfer: false,
  canEditInventory: false,
  canVerifyGRN: false,
  canApproveStockAdjustments: false,
  canScanGRN: false,
  canCreateIncident: false,
  canCreateProcurement: false,
};

const finance = {
  label: "Finance",
  color: "#f39c12",
  dashboardModule: "dashboards_finance",
  siteScope: "all",
  canSeeBudget: true,
  canSeeAllFinancials: true,
  canEditInventory: false,   // HARD BLOCK — finance cannot touch inventory
  showPopups: false,
  aiMsgsPerDay: 0,
};

const project_manager = {
  label: "Project Manager",
  color: "#3d8ef8",
  dashboardModule: "dashboards_pm",
  siteScope: "assigned",
  canApproveRequests: true,
  canIssueStock: false,      // HARD: PM approves; Storekeeper issues & deducts inventory
  canCreateTransfer: true,
  canCreateRequest: true,
  canResolveIncident: true,
  canCreateIncident: true,
  canApprovePM: true,
  showPopups: true,
  aiMsgsPerDay: 0,
};

const engineer = {
  label: "Engineer",
  color: "#8892a0",
  dashboardModule: "dashboards_roles",
  siteScope: "assigned",
  canCreateRequest: true,
  canCreateIncident: true,
  showPopups: false,         // HARD: no popups for engineer
  aiMsgsPerDay: 0,
};

const store_manager = {
  label: "Store Manager",
  color: "#2ecc71",
  dashboardModule: "dashboards_roles",
  siteScope: "all",
  canVerifyGRN: true,
  canApproveStockAdjustments: true,
  aiMsgsPerDay: 0,
};

const storekeeper_local = {
  label: "Storekeeper (Local)",
  color: "#4a5568",
  dashboardModule: "storekeeper",
  siteScope: "assigned",
  storekeeperType: "local",
  canScanGRN: true,
  canIssueStock: true,
  canCreateIncident: true,
  canEditInventory: true,
  aiMsgsPerDay: 0,           // NO AI for storekeepers
};

const storekeeper_import = {
  label: "Storekeeper (Imported)",
  color: "#4a5568",
  dashboardModule: "storekeeper",
  siteScope: "assigned",
  storekeeperType: "imported",
  canScanGRN: true,
  canIssueStock: true,
  canCreateIncident: true,
  canEditInventory: true,
  aiMsgsPerDay: 0,
};

const storekeeper_scaffolding = {
  label: "Storekeeper (Scaffolding)",
  color: "#4a5568",
  dashboardModule: "storekeeper",
  siteScope: "assigned",
  storekeeperType: "scaffolding",
  canScanGRN: true,
  canIssueStock: true,
  canCreateIncident: true,
  canEditInventory: true,
  aiMsgsPerDay: 0,
};

const procurement_officer = {
  label: "Procurement Officer",
  color: "#f39c12",
  dashboardModule: "dashboards_roles",
  siteScope: "all",
  canCreateTransfer: true,
  procurementScope: "am_approved",
  // Sees ONLY pm_approved requests (not raw engineer requests)
  aiMsgsPerDay: 0,
};

const transfer_officer = {
  label: "Transfer Officer",
  color: "#3d8ef8",
  dashboardModule: "dashboards_roles",
  siteScope: "all",
  canCreateTransfer: true,
  canPickupTransfer: true,
  canDeliverTransfer: true,
  aiMsgsPerDay: 0,
};

const data_holder = {
  label: "Data Holder",
  color: "#8892a0",
  dashboardModule: "dashboards_roles",
  siteScope: "all",
  canVerifyGRN: true,
  canFlagDiscrepancy: true,
  aiMsgsPerDay: 0,
};

const supervisor = {
  label: "Supervisor",
  color: "#2dd4bf",
  dashboardModule: "dashboards_roles",
  siteScope: "assigned",
  canCreateRequest: true,
  canCreateIncident: true,
  showPopups: false,
  aiMsgsPerDay: 0,
};

const site_overseer = {
  label: "Site Overseer",
  color: "#9b59b6",
  dashboardModule: "dashboards_roles",
  siteScope: "all",
  canViewPMKPIs: true,
  aiMsgsPerDay: 0,
};

const admin = {
  label: "Admin",
  color: "#e74c3c",
  dashboardModule: "dashboards_roles",
  siteScope: "all",
  canManageUsers: true,
  canManageSites: true,
  canUnlockOpeningBalance: true,
  canGrantBudgetAccess: true,
  canCreateRequest: true,
  canResolveIncident: true,
  aiMsgsPerDay: Infinity,
};

// ── ROLES Export ──────────────────────────────────────────────
// All 17 role definitions keyed by role identifier.

export const ROLES = {
  head_of_projects,
  company_owner,
  ceo,
  office_manager,
  asset_manager,
  finance,
  project_manager,
  engineer,
  store_manager,
  storekeeper_local,
  storekeeper_import,
  storekeeper_scaffolding,
  procurement_officer,
  transfer_officer,
  data_holder,
  supervisor,
  site_overseer,
  admin,
};

// ── Derived Arrays ────────────────────────────────────────────

// Roles that can manage sites (add/deactivate/delete)
export const SITE_MANAGERS = ["admin", "asset_manager", "ceo", "company_owner"];

// Roles that can unlock opening balance
export const BALANCE_UNLOCKERS = ["admin", "ceo", "company_owner"];

// Roles that see the budget tab
export const BUDGET_VIEWERS = ["ceo", "company_owner", "finance"];

// ── Email Log Scoping ─────────────────────────────────────────
// Returns the email report data scope for a given role.

export function getEmailLogForRole(role) {
  const scopes = {
    company_owner:   "all_sites_full",
    ceo:             "all_sites_executive",
    asset_manager:   "all_sites_ops",
    finance:         "all_sites_financial",
    project_manager: "assigned_site_full",
    store_manager:   "all_sites_inventory",
    site_overseer:   "all_sites_pm_kpis",
  };
  return scopes[role] || "assigned_site_basic";
}
