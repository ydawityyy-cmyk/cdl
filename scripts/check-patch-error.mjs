const SUPABASE_URL = "https://dljvplrbjogncwrpmfsj.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsanZwbHJiam9nbmN3cnBtZnNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyMDEzMiwiZXhwIjoyMDk0MDk2MTMyfQ.20i7g7ClEJVCvKiVFR3-mXT-9EoHVhRV6iSiioWa-O0";

async function run() {
  // Try to create a request first to get a valid ID
  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/material_requests`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      site_id: 1,
      requested_by: '2f913d8d-9d41-4770-9884-2a6230491024', // Some UUID
      material_name: 'Test Cement',
      quantity: 10,
      unit: 'Bags',
      status: 'pending'
    })
  });
  
  const createData = await createRes.json();
  console.log('Create Response:', createRes.status, createData);
  
  const requestId = createData[0]?.id;
  if (!requestId) return;

  // Try to patch the request to 'issued'
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/material_requests?id=eq.${requestId}`, {
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      status: 'issued',
      issued_by: '2f913d8d-9d41-4770-9884-2a6230491024',
      issued_at: new Date().toISOString(),
      expiry_at: new Date(Date.now() + 24*3600000).toISOString()
    })
  });

  const patchData = await patchRes.json();
  console.log('Patch Response status:', patchRes.status);
  console.log('Patch Response data:', JSON.stringify(patchData, null, 2));
}

run().catch(console.error);
