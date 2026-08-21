// CDL — modules/ai_chat.js
import { callAI } from "./ai_engine.js";
import { getSystemPrompt } from "./ai_roles.js";
import { AI_MSG_LIMITS, supabase } from "../config.js";
import { ROLES } from "./roles.js";

async function getMsgCountFromSupabase(user) {
  if (!user) return 0;
  const today = new Date().toDateString();
  try {
    const { data, error } = await supabase
      .from('agent_chat_limits')
      .select('count')
      .eq('user_id', user.id)
      .eq('date', today)
      .limit(1);

    if (error) return 0;
    if (data && data.length > 0) {
      return data[0].count || 0;
    }
    return 0;
  } catch (e) {
    console.warn('[AI] getMsgCountFromSupabase:', e.message);
    return 0;
  }
}

async function updateMsgCountInSupabase(user, count) {
  if (!user) return;
  const today = new Date().toDateString();
  try {
    const { data: existing } = await supabase
      .from('agent_chat_limits')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', today)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('agent_chat_limits')
        .update({ count })
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('agent_chat_limits')
        .insert({ user_id: user.id, date: today, count });
    }
  } catch (e) {
    console.warn('[AI] updateMsgCountInSupabase:', e.message);
  }
}

let _user = null;
let _history = [];
let _msgCount = 0;
let _handlersAttached = false;
const TODAY_KEY = () => `cdl_ai_msgs_${_user?.id}_${new Date().toDateString()}`;

export async function initAIChat(user, container) {
  _user = user;
  _history = [];
  _handlersAttached = false; // reset so new chat can re-attach

  // Ensure _customPerms is populated — query role_permissions if not cached
  if (!_user._customPerms && _user.role) {
    try {
      const { data: perms } = await supabase
        .from('role_permissions')
        .select('permission_key')
        .eq('role_key', _user.role);
      _user._customPerms = (perms || []).map(p => p.permission_key);
    } catch (_) {
      _user._customPerms = [];
    }
  }

  const customPerms = user._customPerms || [];
  const isCustomWithAI = customPerms.includes('ai:access');
  const limit = isCustomWithAI ? 20 : (AI_MSG_LIMITS[user.role] ?? 0);
  const hasAIAccess = limit > 0 || isCustomWithAI;

  if (!hasAIAccess) {
    // Show locked AI card — do not init chat handlers
    const aiSection = container
      ? container.querySelector('#ai-advisor-section, #ai-panel, [id*="ai"]')
      : document.getElementById('ai-advisor-section') || document.querySelector('.ai-advisor');
    if (aiSection) {
      aiSection.innerHTML = `
        <div style="background:var(--bg-700);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center;margin-top:16px;">
          <div style="font-size:32px;margin-bottom:12px;">🔒</div>
          <div style="font-size:15px;font-weight:700;color:var(--text-100);margin-bottom:6px;">AI Advisor — Access Restricted</div>
          <div style="font-size:13px;color:var(--text-300);max-width:360px;margin:0 auto;">
            AI Advisor is available for executive and strategic roles. Contact your administrator if you need access.
          </div>
        </div>`;
    }
    return;
  }

  if (limit > 0) {
    _msgCount = await getMsgCountFromSupabase(user);
  } else {
    _msgCount = 0; // custom role with ai:access — unlimited for now
  }
  setupChatHandlers(container);
  await loadHistory();
}

let _isSending = false;

function setupChatHandlers(container) {
  if (_handlersAttached) return;
  _handlersAttached = true;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#ai-send");
    if (btn) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target && e.target.id === "ai-input" && e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
}

async function sendMessage() {
  if (!_user || _isSending) return;
  const input = document.getElementById("ai-input");
  const text = input ? input.value.trim() : "";
  if (!text) return;

  const customPerms = _user._customPerms || [];
  const isCustomWithAI = customPerms.includes('ai:access');
  const limit = isCustomWithAI ? 20 : (AI_MSG_LIMITS[_user.role] ?? 0);
  if (limit !== Infinity && _msgCount >= limit) {
    appendMsg("system", `Daily limit of ${limit} messages reached. Resets tomorrow.`);
    return;
  }

  _isSending = true;
  input.value = "";
  appendMsg("user", text);
  const thinking = appendMsg("ai", "✦ Thinking…", true);

  try {
    _msgCount++;
    updateMsgCountInSupabase(_user, _msgCount).catch(() => {});
    const systemPrompt = getSystemPrompt(_user);
    
    const recentHistory = _history.slice(-10).map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content
    }));

    const reply = await callAI(text, systemPrompt, recentHistory);
    thinking.remove();
    appendMsg("ai", reply);
    _history.push({ role: "user", content: text }, { role: "ai", content: reply });
    saveHistory().catch(() => {});
  } catch (err) {
    thinking.remove();
    appendMsg("system", `Error: ${err.message}`);
  } finally {
    _isSending = false;
  }
}

