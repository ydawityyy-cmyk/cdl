// CDL — modules/requests.js — Premium UI
import { supabase, SITES } from "../config.js";
import { logAudit } from "./audit_core.js";
import { ROLES } from "./roles.js";
import { showToast, showModal, closeModal } from "../app.js";
import { MATERIALS_DB } from "../data.js";
import { sendNotif } from "./notifs.js";
import { checkAndQueueNewMaterial } from "./material_approvals.js";

export async function renderRequests(container, user) {
  const role = ROLES[user.role] || {};
  const canCreate = role.canCreateRequest === true;
  const canApprove = role.canApproveRequests === true;
  const canIssue = role.canIssueStock === true;
  const siteFilter = role.siteScope === "assigned" ? (user.site_ids || []) : SITES.map(s => s.id);
  container.innerHTML = `<div style="margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;"><div><h1 style="font-size:24px;font-weight:700;color:var(--text-100);">Material Requests</h1><p style="color:var(--text-200);font-size:13px;margin-top:4px;">Request, approve, issue, collect and return material</p></div>${canCreate?`<button class="btn btn-gold" onclick="window._reqOpenNew()">+ New Request</button>`:""}</div><div style="display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap;">${["Pending","PM Approved","Issued","Collected","Completed","Returned","Expired"].map((t,i)=>{const key=t.toLowerCase().replace(" ","_");return `<button onclick="window._reqLoad('${key}')" id="req-tab-${key}" style="padding:7px 16px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:500;${i===0?"background:var(--gold);color:var(--bg-900);":"background:var(--bg-600);color:var(--text-200);"}">${t}<span id="req-count-${key}" style="margin-left:4px;font-size:10px;opacity:0.7;"></span></button>`;}).join("")}</div><div id="req-list"><div class="spinner" style="margin:60px auto;"></div></div>`;
  window._reqLoad = (status) => { ["pending","pm_approved","issued","collected","completed","returned","expired"].forEach(s=>{const b=document.getElementById(`req-tab-${s}`);if(b){b.style.background=s===status?"var(--gold)":"var(--bg-600)";b.style.color=s===status?"var(--bg-900)":"var(--text-200)";}}); fetchRequests(user,siteFilter,status,canApprove,canIssue); };
  window._reqOpenNew = () => openRequestModal(user,siteFilter);
  window._submitReq = () => submitRequest(user,siteFilter);
  fetchRequests(user,siteFilter,"pending",canApprove,canIssue);
}

