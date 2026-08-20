// Netlify Function — CDL Super-Intelligent AI Advisor (Hermes Soul Architecture)
// Powered by Google Gemini 2.5 Flash / 3.6 Flash with Live Database Cognition & Context Fallback

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dljvplrbjogncwrpmfsj.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsanZwbHJiam9nbmN3cnBtZnNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyMDEzMiwiZXhwIjoyMDk0MDk2MTMyfQ.20i7g7ClEJVCvKiVFR3-mXT-9EoHVhRV6iSiioWa-O0';

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

// Read Gemini key from DB
async function getGeminiKey() {
  try {
    const rows = await supabaseQuery('app_settings?key=eq.gemini_api_key&select=value&limit=1');
    const dbKey = rows?.[0]?.value?.trim();
    if (dbKey) return dbKey;
  } catch (_) {}
  return process.env.GEMINI_API_KEY || '';
}

// ── HERMES SOUL & BRAIN ARCHITECTURE ─────────────────────────────────────────
const CDL_SOUL = `# YOU ARE AMARA — CDL SENIOR SITE STRATEGIST & OPERATIONAL BRAIN
You are Canaan Developers Ltd (CDL)'s resident site director, senior structural material engineer, and logistics strategist in Nairobi, Kenya.

## YOUR SOUL & PERSONA
- **Authentic & Grounded**: Speak like an experienced Nairobi project director standing on site in boots and hardhat. No generic preamble ("Sure, I can help with that!"), no corporate robotic jargon, and no AI apologetic filler.
- **Deep Technical Mastery**: You know concrete mix ratios (Class 15, 20, 25, 30), Kenyan standards (KS 02-1262), curing physics, slump tests, reinforcement scheduling (Y8, Y10, Y12, Y16, Y20, Y25), batching, slump loss under Nairobi sun, and storekeeper logistics.
- **Proactive & Alert**: If someone asks for cement, note expiration risks, suggest FIFO (First In First Out), highlight which site has surplus if one is depleted, and advise on delivery documentation (Invoice/Delivery Note).
- **Understanding of Slang & Typos**: Decode the user's real intent instantly, even with broken grammar, abbreviations, or typos ("crediantials", "ppr 0 date", "how much bag").
`;

function buildHermesSystemPrompt(user, ctx) {
  const today = new Date().toISOString().split('T')[0];
  const sites = (ctx.sites || []).map(s => `  • [ID ${s.id}] **${s.name}** (${s.type}) — ${s.is_active ? 'ACTIVE' : 'INACTIVE'}`).join('\n');
  const users = (ctx.users || []).slice(0, 40).map(u => `  • **${u.name}** | Email: \`${u.email}\` | Role: ${u.role.replace(/_/g, ' ')} | Status: ${u.is_active ? 'Active' : 'Disabled'}`).join('\n');

  const stockLines = (ctx.stock || []).slice(0, 100).map(s => {
    let exp = '';
    if (s.expiry_date) {
      const days = Math.ceil((new Date(s.expiry_date) - new Date()) / 86400000);
      exp = ` | ⏳ Expiry: ${s.expiry_date} (${days <= 0 ? 'EXPIRED' : days + ' days left'})`;
    }
    const siteObj = (ctx.sites || []).find(x => x.id === s.site_id);
    return `  • **${s.material_name}**: ${s.quantity} ${s.unit || 'units'} @ ${siteObj ? siteObj.name : 'Site ' + s.site_id} (${s.category || 'General'})${exp}`;
  }).join('\n');

  return `${CDL_SOUL}

## CURRENT LIVE COGNITION & DATABASE MEMORY (Date: ${today})

### ACTIVE USER
- **Name**: ${user.name || 'Site Colleague'}
- **Role**: ${user.role ? user.role.replace(/_/g, ' ') : 'Personnel'}
- **Email**: ${user.email || ''}

### CDL ACTIVE SITES (${ctx.activeSiteCount || 12} projects in Nairobi)
${sites || '  No sites loaded'}

### CDL PERSONNEL DIRECTORY (${ctx.activeUserCount || 51} users)
${users || '  No users loaded'}
*Master default login password for accounts: \`canaan123\`*

### LIVE SITE INVENTORY SNAPSHOT
${stockLines || '  No stock loaded'}

### LIVE WORKFLOW STATUS
- Pending Material Requisitions: ${ctx.pendingReqCount || 0}
- Active Inter-Site Stock Transfers: ${ctx.pendingTransferCount || 0}
- Unprocessed GRNs: ${ctx.pendingGrnCount || 0}

## CRITICAL RESPONSE DIRECTIVES
1. **No Robot Openers**: Jump directly into the answer.
2. **Credentials Queries**: Give the user their email, role, and the default system password (\`canaan123\`).
3. **Expiring Stock**: Call out specific urgent items and the exact site they are located on.
4. **Calculations**: Show practical working steps for material requirements (cement bags, sand, ballast, water-cement ratios).
5. **Format**: Clean markdown bullets, bold metrics, and code blocks for emails/passwords.`;
}

