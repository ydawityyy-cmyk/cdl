// CDL — modules/dashboards_finance.js
// Finance: Budget vs actual, spend trends, NO inventory edit buttons.
import { supabase, SITES, LOGO_URL } from "../config.js";
import { initAIChat } from "./ai_chat.js";

export async function renderFinanceDashboard(container, user) {
  container.innerHTML = `
    <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:11px;color:var(--accent-orange);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">
          💰 FINANCIAL INTELLIGENCE
        </div>
        <h1 style="font-family:var(--font-display);font-size:26px;font-weight:800;">Finance Dashboard</h1>
        <p style="color:var(--text-muted);font-size:12px;margin-top:4px;">Read-only · No inventory editing</p>
      </div>
      <img src="${LOGO_URL}" style="height:40px;object-fit:contain;opacity:0.8;" onerror="this.style.display='none'" />
    </div>
    <div id="fin-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px;"></div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:20px;">
      <div class="card">
        <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px;">📊 Stock Value by Site</h3>
        <div style="position:relative;height:220px;"><canvas id="fin-chart" height="220" style="width:100%;height:220px;"></canvas></div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 style="font-family:var(--font-display);font-size:15px;">💸 Procurement Spend</h3>
          <button onclick="window.exportFinanceCSV()" class="btn btn-ghost" style="font-size:12px;padding:6px 14px;">⬇ CSV</button>
        </div>
        <div id="fin-spend">Loading…</div>
      </div>
    </div>
    <div class="card">
      <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:14px;">🧾 Recent Procurement</h3>
      <div id="fin-procurement" style="overflow-x:auto;"></div>
    </div>`;

  const [stockRes, procurementRes, incidentsRes] = await Promise.all([
    supabase.from("stock").select("site_id,quantity,unit_price").limit(500),
    supabase.from("procurement").select("*").order("created_at.desc").limit(100),
    supabase.from("incidents").select("estimated_value,type").limit(100),
  ]);
  const stock = stockRes.data || [];
  const procurement = procurementRes.data || [];
  const incidents = incidentsRes.data || [];

  const totalVal = stock.reduce((s,i)=>s+((i.quantity||0)*(i.unit_price||0)),0);
  const procTotal = procurement.reduce((s,p)=>s+(p.total_amount||0),0);
  const incTotal = incidents.reduce((s,i)=>s+(i.estimated_value||0),0);
  const approved = procurement.filter(p=>["finance_approved","completed"].includes(p.status));

  document.getElementById("fin-kpis").innerHTML = [
    {icon:"💰",label:"Portfolio Value",val:`KES ${(totalVal/1e6).toFixed(2)}M`,c:"var(--accent-gold)"},
    {icon:"🛒",label:"Total Procurement",val:`KES ${(procTotal/1e6).toFixed(2)}M`,c:"var(--accent-orange)"},
    {icon:"✅",label:"Approved Spend",val:`KES ${(approved.reduce((s,p)=>s+(p.total_amount||0),0)/1000).toFixed(0)}K`,c:"var(--accent-green)"},
    {icon:"🚨",label:"Incident Losses",val:`KES ${incTotal.toLocaleString()}`,c:"var(--accent-red)"},
  ].map(k=>`<div class="card" style="border-left:3px solid ${k.c};padding:16px;">
    <div style="font-size:20px;margin-bottom:6px;">${k.icon}</div>
    <div style="font-size:20px;font-weight:700;color:${k.c};font-family:var(--font-display);">${k.val}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${k.label}</div>
  </div>`).join("");

  // Spend by site
  const spendEl = document.getElementById("fin-spend");
  if (spendEl) {
    const bysite = {};
    procurement.forEach(p=>{ bysite[p.site_id]=(bysite[p.site_id]||0)+(p.total_amount||0); });
    spendEl.innerHTML = Object.entries(bysite).slice(0,6).map(([sid,val])=>`
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span style="color:var(--text-secondary);">${SITES.find(s=>s.id==sid)?.name||`Site ${sid}`}</span>
          <span style="color:var(--accent-gold);">KES ${val.toLocaleString()}</span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:3px;height:4px;">
          <div style="background:var(--accent-gold);width:${Math.min(100,(val/procTotal||0)*100)}%;height:4px;border-radius:3px;"></div>
        </div>
      </div>`).join("") || `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No spend data</div>`;
  }

  // Procurement table (read-only — no action buttons per spec)
  const procEl = document.getElementById("fin-procurement");
  if (procEl) {
    procEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="border-bottom:1px solid var(--border);">
        ${["Supplier","Site","Amount (KES)","Status","Date"].map(h=>`<th style="text-align:left;padding:8px;color:var(--text-muted);">${h}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${procurement.slice(0,15).map(p=>`<tr style="border-bottom:1px solid rgba(30,35,48,0.5);">
          <td style="padding:8px;color:var(--text-primary);">${p.supplier||"–"}</td>
          <td style="padding:8px;color:var(--text-secondary);">${SITES.find(s=>s.id===p.site_id)?.name||"–"}</td>
          <td style="padding:8px;color:var(--accent-gold);">${(p.total_amount||0).toLocaleString()}</td>
          <td style="padding:8px;"><span style="padding:2px 8px;border-radius:10px;font-size:11px;background:rgba(200,169,110,0.1);color:var(--accent-gold);">${p.status}</span></td>
          <td style="padding:8px;color:var(--text-muted);">${new Date(p.created_at).toLocaleDateString("en-KE")}</td>
        </tr>`).join("")}
      </tbody></table>`;
  }

  setTimeout(()=>{
    if (typeof Chart==="undefined") return;
    const cv=document.getElementById("fin-chart"); if(!cv) return;
    // Destroy existing chart instance to prevent "Canvas is already in use" error
    if (cv._chart) {
      cv._chart.destroy();
      cv._chart = null;
    }
    const vals=SITES.map(s=>stock.filter(i=>i.site_id===s.id).reduce((a,i)=>a+((i.quantity||0)*(i.unit_price||0)),0));
    try {
      cv._chart=new Chart(cv,{type:"doughnut",data:{labels:SITES.map(s=>s.name.split(" ")[0]),
        datasets:[{data:vals,backgroundColor:["#c8a96e","#3d8ef8","#2ecc71","#e74c3c","#f39c12","#9b59b6","#1abc9c","#e67e22","#34495e","#16a085","#8e44ad"],borderWidth:0}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"right",labels:{color:"#8892a0",font:{size:10},boxWidth:10}}}}});
    } catch(e) { console.error("[Finance Chart]",e); }
  },100);

  // AI Chat for Finance (7 msgs/day per spec)
  if (!document.getElementById('ai-input')) {
    const aiDiv = document.createElement('div');
    aiDiv.className = 'card';
    aiDiv.style.cssText = 'margin-top:20px;';
    aiDiv.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:700;color:var(--gold);">✦ AI Advisor</span>
          <span style="background:rgba(212,175,110,0.12);color:var(--gold);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;">Live Sync</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="window._aiClearChat()" title="Start a fresh chat conversation"
            style="background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text-200);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;"
            onmouseenter="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-200)'">
            ✨ New Chat / Clear
          </button>
          <span style="color:var(--text-300);font-size:11px;">7 msgs/day</span>
        </div>
      </div>
      <div id="ai-chat-messages" style="height:360px;min-height:240px;max-height:550px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="ai-input" type="text" placeholder="Ask about finance, budget, spend…"
          style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;" />
        <button id="ai-send" class="btn btn-gold btn-sm">→</button>
      </div>`;
    container.appendChild(aiDiv);
  }
  if (typeof initAIChat === 'function') initAIChat(user);

  window.exportFinanceCSV = () => {
    const rows = procurement.map(p=>({
      Supplier:p.supplier||"",
      Site:SITES.find(s=>s.id===p.site_id)?.name||"",
      Amount:p.total_amount||0, Status:p.status,
      Date:new Date(p.created_at).toLocaleDateString("en-KE")
    }));
    const csv = [Object.keys(rows[0]||{}).join(","),
      ...rows.map(r=>Object.values(r).map(v=>`"${v}"`).join(","))].join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`cdl_finance_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };
}
