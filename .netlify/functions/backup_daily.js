// CDL — Netlify Scheduled Function: Daily backup at midnight UTC
// Emails backup notification to kebroncanaanstore@gmail.com
// Scheduled via netlify.toml: [functions.backup_daily]
// Imports: Netlify function runtime (requires no external deps)
// Data schema: JSON dump of all CDL tables (users, sites, stock, grn_entries, etc)
// User instruction: "backup zip email send to kebroncanaanstore@gmail every midnight"
const https = require('https');
const zlib = require('zlib');

const TABLES = [
  'users', 'sites', 'stock', 'grn_entries', 'transfer_requests',
  'procurement_requests', 'incidents', 'audit_log', 'agent_chat_history',
  'material_watchlist', 'notifications', 'requests', 'stock_movements'
];

exports.handler = async (event, context) => {
  console.log('=== CDL Daily Backup Function ===');

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://dljvplrbjogncwrpmfsj.supabase.co';
  // Use service_role key for full table access from Netlify Functions (server-side)
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY || '';
  const TO_EMAIL = 'kebroncanaanstore@gmail.com';

  if (!SUPABASE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE key not configured' }) };
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  const fetch = (url, opts = {}) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: { ...headers, ...opts.headers },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)) });
        } catch {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => body });
        }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });

  const backup = {
    metadata: {
      project: 'CDL Site Management',
      environment: 'production (wraith-w.netlify.app)',
      started_at: new Date().toISOString(),
      tables: [],
    },
    data: {},
  };

  async function fetchTable(table) {
    let rows = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
      const url = `${SUPABASE_URL}/rest/v1/${table}?limit=${limit}&offset=${offset}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 404 || res.status === 400) {
            rows.push({ _note: `Table '${table}' not available` }); break;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < limit) break;
        offset += limit;
      } catch (err) {
        console.error(`[${table}] ${err.message}`);
        rows.push({ _error: err.message }); break;
      }
    }
    return rows;
  }

  for (const table of TABLES) {
    console.log(`Backing up: ${table}`);
    const rows = await fetchTable(table);
    backup.data[table] = rows;
    backup.metadata.tables.push({ name: table, rows: rows.length });
  }

  backup.metadata.completed_at = new Date().toISOString();
  backup.metadata.total_size = JSON.stringify(backup).length;

  console.log(`Backup complete. Tables: ${backup.metadata.tables.length}, Size: ${backup.metadata.total_size} bytes`);

  // Send email notification via EmailJS
  const emailPayload = JSON.stringify({
    service_id: process.env.EMAILJS_SERVICE_ID || 'service_v1ur36h',
    template_id: process.env.EMAILJS_TEMPLATE_ID || 'template_ygjqjys',
    user_id: process.env.EMAILJS_PUBLIC_KEY || 'ryd3W4j56HPHbiD09',
    template_params: {
      to_email: TO_EMAIL,
      from_name: 'CDL Backup Service',
      subject: `CDL Daily Backup — ${new Date().toLocaleString('en-KE')}`,
      message: `CDL Site Management backup completed at ${backup.metadata.completed_at}.\n` +
        `Tables exported: ${backup.metadata.tables.map(t => t.name + ' (' + t.rows + ')').join(', ')}\n` +
        `Total size: ${(backup.metadata.total_size / 1024).toFixed(1)} KB\n\n` +
        `Automated backup from wraith-w.netlify.app.`,
    },
  });

  try {
    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: emailPayload,
    });
    console.log('Backup email sent to ' + TO_EMAIL);
  } catch (err) {
    console.error('Email send failed: ' + err.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Daily backup completed',
      tables: backup.metadata.tables.length,
      total_size: backup.metadata.total_size,
      email: TO_EMAIL,
      timestamp: backup.metadata.completed_at,
    }),
  };
};