async function fetchRequests(user,siteFilter,status,canApprove,canIssue) {
  const list=document.getElementById("req-list");if(!list)return;list.innerHTML=`<div class="spinner" style="margin:60px auto;"></div>`;
  try {
    let query = supabase
      .from('material_requests')
      .select('*, sites(name)')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50);
    if (siteFilter.length) {
      query = query.in('site_id', siteFilter);
    }
    const { data: requests, error: reqError } = await query;
    if (reqError) throw new Error(reqError.message);
    if (requests && requests.length) {
      const requesterIds = [...new Set(requests.map(r => r.requested_by).filter(Boolean))];
      if (requesterIds.length) {
        const { data: users, error: userError } = await supabase
          .from('users')
          .select('id, name')
          .in('id', requesterIds);
        const userMap = {};
        (users || []).forEach(u => { userMap[u.id] = u.name; });
        requests.forEach(r => { r.requester_name = userMap[r.requested_by] || "Unknown"; });
      }
    }
    const countEl=document.getElementById(`req-count-${status}`);if(countEl)countEl.textContent=requests.length?`(${requests.length})`:"";
    list.innerHTML=requests.map(r=>{const urgencyColors={low:"var(--text-300)",normal:"var(--blue)",high:"var(--orange)",critical:"var(--red)"};const uc=urgencyColors[r.urgency]||"var(--text-300)";const isExpired=r.expiry_at&&new Date(r.expiry_at)<new Date()&&status==="issued";return `<div class="card" style="margin-bottom:12px;${isExpired?"border-left:3px solid var(--red);":""}"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div style="flex:1;"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-size:14px;font-weight:600;color:var(--text-100);">${r.material_name}</span><span class="badge" style="background:${uc}20;color:${uc};font-size:10px;">${r.urgency}</span></div><div style="color:var(--text-200);font-size:12px;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;"><span>📦 ${r.quantity} ${r.unit||""}</span><span>🏗 ${r.sites?.name||`#${r.site_id}`}</span>${r.requester_name?`<span>👤 ${r.requester_name}</span>`:""}${r.purpose?`<span>📝 ${r.purpose}</span>`:""}<span>📅 ${new Date(r.created_at).toLocaleDateString("en-KE")}</span></div>${r.return_reason?`<div style="color:var(--orange);font-size:12px;margin-top:4px;">↩ ${r.return_reason}</div>`:""}${isExpired?`<div style="color:var(--red);font-size:11px;font-weight:600;margin-top:4px;">⚠ EXPIRED</div>`:""}</div></div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">${canApprove&&status==="pending"?`<button onclick="window._reqUpdateStatus('${r.id}','pm_approved')" class="btn btn-gold btn-sm">✓ Approve</button><button onclick="window._reqUpdateStatus('${r.id}','pm_rejected')" class="btn btn-ghost btn-sm" style="color:var(--red);">✕ Reject</button>`:""}${canIssue&&status==="pm_approved"?`<button onclick="window._reqIssue('${r.id}')" class="btn btn-gold btn-sm">📤 Issue</button><button onclick="window._reqUpdateStatus('${r.id}','reserved')" class="btn btn-ghost btn-sm">📦 Reserve</button>`:""}${status==="issued"&&!isExpired?`<button onclick="window._reqUpdateStatus('${r.id}','collected')" class="btn btn-gold btn-sm">✓ Collected</button>`:""}${status==="collected"?`<button onclick="window._reqUpdateStatus('${r.id}','completed')" class="btn btn-gold btn-sm">✓ Complete</button><button onclick="window._reqOpenReturn('${r.id}','${r.material_name.replace(/'/g,"\\'")}',${r.quantity},'${r.unit||""}')" class="btn btn-ghost btn-sm" style="color:var(--orange);">↩ Return</button>`:""}</div></div>`;}).join("");
    window._reqUpdateStatus=(id,newStatus)=>updateRequestStatus(id,newStatus,user);
    window._reqIssue=(id)=>issueRequestFn(id,user);
  } catch(err){list.innerHTML=`<p style="color:var(--red);">Error: ${err.message}</p>`;}
}

async function updateRequestStatus(id,status,user) {
  try {
    const patch = { status };
    if (status === "pm_approved") {
      patch.pm_approved_by = user.id;
      patch.pm_approved_at = new Date().toISOString();
      const { data: reqs, error: reqError } = await supabase
        .from('material_requests')
        .select('site_id,material_name,quantity,unit,requested_by')
        .eq('id', id)
        .single();
      if (reqError) throw reqError;
      const req = reqs;
      if (req) {
        await sendNotif(req.requested_by, `Request Approved`, `${req.material_name} (${req.quantity} ${req.unit||""}) approved by PM`, "request_approved", id);
        const { data: sks } = await supabase
          .from('users')
          .select('id')
          .in('role', ['storekeeper_local', 'storekeeper_import', 'storekeeper_scaffolding'])
          .contains('site_ids', [req.site_id])
          .eq('is_active', true);
        if (sks) {
          for (const sk of sks) {
            await sendNotif(sk.id, `📋 Material Request Approved`, `PM approved: ${req.material_name} × ${req.quantity} ${req.unit||""} — ready to issue`, "issue_ready", id);
          }
        }
      }
    }
    if (status === "collected") {
      patch.collected_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('material_requests')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
    await logAudit({ action: `request_${status}`, module: "requests", record_id: id });
    showToast(`Request ${status.replace(/_/g, " ")}`, "success");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

async function issueRequestFn(id, user) {
  try {
    const { data: reqs, error: reqError } = await supabase
      .from('material_requests')
      .select('site_id,material_name,quantity,unit,requested_by')
      .eq('id', id)
      .single();
    if (reqError) throw reqError;
    const req = reqs;
    const { error } = await supabase
      .from('material_requests')
      .update({
        status: "issued",
        issued_by: user.id,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 3600000).toISOString()
      })
      .eq('id', id);
    if (error) throw error;
    if (req?.requested_by) {
      await sendNotif(req.requested_by, `📦 Material Ready for Collection`, `${req.material_name} (${req.quantity} ${req.unit||""}) has been issued. Collect before midnight.`, "material_issued", id);
    }
    await logAudit({ action: "request_issued", module: "requests", record_id: id });
    showToast("Request issued — expires in 24h", "success");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

function openReturnModal(id,materialName,origQty,unit) {
  showModal(`<h2 style="font-size:18px;font-weight:700;color:var(--text-100);margin-bottom:6px;">↩ Return Material</h2><div class="card" style="background:var(--bg-700);margin-bottom:16px;border-left:3px solid var(--orange);"><div style="font-weight:600;color:var(--text-100);">${materialName}</div><div style="color:var(--text-300);font-size:12px;margin-top:4px;">Originally: ${origQty} ${unit}</div></div><div style="display:flex;flex-direction:column;gap:14px;"><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Return Quantity</label><input id="ret-qty" type="number" min="0.1" max="${origQty}" value="${origQty}" step="0.1" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);"></div><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Condition</label><select id="ret-condition" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);"><option value="good">Good — Reusable</option><option value="damaged">Damaged — Needs Repair</option><option value="expired">Expired / Unusable</option></select></div><div><label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-400);margin-bottom:6px;">Reason</label><textarea id="ret-reason" rows="2" placeholder="Why is this being returned?" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-100);resize:none;"></textarea></div><div style="display:flex;gap:12px;"><button onclick="window._reqSubmitReturn('${id}')" class="btn btn-gold" style="flex:1;">Submit Return</button><button onclick="window._closeModal()" class="btn btn-ghost">Cancel</button></div></div>`);
  window._reqSubmitReturn=async(reqId)=>{const qty=parseFloat(document.getElementById("ret-qty").value);const condition=document.getElementById("ret-condition").value;const reason=document.getElementById("ret-reason").value.trim();if(!qty||qty<=0){showToast("Enter valid quantity","error");return;}try{
    const { error } = await supabase
      .from('material_requests')
      .update({
        status: "returned",
        return_qty: qty,
        return_reason: reason || condition,
        return_condition: condition,
        collected_at: new Date().toISOString()
      })
      .eq('id', reqId);
    if (error) throw error;
    await logAudit({ action: "request_returned", module: "requests", record_id: reqId });
    closeModal();
    showToast(`Returned ${qty} ${condition}`, "success");
  }catch(err){showToast(`Error: ${err.message}`,"error");}};
}

async function submitRequest(user,siteFilter) {

  const siteId = parseInt(document.getElementById("rq-site").value);
  let material = document.getElementById("rq-material").value.trim();
  const qty = parseFloat(document.getElementById("rq-qty").value);
  const unit = document.getElementById("rq-unit").value.trim();
  const urgency = document.getElementById("rq-urgency").value;
  const purpose = document.getElementById("rq-purpose").value.trim();

  if (!material) { showToast("Material required","error"); return; }
  if (!qty || qty <= 0) { showToast("Valid quantity required","error"); return; }

  if (material === "__NEW__") {
    const custom = document.getElementById("rq-material-new").value.trim();
    if (!custom) { showToast("Enter new material name","error"); return; }
    const result = await checkAndQueueNewMaterial(custom, siteId, "request", user.id, { name: user.name });
    if (result.isNew) { showToast(`"${custom}" queued for approval. Request submitted.`, "info"); }
    else if (result.alreadyQueued) { showToast(`"${custom}" already pending approval. Request submitted.`, "info"); }
    else { material = custom; }
  }

  try {
    const { data: saved, error } = await supabase
      .from('material_requests')
      .insert({
        site_id: siteId,
        requested_by: user.id,
        material_name: material,
        quantity: qty,
        unit: unit || null,
        urgency,
        purpose: purpose || null,
        status: "pending"
      })
      .select()
      .single();
    if (error) throw error;
    await logAudit({ action: "request_created", module: "requests", record_id: saved.id });
    closeModal();
    showToast("Request submitted for PM approval", "success");
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

function openRequestModal(user, siteFilter) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  showModal(`
    <div style="max-height:82vh;overflow-y:auto;padding-right:4px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <span style="font-size:24px;">📋</span>
        <div>
          <h2 style="font-size:18px;font-weight:700;color:var(--text-100);margin:0;">New Material Requisition</h2>
          <p style="font-size:12px;color:var(--text-400);margin:2px 0 0;">All fields marked with <span style="color:#ef4444;">*</span> are mandatory for PM approval.</p>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;">
        
        <!-- SECTION 1: LOCATION & STORE DESTINATION -->
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:12px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent-gold);margin-bottom:8px;">1. Site & Store Destination</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Site <span style="color:#ef4444;">*</span></label>
              <select id="rq-site" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
                ${SITES.filter(s => siteFilter.includes(s.id)).map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
              </select>
            </div>
            <div>
              <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Store Section <span style="color:#ef4444;">*</span></label>
              <select id="rq-store-type" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
                <option value="local">Local Materials Store</option>
                <option value="imported">Imported Materials Store</option>
                <option value="scaffolding">Scaffolding & Heavy Formwork</option>
              </select>
            </div>
          </div>
        </div>

        <!-- SECTION 2: TRADE & ACTIVITY -->
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:12px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent-gold);margin-bottom:8px;">2. Trade & Department</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Trade / Department <span style="color:#ef4444;">*</span></label>
              <select id="rq-department" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
                <option value="Civil & Concrete">Civil & Concrete Works</option>
                <option value="Structural Steel">Structural Steel & Rebar</option>
                <option value="Masonry & Walling">Masonry & Walling</option>
                <option value="Electrical">Electrical Installation</option>
                <option value="Plumbing & Drainage">Plumbing & Drainage</option>
                <option value="Carpentry & Formwork">Carpentry & Formwork</option>
                <option value="Plaster & Finishes">Plaster, Screed & Tiling</option>
                <option value="Painting & Waterproofing">Painting & Waterproofing</option>
                <option value="Site Safety & Logistics">Site Safety & Logistics</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Target Floor / Work Zone <span style="color:#ef4444;">*</span></label>
              <input id="rq-location" type="text" placeholder="e.g. Block A - 2nd Floor Slab" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
            </div>
          </div>
        </div>

        <!-- SECTION 3: MATERIAL & QUANTITY -->
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:12px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent-gold);margin-bottom:8px;">3. Material & Quantity</div>
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Approved Material Catalog <span style="color:#ef4444;">*</span></label>
            <select id="rq-material" onchange="window._rqMaterialChange()" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
              <option value="">-- Select Approved Material --</option>
              ${MATERIALS_DB.map(m => `<option value="${m.name}">${m.name} (${m.category})</option>`).join("")}
              <option value="__NEW__">➕ Propose New Material (Requires Approval)</option>
            </select>
            <input type="text" id="rq-material-new" placeholder="Enter custom material name for approval" style="display:none;margin-top:8px;width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-700);color:var(--text-100);font-size:13px;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div>
              <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Quantity <span style="color:#ef4444;">*</span></label>
              <input id="rq-qty" type="number" min="0.1" step="any" placeholder="0" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
            </div>
            <div>
              <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Unit <span style="color:#ef4444;">*</span></label>
              <input id="rq-unit" type="text" placeholder="Bags, Pcs, Kgs…" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
            </div>
            <div>
              <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Urgency Level <span style="color:#ef4444;">*</span></label>
              <select id="rq-urgency" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
                <option value="low">Low (Next Week)</option>
                <option value="normal" selected>Normal (2-3 Days)</option>
                <option value="high">High (Tomorrow)</option>
                <option value="critical">Critical (Immediate / Stoppage)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- SECTION 4: MANDATORY PURPOSE & REQUIRED DATE -->
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:12px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent-gold);margin-bottom:8px;">4. Purpose & Timeline (Mandatory)</div>
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Purpose / Work Scope Description <span style="color:#ef4444;">* (Mandatory)</span></label>
            <textarea id="rq-purpose" rows="2" placeholder="e.g. Foundation blinding and column bases at Aura Peponi, week 34" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;resize:vertical;"></textarea>
          </div>
          <div>
            <label style="display:block;font-size:11px;color:var(--text-300);margin-bottom:4px;">Required On Site By Date <span style="color:#ef4444;">*</span></label>
            <input id="rq-date" type="date" value="${tomorrow}" style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text-100);font-size:13px;">
          </div>
        </div>

        <!-- SUBMISSION ACTIONS -->
        <div style="display:flex;gap:12px;margin-top:6px;">
          <button onclick="window._reqSubmitNew('${user.id}')" class="btn btn-gold" style="flex:1;padding:12px;font-size:14px;font-weight:700;">
            ✓ Submit Request for PM Approval
          </button>
          <button onclick="window._closeModal()" class="btn btn-ghost" style="padding:12px;">Cancel</button>
        </div>
      </div>
    </div>
  `);

  // Auto-fill Unit on Material Select
  window._rqMaterialChange = function() {
    const select = document.getElementById("rq-material");
    const newMaterialInput = document.getElementById("rq-material-new");
    const unitInput = document.getElementById("rq-unit");
    if (!select) return;

    if (select.value === "__NEW__") {
      newMaterialInput.style.display = "block";
      if (unitInput) unitInput.value = "";
    } else {
      newMaterialInput.style.display = "none";
      const found = MATERIALS_DB.find(m => m.name === select.value);
      if (found && unitInput && !unitInput.value) {
        unitInput.value = found.unit || "Pcs";
      }
    }
  };

  // Submit Handler with Strict Mandatory Validation
  window._reqSubmitNew = async (userId) => {
    const siteId = parseInt(document.getElementById("rq-site")?.value || "0");
    const storeType = document.getElementById("rq-store-type")?.value || "local";
    const department = document.getElementById("rq-department")?.value || "";
    const location = (document.getElementById("rq-location")?.value || "").trim();
    let material = (document.getElementById("rq-material")?.value || "").trim();
    const qty = parseFloat(document.getElementById("rq-qty")?.value || "0");
    const unit = (document.getElementById("rq-unit")?.value || "").trim();
    const urgency = document.getElementById("rq-urgency")?.value || "normal";
    const purpose = (document.getElementById("rq-purpose")?.value || "").trim();
    const requiredDate = document.getElementById("rq-date")?.value || "";

    // Validation
    if (!siteId) { showToast("Site selection is mandatory", "error"); return; }
    if (!material) { showToast("Material selection is mandatory", "error"); return; }
    if (!qty || isNaN(qty) || qty <= 0) { showToast("Enter a valid quantity greater than 0", "error"); return; }
    if (!unit) { showToast("Unit of measure is required (e.g. Bags, Pcs)", "error"); return; }
    
    // MANDATORY PURPOSE CHECK
    if (!purpose || purpose.length < 5) {
      showToast("Purpose / Section of Work is mandatory (e.g. Foundation blinding, week 34)", "error");
      document.getElementById("rq-purpose")?.focus();
      return;
    }

    if (material === "__NEW__") {
      const custom = (document.getElementById("rq-material-new")?.value || "").trim();
      if (!custom) { showToast("Enter the new proposed material name", "error"); return; }
      const result = await checkAndQueueNewMaterial(custom, siteId, "request", userId, { name: user.name });
      if (result.isNew) { showToast(`"${custom}" queued for approval. Request submitted.`, "info"); }
      else if (result.alreadyQueued) { showToast(`"${custom}" already pending approval. Request submitted.`, "info"); }
      material = custom;
    }

    const fullPurpose = `[${department}] ${purpose}${location ? ' (Location: ' + location + ')' : ''}${requiredDate ? ' [Needed by: ' + requiredDate + ']' : ''}`;

    try {
      const { data: saved, error } = await supabase
        .from('material_requests')
        .insert({
          site_id: siteId,
          requested_by: userId,
          material_name: material,
          quantity: qty,
          unit: unit || null,
          urgency,
          purpose: fullPurpose,
          status: "pending"
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit({ action: "request_created", module: "requests", record_id: saved.id });
      closeModal();
      showToast("Request submitted for PM approval", "success");
      
      // Auto reload requests tab if open
      if (window._navigate) {
        window._navigate('requests');
      }
    } catch (err) {
      showToast(`Error submitting request: ${err.message}`, "error");
    }
  };
}
