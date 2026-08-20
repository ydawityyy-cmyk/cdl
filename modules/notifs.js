// CDL Site Management — modules/notifs.js
// Notification system: realtime polling, rendering, sending, and read management.

import { supabase } from "../config.js";

let _user = null;
let _interval = null;

export function initNotifs(user) {
  _user = user;
  pollNotifs();
  if (_interval) clearInterval(_interval);
  _interval = setInterval(pollNotifs, 15000);

  // Realtime subscription for incoming notifications
  try {
    supabase
      .channel('public:notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new && (payload.new.user_id === user.id || !payload.new.user_id)) {
          pollNotifs();
        }
      })
      .subscribe();
  } catch (e) {
    console.warn('[notifs] Realtime subscription fallback:', e.message);
  }
}

export async function pollNotifs() {
  if (!_user) return;

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', _user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    _renderList(data || []);
    _updateBadge((data || []).length);
  } catch (err) {
    console.warn('[notifs] poll failed:', err.message);
  }
}

export async function sendNotif(userId, title, body, type = 'info', refId = null, refTable = null) {
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      title,
      body,
      type,
      ref_id: refId,
      ref_table: refTable,
      is_read: false
    });
  } catch (err) {
    console.error('[notifs] send failed:', err.message);
  }
}

window._markRead = async function (id) {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    pollNotifs();
  } catch (err) {
    console.warn('[notifs] markRead failed:', err.message);
  }
};
window.markRead = window._markRead;

window._markAllRead = async function () {
  if (!_user) return;
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', _user.id);
    pollNotifs();
  } catch (err) {
    console.warn('[notifs] markAllRead failed:', err.message);
  }
};
window.markAllRead = window._markAllRead;

window._toggleNotifPanel = function () {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = isHidden ? 'block' : 'none';
  if (isHidden) pollNotifs();
};

function _renderList(notifs) {
  const el = document.getElementById('notif-list');
  if (!el) return;

  if (!notifs.length) {
    el.innerHTML = `<p style="color:var(--text-300);font-size:13px;text-align:center;padding:24px 0;">No unread notifications</p>`;
    return;
  }

  el.innerHTML = notifs.map(n => `
    <div onclick="window._markRead('${n.id}')" style="background:var(--bg-700);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;transition:border-color 0.2s;" onmouseenter="this.style.borderColor='var(--gold)'" onmouseleave="this.style.borderColor='var(--border)'">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span style="font-weight:600;font-size:13px;color:var(--text-100);">${n.title}</span>
        <span style="font-size:10px;color:var(--text-300);">${_timeAgo(n.created_at)}</span>
      </div>
      <p style="font-size:12px;color:var(--text-200);margin:0;line-height:1.4;">${n.body || ''}</p>
    </div>
  `).join('');
}

function _updateBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function _timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
