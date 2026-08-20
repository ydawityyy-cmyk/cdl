// CDL — modules/ai_chat.js
import { callAI } from "./ai_engine.js";
import { getSystemPrompt } from "./ai_roles.js";
import { AI_MSG_LIMITS, SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";
import { ROLES } from "./roles.js";

async function getMsgCountFromSupabase(user) {
  if (!user) return 0;
  const today = new Date().toDateString();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_limits?user_id=eq.${user.id}&date=eq.${today}&select=count`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return 0;
    const rows = await res.json();
    if (rows.length > 0) {
      return rows[0].count;
    }
    return 0;
  } catch (e) {
    console.error('[AI] getMsgCountFromSupabase error:', e);
    return 0;
  }
}

async function updateMsgCountInSupabase(user, count) {
  if (!user) return;
  const today = new Date().toDateString();
  try {
    // First, check if a record exists for today
    const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_limits?user_id=eq.${user.id}&date=eq.${today}&select=id`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) return;
    const rows = await res.json();
    if (rows.length > 0) {
      // Update existing record
      await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_limits?id=eq.${rows[0].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ count })
      });
    } else {
      // Insert new record
      await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_limits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, date: today, count })
      });
    }
  } catch (e) {
    console.error('[AI] updateMsgCountInSupabase error:', e);
  }
}

let _user = null;
let _history = [];
let _msgCount = 0;
let _handlersAttached = false;
const TODAY_KEY = () => `cdl_ai_msgs_${_user?.id}_${new Date().toDateString()}`;

export async function initAIChat(user, container) {
  _user = user;
  const limit = AI_MSG_LIMITS[user.role] ?? 0;
  if (limit > 0) {
    _msgCount = await getMsgCountFromSupabase(user);
    setupChatHandlers(container);
    loadHistory();
  } else {
    _msgCount = 0;
    setupChatHandlers(container);
  }
}

function setupChatHandlers(container) {
  if (_handlersAttached) return;
  _handlersAttached = true;
  document.addEventListener("click", (e) => { if (e.target.id === "ai-send" || e.target.closest("#ai-send")) sendMessage(); });
  document.addEventListener("keydown", (e) => { if (e.target.id === "ai-input" && e.key === "Enter") sendMessage(); });
  const root = container || document;
  setTimeout(() => {
    const sendBtn = root.querySelector("#ai-send");
    const input = root.querySelector("#ai-input");
    if (sendBtn && input) { sendBtn.addEventListener("click", sendMessage); input.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); }); }
  }, 100);
}

async function sendMessage() {
  if (!_user) return;
  const limit = AI_MSG_LIMITS[_user.role] ?? 0;
  if (limit !== Infinity && _msgCount >= limit) {
    appendMsg("system", `Daily limit of ${limit} messages reached. Resets tomorrow.`);
    return;
  }
  const input = document.getElementById("ai-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  appendMsg("user", text);
  const thinking = appendMsg("ai", "✦ Thinking…", true);
  _msgCount++;
  await updateMsgCountInSupabase(_user, _msgCount);
  const systemPrompt = getSystemPrompt(_user);
  
  // Pass clean history array and pure text prompt
  const recentHistory = _history.slice(-10).map(m => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content
  }));

  try {
    const reply = await callAI(text, systemPrompt, recentHistory);
    thinking.remove();
    appendMsg("ai", reply);
    _history.push({ role: "user", content: text }, { role: "ai", content: reply });
    saveHistory();
  } catch (err) {
    thinking.remove();
    appendMsg("system", `Error: ${err.message}`);
  }
}

function formatMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.*$)/gim, '<h4 style="color:var(--text-100);font-size:14px;font-weight:700;margin:8px 0 4px 0;">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="color:var(--text-100);font-size:15px;font-weight:700;margin:10px 0 6px 0;">$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:var(--text-100);font-weight:600;">$1</strong>')
    .replace(/^• (.*$)/gim, '<div style="display:flex;gap:6px;margin:3px 0;"><span style="color:var(--gold);">•</span><span>$1</span></div>')
    .replace(/\n/g, '<br>');
  return html;
}

function appendMsg(role, text, temp = false) {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return document.createElement("div");
  const div = document.createElement("div");
  const isUser = role === "user";
  const isSystem = role === "system";
  div.style.cssText = `max-width:88%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.6;${
    isUser
      ? "align-self:flex-end;background:var(--gold);color:#0a0c10;border-radius:12px 12px 2px 12px;font-weight:500;"
      : isSystem
      ? "align-self:center;background:rgba(231,76,60,0.1);color:#e74c3c;font-size:12px;border-radius:8px;"
      : "align-self:flex-start;background:var(--bg-600);border:1px solid var(--border);color:var(--text-200);border-radius:12px 12px 12px 2px;"
  }`;
  
  if (isUser || isSystem || temp) {
    div.textContent = text;
  } else {
    div.innerHTML = formatMarkdown(text);
  }
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function loadHistory() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_history?user_id=eq.${_user.id}&agent_type=eq.main&limit=1`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    const rows = await res.json();
    if (rows.length && rows[0].messages) { _history = rows[0].messages.slice(-10); const container = document.getElementById("ai-chat-messages"); if (container && _history.length) _history.forEach(m => appendMsg(m.role, m.content)); }
  } catch {}
}

async function saveHistory() {
  if (!_user || _history.length === 0) return;
  try {
    const existing = await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_history?user_id=eq.${_user.id}&agent_type=eq.main&select=id`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }).then(r => r.json()).catch(() => []);
    const payload = { user_id: _user.id, agent_type: "main", messages: _history.slice(-20), updated_at: new Date().toISOString() };
    if (existing.length > 0) { await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_history?id=eq.${existing[0].id}`, { method: "PATCH", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify(payload) }); } else { await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_history`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: "return=minimal" }, body: JSON.stringify(payload) }); }
  } catch (err) { console.error("[AI] saveHistory error:", err); }
}

window._aiClearChat = async function() {
  _history = [];
  const container = document.getElementById("ai-chat-messages");
  if (container) {
    container.innerHTML = "";
    const welcome = document.createElement("div");
    welcome.style.cssText = "align-self:flex-start;background:var(--bg-600);border:1px solid var(--border);color:var(--text-200);border-radius:12px 12px 12px 2px;padding:10px 14px;font-size:13px;";
    welcome.innerHTML = "✦ Chat cleared. How can I help you with site inventory, shelf-life, or logistics today?";
    container.appendChild(welcome);
  }
  
  if (_user) {
    try {
      localStorage.removeItem(TODAY_KEY());
      await fetch(`${SUPABASE_URL}/rest/v1/agent_chat_history?user_id=eq.${_user.id}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      });
    } catch(e) {
      console.warn('[AI] Clear history sync:', e.message);
    }
  }
};
