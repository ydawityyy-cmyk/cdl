// ============================================================
// CDL Site Management — modules/audit_core.js
// Immutable audit trail — called by EVERY module on every action.
// ============================================================

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

// Get current user from Supabase Auth session
async function getAuthToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || SUPABASE_ANON_KEY;
  } catch {
    return SUPABASE_ANON_KEY;
  }
}

// Get actor from Supabase user
async function getActor() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    // Try profile from cache in localStorage to avoid circular deps
    const cachedProfile = (() => {
      try { return JSON.parse(localStorage.getItem("cdl_user_profile") || "null"); } catch { return null; }
    })();
    return cachedProfile || { id: user.id, name: user.email, role: "unknown" };
  } catch {
    return null;
  }
}

// Persistent session ID via crypto.randomUUID()
function getSessionId() {
  if (!sessionStorage.getItem("cdl_session_id")) {
    sessionStorage.setItem("cdl_session_id", crypto.randomUUID());
  }
  return sessionStorage.getItem("cdl_session_id");
}

// In-memory queue for failed audit logs (sync on reconnect)
const pendingAudits = [];

/**
 * Log an action to the immutable audit_log table.
 * Never fails silently — logs to console if Supabase unreachable.
 *
 * @param {Object} entry
 * @param {string} entry.action       - e.g. "stock_adjusted", "grn_verified", "transfer_approved"
 * @param {string} entry.module       - e.g. "inventory", "transfers", "procurement"
 * @param {string} [entry.record_id]  - UUID of the affected record
 * @param {*}      [entry.before]     - Value before change
 * @param {*}      [entry.after]      - Value after change
 * @param {string} [entry.reason]     - Human-readable reason
 */
export async function logAudit({ action, module, record_id, before, after, reason }) {
  try {
    const actor = await getActor();
    if (!actor) return;
    const jwt = await getAuthToken();

    const entry = {
      actor_id:     actor.id,
      actor_name:   actor.name || actor.email || "System",
      actor_role:   actor.role || "unknown",
      action,
      module,
      record_id:    record_id || null,
      before_value: before ? JSON.stringify(before) : null,
      after_value:  after  ? JSON.stringify(after)  : null,
      reason:       reason || null,
      session_id:   getSessionId(),
      timestamp:    new Date().toISOString(),
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/audit_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${jwt}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(entry)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[AUDIT] Failed to log:", action, res.status, errText);
      pendingAudits.push({ entry, jwt });
    }
  } catch (err) {
    console.warn("[AUDIT] logAudit error:", action, err.message);
  }
}

/**
 * Retry all pending (previously failed) audit log entries.
 * Called on reconnect or on a timer.
 */
export async function syncPendingAudits() {
  if (!pendingAudits.length) return;
  const batch = [...pendingAudits];
  pendingAudits.length = 0;
  const jwt = await getAuthToken();
  for (const { entry } of batch) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/audit_log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${jwt}`,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(entry)
      });
      if (!res.ok) {
        pendingAudits.push({ entry, jwt });
      }
    } catch {
      pendingAudits.push({ entry, jwt });
    }
  }
}
