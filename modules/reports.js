// CDL — modules/reports.js — Authenticated Reports & Analytics Engine
import { supabase, SITES } from "../config.js";
import { ROLES } from "./roles.js";
import { showToast } from "../app.js";

const ALL_REQUESTS_STATUSES = ["pending","pm_approved","pm_rejected","reserved","issued","collected","completed","returned","expired","cancelled"];
const ALL_TRANSFER_STATUSES = ["pending","source_pm_approved","dest_pm_approved","am_approved","preparing","picked_up","in_transit","delivered","received","completed","rejected","expired"];

export async function renderReports(container, user) {
  const roleInfo = ROLES[user.role] || {};
  const siteFilter = roleInfo.siteScope === "assigned" ? (user.site_ids || []) : SITES.map(s => s.id);

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <h1 style="font-size:24px;font-weight:700;">Reports & Analytics</h1>
      <p style="color:var(--text-200);font-size:14px;">Export data, analyse trends, generate summaries</p>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <select id="rpt-site" style="background:var(--bg-600);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-100);font-size:13px;">
        <option value="">All Sites</option>
        ${SITES.filter(s => siteFilter.includes(s.id)).map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
      </select>
      <select id="rpt-days" style="background:var(--bg-600);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-100);font-size:13px;">
        <option value="7">Last 7 days</option>
        <option value="30" selected>Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="365">Last 12 months</option>
        <option value="0">All time</option>
      </select>
      <button onclick="window._rptRefresh()" class="btn btn-ghost" style="font-size:12px;">↻ Refresh Data</button>
    </div>

    <!-- Charts Row 1 -->
    <div id="charts-row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div class="card">
        <h3 style="font-size:14px;margin-bottom:12px;">📊 Request Status Breakdown</h3>
        <div style="position:relative;height:220px;"><canvas id="chart-requests"></canvas></div>
      </div>
      <div class="card">
        <h3 style="font-size:14px;margin-bottom:12px;">🚚 Transfer Pipeline</h3>
        <div style="position:relative;height:220px;"><canvas id="chart-transfers"></canvas></div>
      </div>
    </div>

    <!-- Charts Row 2 -->
    <div id="charts-row2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div class="card">
        <h3 style="font-size:14px;margin-bottom:12px;">📦 Stock by Category</h3>
        <div style="position:relative;height:220px;"><canvas id="chart-stock-cat"></canvas></div>
      </div>
      <div class="card">
        <h3 style="font-size:14px;margin-bottom:12px;">💰 Monthly Spend (Procurement)</h3>
        <div style="position:relative;height:220px;"><canvas id="chart-procurement"></canvas></div>
      </div>
    </div>

    <!-- Report Cards with 1-Click Interactive Downloads -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:28px;">
      ${[
        {type:"stock",icon:"📦",label:"Stock Report",desc:"All materials by site, category, value",fn:"genStockReport",color:"var(--blue)"},
        {type:"requests",icon:"📋",label:"Requests Report",desc:"All material requests with status timeline",fn:"genRequestsReport",color:"var(--orange)"},
        {type:"transfers",icon:"🚚",label:"Transfers Report",desc:"Transfer pipeline and completion stats",fn:"genTransfersReport",color:"var(--green)"},
        {type:"grns",icon:"🏗",label:"GRN Report",desc:"Goods received by supplier and site",fn:"genGRNReport",color:"var(--purple)"},
        {type:"incidents",icon:"🚨",label:"Incidents Report",desc:"All incidents, values, and PM decisions",fn:"genIncidentsReport",color:"var(--red)"},
        {type:"procurement",icon:"💰",label:"Procurement Report",desc:"Purchase requests and approval chain",fn:"genProcurementReport",color:"var(--gold)"},
        {type:"reconciliation",icon:"⚖️",label:"Reconciliation Report",desc:"Weekly cross-site stock reconciliation",fn:"genReconciliationReport",color:"var(--teal)"}
      ].map(r => `
        <div class="card" style="border-left:3px solid ${r.color};padding:18px;display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
              <div style="font-size:24px;">${r.icon}</div>
              <button onclick="window.${r.fn}()" class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 10px;">👁 Preview</button>
            </div>
            <div style="font-size:14px;font-weight:600;color:var(--text-100);margin-bottom:4px;">${r.label}</div>
            <div style="font-size:12px;color:var(--text-200);margin-bottom:14px;">${r.desc}</div>
          </div>
          <div style="display:flex;gap:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;">
            <button onclick="window._quickDownload('${r.type}','excel')" class="btn btn-gold btn-sm" style="flex:1;font-size:11px;font-weight:600;padding:6px 10px;">⬇ Excel</button>
            <button onclick="window._quickDownload('${r.type}','csv')" class="btn btn-ghost btn-sm" style="flex:1;font-size:11px;font-weight:600;padding:6px 10px;border:1px solid var(--border);">⬇ CSV</button>
          </div>
        </div>
      `).join("")}
    </div>

    <!-- Preview Container -->
    <div id="report-preview" class="card" style="display:none;margin-top:20px;"></div>
  `;

  window._quickDownload = async (type, format) => {
    showToast("Generating " + type + " report for download…", "info");
    if (type === "reconciliation") {
      await genReconciliationReport(user);
      const r = window._reportData?.["reconciliation"];
      if (r && r.length) {
        if (format === "excel") exportExcel(r, "reconciliation");
        else exportCSV(r, "reconciliation");
      }
      return;
    }

    try {
      const days = parseInt(document.getElementById("rpt-days")?.value || 30);
      const specificSite = document.getElementById("rpt-site")?.value || "";
      const dateFrom = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;

      let query = null;
      if (type === "stock") {
        query = supabase.from("stock").select("*, sites(name)").order("material_name", { ascending: true });
        if (specificSite) query = query.eq("site_id", specificSite);
        else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
      } else if (type === "requests") {
        query = supabase.from("material_requests").select("*, sites(name)").order("created_at", { ascending: false });
        if (specificSite) query = query.eq("site_id", specificSite);
        else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
        if (dateFrom) query = query.gte("created_at", dateFrom);
      } else if (type === "transfers") {
        query = supabase.from("transfers").select("*").order("created_at", { ascending: false });
        if (dateFrom) query = query.gte("created_at", dateFrom);
      } else if (type === "grns") {
        query = supabase.from("grns").select("*, sites(name)").order("created_at", { ascending: false });
        if (specificSite) query = query.eq("site_id", specificSite);
        else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
        if (dateFrom) query = query.gte("created_at", dateFrom);
      } else if (type === "incidents") {
        query = supabase.from("incidents").select("*, sites(name)").order("created_at", { ascending: false });
        if (specificSite) query = query.eq("site_id", specificSite);
        else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
        if (dateFrom) query = query.gte("created_at", dateFrom);
      } else if (type === "procurement") {
        query = supabase.from("procurement").select("*, sites(name)").order("created_at", { ascending: false });
        if (specificSite) query = query.eq("site_id", specificSite);
        else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
        if (dateFrom) query = query.gte("created_at", dateFrom);
      }

      const { data, error } = await query.limit(2000);
      if (error) throw error;
      if (!data || !data.length) {
        showToast("No data available to export for " + type, "error");
        return;
      }

      const rows = flattenData(type, data);
      window._reportData = window._reportData || {};
      window._reportData[type] = rows;

      if (format === "excel") exportExcel(rows, type);
      else exportCSV(rows, type);
    } catch (err) {
      showToast("Download failed: " + err.message, "error");
    }
  };

  window.genStockReport = () => generateReport("stock", user);
  window.genRequestsReport = () => generateReport("requests", user);
  window.genTransfersReport = () => generateReport("transfers", user);
  window.genGRNReport = () => generateReport("grns", user);
  window.genIncidentsReport = () => generateReport("incidents", user);
  window.genProcurementReport = () => generateReport("procurement", user);
  window.genReconciliationReport = () => genReconciliationReport(user);
  window._rptRefresh = () => loadAllCharts(user, siteFilter);

  loadAllCharts(user, siteFilter);
}

let _chartsLoading = false;
async function loadAllCharts(user, siteFilter) {
  if (_chartsLoading) return;
  _chartsLoading = true;
  const days = parseInt(document.getElementById("rpt-days")?.value || 30);
  const specificSite = document.getElementById("rpt-site")?.value || "";
  const dateFrom = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;

  try {
    let qReqs = supabase.from("material_requests").select("status,created_at").limit(3000);
    if (specificSite) qReqs = qReqs.eq("site_id", specificSite);
    else if (siteFilter.length < SITES.length) qReqs = qReqs.in("site_id", siteFilter);
    if (dateFrom) qReqs = qReqs.gte("created_at", dateFrom);

    let qTrans = supabase.from("transfers").select("status,created_at,completed_at").limit(2000);
    if (dateFrom) qTrans = qTrans.gte("created_at", dateFrom);

    let qStock = supabase.from("stock").select("category,quantity,unit_price").limit(3000);
    if (specificSite) qStock = qStock.eq("site_id", specificSite);
    else if (siteFilter.length < SITES.length) qStock = qStock.in("site_id", siteFilter);

    let qProc = supabase.from("procurement").select("status,total_amount,created_at").limit(2000);
    if (dateFrom) qProc = qProc.gte("created_at", dateFrom);

    const [reqsRes, transRes, stockRes, procRes] = await Promise.all([qReqs, qTrans, qStock, qProc]);
    const reqs = reqsRes.data || [];
    const transfers = transRes.data || [];
    const stock = stockRes.data || [];
    const procurement = procRes.data || [];

    renderChart("chart-requests", reqs, "doughnut", ALL_REQUESTS_STATUSES);
    renderChart("chart-transfers", transfers, "bar", ALL_TRANSFER_STATUSES);

    const cats = {};
    stock.forEach(i => { const c = i.category || "General"; cats[c] = (cats[c] || 0) + (i.quantity || 0); });
    const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const canvas3 = document.getElementById("chart-stock-cat");
    if (canvas3 && window.Chart) {
      const ctx3 = canvas3.getContext("2d");
      if (canvas3._chart) { canvas3._chart.destroy(); canvas3._chart = null; }
      canvas3._chart = new Chart(ctx3, {
        type: "bar",
        data: {
          labels: sortedCats.map(s => s[0]),
          datasets: [{ label: "Qty", data: sortedCats.map(s => s[1]), backgroundColor: ["#c8a96e","#3d8ef8","#2ea043","#e67e22","#8b5cf6","#e74c3c","#2ecc71","#f39c12","#1abc9c","#9b59b6"], borderRadius: 4 }]
        },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#8892a0" }, grid: { color: "#1e2330" } }, y: { ticks: { color: "#8892a0", font: { size: 11 } }, grid: { display: false } } } }
      });
    }

    const monthly = {};
    procurement.forEach(p => {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[key] = (monthly[key] || 0) + (p.total_amount || 0);
    });
    const sortedM = Object.entries(monthly).sort().slice(-6);
    const canvas4 = document.getElementById("chart-procurement");
    if (canvas4 && window.Chart) {
      const ctx4 = canvas4.getContext("2d");
      if (canvas4._chart) { canvas4._chart.destroy(); canvas4._chart = null; }
      canvas4._chart = new Chart(ctx4, {
        type: "line",
        data: {
          labels: sortedM.map(s => s[0]),
          datasets: [{ label: "KES", data: sortedM.map(s => s[1]), borderColor: "#c8a96e", backgroundColor: "rgba(200,169,110,0.1)", fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: "#c8a96e" }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#8892a0" }, grid: { display: false } }, y: { ticks: { color: "#8892a0", callback: v => "KES " + (v / 1000).toFixed(0) + "K" }, grid: { color: "#1e2330" } } } }
      });
    }
  } catch (err) {
    console.error("[Charts]", err);
  } finally {
    _chartsLoading = false;
  }
}

function renderChart(canvasId, data, type, statuses) {
  if (!Array.isArray(data)) data = [];
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  const ctx = canvas.getContext("2d");
  const counts = {};
  statuses.forEach(s => counts[s] = 0);
  data.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  const labels = Object.keys(counts).map(s => s.replace(/_/g, " "));
  const values = Object.values(counts);
  const colors = ["#e67e22","#c8a96e","#e74c3c","#3d8ef8","#2ea043","#8b5cf6","#2ecc71","#f39c12","#4a5568","#1e2330","#95a5a6","#1abc9c"];
  if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }
  canvas._chart = new Chart(ctx, {
    type,
    data: { 
      labels, 
      datasets: [{ 
        label: type === "bar" ? "Count" : "Status", 
        data: values, 
        backgroundColor: colors.slice(0, labels.length), 
        borderWidth: 0 
      }] 
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: type === "bar" ? { display: false } : { position: "right", labels: { color: "#8892a0", font: { size: 11 }, padding: 8, boxWidth: 12 } } 
      } 
    }
  });
}

async function generateReport(type, user) {
  const preview = document.getElementById("report-preview");
  if (!preview) return;
  preview.style.display = "block";
  preview.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gold);">🔄 Generating ${type} report…</div>`;

  const roleInfo = ROLES[user.role] || {};
  const siteFilter = roleInfo.siteScope === "assigned" ? (user.site_ids || []) : SITES.map(s => s.id);
  const days = parseInt(document.getElementById("rpt-days")?.value || 30);
  const specificSite = document.getElementById("rpt-site")?.value || "";
  const dateFrom = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;

  try {
    let query = null;
    if (type === "stock") {
      query = supabase.from("stock").select("*, sites(name)").order("material_name", { ascending: true });
      if (specificSite) query = query.eq("site_id", specificSite);
      else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
    } else if (type === "requests") {
      query = supabase.from("material_requests").select("*, sites(name)").order("created_at", { ascending: false });
      if (specificSite) query = query.eq("site_id", specificSite);
      else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
      if (dateFrom) query = query.gte("created_at", dateFrom);
    } else if (type === "transfers") {
      query = supabase.from("transfers").select("*").order("created_at", { ascending: false });
      if (dateFrom) query = query.gte("created_at", dateFrom);
    } else if (type === "grns") {
      query = supabase.from("grns").select("*, sites(name)").order("created_at", { ascending: false });
      if (specificSite) query = query.eq("site_id", specificSite);
      else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
      if (dateFrom) query = query.gte("created_at", dateFrom);
    } else if (type === "incidents") {
      query = supabase.from("incidents").select("*, sites(name)").order("created_at", { ascending: false });
      if (specificSite) query = query.eq("site_id", specificSite);
      else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
      if (dateFrom) query = query.gte("created_at", dateFrom);
    } else if (type === "procurement") {
      query = supabase.from("procurement").select("*, sites(name)").order("created_at", { ascending: false });
      if (specificSite) query = query.eq("site_id", specificSite);
      else if (siteFilter.length < SITES.length) query = query.in("site_id", siteFilter);
      if (dateFrom) query = query.gte("created_at", dateFrom);
    }

    const { data, error } = await query.limit(2000);
    if (error) throw error;
    if (!data || !data.length) {
      preview.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-300);">No data found for ${type} report</div>`;
      return;
    }

    const rows = flattenData(type, data);
    preview.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;padding:12px 16px;">
        <h3 style="font-size:16px;font-weight:600;color:var(--text-100);">${type.charAt(0).toUpperCase() + type.slice(1)} Report — ${data.length} records</h3>
        <div style="display:flex;gap:8px;">
          <button onclick="window._rptDownload('${type}')" class="btn btn-gold" style="font-size:13px;padding:8px 20px;">⬇ Download Excel</button>
          <button onclick="window._rptDownloadCSV('${type}')" class="btn btn-ghost" style="font-size:13px;padding:8px 16px;border:1px solid var(--border);">⬇ Download CSV</button>
        </div>
      </div>
      <div style="overflow-x:auto;max-height:400px;overflow-y:auto;padding:0 16px 16px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              ${Object.keys(rows[0] || {}).map(k => `<th style="text-align:left;padding:8px;color:var(--text-400);font-weight:500;white-space:nowrap;position:sticky;top:0;background:var(--bg-600);">${k}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.slice(0, 50).map(row => `
              <tr style="border-bottom:1px solid rgba(30,35,48,0.4);">
                ${Object.values(row).map(v => `<td style="padding:8px;color:var(--text-200);white-space:nowrap;">${v ?? ""}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${rows.length > 50 ? `<p style="color:var(--text-300);font-size:12px;padding:12px 0 0;">Showing 50 of ${rows.length} rows. Click Download for full export.</p>` : ""}
      </div>
    `;

    window._reportData = window._reportData || {};
    window._reportData[type] = rows;
    window._rptDownload = (t) => {
      const r = window._reportData?.[t];
      if (r && typeof XLSX !== "undefined") exportExcel(r, t);
      else if (r) exportCSV(r, t);
    };
    window._rptDownloadCSV = (t) => {
      const r = window._reportData?.[t];
      if (r) exportCSV(r, t);
    };
  } catch (err) {
    preview.innerHTML = `<p style="color:var(--red);padding:20px;">Error: ${err.message}</p>`;
  }
}

function flattenData(type, data) {
  if (type === "stock") return data.map(i => ({
    Site: i.sites?.name || `#${i.site_id}`,
    Code: i.material_code || "",
    Material: i.material_name,
    Category: i.category || "",
    Type: i.storekeeper_type || "",
    Quantity: i.quantity || 0,
    Unit: i.unit || "",
    "Unit Price (KES)": i.unit_price || 0,
    "Total Value (KES)": ((i.quantity || 0) * (i.unit_price || 0)).toFixed(2),
    "Last Updated": i.last_updated ? new Date(i.last_updated).toLocaleDateString("en-KE") : ""
  }));

  if (type === "requests") return data.map(i => ({
    Site: i.sites?.name || `#${i.site_id}`,
    Material: i.material_name,
    Quantity: i.quantity || 0,
    Unit: i.unit || "",
    Urgency: i.urgency,
    Status: i.status,
    Purpose: i.purpose || "",
    Date: new Date(i.created_at).toLocaleDateString("en-KE"),
    "PM Approved": i.pm_approved_at ? new Date(i.pm_approved_at).toLocaleDateString("en-KE") : "",
    Issued: i.issued_at ? new Date(i.issued_at).toLocaleDateString("en-KE") : "",
    Collected: i.collected_at ? new Date(i.collected_at).toLocaleDateString("en-KE") : "",
    "Return Qty": i.return_qty || "",
    "Return Reason": i.return_reason || ""
  }));

  if (type === "transfers") return data.map(i => ({
    "Transfer ID": i.id?.slice(0, 8) || "",
    From: SITES.find(s => s.id === i.from_site_id)?.name || `Site ${i.from_site_id}`,
    To: SITES.find(s => s.id === i.to_site_id)?.name || `Site ${i.to_site_id}`,
    Items: Array.isArray(i.items) ? i.items.length : 0,
    Status: i.status,
    Created: i.created_at ? new Date(i.created_at).toLocaleDateString("en-KE") : "",
    Completed: i.completed_at ? new Date(i.completed_at).toLocaleDateString("en-KE") : "",
    Steps: Array.isArray(i.step_log) ? i.step_log.length : 0
  }));

  if (type === "grns") return data.map(i => ({
    Site: i.sites?.name || `#${i.site_id}`,
    "GRN #": i.grn_number || "",
    "Invoice #": i.invoice_number || "",
    Supplier: i.supplier || "",
    Type: i.storekeeper_type || "",
    Items: Array.isArray(i.items) ? i.items.length : 0,
    "Total Value (KES)": i.total_value || "",
    Status: i.status,
    Date: new Date(i.created_at).toLocaleDateString("en-KE"),
    Verified: i.verified_at ? new Date(i.verified_at).toLocaleDateString("en-KE") : ""
  }));

  if (type === "incidents") return data.map(i => ({
    Site: i.sites?.name || `#${i.site_id}`,
    Type: i.type,
    Material: i.material_name,
    Quantity: i.quantity || "",
    "Est. Value (KES)": i.estimated_value || "",
    Reason: i.reason || "",
    Status: i.status,
    "PM Decision": i.pm_decision || "",
    Date: new Date(i.created_at).toLocaleDateString("en-KE")
  }));

  if (type === "procurement") return data.map(i => ({
    Site: i.sites?.name || `#${i.site_id}`,
    Supplier: i.supplier || "",
    Items: Array.isArray(i.items) ? i.items.length : 0,
    "Total (KES)": i.total_amount || "",
    Status: i.status,
    Approvals: Array.isArray(i.approval_chain) ? i.approval_chain.map(a => a.by).join(" → ") : "",
    Date: new Date(i.created_at).toLocaleDateString("en-KE")
  }));

  return data.map(i => ({ ...i }));
}

function exportCSV(rows, name) {
  if (!rows || !rows.length) {
    showToast("No data to export for " + name, "error");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => '"' + String(r[h] ?? "").replace(/"/g, '""') + '"').join(","))
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const filename = "cdl_" + name + "_" + new Date().toISOString().slice(0, 10) + ".csv";
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
  showToast("Downloaded " + filename, "success");
}

function exportExcel(rows, name) {
  try {
    if (typeof XLSX !== "undefined" && XLSX.utils) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      const filename = "cdl_" + name + "_" + new Date().toISOString().slice(0, 10) + ".xlsx";
      XLSX.writeFile(wb, filename);
      showToast("Downloaded " + filename, "success");
    } else {
      showToast("Excel library not loaded — downloading as CSV instead", "info");
      exportCSV(rows, name);
    }
  } catch (e) {
    console.warn("[Reports] Excel export failed, falling back to CSV:", e.message);
    exportCSV(rows, name);
  }
}

export async function genReconciliationReport(user) {
  const preview = document.getElementById("report-preview");
  if (!preview) return;
  preview.style.display = "block";
  preview.innerHTML = `<div style="padding:40px;text-align:center;color:var(--teal);">🔄 Generating reconciliation report…</div>`;

  try {
    const [stockRes, grnRes, transferRes] = await Promise.all([
      supabase.from("stock").select("site_id,material_name,quantity,unit_price,category,storekeeper_type,last_updated").limit(5000),
      supabase.from("grns").select("site_id,supplier,total_value,created_at,status").limit(2000),
      supabase.from("transfers").select("from_site_id,to_site_id,items,status,created_at,completed_at").limit(2000)
    ]);

    const stock = stockRes.data || [];
    const grns = grnRes.data || [];
    const transfers = transferRes.data || [];

    const siteMaterialMap = {};
    stock.forEach(i => {
      const key = `${i.site_id}_${i.material_name}`;
      if (!siteMaterialMap[key]) {
        siteMaterialMap[key] = {
          siteId: i.site_id,
          site: SITES.find(s => s.id === i.site_id)?.name || `#${i.site_id}`,
          material: i.material_name,
          category: i.category || "General",
          qty: 0,
          unitPrice: i.unit_price || 0,
          value: 0,
          lastUpdated: i.last_updated
        };
      }
      siteMaterialMap[key].qty += (i.quantity || 0);
      siteMaterialMap[key].value += ((i.quantity || 0) * (i.unit_price || 0));
    });

    const reportRows = Object.values(siteMaterialMap).sort((a, b) => b.value - a.value).map(m => ({
      Site: m.site,
      Material: m.material,
      Category: m.category,
      "Physical Qty": m.qty,
      "Unit Price (KES)": m.unitPrice,
      "Total Value (KES)": m.value.toFixed(2),
      "Last Activity": m.lastUpdated ? new Date(m.lastUpdated).toLocaleDateString("en-KE") : "No recent activity"
    }));

    if (!reportRows.length) {
      preview.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-300);">No reconciliation data available.</div>`;
      return;
    }

    const totalValue = reportRows.reduce((s, r) => s + parseFloat(r["Total Value (KES)"] || 0), 0);

    preview.innerHTML = `
      <div style="padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <h3 style="font-size:16px;font-weight:600;color:var(--text-100);">Weekly Reconciliation Report — ${reportRows.length} items</h3>
          <div style="display:flex;gap:8px;">
            <button onclick="window._rptDownloadReconciliation('excel')" class="btn btn-gold" style="font-size:12px;padding:6px 16px;">⬇ Export Excel</button>
            <button onclick="window._rptDownloadReconciliation('csv')" class="btn btn-ghost" style="font-size:12px;padding:6px 16px;border:1px solid var(--border);">⬇ Export CSV</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px;">
          <div class="card"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Total Sites</div><div style="font-size:20px;font-weight:700;">${SITES.length}</div></div>
          <div class="card"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Total Materials</div><div style="font-size:20px;font-weight:700;">${reportRows.length}</div></div>
          <div class="card"><div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Portfolio Value</div><div style="font-size:20px;font-weight:700;color:var(--accent-gold);">KES ${totalValue.toLocaleString()}</div></div>
        </div>
        <div style="overflow-x:auto;max-height:350px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border);">
                ${Object.keys(reportRows[0] || {}).map(h => `<th style="text-align:left;padding:7px 6px;color:var(--text-400);font-weight:500;font-size:11px;text-transform:uppercase;position:sticky;top:0;background:var(--bg-600);">${h}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${reportRows.slice(0, 50).map(row => `
                <tr style="border-bottom:1px solid rgba(30,35,48,0.3);">
                  ${Object.values(row).map(v => `<td style="padding:7px 6px;color:var(--text-200);white-space:nowrap;">${v ?? ""}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    window._reportData = window._reportData || {};
    window._reportData["reconciliation"] = reportRows;
    window._rptDownloadReconciliation = (format) => {
      const r = window._reportData?.["reconciliation"];
      if (r && format === "excel" && typeof XLSX !== "undefined") exportExcel(r, "reconciliation");
      else if (r) exportCSV(r, "reconciliation");
    };
  } catch (err) {
    preview.innerHTML = `<p style="color:var(--red);padding:20px;">Error: ${err.message}</p>`;
  }
}
