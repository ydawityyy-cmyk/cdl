// Netlify Function — CDL AI Advisor with Gemini Intelligence + Live DB Context
// POST /.netlify/functions/ai-chat { prompt, history }

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dljvplrbjogncwrpmfsj.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve({ status: res.statusCode, headers: res.headers, body: data }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function supabaseQuery(tablePath) {
  const url = `${SUPABASE_URL}/rest/v1/${tablePath}`;
  const result = await httpsRequest(url, {
    method: 'GET',
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' }
  });
  if (result.status >= 400) return [];
  try { return JSON.parse(result.body); } catch { return []; }
}

// Read Gemini key from DB (admin updates via dashboard)
async function getGeminiKey() {
  try {
    const rows = await supabaseQuery('app_settings?key=eq.gemini_api_key&select=value&limit=1');
    const dbKey = rows?.[0]?.value?.trim();
    if (dbKey) return dbKey;
  } catch (_) {}
  return process.env.GEMINI_API_KEY || '';
}

// Call Gemini 2.0 Flash Lite with full live context injected
async function callGemini(apiKey, systemPrompt, userPrompt, history = []) {
  const contents = [
    ...history.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    })),
    { role: 'user', parts: [{ text: userPrompt }] }
  ];

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.65, maxOutputTokens: 600, topP: 0.9 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  });

  const result = await httpsRequest(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    body
  );

  if (result.status !== 200) {
    const err = JSON.parse(result.body || '{}');
    throw new Error(`Gemini ${result.status}: ${err?.error?.message || result.body}`);
  }

  const data = JSON.parse(result.body);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Build Gemini system prompt with all live data injected
function buildSystemPrompt(user, ctx) {
  const today = new Date();

  const sitesStr = (ctx.sites || [])
    .map(s => `• ${s.name} (${s.type}, ${s.is_active ? 'Active' : 'Inactive'})`).join('\n');

  const usersStr = (ctx.users || []).slice(0, 40)
    .map(u => `• ${u.name} | ${u.email} | ${u.role.replace(/_/g,' ')} | ${u.is_active ? 'Active' : 'Disabled'}`).join('\n');

  const stockStr = (ctx.stock || []).slice(0, 100).map(s => {
    let exp = '';
    if (s.expiry_date) {
      const d = Math.ceil((new Date(s.expiry_date) - today) / 86400000);
      exp = ` | ${d <= 0 ? 'EXPIRED' : 'Expires in ' + d + 'd'} (${s.expiry_date})`;
    }
    const site = (ctx.sites || []).find(x => x.id === s.site_id);
    return `• ${s.material_name}: ${s.quantity} ${s.unit || 'units'} @ ${site ? site.name : 'Site '+s.site_id} (${s.category || 'General'})${exp}`;
  }).join('\n');

  return `You are the CDL AI Advisor for Canaan Developers Ltd — a smart, friendly, and highly knowledgeable construction site management assistant based in Nairobi, Kenya.

You have LIVE real-time access to the CDL database. Use it to answer questions accurately and specifically.

== CURRENT USER ==
Name: ${user.name || 'User'} | Role: ${(user.role || '').replace(/_/g,' ')} | Email: ${user.email || ''}

== ACTIVE SITES (${ctx.activeSiteCount || 0}) ==
${sitesStr || 'None loaded'}

== TEAM (${ctx.activeUserCount || 0} active) ==
${usersStr || 'None loaded'}
Default password for ALL accounts: canaan123

== LIVE INVENTORY (${ctx.totalStockItems || 0} items, showing 100) ==
${stockStr || 'None loaded'}

== PENDING OPERATIONS ==
• Material Requests: ${ctx.pendingReqCount || 0} pending
• Inter-site Transfers: ${ctx.pendingTransferCount || 0} pending
• GRNs awaiting approval: ${ctx.pendingGrnCount || 0}

== INSTRUCTIONS ==
- Respond naturally and conversationally, like a knowledgeable site manager
- Use the live data above to give specific, accurate answers
- When asked for user credentials/login: provide email + default password canaan123
- For expiring items: calculate from today's date (${today.toISOString().split('T')[0]}) and highlight urgent ones
- For stock questions: look up from the inventory above and give quantities and locations
- Format nicely with **bold** for names and numbers
- Keep responses concise (3-8 lines) unless detail is needed
- If a question is completely unrelated to CDL operations, politely redirect
- NEVER invent data — only use what's provided above`;
}

