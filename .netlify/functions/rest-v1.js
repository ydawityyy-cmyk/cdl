// Netlify Function — Supabase REST API proxy
// Proxies /rest/v1/* to Supabase, forwarding the client's JWT Authorization header
// so RLS policies using auth.uid() work correctly.
const https = require('https');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dljvplrbjogncwrpmfsj.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';

function proxyRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  try {
    const restPath = event.path.replace(/^\/rest\/v1/, '');
    const params = new URLSearchParams(event.queryStringParameters || {}).toString();
    const fullUrl = `${SUPABASE_URL}/rest/v1/${restPath}${params ? '?' + params : ''}`;

    // Forward client's JWT if present, otherwise fall back to service_role
    const clientAuth = event.headers['authorization'] || event.headers['Authorization'];
    const apikey = clientAuth ? '' : SERVICE_ROLE;
    const authHeader = clientAuth || `Bearer ${SERVICE_ROLE}`;

    const headers = {
      'apikey': apikey,
      'Authorization': authHeader,
      'Content-Type': event.headers['content-type'] || 'application/json',
    };
    if (event.headers['prefer']) headers['Prefer'] = event.headers['prefer'];

    const options = {
      method: event.httpMethod,
      headers,
    };

    const result = await proxyRequest(fullUrl, options, event.body);

    return {
      statusCode: result.status,
      headers: {
        'Content-Type': result.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      },
      body: result.body,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};