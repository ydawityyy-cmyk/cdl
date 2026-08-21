const SUPABASE_URL = "https://dljvplrbjogncwrpmfsj.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsanZwbHJiam9nbmN3cnBtZnNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyMDEzMiwiZXhwIjoyMDk0MDk2MTMyfQ.20i7g7ClEJVCvKiVFR3-mXT-9EoHVhRV6iSiioWa-O0";

async function patch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log(`Successfully updated ${path}:`, data);
  } else {
    console.error(`Failed to update ${path}: status ${res.status}`, await res.text());
  }
}

async function run() {
  console.log("Updating Admin password...");
  await patch("users?email=eq.admin@canaan.co.ke", { password_hash: "admin123" });

  console.log("Updating Company Owner password...");
  await patch("users?email=eq.owner@canaan.co.ke", { password_hash: "owner123" });

  console.log("Updating CEO password...");
  await patch("users?email=eq.ceo@canaan.co.ke", { password_hash: "ceo123" });
}

run().catch(console.error);