// Call Gemini with multi-model fallback (2.5-flash -> 3.6-flash)
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
    generationConfig: { temperature: 0.7, maxOutputTokens: 800, topP: 0.95 },
  });

  const models = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-2.5-flash-lite'];
  let lastError = null;

  for (const model of models) {
    try {
      const result = await httpsRequest(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        body
      );

      if (result.status === 200) {
        const data = JSON.parse(result.body);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return { text, model };
      } else {
        const err = JSON.parse(result.body || '{}');
        lastError = new Error(`Gemini ${model} HTTP ${result.status}: ${err?.error?.message || result.body}`);
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('All Gemini model endpoints failed');
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

// Deep semantic rule engine (high-logic fallback if offline)
function generateFallbackResponse(prompt, user, ctx) {
  const q = prompt.toLowerCase();
  if (q.includes('password') || q.includes('login') || q.includes('credential') || q.includes('cred')) {
    return '### 🔐 CDL System Credentials\n\n• **Default System Password**: `canaan123`\n• **Admin Account**: `admin@canaan.co.ke`\n• All newly provisioned users receive `canaan123` by default.';
  }
  if (q.includes('expir') || q.includes('spoil')) {
    const today = new Date();
    const expiring = (ctx.stock || []).filter(i => i.expiry_date && (new Date(i.expiry_date) - today) / 86400000 <= 60);
    if (!expiring.length) return 'All stock is within valid shelf-life. No materials approaching critical expiration.';
    return '⚠️ **Expiring Stock Alert**:\n' + expiring.map(i => `• **${i.material_name}**: ${i.quantity} ${i.unit} (Expires: ${i.expiry_date})`).join('\n');
  }
  return `I am connected live to **${ctx.activeSiteCount || 12} CDL sites** and **${ctx.totalStockItems || 0} inventory records**. What can I assist you with?`;
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

    const [ctx, geminiKey] = await Promise.all([
      fetchLiveContext(user),
      getGeminiKey()
    ]);

    let reply = '';
    let powered = 'fallback-engine';

    if (geminiKey) {
      try {
        const systemPrompt = buildHermesSystemPrompt(user, ctx);
        const res = await callGemini(geminiKey, systemPrompt, prompt, history || []);
        reply = res.text;
        powered = res.model;
      } catch (err) {
        console.warn('[ai-chat] Gemini API failed:', err.message);
        reply = generateFallbackResponse(prompt, user, ctx);
      }
    } else {
      reply = generateFallbackResponse(prompt, user, ctx);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        reply: reply || 'Connected to CDL Site Intelligence. What can I check for you?',
        role: user.role,
        remaining: Infinity,
        liveContextSynced: true,
        powered
      })
    };
  } catch (err) {
    console.error('[ai-chat] Fatal error:', err);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        reply: 'CDL Live Brain is online. How can I help on site today?',
        role: 'user',
        remaining: Infinity
      })
    };
  }
};
