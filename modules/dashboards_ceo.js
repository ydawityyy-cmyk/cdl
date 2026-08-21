// CDL — modules/dashboards_ceo.js
// CEO: Sci-fi control center, company-wide pulse, approval queue
import { supabase, SITES, LOGO_URL } from "../config.js";
import { callAI } from "./ai_engine.js";
import { getSystemPrompt } from "./ai_roles.js";
import { initAIChat } from "./ai_chat.js";

export async function renderCEODashboard(container, user) {
  container.innerHTML = `
    <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:11px;color:var(--accent-blue);letter-spacing:3px;text-transform:uppercase;margin-bottom:6px;">
          ◈ COMMAND CENTER
        </div>
        <h1 style="font-family:var(--font-display);font-size:26px;font-weight:800;">
          CEO Dashboard
        </h1>
      </div>
      <img src="${LOGO_URL}" style="height:40px;object-fit:contain;opacity:0.8;" onerror="this.style.display='none'" />
    </div>

    <!-- KPIs -->
    <div id="ceo-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:24px;"></div>

    <!-- Grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr 340px;gap:20px;">
      <!-- Site comparison -->
      <div class="card">
        <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px;">🏗 Site Comparison</h3>
        <div style="position:relative;height:220px;"><canvas id="ceo-site-chart" height="220" style="width:100%;height:220px;"></canvas></div>
      </div>
      <!-- Approval queue -->
      <div class="card">
        <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px;">✅ Approval Queue</h3>
        <div id="ceo-approvals">Loading…</div>
      </div>
      <!-- AI Chat -->
      <div class="card" style="display:flex;flex-direction:column;height:440px;">
        <h3 style="font-family:var(--font-display);font-size:14px;margin-bottom:12px;color:var(--accent-blue);">◈ CEO Intelligence</h3>
        <div id="ai-chat-messages" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
        <div style="display:flex;gap:8px;">
          <input id="ai-input" type="text" placeholder="Ask…"
            style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:9px;color:var(--text-primary);font-size:13px;"
            onfocus="this.style.borderColor='var(--accent-blue)'" onblur="this.style.borderColor='var(--border)'" />
          <button id="ai-send" style="background:var(--accent-blue);border:none;border-radius:8px;padding:9px 14px;color:#fff;font-weight:700;cursor:pointer;">→</button>
        </div>
      </div>
    </div>`;

  // Matched order in Promise.all and destructuring:
  // 1: sites, 2: stock, 3: procurement, 4: transfers
  const [sitesRes, stockRes, procRes, transRes] = await Promise.all([
    supabase.from("sites").select("id,name,is_active"),
    supabase.from("stock").select("site_id,quantity,unit_price").limit(500),
    supabase.from("procurement").select("*").in("status", ["pending", "pm_approved", "am_approved"]).limit(50),
    supabase.from("transfers").select("id,status").in("status", ["pending", "source_pm_approved", "dest_pm_approved"]).limit(30),
  ]);

  const liveSites = sitesRes.data || [];
  const stock = stockRes.data || [];
  const procurement = procRes.data || [];
  const transfers = transRes.data || [];

  const activeSitesCount = liveSites.length ? liveSites.filter(s => s.is_active !== false).length : SITES.length;
  const totalVal = stock.reduce((s,i)=>s+((Number(i.quantity)||0)*(Number(i.unit_price)||0)),0);

  document.getElementById("ceo-kpis").innerHTML = [
    {icon:"💰",label:"Portfolio Value",val:`KES ${(totalVal/1e6).toFixed(1)}M`,c:"var(--accent-gold)"},
    {icon:"🛒",label:"Procurement Queue",val:procurement.length,c:"var(--accent-orange)"},
    {icon:"🚚",label:"Active Transfers",val:transfers.length,c:"var(--accent-blue)"},
    {icon:"🏗",label:"Active Sites",val:activeSitesCount,c:"var(--accent-green)"},
  ].map(k=>`<div class="card" style="border-top:2px solid ${k.c};padding:16px;text-align:center;">
    <div style="font-size:22px;margin-bottom:8px;">${k.icon}</div>
    <div style="font-size:22px;font-weight:700;color:${k.c};font-family:var(--font-display);">${k.val}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${k.label}</div>
  </div>`).join("");

  const approvalEl = document.getElementById("ceo-approvals");
  if (approvalEl) {
    approvalEl.innerHTML = procurement.length ? procurement.slice(0,6).map(p=>{
      const supplier = p.supplier || (Array.isArray(p.items) && p.items[0]?.name) || "Purchase Order";
      const amount = Number(p.total_amount) || 0;
      const status = p.status || "pending";
      return `
      <div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;color:var(--text-primary);">${supplier}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
          <span style="font-size:12px;color:var(--accent-gold);">KES ${amount.toLocaleString()}</span>
          <span style="font-size:11px;background:rgba(61,142,248,0.1);color:var(--accent-blue);padding:1px 8px;border-radius:10px;">${status.replace(/_/g, " ")}</span>
        </div>
      </div>`;
    }).join("") : `<div style="color:var(--accent-green);padding:20px;text-align:center;font-size:13px;">✓ No pending approvals</div>`;
  }

  setTimeout(()=>{
    if (typeof Chart === "undefined") return;
    const cv = document.getElementById("ceo-site-chart");
    if (!cv) return;
    if (cv._chart) {
      cv._chart.destroy();
      cv._chart = null;
    }
    const sitesToChart = liveSites.length ? liveSites : SITES;
    const vals = sitesToChart.map(s=>stock.filter(i=>i.site_id===s.id).reduce((a,i)=>a+((Number(i.quantity)||0)*(Number(i.unit_price)||0)),0));
    try {
      cv._chart=new Chart(cv,{type:"bar",data:{
        labels:sitesToChart.map(s=>(s.name||"Site").split(" ")[0]),
        datasets:[{data:vals,backgroundColor:"rgba(61,142,248,0.5)",borderColor:"var(--accent-blue)",borderWidth:1,borderRadius:4}]
      },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{y:{grid:{color:"rgba(255,255,255,0.04)"},ticks:{color:"#8892a0"}},x:{grid:{display:false},ticks:{color:"#8892a0",font:{size:10}}}}}});
    } catch(e) { console.error("[CEO Chart]",e); }
  },100);

  initAIChat(user);
}
