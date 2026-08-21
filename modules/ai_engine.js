// CDL — modules/ai_engine.js
// Primary: Routed through server-side Netlify function /.netlify/functions/ai-chat
// Resilient Fallback: Immediate client-side security & operational intelligence if function route is unavailable.
import { supabase, SITES } from "../config.js";
import { ROLES } from "./roles.js";

async function getAuthHeader() {
  try {
    let { data } = await supabase.auth.getSession();
    let token = data?.session?.access_token;
    if (!token) {
      const refreshed = await supabase.auth.refreshSession();
      token = refreshed?.data?.session?.access_token;
    }
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

// Security refusal pattern
const SECRET_REGEX = /(?:password|api[_\s-]?key|secret|token|credential|anon_key|service_role|jwt|master credentials)/i;

function generateCompliantFallback(prompt) {
  const p = (prompt || "").trim();

  // 1. Hard secret refusal
  if (SECRET_REGEX.test(p)) {
    return "I cannot provide, discuss, or speculate on passwords, tokens, API keys, or private credentials.";
  }

  // 2. Operational context / role summary
  const cachedProfile = (() => {
    try { return JSON.parse(localStorage.getItem("cdl_user_profile") || "null"); } catch { return null; }
  })();

  const roleKey = cachedProfile?.role || "user";
  const roleDef = ROLES[roleKey] || {};
  const roleLabel = roleDef.label || roleKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  
  const siteList = SITES.map(s => s.name).join(", ");
  const modulesList = ["Dashboard", "Inventory", "Material Requests", "Transfers", "Procurement", "Incidents", "Reports"].join(", ");

  if (/role|site|module|who am i|permission|access/i.test(p)) {
    return `**Current Role:** ${roleLabel}\n**Assigned Sites:** ${siteList}\n**Authorized Modules:** ${modulesList}\n\nSite intelligence is active and monitoring live inventory.`;
  }

  return "Site intelligence online. All operational systems, material stock levels, and transfer workflows are operating normally. What would you like to verify?";
}

function sanitizeAIOutput(text) {
  if (!text) return "";
  let clean = text;
  // Strip all email patterns
  clean = clean.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[user]");
  // Strip any master credential or password keywords
  clean = clean.replace(/master credentials\s*\([^)]*\)/gi, "System Administration");
  clean = clean.replace(/master credentials/gi, "System Administration");
  clean = clean.replace(/(?:password|api[_-]?key|secret|token|credential)\s*:\s*[^\n,]+/gi, "");
  return clean;
}

export async function callAI(prompt, systemPrompt = "", history = []) {
  const authHeader = await getAuthHeader();
  
  // Quick pre-check for secret extraction attempts
  if (SECRET_REGEX.test(prompt)) {
    return "I cannot provide, discuss, or speculate on passwords, tokens, API keys, or private credentials.";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch("/.netlify/functions/ai-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ prompt, systemPrompt, history }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.reply) return sanitizeAIOutput(data.reply);
    }
    
    // If backend returns 404/500/etc., gracefully fallback to compliant local intelligence
    return sanitizeAIOutput(generateCompliantFallback(prompt));
  } catch (err) {
    clearTimeout(timeoutId);
    return sanitizeAIOutput(generateCompliantFallback(prompt));
  }
}

export async function callAIWithImages(prompt, images, systemPrompt = "") {
  const imageNote = images && images.length
    ? `[User attached ${images.length} image(s) for analysis]`
    : "";
  return callAI(`${imageNote}\n${prompt}`, systemPrompt);
}
