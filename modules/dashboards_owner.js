// CDL — modules/dashboards_owner.js
// Company Owner: cinematic, AI greeting, full enterprise intelligence
import { supabase, SITES } from "../config.js";
import { callAI } from "./ai_engine.js";
import { getSystemPrompt } from "./ai_roles.js";
import { initAIChat } from "./ai_chat.js";

export async function renderOwnerDashboard(container, user) {
  container.innerHTML = `
    <div style="margin-bottom:28px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="font-size:12px;color:var(--accent-gold);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">
            ✦ EXECUTIVE COMMAND CENTER
          </div>
          <h1 style="font-family:var(--font-display);font-size:28px;font-weight:800;color:var(--text-primary);">
            Welcome back, ${user.name.split(" ")[0]}
          </h1>
          <p style="color:var(--text-secondary);margin-top:4px;">
            ${new Date().toLocaleDateString("en-KE",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          </p>
        </div>
        <button onclick="window.triggerOwnerBrief()" class="btn btn-gold" style="gap:8px;">
          ✦ Get AI Brief
        </button>
      </div>
    </div>

    <!-- KPI strip -->
    <div id="owner-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px;">
      <div class="card" style="text-align:center;padding:16px;animation:fadeIn .4s ease;">
        <div class="spinner" style="margin:0 auto;"></div>
      </div>
    </div>

    <!-- Main grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr 380px;gap:20px;margin-bottom:24px;">
      <!-- Site health grid -->
      <div class="card">
        <h3 style="font-family:var(--font-display);font-size:15px;font-weight:600;margin-bottom:16px;">
          🏗 Site Health Scores
        </h3>
        <div id="owner-site-grid"></div>
      </div>

      <!-- Leakage alerts -->
      <div class="card">
        <h3 style="font-family:var(--font-display);font-size:15px;font-weight:600;margin-bottom:16px;color:var(--accent-red);">
          🚨 Procurement Alerts
        </h3>
        <div id="owner-alerts">
          <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:30px;">
            Scanning for anomalies…
          </div>
        </div>
      </div>

      <!-- AI Chat -->
      <div class="card" style="display:flex;flex-direction:column;height:480px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          
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
          <span style="color:var(--text-300);font-size:11px;">20 msgs/day</span>
        </div>
      </div>
          <span id="ai-msg-counter" style="font-size:11px;color:var(--text-muted);
            background:var(--bg-secondary);padding:2px 8px;border-radius:12px;"></span>
        </div>
        <div id="ai-chat-messages" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;">
          <input id="ai-input" type="text" placeholder="Ask anything…"
            style="flex:1;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);font-size:13px;"
            onfocus="this.style.borderColor='var(--accent-gold)'" onblur="this.style.borderColor='var(--border)'" />
          <button id="ai-send" style="background:var(--accent-gold);border:none;border-radius:8px;padding:10px 14px;color:#0a0c10;font-weight:700;cursor:pointer;">→</button>
        </div>
      </div>
    </div>

    <!-- Bottom row: spend chart + recent -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card">
        <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:16px;">📊 Stock Value by Site</h3>
        <div style="position:relative;height:220px;"><canvas id="owner-chart" height="200" style="width:100%;height:220px;"></canvas></div>
      </div>
      <div class="card">
        <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:16px;">⚡ Live Activity</h3>
        <div id="owner-activity" style="font-size:13px;color:var(--text-secondary);">Loading…</div>
      </div>
    </div>

    <!-- Feature 1: Cross-Site Inventory Summary -->
    <div class="card" style="margin-top:20px;">
      <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:16px;">🌐 Cross-Site Inventory Summary</h3>
      <div id="owner-cross-site" style="overflow-x:auto;font-size:12px;"></div>
    </div>

    <!-- Feature 4: Discrepancy Alerts -->
    <div class="card" style="margin-top:20px;">
      <h3 style="font-family:var(--font-display);font-size:15px;margin-bottom:16px;color:var(--accent-red);">⚠️ Automated Discrepancy Flags</h3>
      <div id="owner-discrepancies" style="font-size:12px;"></div>
    </div>

    <!-- AI Brief Modal trigger -->
    <div id="owner-brief-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);
      z-index:400;display:none;align-items:center;justify-content:center;backdrop-filter:blur(6px);">
      <div style="background:var(--bg-card);border:1px solid var(--accent-gold);border-radius:20px;
        padding:36px;max-width:640px;width:92%;max-height:80vh;overflow-y:auto;position:relative;">
        <button onclick="document.getElementById('owner-brief-modal').style.display='none'"
          style="position:absolute;top:16px;right:16px;background:transparent;border:none;
          color:var(--text-muted);cursor:pointer;font-size:20px;">✕</button>
        <div style="font-size:11px;color:var(--accent-gold);letter-spacing:2px;margin-bottom:12px;">
          ✦ EXECUTIVE BRIEF
        </div>
        <div id="brief-content" style="color:var(--text-secondary);font-size:14px;line-height:1.8;white-space:pre-wrap;"></div>
      </div>
    </div>`;

  // Load data in parallel
  const [stockRes, reqRes, incRes, grnRes, procRes] = await Promise.all([
    supabase.from("stock").select("site_id,material_name,quantity,unit,unit_price,last_updated").limit(1000),
    supabase.from("material_requests").select("id,urgency,site_id").eq("status", "pending").limit(100),
    supabase.from("incidents").select("id,estimated_value,type").eq("status", "pending").limit(50),
    supabase.from("grns").select("id").eq("status", "pending").limit(50),
    supabase.from("procurement").select("id,total_amount").in("status", ["pending", "pm_approved"]).limit(50),
  ]);
  const stock = stockRes.data || [];
  const requests = reqRes.data || [];
  const incidents = incRes.data || [];
  const grns = grnRes.data || [];
  const procurement = procRes.data || [];

  const totalVal = stock.reduce((s,i)=>s+((i.quantity||0)*(i.unit_price||0)),0);
  const lowStock = stock.filter(i=>(i.quantity||0)<10 && (i.quantity||0)>0).length;
  const critReqs = requests.filter(r=>r.urgency==="critical").length;
  const incVal   = incidents.reduce((s,i)=>s+(i.estimated_value||0),0);
  const procVal  = procurement.reduce((s,p)=>s+(p.total_amount||0),0);

  // KPIs
  document.getElementById("owner-kpis").innerHTML = [
    {icon:"💰",label:"Portfolio Value",  val:`KES ${(totalVal/1e6).toFixed(1)}M`, color:"var(--accent-gold)"},
    {icon:"⚠️",label:"Low Stock Items", val:lowStock,                             color:"var(--accent-orange)"},
    {icon:"🚨",label:"Critical Requests",val:critReqs,                            color:"var(--accent-red)"},
    {icon:"📦",label:"Pending GRNs",    val:grns.length,                          color:"var(--accent-blue)"},
    {icon:"💸",label:"Incident Losses", val:`KES ${incVal.toLocaleString()}`,     color:"var(--accent-red)"},
    {icon:"🛒",label:"Open Procurement", val:`KES ${procVal.toLocaleString()}`,    color:"var(--accent-purple)"},
  ].map(k=>`
    <div class="card" style="border-left:3px solid ${k.color};padding:16px;animation:fadeIn .4s ease;">
      <div style="font-size:22px;margin-bottom:8px;">${k.icon}</div>
      <div style="font-size:20px;font-weight:700;color:${k.color};font-family:var(--font-display);">${k.val}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${k.label}</div>
    </div>`).join("");

  // Site health grid
  const siteEl = document.getElementById("owner-site-grid");
  if (siteEl) {
    siteEl.innerHTML = SITES.map(site => {
      const siteStock = stock.filter(i=>i.site_id===site.id);
      const low = siteStock.filter(i=>(i.quantity||0)<10).length;
      const pending = requests.filter(r=>r.site_id===site.id).length;
      const score = Math.max(0, 100 - low*5 - pending*3);
      const grade = score>=90?"A":score>=75?"B":score>=60?"C":score>=40?"D":"F";
      const gc = score>=90?"var(--accent-green)":score>=75?"var(--accent-gold)":score>=60?"var(--accent-orange)":"var(--accent-red)";
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:18px;font-weight:800;color:${gc};font-family:var(--font-display);width:24px;">${grade}</div>
        <div style="flex:1;">
          <div style="font-size:12px;color:var(--text-primary);">${site.name}</div>
          <div style="background:var(--bg-secondary);border-radius:3px;height:3px;margin-top:4px;">
            <div style="background:${gc};width:${score}%;height:3px;border-radius:3px;"></div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);">${score}/100</div>
      </div>`;
    }).join("");
  }

  // Alerts panel — incident types
  const alertEl = document.getElementById("owner-alerts");
  if (alertEl) {
    if (!incidents.length) {
      alertEl.innerHTML = `<div style="color:var(--accent-green);font-size:13px;text-align:center;padding:20px;">✓ No active incidents</div>`;
    } else {
      const types = {};
      incidents.forEach(i=>{ types[i.type]=(types[i.type]||0)+1; });
      alertEl.innerHTML = Object.entries(types).map(([t,c])=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <span style="color:var(--text-secondary);font-size:13px;text-transform:capitalize;">${t}</span>
          <span style="background:rgba(231,76,60,0.1);color:var(--accent-red);padding:2px 10px;border-radius:12px;font-size:12px;">${c}</span>
        </div>`).join("") +
        `<div style="margin-top:12px;font-size:13px;color:var(--accent-red);">
          Est. loss: KES ${incVal.toLocaleString()}
        </div>`;
    }
  }

  // Activity feed
  const actEl = document.getElementById("owner-activity");
  if (actEl) {
    const items = [...requests.slice(0,3).map(r=>`📋 Critical request · Site ${r.site_id}`),
      ...incidents.slice(0,2).map(i=>`🚨 ${i.type} incident · KES ${i.estimated_value||"?"}`),
      ...grns.slice(0,2).map(()=>`📦 GRN pending verification`)];
    actEl.innerHTML = items.length ? items.map(i=>`
      <div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;">${i}</div>`
    ).join("") : `<div style="color:var(--accent-green);padding:20px;text-align:center;">✓ All clear</div>`;
  }

  // Feature 1: Cross-Site Inventory Summary
  const csEl = document.getElementById("owner-cross-site");
  if (csEl) {
    const byMat = {};
    stock.forEach(i => {
      const key = i.material_name || "Unnamed";
      if (!byMat[key]) byMat[key] = {qty:0, val:0, sites:new Set(), unit:i.unit||""};
      byMat[key].qty += (i.quantity||0);
      byMat[key].val += ((i.quantity||0)*(i.unit_price||0));
      byMat[key].sites.add(i.site_id);
    });
    const sorted = Object.entries(byMat).sort((a,b)=>b[1].val-a[1].val).slice(0,15);
    csEl.innerHTML = sorted.length ? `<table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="border-bottom:1px solid var(--border);">
        ${["Material","Total Qty","Unit","Total Value","Sites"].map(h=>`<th style="text-align:left;padding:7px 6px;color:var(--text-muted);font-weight:500;font-size:11px;text-transform:uppercase;">${h}</th>`).join("")}
      </tr></thead>
      <tbody>${sorted.map(([name,d])=>`<tr style="border-bottom:1px solid rgba(30,35,48,0.3);">
        <td style="padding:7px 6px;color:var(--text-primary);font-weight:500;">${name}</td>
        <td style="padding:7px 6px;color:var(--text-primary);">${d.qty}</td>
        <td style="padding:7px 6px;color:var(--text-muted);">${d.unit||"–"}</td>
        <td style="padding:7px 6px;color:var(--accent-gold);">KES ${d.val.toLocaleString()}</td>
        <td style="padding:7px 6px;color:var(--text-secondary);">${d.sites.size}/${SITES.length}</td>
      </tr>`).join("")}</tbody></table>` : `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No stock data</div>`;
  }

  // Feature 4: Automated Discrepancy Flagging
  const discEl = document.getElementById("owner-discrepancies");
  if (discEl) {
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const flags = [];
    stock.forEach(i => {
      const qty = i.quantity || 0;
      const site = SITES.find(s=>s.id===i.site_id)?.name || `Site ${i.site_id}`;
      const mat = i.material_name || "Unknown";
      if (qty < 0) flags.push({type:"negative",site,mat,msg:`negative quantity (${qty})`});
      if (qty === 0 && i.last_updated) {
        const days = Math.floor((now - new Date(i.last_updated).getTime()) / 86400000);
        if (days > 14) flags.push({type:"potential_out",site,mat,msg:`zero stock for ${days} days`});
      }
      if (i.last_updated && (now - new Date(i.last_updated).getTime()) > STALE_MS) {
        flags.push({type:"stale",site,mat,msg:`stale (last updated ${new Date(i.last_updated).toLocaleDateString("en-KE")})`});
      }
    });
    discEl.innerHTML = flags.length ? `<div style="margin-bottom:8px;font-size:11px;color:var(--accent-red);letter-spacing:1px;text-transform:uppercase;">${flags.length} Issues Found</div>${flags.slice(0,10).map(f=>`
      <div style="padding:6px 8px;margin-bottom:4px;border-radius:6px;background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.2);">
        <span style="color:var(--accent-red);font-weight:600;">●</span> ${f.site} · ${f.mat} · <span style="color:var(--text-secondary);">${f.msg}</span>
      </div>`).join("")}${flags.length>10?`<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">+${flags.length-10} more…</div>`:""}` : `<div style="color:var(--accent-green);font-size:13px;text-align:center;padding:20px;">✓ No discrepancies detected</div>`;
  }

  // Chart
  setTimeout(()=>{
    if (typeof Chart === "undefined") return;
    const cv = document.getElementById("owner-chart");
    if (!cv) return;
    // Destroy existing chart instance to prevent "Canvas is already in use" error
    if (cv._chart) {
      cv._chart.destroy();
      cv._chart = null;
    }
    const vals = SITES.map(s=>stock.filter(i=>i.site_id===s.id).reduce((a,i)=>a+((i.quantity||0)*(i.unit_price||0)),0));
    try {
      cv._chart=new Chart(cv,{type:"bar",data:{
      labels:SITES.map(s=>s.name.split(" ")[0]),
      datasets:[{label:"KES",data:vals,backgroundColor:"rgba(200,169,110,0.5)",
        borderColor:"var(--accent-gold)",borderWidth:1,borderRadius:4}]
    },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{y:{grid:{color:"rgba(255,255,255,0.04)"},ticks:{color:"#8892a0",callback:v=>`${(v/1000).toFixed(0)}K`}},
        x:{grid:{display:false},ticks:{color:"#8892a0",font:{size:10}}}}}});
    } catch(e) { console.error("[Owner Chart]",e); }
  },100);

  // AI Brief handler
  window.triggerOwnerBrief = async () => {
    const modal = document.getElementById("owner-brief-modal");
    const content = document.getElementById("brief-content");
    if (!modal||!content) return;
    modal.style.display = "flex";
    content.textContent = "✦ Generating executive brief…";
    const prompt = getSystemPrompt(user,{stock:stock.length,lowStock,critReqs,incidents:incidents.length,grns:grns.length});
    const brief = await callAI(
      `Generate a concise real-time executive brief for the Company Owner of Canaan Developers Ltd based on today's live data (2026-08-21).
Data: ${stock.length} stock items, ${lowStock} low stock, ${critReqs} critical requests, 
${incidents.length} open incidents (KES ${incVal.toLocaleString()} loss), ${grns.length} unverified GRNs.
Format: 3 sections — STATUS, ALERTS, ACTIONS. Be specific. KES currency.`, prompt);
    content.textContent = brief || "Brief unavailable.";
  };

  initAIChat(user);
}
