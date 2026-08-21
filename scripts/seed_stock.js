// Seed realistic stock data across all 11 sites
// Run with: node seed_stock.js

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

// Materials per category with realistic Kenyan construction prices
const MATERIALS = [
  // Electrical
  { name: '1 Gang 2 Way Switch', code: 'EL001', category: 'Electrical', unit: 'Pcs', price: 450, type: 'local' },
  { name: '13A Socket Outlet', code: 'EL003', category: 'Electrical', unit: 'Pcs', price: 650, type: 'local' },
  { name: 'Conduit Pipe 20mm', code: 'EL005', category: 'Electrical', unit: 'Metres', price: 120, type: 'local' },
  { name: 'Cable 2.5mm Twin & Earth', code: 'EL008', category: 'Electrical', unit: 'Metres', price: 85, type: 'local' },
  { name: 'MCB 32A Single Pole', code: 'EL015', category: 'Electrical', unit: 'Pcs', price: 1200, type: 'local' },
  // Plumbing
  { name: 'PVC Pipe 110mm', code: 'PL001', category: 'Plumbing', unit: 'Metres', price: 850, type: 'local' },
  { name: 'PVC Pipe 50mm', code: 'PL002', category: 'Plumbing', unit: 'Metres', price: 320, type: 'local' },
  { name: 'Ball Valve 25mm', code: 'PL003', category: 'Plumbing', unit: 'Pcs', price: 480, type: 'local' },
  { name: 'Sink Mixer', code: 'PL004', category: 'Plumbing', unit: 'Pcs', price: 3500, type: 'imported' },
  // Concrete
  { name: 'Ordinary Portland Cement 50kg', code: 'CE001', category: 'Concrete', unit: 'Bags', price: 750, type: 'local' },
  { name: 'Ballast 20mm', code: 'CE002', category: 'Concrete', unit: 'Tons', price: 2800, type: 'local' },
  { name: 'River Sand', code: 'CE003', category: 'Concrete', unit: 'Tons', price: 2200, type: 'local' },
  { name: 'Ready Mix Concrete', code: 'CE004', category: 'Concrete', unit: 'M3', price: 12000, type: 'local' },
  // Steel
  { name: 'Steel Rebar 12mm', code: 'ST001', category: 'Steel', unit: 'Metres', price: 650, type: 'local' },
  { name: 'Steel Rebar 8mm', code: 'ST002', category: 'Steel', unit: 'Metres', price: 380, type: 'local' },
  { name: 'Binding Wire', code: 'ST003', category: 'Steel', unit: 'Kgs', price: 280, type: 'local' },
  { name: 'Steel Mesh BRC A142', code: 'ST004', category: 'Steel', unit: 'Sheets', price: 4500, type: 'imported' },
  // Timber
  { name: 'Sawn Timber 6x1', code: 'TI001', category: 'Timber', unit: 'Metres', price: 180, type: 'local' },
  { name: 'Sawn Timber 4x2', code: 'TI002', category: 'Timber', unit: 'Metres', price: 120, type: 'local' },
  { name: 'Plywood 18mm', code: 'TI003', category: 'Timber', unit: 'Sheets', price: 3200, type: 'local' },
  { name: 'Props 3m', code: 'TI004', category: 'Timber', unit: 'Pcs', price: 950, type: 'local' },
  // Finishing
  { name: 'Wall Paint 20L White', code: 'FI001', category: 'Finishing', unit: 'Litres', price: 2800, type: 'local' },
  { name: 'Floor Tiles 60x60', code: 'FI002', category: 'Finishing', unit: 'M2', price: 1800, type: 'imported' },
  { name: 'Ceiling Tiles 60x60', code: 'FI003', category: 'Finishing', unit: 'Pcs', price: 450, type: 'imported' },
  // Roofing
  { name: 'Mabati Box Profile G28', code: 'RF001', category: 'Roofing', unit: 'Metres', price: 650, type: 'local' },
  { name: 'Roofing Nails', code: 'RF002', category: 'Roofing', unit: 'Kgs', price: 450, type: 'local' },
  { name: 'Gutters PVC 4 inch', code: 'RF003', category: 'Roofing', unit: 'Metres', price: 380, type: 'local' },
  // Safety
  { name: 'Safety Helmet', code: 'SF001', category: 'Safety', unit: 'Pcs', price: 850, type: 'local' },
  { name: 'Safety Vest Hi-Vis', code: 'SF002', category: 'Safety', unit: 'Pcs', price: 650, type: 'local' },
  { name: 'Dust Masks Box', code: 'SF003', category: 'Safety', unit: 'Box', price: 1200, type: 'local' },
  // Scaffolding
  { name: 'Scaffolding Frame 1.8m', code: 'SC001', category: 'Scaffolding', unit: 'Pcs', price: 8500, type: 'scaffolding' },
  { name: 'Scaffolding Base Jack', code: 'SC002', category: 'Scaffolding', unit: 'Pcs', price: 3200, type: 'scaffolding' },
  { name: 'Scaffolding Coupler', code: 'SC003', category: 'Scaffolding', unit: 'Pcs', price: 1800, type: 'scaffolding' },
  { name: 'Scaffolding Plank 3m', code: 'SC004', category: 'Scaffolding', unit: 'Pcs', price: 4500, type: 'scaffolding' },
  // Hardware
  { name: 'Nails 3 inch Kgs', code: 'HW001', category: 'Hardware', unit: 'Kgs', price: 280, type: 'local' },
  { name: 'Nails 4 inch Kgs', code: 'HW002', category: 'Hardware', unit: 'Kgs', price: 280, type: 'local' },
  { name: 'Door Lock Set', code: 'HW003', category: 'Hardware', unit: 'Pcs', price: 4500, type: 'imported' },
  { name: 'Hinges 4 inch Stainless', code: 'HW004', category: 'Hardware', unit: 'Pcs', price: 850, type: 'imported' },
  // Waterproofing
  { name: 'SuperPlast Waterproof', code: 'WP001', category: 'Waterproofing', unit: 'Kgs', price: 1200, type: 'local' },
  { name: 'Bituminous Paint 20L', code: 'WP002', category: 'Waterproofing', unit: 'Litres', price: 4500, type: 'local' },
];

