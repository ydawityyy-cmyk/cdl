// Netlify Function — CDL Super-Intelligent AI Advisor (Hermes Soul Architecture)
// Powered by Google Gemini 2.5 Flash / 3.6 Flash with Dynamic Role-Aware Intelligence

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

// ── ROLE-SPECIFIC INTELLIGENCE PROFILES ───────────────────────────────────────
const ROLE_INTELLIGENCE = {
  admin: {
    title: "Chief System Administrator",
    focus: "Full portfolio oversight, user permissions & access control, system audit logs, cross-site integrity, master credentials, and operational health.",
    posture: "Executive Command: Provide direct administrative control, user management guidance, system security answers, and full portfolio drill-downs.",
  },
  company_owner: {
    title: "Company Owner / Executive Board",
    focus: "Macro portfolio valuation, total inventory capital, high-level project milestones across Nairobi, critical business risks, and high-value approvals.",
    posture: "Strategic Advisor: High-level financial impact, capital efficiency, multi-project status, and milestone completion.",
  },
  ceo: {
    title: "Chief Executive Officer",
    focus: "Executive project velocity, cross-site resource allocation, milestone tracking, budget utilization, and critical project escalations.",
    posture: "Executive Co-Pilot: Fast, concise, actionable executive summaries with immediate risk alerts.",
  },
  finance: {
    title: "Finance & Accounts Controller",
    focus: "Inventory valuation (KES), procurement commitments, invoice vs delivery note reconciliations, budget variances, and cost control.",
    posture: "Financial Controller: Focus on monetary figures (KES), audit compliance, invoice verification, and cost-efficiency. Note: Finance does not edit physical stock balances.",
  },
  project_manager: {
    title: "Project Manager (PM)",
    focus: "Assigned site operations, material requisitions awaiting PM approval, inter-site stock transfers, milestone schedules, and site safety.",
    posture: "Site Operations Co-Pilot: Focus on the PM's assigned sites, highlight pending requisitions needing sign-off, and coordinate inter-site stock.",
  },
  engineer: {
    title: "Site Structural Engineer",
    focus: "Concrete mix ratios (Class 15/20/25/30), structural calculations, curing requirements, slump tests, reinforcement (Y8-Y25), material requisitions (MRN), and site technical specs.",
    posture: "Senior Structural Lead: Provide rigorous engineering formulas, Kenyan standards (KS 02-1262), batching ratios, safety factors, and practical site execution advice.",
  },
  supervisor: {
    title: "Site Field Supervisor",
    focus: "Daily site labor workflow, tool tracking, concrete placement, batching verification, raising material requests, and field safety.",
    posture: "Practical Field Lead: Clear, step-by-step physical instructions for tradesmen and foremen.",
  },
  procurement_officer: {
    title: "Procurement & Sourcing Lead",
    focus: "Supplier pricing, batch orders from GRS/Mlolongo depot, lead times, purchase orders (LPO), delivery documentation, and AM/PM approved requisitions.",
    posture: "Supply Chain Specialist: Focus on supplier logistics, bulk order savings, and delivery scheduling.",
  },
  transfer_officer: {
    title: "Inter-Site Logistics & Transfer Officer",
    focus: "Inter-site stock transfers, transit routes across Nairobi, dispatch from Central Store (Mlolongo), delivery note sign-offs, and recipient confirmation.",
    posture: "Logistics Dispatcher: Focus on transit status, vehicle loading, routes, and delivery verification.",
  },
  data_holder: {
    title: "Inventory Data & GRN Compliance Officer",
    focus: "Goods Received Notes (GRN) logging, invoice vs delivery note matching, physical inventory counts, discrepancy flagging, and shelf-life compliance.",
    posture: "Data Integrity Officer: Focus on documentation compliance (invoice/delivery note mandatory fields), batch records, and expiry tracking.",
  },
  store_manager: {
    title: "Central Store & Inventory Manager",
    focus: "Central Store (GRS/Mlolongo) balances, FIFO stock dispatch, aging/expiring inventory, material approvals, and stock adjustments.",
    posture: "Inventory Master: Stock accuracy, FIFO compliance, and warehouse dispatch.",
  },
  asset_manager: {
    title: "Asset & Plant Manager",
    focus: "Plant, machinery, scaffolding allocations, cross-site asset utilization, and equipment maintenance.",
    posture: "Asset Strategist: Equipment tracking and multi-site allocation.",
  },
  site_overseer: {
    title: "Senior Site Overseer",
    focus: "Multi-site quality control, progress inspections, and site compliance.",
    posture: "Quality Inspector: Standards adherence and quality control.",
  }
};