async function fetchLiveContext(user) {
  try {
    const [sites, users, stock, requests, grns, transfers] = await Promise.all([
      supabaseQuery('sites?select=id,name,type,is_active&order=id.asc'),
      supabaseQuery('users?select=id,name,email,role,position,site_ids,is_active&order=name.asc'),
      supabaseQuery('stock?select=id,site_id,material_name,quantity,unit,category,unit_price,production_date,expiry_date,last_updated&order=last_updated.desc.nullslast&limit=1000'),
      supabaseQuery('material_requests?select=id,site_id,status,urgency,created_at,items&limit=50'),
      supabaseQuery('grns?select=id,site_id,grn_number,invoice_number,status,total_value,supplier,created_at,items&limit=30'),
      supabaseQuery('transfers?select=id,from_site_id,to_site_id,status,created_at,material_name,quantity&limit=30')
    ]);
    const activeSites = (sites || []).filter(s => s.is_active);
    const activeUsers = (users || []).filter(u => u.is_active);
    const pendingReqs = (requests || []).filter(r => r.status === 'pending');
    return {
      sites: sites || [], activeSiteCount: activeSites.length,
      users: users || [], activeUserCount: activeUsers.length,
      stock: stock || [], totalStockItems: (stock || []).length,
      pendingReqs, pendingReqCount: pendingReqs.length,
      pendingGrns: (grns || []).filter(g => g.status === 'pending'),
      pendingGrnCount: (grns || []).filter(g => g.status === 'pending').length,
      pendingTransfers: (transfers || []).filter(t => t.status === 'pending'),
      pendingTransferCount: (transfers || []).filter(t => t.status === 'pending').length,
    };
  } catch (err) {
    console.warn('[ai-chat] Context fetch error:', err.message);
    return {};
  }
}

