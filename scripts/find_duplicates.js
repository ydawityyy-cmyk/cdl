// Duplicate stock finder for CDL ERP
// Run with: node find_duplicates.js

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
  const response = await fetch('GET', '/rest/v1/stock?select=*');
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

  // Group by site_id and material_name
  const groups = {};
  for (const item of stock) {
    const key = `${item.site_id}:${item.material_name}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  // Filter groups with more than one item
  const duplicateGroups = Object.entries(groups).filter(([key, items]) => items.length > 1);
  console.log(`Found ${duplicateGroups.length} potential duplicate groups`);

  // For each group, check if exact duplicates
  const exactDuplicates = [];
  const ambiguous = [];

  for (const [key, items] of duplicateGroups) {
    const [siteId, materialName] = key.split(':');
    // Check if all items have the same values for all fields except id and updated_by
    const first = items[0];
    let isExact = true;
    for (const item of items.slice(1)) {
      // Compare all fields except id and updated_by
      const keysToCompare = Object.keys(item).filter(k => k !== 'id' && k !== 'updated_by');
      for (const k of keysToCompare) {
        if (item[k] !== first[k]) {
          isExact = false;
          break;
        }
      }
      if (!isExact) break;
    }
    if (isExact) {
      exactDuplicates.push({ siteId, materialName, items });
    } else {
      ambiguous.push({ siteId, materialName, items });
    }
  }

  console.log('\n=== EXACT DUPLICATES (safe to merge) ===');
  for (const group of exactDuplicates) {
    console.log(`Site ${group.siteId}, Material: ${group.materialName}`);
    console.log(`  Found ${group.items.length} duplicates:`);
    for (const item of group.items) {
      console.log(`    ID: ${item.id}, Qty: ${item.quantity} ${item.unit}, Price: ${item.unit_price}, Storekeeper: ${item.storekeeper_type}`);
    }
    // Suggest merging: sum quantities, keep the earliest ID
    const totalQty = group.items.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
    const earliestItem = group.items.reduce((a, b) => new Date(a.created_at || 0) < new Date(b.created_at || 0) ? a : b);
    console.log(`  Suggested merge: Keep ID ${earliestItem.id}, set quantity to ${totalQty}, delete others`);
    console.log('');
  }

  console.log('\n=== AMBIGUOUS DUPLICATES (need review) ===');
  for (const group of ambiguous) {
    console.log(`Site ${group.siteId}, Material: ${group.materialName}`);
    console.log(`  Found ${group.items.length} variants:`);
    for (const item of group.items) {
      console.log(`    ID: ${item.id}, Qty: ${item.quantity} ${item.unit}, Price: ${item.unit_price}, Storekeeper: ${item.storekeeper_type}, Updated: ${item.updated_at || 'N/A'}`);
    }
    console.log('');
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Exact duplicates: ${exactDuplicates.length} groups`);
  console.log(`Ambiguous duplicates: ${ambiguous.length} groups`);
}

main().catch(e => console.error('Error:', e.message));