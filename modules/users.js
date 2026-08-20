// CDL — modules/users.js
import { supabase, SITES } from "../config.js";
import { ROLES, SITE_MANAGERS } from "./roles.js";
import { logAudit } from "./audit_core.js";
import { showToast, showModal, closeModal } from "../app.js";

const ROLE_RANK = { company_owner: 10, admin: 9, ceo: 8, asset_manager: 7, finance: 6, office_manager: 5, store_manager: 5, site_overseer: 4, project_manager: 4, procurement_officer: 3, transfer_officer: 3, data_holder: 3, engineer: 2, storekeeper_local: 1, storekeeper_import: 1, storekeeper_scaffolding: 1 };

function canManageUsers(user) { return ["admin", "company_owner", "ceo", "asset_manager"].includes(user.role); }
function canManageSites(user) { return SITE_MANAGERS.includes(user.role); }
function canCreateRole(user, targetRole) { return user.role === "admin" || (ROLE_RANK[user.role] || 0) >= (ROLE_RANK[targetRole] || 0); }

export async function renderUsers(container, user) {
  if (!canManageUsers(user) && !canManageSites(user)) {
    container.innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--red);">⛔ You do not have access to this section.</div>`;
    return;
  }
  const tabs = [];
  if (canManageUsers(user)) tabs.push({ key: "users", label: "👥 Users" });
  if (canManageSites(user)) tabs.push({ key: "sites", label: "🏗 Sites" });
  if (["admin", "company_owner"].includes(user.role)) tabs.push({ key: "roles", label: "🔐 Role Manager" });

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-size:24px;font-weight:700;color:var(--text-100);">Administration</h1>
      <p style="color:var(--text-200);font-size:14px;margin-top:4px;">Manage users, sites and custom role permissions</p>
    </div>
    <div style="display:flex;gap:4px;margin-bottom:24px;">
      ${tabs.map((t, i) => `<button id="adm-tab-${t.key}" onclick="window._admSwitch('${t.key}')" style="padding:8px 20px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:500;${i === 0 ? "background:var(--gold);color:#0a0c10;" : "background:var(--bg-600);color:var(--text-200);" }">${t.label}</button>`).join("")}
    </div>
    <div id="adm-panel"></div>
  `;

  const tabKeys = tabs.map(t => t.key);
  window._admSwitch = (key) => {
    tabKeys.forEach(k => {
      const b = document.getElementById(`adm-tab-${k}`);
      if (b) {
        b.style.background = k === key ? "var(--gold)" : "var(--bg-600)";
        b.style.color = k === key ? "#0a0c10" : "var(--text-200)";
      }
    });
    if (key === "users") loadUsersPanel(user);
    else if (key === "sites") loadSitesPanel(user);
    else loadRolesPanel(user);
  };

  if (tabKeys[0] === "users") loadUsersPanel(user);
  else if (tabKeys[0] === "sites") loadSitesPanel(user);
}

// ─── Users Panel ─────────────────────────────────────────────────────────────
async function loadUsersPanel(currentUser) {
  const panel = document.getElementById("adm-panel");
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span style="color:var(--text-300);font-size:13px;">Manage active Canaan staff accounts</span>
      <button onclick="window._admOpenUserForm(null)" class="btn btn-gold">+ Add User</button>
    </div>
    <div id="users-table"><div class="spinner" style="margin:60px auto;"></div></div>
  `;
  window._admOpenUserForm = (u) => userFormModal(currentUser, u);
  await fetchUsers(currentUser);
}

