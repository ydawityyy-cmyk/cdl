// Netlify Function — Admin Create User with Supabase Auth GoTrue Integration
// POST /.netlify/functions/admin-create-user
// Authorizes admin caller, creates user in auth.users and public.users simultaneously

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dljvplrbjogncwrpmfsj.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsanZwbHJiam9nbmN3cnBtZnNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyMDEzMiwiZXhwIjoyMDk0MDk2MTMyfQ.20i7g7ClEJVCvKiVFR3-mXT-9EoHVhRV6iSiioWa-O0';

function httpsRequest(url, options, body) {
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
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // 1. Verify caller JWT
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing authorization header' })
      };
    }
    const jwt = authHeader.slice(7);

    // Get caller info from auth
    const callerAuthRes = await httpsRequest(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
    });

    if (callerAuthRes.status !== 200) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid or expired session' })
      };
    }

    const callerAuth = JSON.parse(callerAuthRes.body);
    const callerId = callerAuth.id;

    // Check caller role in public.users
    const callerUserRes = await httpsRequest(`${SUPABASE_URL}/rest/v1/users?id=eq.${callerId}&select=role,is_active&limit=1`, {
      method: 'GET',
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' }
    });
    const callerRows = JSON.parse(callerUserRes.body);
    if (!callerRows.length || !callerRows[0].is_active || !['admin', 'company_owner', 'ceo', 'asset_manager'].includes(callerRows[0].role)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Permission denied — admin role required' })
      };
    }

    // 2. Parse target user payload
    const body = JSON.parse(event.body || '{}');
    const { name, email, role, password, position, site_ids, custom_perms } = body;

    if (!name || !email || !role) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Name, email, and role are required' })
      };
    }

    const userPassword = password || 'canaan2024';
    let targetUserId = null;

    // 3. Create or Update user in Supabase Auth
    const createAuthRes = await httpsRequest(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({
      email: email.trim().toLowerCase(),
      password: userPassword,
      email_confirm: true,
      user_metadata: { name: name.trim(), role }
    }));

    if (createAuthRes.status === 200 || createAuthRes.status === 201) {
      const created = JSON.parse(createAuthRes.body);
      targetUserId = created.id;
    } else {
      // If user already exists in Auth, look them up
      const checkRes = await httpsRequest(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'GET',
        headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' }
      });
      if (checkRes.status === 200) {
        const list = JSON.parse(checkRes.body);
        const found = (list.users || []).find(u => u.email?.toLowerCase() === email.trim().toLowerCase());
        if (found) {
          targetUserId = found.id;
          if (password) {
            // Update password in Auth if provided
            await httpsRequest(`${SUPABASE_URL}/auth/v1/admin/users/${found.id}`, {
              method: 'PUT',
              headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' }
            }, JSON.stringify({ password }));
          }
        }
      }
    }

    if (!targetUserId) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Failed to provision auth user in Supabase' })
      };
    }

    // 4. Upsert into public.users with the exact targetUserId
    const userPayload = {
      id: targetUserId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      position: position || null,
      site_ids: Array.isArray(site_ids) ? site_ids.map(Number).filter(n => !isNaN(n) && n > 0) : [],
      custom_perms: Array.isArray(custom_perms) ? custom_perms.filter(p => typeof p === 'string' && p.length > 0) : [],
      is_active: true,
      password_hash: userPassword
    };

    const upsertRes = await httpsRequest(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      }
    }, JSON.stringify(userPayload));

    if (upsertRes.status >= 400) {
      return {
        statusCode: upsertRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Database record error: ${upsertRes.body}` })
      };
    }

    const savedRecord = JSON.parse(upsertRes.body)[0] || userPayload;

    // 5. Auto-save to user_credentials vault (admin-only, permanent record)
    try {
      const credPayload = {
        user_id: targetUserId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        plain_password: userPassword,
        site_ids: Array.isArray(site_ids) ? site_ids.join(',') : '',
        created_by: callerId,
        notes: 'Created via Admin Dashboard'
      };
      await httpsRequest(`${SUPABASE_URL}/rest/v1/user_credentials`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        }
      }, JSON.stringify(credPayload));
      console.log('[admin-create-user] Credentials saved to vault for:', email);
    } catch (credErr) {
      console.warn('[admin-create-user] Could not save to credentials vault:', credErr.message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        user: {
          id: targetUserId,
          name: savedRecord.name,
          email: savedRecord.email,
          role: savedRecord.role,
          position: savedRecord.position,
          site_ids: savedRecord.site_ids,
          is_active: savedRecord.is_active
        }
      })
    };
  } catch (err) {
    console.error('[admin-create-user] Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};
