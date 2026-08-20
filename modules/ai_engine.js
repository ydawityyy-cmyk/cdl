// CDL — modules/ai_engine.js
// AI calls are routed through the server-side Netlify function /.netlify/functions/ai-chat
// Keys are never exposed to the client browser.
import { supabase } from "../config.js";

async function getAuthHeader() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : null;
  } catch {
    return null;
  }
}

export async function callAI(prompt, systemPrompt = "", history = []) {
  const authHeader = await getAuthHeader();
  
  // Enforce 18-second client-side timeout so thinking indicator never hangs
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18000);

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

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`AI service status ${res.status}: ${err.error || res.statusText}`);
    }
    const data = await res.json();
    return data.reply || "Site intelligence online. What would you like to verify?";
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return "⚠️ AI response timed out while compiling site data. Please try asking again.";
    }
    throw err;
  }
}

export async function callAIWithImages(prompt, images, systemPrompt = "") {
  const imageNote = images && images.length
    ? `[User attached ${images.length} image(s) for analysis]`
    : "";
  return callAI(`${imageNote}\n${prompt}`, systemPrompt);
}