async function main() {
  // First clear existing test stock (keep only real entries)
  console.log('Clearing existing stock...');
  const existing = await fetch('GET', '/rest/v1/stock?select=id&limit=1000');
  if (Array.isArray(existing.body)) {
    for (const item of existing.body) {
      await fetch('DELETE', '/rest/v1/stock?id=eq.' + item.id);
    }
    console.log('  Cleared ' + existing.body.length + ' existing items');
  }

  // Insert stock for each site
  let total = 0;
  for (let siteId = 1; siteId <= 11; siteId++) {
    // Determine which materials go to which site
    // All sites get local materials, some get imported/scaffolding
    const siteMaterials = MATERIALS.filter(m => {
      // Skip scaffolding for non-construction sites (only sites 1-10 are construction)
      if (m.type === 'scaffolding' && siteId > 10) return false;
      return true;
    });

    for (const mat of siteMaterials) {
      // Vary quantities per site to make it interesting
      const baseQty = Math.floor(Math.random() * 200) + 5;
      const qty = mat.type === 'scaffolding' ? Math.floor(baseQty / 10) + 2 : baseQty;

      await fetch('POST', '/rest/v1/stock', {
        site_id: siteId,
        material_name: mat.name,
        material_code: mat.code,
        category: mat.category,
        quantity: qty,
        unit: mat.unit,
        unit_price: mat.price,
        storekeeper_type: mat.type,
        opening_balance_locked: false,
        updated_by: null
      });
      total++;
    }
    console.log('  Site ' + siteId + ': ' + siteMaterials.length + ' materials');
  }
  console.log('Done! Total stock items seeded: ' + total);
}

main().catch(e => console.error('Error:', e.message));