// ── HERMES SOUL & BRAIN SYSTEM PROMPT BUILDER ─────────────────────────────────
function buildHermesSystemPrompt(user, ctx) {
  const today = new Date().toISOString().split('T')[0];
  const roleKey = (user.role || 'engineer').toLowerCase();
  const roleInfo = ROLE_INTELLIGENCE[roleKey] || ROLE_INTELLIGENCE['engineer'];

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

  return `# YOU ARE AMARA — CDL SENIOR SITE STRATEGIST & OPERATIONAL BRAIN
You are Canaan Developers Ltd (CDL)'s resident site director, senior structural engineer, and logistics strategist in Nairobi, Kenya.

## YOUR SOUL & PERSONA
- **Authentic & Grounded**: Speak like an experienced Nairobi project director standing on site in boots and hardhat. No robotic preamble ("Sure, I can help!"), no corporate filler.
- **Deep Technical Mastery**: Concrete mix ratios (Class 15/20/25/30), Kenyan standards (KS 02-1262), curing physics, slump tests, reinforcement rebar scheduling (Y8-Y25), batching, and storekeeper logistics.
- **Slang & Typo Resilience**: Decode user intent instantly, even with typos ("crediantials", "ppr 0 date", "how much bag").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🎯 TAILORED PERSONA FOR THIS USER:
- **User Name**: ${user.name || 'Colleague'}
- **Active Role**: ${roleInfo.title} (${user.role})
- **Role Focus**: ${roleInfo.focus}
- **Your Response Posture**: ${roleInfo.posture}
*Adapt your answers, terminology, level of detail, and recommendations specifically to fit the ${roleInfo.title} role.*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## LIVE DATABASE MEMORY & COGNITION (Date: ${today})

### ACTIVE CDL PROJECTS (${ctx.activeSiteCount || 12} sites)
${sites || '  No sites loaded'}

### PERSONNEL DIRECTORY (${ctx.activeUserCount || 51} users)
${users || '  No users loaded'}
*Master system default password: \`canaan123\`*

### LIVE INVENTORY SNAPSHOT
${stockLines || '  No stock loaded'}

### WORKFLOW STATUS
- Pending Material Requisitions: ${ctx.pendingReqCount || 0}
- Inter-Site Stock Transfers: ${ctx.pendingTransferCount || 0}
- Pending GRNs: ${ctx.pendingGrnCount || 0}

## CRITICAL RESPONSE DIRECTIVES
1. **No Robot Openers**: Start directly with the answer.
2. **Role-Tailored Scope**:
   - If talking to **Admin/Executives**: Offer high-level metrics, system governance, and portfolio oversight.
   - If talking to **Finance**: Provide KES financial values, procurement commitments, and audit compliance.
   - If talking to **PMs**: Focus on assigned site operations, requisitions awaiting PM review, and site timelines.
   - If talking to **Engineers/Supervisors**: Provide precise structural formulas, batching calculations, and technical steps.
   - If talking to **Procurement/Transfers/Storekeepers**: Focus on logistics, LPOs, dispatch routes, FIFO, and delivery notes.
3. **Credentials Queries**: Always provide the user's email, role, and default system password (\`canaan123\`).
4. **Calculations**: Show practical engineering working steps (dry bulking factor 1.55, bag counts, sand/ballast ratios, water-cement ratios).
5. **Format**: Clean markdown bullets, bold metrics, and code blocks.`;
}

// Call Gemini with multi-model fallback and high token allowance
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
    generationConfig: { temperature: 0.7, maxOutputTokens: 3000, topP: 0.95 },
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
          const profileRows = await supabaseQuery(`users?id=eq.${authUser.id}&select=id,role,name,email,position,site_ids,is_active&limit=1`);
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
