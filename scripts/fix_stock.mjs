const SUPABASE_URL = "https://dljvplrbjogncwrpmfsj.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsanZwbHJiam9nbmN3cnBtZnNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyMDEzMiwiZXhwIjoyMDk0MDk2MTMyfQ.20i7g7ClEJVCvKiVFR3-mXT-9EoHVhRV6iSiioWa-O0";

async function supa(method, path, body) {
  const opts = {
    method,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(method === 'GET' ? {} : { 'Prefer': 'return=representation' })
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

async function main() {
  // Find stock
  const getR = await supa('GET', `stock?site_id=eq.1&material_name=eq.Ordinary Portland Cement 50kg&storekeeper_type=eq.local&select=id,quantity`);
  if (!getR.ok) { console.error('Failed to get stock:', getR); return; }
  const stocks = getR.data;
  if (!stocks || stocks.length === 0) { console.error('Stock not found'); return; }
  const stock = stocks[0];
  console.log(`Current stock: id=${stock.id}, quantity=${stock.quantity}`);

  // Update quantity to 100
  const updateR = await supa('PATCH', `stock?id=eq.${stock.id}`, { quantity: 100, last_updated: new Date().toISOString() });
  if (!updateR.ok) { console.error('Failed to update stock:', updateR); return; }
  console.log(`Updated stock to quantity: 100`);
}

main().catch(console.error);