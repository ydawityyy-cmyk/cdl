// Check for inconsistencies in stock data
// Run with: node check_inconsistencies.js

const https = require('https');

const SUPABASE_URL = 'https://dljvplrbjogncwrpmfsj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsanZwbHJiam9nbmN3cnBtZnNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyMDEzMiwiZXhwIjoyMDk0MDk2MTMyfQ.20i7g7ClEJVCvKiVFR3-mXT-9EoHVhRV6iSiioWa-O0';

function fetch(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: new URL(SUPABASE_URL).hostname,
      path: path,
      method: method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const r = https.request(opts, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, body: b }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  console.log('Fetching all stock records...');
  const response = await fetch('GET', '/rest/v1/stock?select=site_id,material_name,material_code');
  if (response.status !== 200) {
    console.error('Failed to fetch stock:', response.status, response.body);
    return;
  }
  const stock = response.body;
  if (!Array.isArray(stock)) {
    console.error('Unexpected response format:', stock);
    return;
  }
  console.log(`Fetched ${stock.length} stock records`);

  // Check 1: same site_id and material_name should have same material_code
  const groupsBySiteAndName = {};
  for (const item of stock) {
    const key = `${item.site_id}:${item.material_name}`;
    if (!groupsBySiteAndName[key]) {
      groupsBySiteAndName[key] = new Set();
    }
    groupsBySiteAndName[key].add(item.material_code);
  }
  const nameInconsistencies = [];
  for (const [key, codes] of Object.entries(groupsBySiteAndName)) {
    if (codes.size > 1) {
      const [siteId, materialName] = key.split(':');
      nameInconsistencies.push({ siteId, materialName, codes: Array.from(codes) });
    }
  }

  // Check 2: same site_id and material_code should have same material_name
  const groupsBySiteAndCode = {};
  for (const item of stock) {
    const key = `${item.site_id}:${item.material_code}`;
    if (!groupsBySiteAndCode[key]) {
      groupsBySiteAndCode[key] = new Set();
    }
    groupsBySiteAndCode[key].add(item.material_name);
  }
  const codeInconsistencies = [];
  for (const [key, names] of Object.entries(groupsBySiteAndCode)) {
    if (names.size > 1) {
      const [siteId, materialCode] = key.split(':');
      codeInconsistencies.push({ siteId, materialCode, names: Array.from(names) });
    }
  }

  console.log('\n=== INCONSISTENCIES: same site_id, material_name but different material_code ===');
  if (nameInconsistencies.length === 0) {
    console.log('None found.');
  } else {
    for (const inc of nameInconsistencies) {
      console.log(`Site ${inc.siteId}, Material: ${inc.materialName}`);
      console.log(`  Codes: ${inc.codes.join(', ')}`);
    }
  }

  console.log('\n=== INCONSISTENCIES: same site_id, material_code but different material_name ===');
  if (codeInconsistencies.length === 0) {
    console.log('None found.');
  } else {
    for (const inc of codeInconsistencies) {
      console.log(`Site ${inc.siteId}, Code: ${inc.materialCode}`);
      console.log(`  Names: ${inc.names.join(', ')}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Name inconsistencies: ${nameInconsistencies.length}`);
  console.log(`Code inconsistencies: ${codeInconsistencies.length}`);
}

main().catch(e => console.error('Error:', e.message));