function formatMarkdown(text) {
  if (!text) return "";
  
  // 1. Extract code blocks to avoid messing with code internals
  const codeBlocks = [];
  let processed = text.replace(/```([\s\S]*?)```/g, (match, code) => {
    codeBlocks.push(code.trim());
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 2. Escape HTML
  processed = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 3. Headers
  processed = processed
    .replace(/^### (.*$)/gim, '<h4 style="color:var(--text-100);font-size:13px;font-weight:700;margin:8px 0 4px 0;">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="color:var(--text-100);font-size:14px;font-weight:700;margin:10px 0 6px 0;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:3px;">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 style="color:var(--gold);font-size:15px;font-weight:800;margin:12px 0 8px 0;">$1</h2>');

  // 4. Bold & Italics & Inline Code
  processed = processed
    .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:var(--text-100);font-weight:600;">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em style="color:var(--text-200);">$1</em>')
    .replace(/`([^`]+)`/gim, '<code style="background:rgba(212,175,110,0.12);color:var(--gold);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;">$1</code>');

  // 5. Bullet lists (*, -, •)
  processed = processed.replace(/^[\*\-•] (.*$)/gim, '<div style="display:flex;gap:8px;margin:3px 0 3px 4px;"><span style="color:var(--gold);font-weight:bold;">•</span><span style="flex:1;">$1</span></div>');

  // 6. Numbered lists (1., 2., etc.)
  processed = processed.replace(/^(\d+)\. (.*$)/gim, '<div style="display:flex;gap:8px;margin:4px 0 4px 4px;"><span style="color:var(--gold);font-weight:700;min-width:16px;">$1.</span><span style="flex:1;">$2</span></div>');

  // 7. Line breaks
  processed = processed.replace(/\n/g, '<br>');

  // 8. Restore code blocks
  processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (match, idx) => {
    return `<pre style="background:var(--bg-900);border:1px solid var(--border);border-radius:8px;padding:10px 12px;overflow-x:auto;margin:8px 0;font-family:monospace;font-size:12px;color:var(--gold);line-height:1.5;"><code>${codeBlocks[idx]}</code></pre>`;
  });

  return processed;
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
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10);
  return div;
}

async function loadHistory() {
  if (!_user) return;
  try {
    const { data, error } = await supabase
      .from('agent_chat_history')
      .select('messages')
      .eq('user_id', _user.id)
      .limit(1);

    if (error) return;
    if (data && data.length && data[0].messages) {
      _history = (data[0].messages || []).slice(-10);
      const container = document.getElementById("ai-chat-messages");
      if (container && _history.length) {
        container.innerHTML = "";
        _history.forEach(m => appendMsg(m.role, m.content));
      }
    }
  } catch (e) {
    console.warn('[AI] loadHistory:', e.message);
  }
}

async function saveHistory() {
  if (!_user || _history.length === 0) return;
  try {
    const { data: existing } = await supabase
      .from('agent_chat_history')
      .select('id')
      .eq('user_id', _user.id)
      .limit(1);

    const payload = {
      user_id: _user.id,
      agent_type: "main",
      messages: _history.slice(-20),
      updated_at: new Date().toISOString()
    };

    if (existing && existing.length > 0) {
      await supabase
        .from('agent_chat_history')
        .update(payload)
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('agent_chat_history')
        .insert(payload);
    }
  } catch (err) {
    console.warn("[AI] saveHistory error:", err.message);
  }
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
      await supabase
        .from('agent_chat_history')
        .delete()
        .eq('user_id', _user.id);
    } catch(e) {
      console.warn('[AI] Clear history sync:', e.message);
    }
  }
};