async function fetchUsers(currentUser) {
  const el = document.getElementById("users-table");
  if (!el) return;
  try {
    const { data: users, error } = await supabase.from("users").select("*").order("name", { ascending: true }).limit(200);
    if (error) throw error;
    el.innerHTML = `
      <div class="card" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              ${["Name", "Email", "Role", "Sites", "Status", "Actions"].map(h => `<th style="text-align:left;padding:10px 8px;color:var(--text-400);font-weight:500;">${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${users.map(u => {
              const roleInfo = ROLES[u.role] || { label: u.role, color: "#c8a96e" };
              const rank = ROLE_RANK[u.role] || 0;
              const myRank = ROLE_RANK[currentUser.role] || 0;
              const canEdit = myRank >= rank || currentUser.role === "admin";
              const siteNames = (u.site_ids || []).map(id => SITES.find(s => s.id === id)?.name || `#${id}`).join(", ") || "All";
              return `
                <tr style="border-bottom:1px solid rgba(30,35,48,0.5);">
                  <td style="padding:10px 8px;font-weight:500;color:var(--text-100);">${u.name}</td>
                  <td style="padding:10px 8px;color:var(--text-200);">${u.email}</td>
                  <td style="padding:10px 8px;"><span style="padding:2px 10px;border-radius:12px;font-size:11px;background:rgba(200,169,110,0.1);color:${roleInfo.color || "var(--gold)"};">${roleInfo.label || u.role}</span></td>
                  <td style="padding:10px 8px;color:var(--text-200);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${siteNames}">${siteNames}</td>
                  <td style="padding:10px 8px;"><span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${u.is_active ? "rgba(46,160,67,0.15)" : "rgba(231,76,60,0.15)"};color:${u.is_active ? "var(--green)" : "var(--red)"};">${u.is_active ? "Active" : "Inactive"}</span></td>
                  <td style="padding:10px 8px;display:flex;gap:6px;">
                    ${canEdit ? `
                      <button onclick="window._admOpenUserForm(${JSON.stringify(u).replace(/"/g, "&quot;")})" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--text-200);cursor:pointer;font-size:12px;">Edit</button>
                      <button onclick="window._admToggleUser('${u.id}',${u.is_active})" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;color:${u.is_active ? "var(--red)" : "var(--green)"};">${u.is_active ? "Disable" : "Enable"}</button>
                    ` : "<span style='color:var(--text-300);font-size:12px;'>–</span>"}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    window._admToggleUser = async (id, isActive) => {
      try {
        const { error } = await supabase.from("users").update({ is_active: !isActive }).eq("id", id);
        if (error) throw error;
        await logAudit({ action: isActive ? "user_disabled" : "user_enabled", module: "admin", record_id: id });
        showToast(`User ${isActive ? "disabled" : "enabled"}`, "success");
        fetchUsers(currentUser);
      } catch (e) {
        showToast(e.message, "error");
      }
    };
  } catch (e) {
    el.innerHTML = `<p style="color:var(--red);">Error: ${e.message}</p>`;
  }
}

async function userFormModal(currentUser, editUser) {
  const isEdit = !!editUser;
  // Fetch dynamic roles from DB or fall back to ROLES keys
  let dbRoles = [];
  try {
    const { data } = await supabase.from("roles").select("key, label");
    if (data && data.length > 0) dbRoles = data;
  } catch {}

  const availableRoles = dbRoles.length > 0 
    ? dbRoles 
    : Object.entries(ROLES).map(([key, r]) => ({ key, label: r.label || key }));

  showModal(`
    <h2 style="margin-bottom:20px;">${isEdit ? "Edit" : "New"} User</h2>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Full Name</label>
          <input id="uf-name" value="${editUser?.name || ""}" type="text" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        </div>
        <div>
          <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Email</label>
          <input id="uf-email" value="${editUser?.email || ""}" type="email" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Role</label>
          <select id="uf-role" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
            ${availableRoles.map(r => `<option value="${r.key}" ${editUser?.role === r.key ? "selected" : ""}>${r.label || r.key}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Password ${isEdit ? "(blank = keep)" : ""}</label>
          <input id="uf-pw" type="password" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Position / Title</label>
        <input id="uf-position" value="${editUser?.position || ""}" type="text" placeholder="e.g. Site Manager, Procurement Officer" style="background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);font-size:13px;">
      </div>
      <div>
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;display:block;">Assigned Sites</label>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          ${SITES.map(s => `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-200);"><input type="checkbox" value="${s.id}" class="uf-site" ${(editUser?.site_ids || []).includes(s.id) ? "checked" : "" } style="accent-color:var(--gold);">${s.name}</label>`).join("")}
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:4px;">
        <button onclick="window._admSaveUser('${editUser?.id || ""}')" class="btn btn-gold" style="flex:1;">${isEdit ? "Save Changes" : "Create User"}</button>
        <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `);

  window._admSaveUser = async (uid) => {
    const name = document.getElementById("uf-name").value.trim();
    const email = document.getElementById("uf-email").value.trim();
    const role = document.getElementById("uf-role").value;
    const pw = document.getElementById("uf-pw").value;
    const sites = [...document.querySelectorAll(".uf-site:checked")].map(c => parseInt(c.value));
    if (!name || !email) { showToast("Name and email required", "error"); return; }
    if (!canCreateRole(currentUser, role)) { showToast("You cannot assign that role", "error"); return; }
    const position = document.getElementById("uf-position").value.trim();
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";

      // Call secure serverless function to provision user in Supabase Auth & public.users
      const res = await fetch("/.netlify/functions/admin-create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          email,
          role,
          password: pw || undefined,
          position,
          site_ids: sites
        })
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || "Failed to provision user");
      }

      await logAudit({ action: uid ? "user_updated" : "user_created", module: "admin", record_id: result.user?.id || uid, after: { name, email, role, position, site_ids: sites } });
      closeModal();
      showToast(`User ${email} ${uid ? "updated" : "created & login ready"}!`, "success");
      fetchUsers(currentUser);
    } catch (e) {
      // Fallback to direct DB update if offline/error
      try {
        const payload = { name, email, role, position, site_ids: sites, is_active: true, ...(pw ? { password_hash: pw } : {}) };
        if (uid) {
          const { error } = await supabase.from("users").update(payload).eq("id", uid);
          if (error) throw error;
        } else {
          const { data: inserted, error } = await supabase.from("users").insert(payload).select().single();
          if (error) throw error;
          // Also save to credential vault
          try {
            await supabase.from("user_credentials").upsert({
              user_id: inserted?.id,
              name,
              email: email.toLowerCase(),
              role,
              plain_password: pw || 'canaan2024',
              site_ids: sites.join(','),
              created_by: 'fallback-direct',
              notes: 'Created via direct DB (fallback)'
            }, { onConflict: 'email' });
          } catch (_) { /* vault save failure is non-fatal */ }
        }
        closeModal();
        showToast(`User saved in database`, "success");
        fetchUsers(currentUser);
      } catch (err2) {
        showToast(e.message || err2.message, "error");
      }
    }
  };
}

// ─── Sites Panel ─────────────────────────────────────────────────────────────
async function loadSitesPanel(user) {
  const panel = document.getElementById("adm-panel");
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span style="color:var(--text-300);font-size:13px;">Manage construction sites · ${SITES.length} total</span>
      <button onclick="window._admOpenSiteForm(null)" class="btn btn-gold">+ Add Site</button>
    </div>
    <div id="sites-table"><div class="spinner" style="margin:60px auto;"></div></div>
  `;
  window._admOpenSiteForm = (s) => siteFormModal(user, s);
  await fetchSites(user);
}

async function fetchSites(user) {
  const el = document.getElementById("sites-table");
  if (!el) return;
  try {
    const { data: sites, error } = await supabase.from("sites").select("*").order("id", { ascending: true });
    if (error) throw error;
    el.innerHTML = `
      <div class="card" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              ${["#", "Name", "Type", "Status", "Actions"].map(h => `<th style="text-align:left;padding:10px 8px;color:var(--text-400);font-weight:500;">${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${sites.map(s => `
              <tr style="border-bottom:1px solid rgba(30,35,48,0.5);">
                <td style="padding:10px 8px;color:var(--text-300);">${s.id}</td>
                <td style="padding:10px 8px;font-weight:500;color:var(--text-100);">${s.name}</td>
                <td style="padding:10px 8px;"><span style="padding:2px 10px;border-radius:12px;font-size:11px;background:rgba(61,142,248,0.1);color:var(--blue);">${s.type || "–"}</span></td>
                <td style="padding:10px 8px;"><span style="padding:2px 10px;border-radius:12px;font-size:11px;background:${s.is_active ? "rgba(46,160,67,0.15)" : "rgba(231,76,60,0.15)"};color:${s.is_active ? "var(--green)" : "var(--red)"};">${s.is_active ? "Active" : "Inactive"}</span></td>
                <td style="padding:10px 8px;display:flex;gap:6px;">
                  <button onclick="window._admOpenSiteForm(${JSON.stringify(s).replace(/"/g, "&quot;")})" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--text-200);cursor:pointer;font-size:12px;">Edit</button>
                  <button onclick="window._admToggleSite('${s.id}',${s.is_active})" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;color:${s.is_active ? "var(--red)" : "var(--green)"};">${s.is_active ? "Deactivate" : "Activate"}</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    window._admToggleSite = async (id, isActive) => {
      try {
        const { error } = await supabase.from("sites").update({ is_active: !isActive }).eq("id", id);
        if (error) throw error;
        await logAudit({ action: isActive ? "site_deactivated" : "site_activated", module: "admin", record_id: id });
        showToast(`Site ${isActive ? "deactivated" : "activated"}`, "success");
        fetchSites(user);
      } catch (e) {
        showToast(e.message, "error");
      }
    };
  } catch (e) {
    el.innerHTML = `<p style="color:var(--red);">Error: ${e.message}</p>`;
  }
}

function siteFormModal(user, site) {
  const isEdit = Boolean(site);
  showModal(`
    <h2 style="margin-bottom:20px;">${isEdit ? "Edit" : "New"} Site</h2>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Site Name</label>
        <input id="sf-name" value="${site?.name || ""}" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
      </div>
      <div>
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Type</label>
        <select id="sf-type" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
          <option value="residential" ${site?.type === "residential" ? "selected" : ""}>Residential</option>
          <option value="commercial" ${site?.type === "commercial" ? "selected" : ""}>Commercial</option>
          <option value="warehouse" ${site?.type === "warehouse" ? "selected" : ""}>Warehouse</option>
        </select>
      </div>
      <div style="display:flex;gap:10px;margin-top:4px;">
        <button onclick="window._admSaveSite('${site?.id || ""}')" class="btn btn-gold" style="flex:1;">${isEdit ? "Save Changes" : "Create Site"}</button>
        <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `);
  window._admSaveSite = async (sid) => {
    const name = document.getElementById("sf-name").value.trim();
    const type = document.getElementById("sf-type").value;
    if (!name) { showToast("Site name required", "error"); return; }
    try {
      if (sid) {
        const { error } = await supabase.from("sites").update({ name, type }).eq("id", sid);
        if (error) throw error;
        await logAudit({ action: "site_updated", module: "admin", after: { name, type } });
      } else {
        const { data: saved, error } = await supabase.from("sites").insert({ name, type, is_active: true }).select().single();
        if (error) throw error;
        await logAudit({ action: "site_created", module: "admin", record_id: saved?.id, after: { name, type } });
      }
      closeModal();
      showToast(`Site ${sid ? "updated" : "created"}`, "success");
      fetchSites(user);
    } catch (e) {
      showToast(e.message, "error");
    }
  };
}

// ─── Dynamic Role Manager Panel ──────────────────────────────────────────────
async function loadRolesPanel(user) {
  const panel = document.getElementById("adm-panel");
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <h3 style="color:var(--text-100);font-size:16px;font-weight:600;">Dynamic Role & Permission Matrix</h3>
        <p style="color:var(--text-300);font-size:12px;margin-top:2px;">Define custom roles with granular action permissions</p>
      </div>
      ${user.role === "admin" ? `<button onclick="window._admOpenCustomRoleModal()" class="btn btn-gold">+ Create Custom Role</button>` : ""}
    </div>
    <div id="roles-matrix-table"><div class="spinner" style="margin:40px auto;"></div></div>
  `;

  window._admOpenCustomRoleModal = () => openCustomRoleModal(user);
  await fetchRolesMatrix(user);
}

async function fetchRolesMatrix(user) {
  const el = document.getElementById("roles-matrix-table");
  if (!el) return;
  try {
    const [{ data: dbRoles }, { data: dbRolePerms }, { data: dbPerms }] = await Promise.all([
      supabase.from("roles").select("*").order("created_at", { ascending: true }),
      supabase.from("role_permissions").select("role_key, permission_key"),
      supabase.from("permissions").select("*").order("category", { ascending: true })
    ]);

    const rolesList = dbRoles && dbRoles.length > 0 
      ? dbRoles 
      : Object.entries(ROLES).map(([k, r]) => ({ key: k, label: r.label, color: r.color, site_scope: r.siteScope || "assigned", is_system: true }));

    const permsByRole = {};
    (dbRolePerms || []).forEach(rp => {
      if (!permsByRole[rp.role_key]) permsByRole[rp.role_key] = [];
      permsByRole[rp.role_key].push(rp.permission_key);
    });

    el.innerHTML = `
      <div class="card" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              ${["Role", "Scope", "Type", "Active Permissions"].map(h => `<th style="text-align:left;padding:10px 8px;color:var(--text-400);font-weight:500;">${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rolesList.map(r => {
              const perms = permsByRole[r.key] || [];
              return `
                <tr style="border-bottom:1px solid rgba(30,35,48,0.5);">
                  <td style="padding:10px 8px;">
                    <span style="padding:3px 10px;border-radius:12px;font-size:11px;background:${r.color || "#333"}22;color:${r.color || "var(--text-200)"};font-weight:600;">
                      ${r.label || r.key}
                    </span>
                  </td>
                  <td style="padding:10px 8px;color:var(--text-200);">${r.site_scope || "assigned"}</td>
                  <td style="padding:10px 8px;color:var(--text-300);font-size:11px;">${r.is_system ? "System Default" : "Custom Role"}</td>
                  <td style="padding:10px 8px;max-width:400px;">
                    ${perms.length > 0 
                      ? perms.slice(0, 5).map(p => `<span style="display:inline-block;margin:2px;padding:1px 7px;border-radius:8px;font-size:10px;background:rgba(200,169,110,0.08);color:var(--gold);">${p}</span>`).join("") + (perms.length > 5 ? `<span style="color:var(--text-400);font-size:10px;margin-left:4px;">+${perms.length - 5} more</span>` : "")
                      : '<span style="color:var(--text-400);">Standard access</span>'
                    }
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p style="color:var(--red);">Error loading roles: ${err.message}</p>`;
  }
}

async function openCustomRoleModal(user) {
  let allPerms = [];
  try {
    const { data } = await supabase.from("permissions").select("*").order("category", { ascending: true });
    if (data) allPerms = data;
  } catch {}

  const permsByCategory = {};
  allPerms.forEach(p => {
    if (!permsByCategory[p.category]) permsByCategory[p.category] = [];
    permsByCategory[p.category].push(p);
  });

  showModal(`
    <h2 style="margin-bottom:8px;">Create Custom Role</h2>
    <p style="color:var(--text-300);font-size:13px;margin-bottom:20px;">Define a new operational role and assign specific action permissions.</p>
    <div style="display:flex;flex-direction:column;gap:14px;max-height:70vh;overflow-y:auto;padding-right:8px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Role Key (Unique identifier)</label>
          <input id="cr-key" type="text" placeholder="e.g. site_clerk" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        </div>
        <div>
          <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Role Display Label</label>
          <input id="cr-label" type="text" placeholder="e.g. Site Inventory Clerk" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Badge Color</label>
          <select id="cr-color" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
            <option value="#c8a96e">Gold (#c8a96e)</option>
            <option value="#3d8ef8">Blue (#3d8ef8)</option>
            <option value="#2ecc71">Green (#2ecc71)</option>
            <option value="#9b59b6">Purple (#9b59b6)</option>
            <option value="#f39c12">Amber (#f39c12)</option>
            <option value="#2dd4bf">Teal (#2dd4bf)</option>
          </select>
        </div>
        <div>
          <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;">Site Scope</label>
          <select id="cr-scope" style="width:100%;margin-top:5px;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);">
            <option value="assigned">Assigned Sites Only</option>
            <option value="all">All Sites (Executive)</option>
          </select>
        </div>
      </div>
      <div>
        <label style="color:var(--text-300);font-size:11px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:8px;">Permissions</label>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${Object.entries(permsByCategory).map(([cat, perms]) => `
            <div style="background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:12px;">
              <div style="font-weight:600;color:var(--gold);font-size:12px;margin-bottom:8px;">${cat}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                ${perms.map(p => `
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--text-200);" title="${p.description}">
                    <input type="checkbox" value="${p.key}" class="cr-perm" style="accent-color:var(--gold);">
                    <span>${p.name}</span>
                  </label>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:6px;">
        <button onclick="window._admSaveCustomRole()" class="btn btn-gold" style="flex:1;">Create Role</button>
        <button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `);

  window._admSaveCustomRole = async () => {
    const rawKey = document.getElementById("cr-key").value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const label = document.getElementById("cr-label").value.trim();
    const color = document.getElementById("cr-color").value;
    const site_scope = document.getElementById("cr-scope").value;
    const selectedPerms = [...document.querySelectorAll(".cr-perm:checked")].map(c => c.value);

    if (!rawKey || !label) {
      showToast("Role key and display label are required", "error");
      return;
    }

    try {
      // 1. Insert Role
      const { error: roleErr } = await supabase.from("roles").insert({
        key: rawKey,
        label,
        color,
        site_scope,
        is_system: false,
        created_by: user.id
      });
      if (roleErr) throw roleErr;

      // 2. Insert Permissions
      if (selectedPerms.length > 0) {
        const permRows = selectedPerms.map(pk => ({ role_key: rawKey, permission_key: pk }));
        const { error: permErr } = await supabase.from("role_permissions").insert(permRows);
        if (permErr) throw permErr;
      }

      await logAudit({ action: "role_created", module: "admin", reason: `Created role ${label} (${rawKey}) with ${selectedPerms.length} perms` });
      closeModal();
      showToast(`Custom role "${label}" created successfully!`, "success");
      fetchRolesMatrix(user);
    } catch (err) {
      showToast(`Error creating role: ${err.message}`, "error");
    }
  };
}