function generateDeepReasoning(prompt, user, ctx, history = []) {
  // Normalize input - handle typos, punctuation, extra spaces
  const rawQ = prompt.trim();
  const q = rawQ.toLowerCase()
    .replace(/[^a-z0-9\s@\.]/g, ' ')  // strip punctuation except @ and .
    .replace(/\s+/g, ' ')
    .trim();

  // Smart intent scoring — each intent has weighted keyword matches
  function score(keywords) {
    let s = 0;
    for (const kw of keywords) {
      if (q.includes(kw)) s += kw.length; // longer match = stronger signal
    }
    return s;
  }

  const userName = user.name ? user.name.split(' ')[0] : 'there';
  const stock = ctx.stock || [];
  const sites = ctx.sites || [];
  const users = ctx.users || [];

  const siteName = (id) => {
    const s = sites.find(x => x.id === id);
    return s ? s.name : `Site ${id}`;
  };

  // ── INTENT SCORES ──────────────────────────────────────────────
  const credScore   = score(['password','credential','crediantial','cred','login','access','sign in','username','account info','log in','passw']);
  const userScore   = score(['user','team','personnel','staff','employee','who are','roster','member','how many user','list user','all user']);
  const expiryScore = score(['expir','shelf','perish','spoil','old stock','aging','due date','expire','expiry','best before','use by']);
  const lowStockScore = score(['low stock','shortage','running low','reorder','depleted','out of stock','critical stock','less than','minimum']);
  const sitesScore  = score(['site','project','location','all project','show site','list site','our project','how many site','active project']);
  const transferScore = score(['transfer','transit','dispatch','move stock','inter.site']);
  const requestScore  = score(['request','approval','mrn','requisition','pending request','material request','order']);
  const greetScore    = score(['hello','hi ','hey','status','help me','how are','what can','good morning','good afternoon']);
  const technicalScore = score(['concrete','mix ratio','curing','slump','grade','rebar','column','slab','beam','foundation','cement ratio','water cement']);
  const costScore = score(['cost','price','value','worth','budget','ksh','kes','money','spend','spent','expensive']);

  // ── SPECIFIC USER LOOKUP (by name or email in query) ──────────
  const mentionedUser = users.find(u => {
    if (!u.name && !u.email) return false;
    const nameWords = (u.name || '').toLowerCase().split(' ').filter(w => w.length > 2);
    const email = (u.email || '').toLowerCase();
    return nameWords.some(w => q.includes(w)) || (email && q.includes(email.split('@')[0]));
  });

  if (mentionedUser && (credScore > 0 || q.includes('info') || q.includes('detail') || q.includes('for ') || q.includes('about'))) {
    const u = mentionedUser;
    const siteList = Array.isArray(u.site_ids) && u.site_ids.length > 0
      ? u.site_ids.map(id => siteName(id)).join(', ')
      : 'All Sites';
    return `Here are the details for **${u.name}**:\n\n• **Email / Username**: \`${u.email}\`\n• **Role**: ${u.role.replace(/_/g, ' ')}\n• **Position**: ${u.position || '—'}\n• **Sites**: ${siteList}\n• **Status**: ${u.is_active ? '✅ Active' : '⏸️ Disabled'}\n\n🔐 **Default Login Password**: \`canaan123\`\n*(Administrators can reset the password via **Manage Users → Edit User**)*`;
  }

  // ── SPECIFIC MATERIAL SEARCH (do this BEFORE site match to avoid "site" word clashing) ──
  const materialKeywords = q.split(' ').filter(w => w.length > 2 && !['what','where','how','show','tell','about','many','much','the','and','for','are','are','have','item','give','need','site','project','stock','all','our','does','that','this','with','from','which','they'].includes(w));
  const matchedMaterials = materialKeywords.length > 0 ? stock.filter(item => {
    const name = (item.material_name || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    return materialKeywords.some(k => name.includes(k) || cat.includes(k));
  }) : [];

  // ── SPECIFIC SITE LOOKUP ───────────────────────────────────────
  const matchedSite = sites.find(s => {
    const sn = s.name.toLowerCase();
    const parts = sn.split(' ').filter(w => w.length > 3);
    return parts.some(p => q.includes(p));
  });

  // ── INTENT ROUTING (by highest score) ─────────────────────────
  const maxScore = Math.max(credScore, userScore, expiryScore, lowStockScore, sitesScore, transferScore, requestScore, greetScore, technicalScore, costScore);

  // ── CREDENTIALS / PASSWORD ────────────────────────────────────
  if (credScore >= 4 && credScore === maxScore) {
    return `### 🔐 CDL System Access & Credentials\n\n• **Default System Password** (all accounts): \`canaan123\`\n• **Admin Email**: \`admin@canaan.co.ke\`\n• **Data Holder**: \`dh@canaan.co.ke\` / \`canaan123\`\n• **CEO**: \`ceo@canaan.co.ke\` / \`canaan123\`\n• **Owner**: \`owner@canaan.co.ke\` / \`canaan123\`\n\n💡 All user accounts provisioned through **Manage Users** are assigned the default password \`canaan123\` automatically.\n\nAdmins can reset or disable any account from the **Manage Users** dashboard.`;
  }

  // ── USERS / TEAM ──────────────────────────────────────────────
  if (userScore > 3 && (userScore >= credScore || credScore < 4)) {
    const roleCounts = {};
    users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });
    const breakdown = Object.entries(roleCounts).sort((a,b) => b[1]-a[1])
      .map(([r, c]) => `• **${r.replace(/_/g,' ').toUpperCase()}**: ${c}`).join('\n');
    const sample = users.slice(0, 6).map(u => `• **${u.name}** (${u.email}) — ${u.role.replace(/_/g,' ')}`).join('\n');
    return `We have **${ctx.activeUserCount || users.length} active team members** across all CDL sites:\n\n### 👥 By Role:\n${breakdown}\n\n### Sample Accounts:\n${sample}\n\n*(Full list in **Manage Users**)*`;
  }

  // ── EXPIRING STOCK ────────────────────────────────────────────
  if (expiryScore > 3) {
    const today = new Date();
    const expiring = stock
      .filter(i => i.expiry_date)
      .map(i => ({ ...i, daysLeft: Math.ceil((new Date(i.expiry_date) - today) / 86400000) }))
      .filter(i => i.daysLeft <= 60)
      .sort((a,b) => a.daysLeft - b.daysLeft);

    if (expiring.length === 0) return `All good! No materials are within the critical 60-day expiration window across any of our ${ctx.activeSiteCount} sites.\n\n*(PPR pipes, steel rebar, timber, and aggregates are non-perishable — they don't expire.)*`;

    const list = expiring.slice(0, 8).map(i => {
      const flag = i.daysLeft < 0 ? `❌ Expired ${Math.abs(i.daysLeft)}d ago`
        : i.daysLeft <= 7 ? `🔴 CRITICAL — expires in ${i.daysLeft} days (${i.expiry_date})`
        : i.daysLeft <= 30 ? `🟠 Expiring in ${i.daysLeft} days (${i.expiry_date})`
        : `🟡 Expiring in ${i.daysLeft} days (${i.expiry_date})`;
      return `• **${i.material_name}** — ${i.quantity} ${i.unit || 'units'} @ **${siteName(i.site_id)}**\n  ${flag}`;
    }).join('\n\n');

    return `I found **${expiring.length} item(s)** approaching or past their expiry date:\n\n${list}\n\n💡 Recommend using or transferring urgent batches to high-consumption sites immediately.`;
  }

  // ── LOW STOCK / SHORTAGE ──────────────────────────────────────
  if (lowStockScore > 3) {
    const low = stock.filter(i => parseFloat(i.quantity) > 0 && parseFloat(i.quantity) <= 15);
    if (!low.length) return `Stock levels look healthy across all sites — no critical shortages detected right now.`;
    const list = low.slice(0, 8).map(i => `• **${i.material_name}**: only **${i.quantity} ${i.unit || 'units'}** left @ ${siteName(i.site_id)}`).join('\n');
    return `⚠️ **${low.length} items** are running low across our sites:\n\n${list}\n\nWould you like to raise a material requisition or arrange a transfer from the Central Store?`;
  }

  // ── SITE-SPECIFIC LOOKUP ──────────────────────────────────────
  if (matchedSite) {
    const siteStock = stock.filter(i => i.site_id === matchedSite.id);
    const siteReqs = (ctx.pendingReqs || []).filter(r => r.site_id === matchedSite.id);
    const stockList = siteStock.length
      ? siteStock.slice(0, 8).map(i => `• **${i.material_name}**: ${i.quantity} ${i.unit || 'units'}`).join('\n') + (siteStock.length > 8 ? `\n• *...and ${siteStock.length - 8} more*` : '')
      : 'No active materials recorded yet.';
    return `### 📍 ${matchedSite.name}\n\n• **Type**: ${matchedSite.type}\n• **Status**: ${matchedSite.is_active ? '✅ Active' : '⏸️ Inactive'}\n• **Open Requests**: ${siteReqs.length}\n• **Inventory Lines**: ${siteStock.length}\n\n**Stock on Site:**\n${stockList}`;
  }

  // ── COST / VALUE ───────────────────────────────────────────────
  if (costScore > 3) {
    const totalValue = stock.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0)), 0);
    const bySite = {};
    stock.forEach(i => {
      const sn = siteName(i.site_id);
      bySite[sn] = (bySite[sn] || 0) + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0));
    });
    const breakdown = Object.entries(bySite).sort((a,b) => b[1]-a[1]).slice(0, 5)
      .map(([s, v]) => `• **${s}**: KES ${v.toLocaleString()}`).join('\n');
    return `Our total live inventory value across all sites is **KES ${totalValue.toLocaleString()}**\n\n### Top Sites by Value:\n${breakdown}`;
  }

  // ── ALL SITES ─────────────────────────────────────────────────
  if (sitesScore > 3 && matchedMaterials.length === 0) {
    const list = sites.map(s => `• **${s.name}** — ${s.type} (${s.is_active ? 'Active' : 'Inactive'})`).join('\n');
    return `CDL is managing **${ctx.activeSiteCount || sites.length} active projects** across Nairobi:\n\n${list}\n\nAll sites share the central inventory and requisition network.`;
  }

  // ── TRANSFERS ─────────────────────────────────────────────────
  if (transferScore > 3) {
    const t = ctx.pendingTransfers || [];
    return `There are **${t.length} inter-site transfer(s)** currently in transit or awaiting confirmation.\n\nAll transfers go through central dispatch at GRS/Mlolongo. You can track and approve them in the **Transfers** module.`;
  }

  // ── MATERIAL REQUESTS ─────────────────────────────────────────
  if (requestScore > 3) {
    const r = ctx.pendingReqs || [];
    return `We have **${r.length} pending material request(s)** awaiting PM review.\n\nYou can review, approve, or issue them from the **Requests** tab.`;
  }

  // ── TECHNICAL GUIDANCE ────────────────────────────────────────
  if (technicalScore > 3) {
    return `### 🏗️ CDL Technical Standards\n\n**Concrete Mix Ratios:**\n• Class 15 (1:3:6) — Blinding, non-structural\n• Class 20 (1:2:4) — Standard columns, beams, slabs\n• Class 25/30 (1:1.5:3) — Heavy structural, water-retaining\n\n**Curing:** Minimum 7–14 days wet curing (burlap/ponding)\n**Slump Test:** 50–75mm for pumpable structural concrete`;
  }

  // ── GREETING / STATUS ─────────────────────────────────────────
  if (greetScore > 2) {
    return `Hi ${userName}! I'm your CDL Site & Inventory Advisor, connected live to all ${ctx.activeSiteCount || 12} project sites.\n\nCurrently tracking **${ctx.totalStockItems || 0} stock items** across **${ctx.activeSiteCount || 12} sites** with **${ctx.pendingReqCount || 0} pending requests**.\n\nYou can ask me about expiring materials, stock levels, user credentials, site inventories, transfers, costs, or any construction technical question!`;
  }

  // ── MATERIAL KEYWORD SEARCH ───────────────────────────────────
  if (matchedMaterials.length > 0) {
    const list = matchedMaterials.slice(0, 8).map(m =>
      `• **${m.material_name}**: **${m.quantity} ${m.unit || 'units'}** @ **${siteName(m.site_id)}** (${m.category || 'General'})`
    ).join('\n');
    return `I found **${matchedMaterials.length} matching record(s)** in our live inventory:\n\n${list}${matchedMaterials.length > 8 ? `\n\n*...and ${matchedMaterials.length - 8} more records*` : ''}\n\nLet me know if you need to requisition or transfer any of these!`;
  }

  // ── SMART DEFAULT — try to infer intent from question words ───
  const isQuestion = q.includes('what') || q.includes('how') || q.includes('who') || q.includes('where') || q.includes('when') || q.includes('which') || q.includes('is there') || q.includes('do we') || q.includes('can i');
  if (isQuestion) {
    return `I'm not sure I caught that exactly — I'm connected live to all **${ctx.activeSiteCount || 12} CDL sites** and **${ctx.totalStockItems || 0} stock records**.\n\nTry asking me:\n• *"What item is going to expire?"*\n• *"How many users do we have?"*\n• *"What is the stock at Aura Peponi?"*\n• *"Show me low stock items"*\n• *"What are the credentials for [name]?"*\n• *"What is the total inventory value?"*`;
  }

  // Last resort — at least show live context
  return `I checked our live system — we're currently managing **${ctx.activeSiteCount || 12} sites**, **${ctx.activeUserCount || 0} personnel**, and **${ctx.totalStockItems || 0} material records**.\n\nCould you rephrase? I can help with inventory, expiring items, user credentials, transfers, costs, and more.`;
}



exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    let user = { role: 'admin', name: 'User', id: null };

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwt = authHeader.slice(7);
      try {
        const userRes = await httpsRequest(`${SUPABASE_URL}/auth/v1/user`, {
          method: 'GET',
          headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        });
        if (userRes.status === 200) {
          const authUser = JSON.parse(userRes.body);
          const profileRows = await supabaseQuery(`users?id=eq.${authUser.id}&select=id,role,name,email,is_active&limit=1`);
          if (profileRows.length) user = { ...profileRows[0], id: authUser.id };
          else user = { ...user, id: authUser.id };
        }
      } catch (_) {}
    }

    const { prompt, history } = JSON.parse(event.body || '{}');
    if (!prompt || typeof prompt !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Prompt is required' })
      };
    }

    // Fetch live context AND Gemini key in parallel
    const [ctx, geminiKey] = await Promise.all([
      fetchLiveContext(user),
      getGeminiKey()
    ]);

    let reply = '';

    // Try Gemini first if key available
    if (geminiKey) {
      try {
        const systemPrompt = buildSystemPrompt(user, ctx);
        reply = await callGemini(geminiKey, systemPrompt, prompt, history || []);
      } catch (geminiErr) {
        console.warn('[ai-chat] Gemini failed, using rule engine:', geminiErr.message);
        reply = generateDeepReasoning(prompt, user, ctx, history || []);
        reply += '\n\n*Note: AI reasoning engine active — AI upgrade available once API key is configured.*';
      }
    } else {
      // No Gemini key — use intelligent rule engine
      reply = generateDeepReasoning(prompt, user, ctx, history || []);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        reply: reply || 'I am online and monitoring all CDL construction sites. What would you like to check?',
        role: user.role,
        remaining: Infinity,
        liveContextSynced: true,
        powered: geminiKey ? 'gemini-2.0-flash-lite' : 'cdl-rule-engine'
      })
    };
  } catch (err) {
    console.error('[ai-chat] Handler error:', err);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        reply: 'I am online and monitoring all CDL sites and stock balances. What would you like to check?',
        role: 'user',
        remaining: Infinity
      })
    };
  }
};
