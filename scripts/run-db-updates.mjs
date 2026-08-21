import pg from 'pg';

const { Client } = pg;

const passwords = [
  "CDL@Supabase2025!",
  "Ytc9nqSU*CzHu@M",
  "Miki32@@Meriam@@32",
  "Miki32@@Meriam@@32"
];
const hosts = [
  "aws-1-eu-west-2.pooler.supabase.com",
  "db.dljvplrbjogncwrpmfsj.supabase.co"
];
const ports = [6543, 5432];

async function tryConnect() {
  for (const password of passwords) {
    for (const host of hosts) {
      for (const port of ports) {
        console.log(`Trying to connect to ${host}:${port} with password ending in ${password.slice(-4)}...`);
        const client = new Client({
          host,
          port,
          database: "postgres",
          user: "postgres.dljvplrbjogncwrpmfsj",
          password,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000
        });

        try {
          await client.connect();
          console.log(`Successfully connected to ${host}:${port} with password ending in ${password.slice(-4)}!`);
          return client;
        } catch (err) {
          // don't log full error to avoid spamming if it's just auth failure
        }
      }
    }
  }
  throw new Error("Could not connect to any database configuration with any password");
}

async function run() {
  const client = await tryConnect();

  try {
    // 1. Add collected_at column if missing
    console.log("Checking for collected_at column in material_requests...");
    const colCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'material_requests' AND column_name = 'collected_at'
    `);

    if (colCheck.rows.length === 0) {
      console.log("Adding collected_at column to material_requests table...");
      await client.query(`ALTER TABLE material_requests ADD COLUMN collected_at TIMESTAMPTZ`);
      console.log("Column added successfully!");
    } else {
      console.log("Column collected_at already exists.");
    }

    // 2. Update user passwords - UPSERT pattern: UPDATE if exists, INSERT if not
    console.log("Updating user passwords...");

    const rolePasswords = {
      // admin
      "admin@canaan.co.ke": { password: "admin123", name: "Admin", role: "admin", site_ids: [1] },
      // company_owner - already exists
      // ceo - already exists
      // office_manager
      "om@canaan.co.ke": { password: "om123", name: "Office Manager", role: "office_manager", site_ids: [1] },
      // engineer
      "eng@canaan.co.ke": { password: "eng123", name: "Engineer", role: "engineer", site_ids: [1] },
      // store_manager
      "sm@canaan.co.ke": { password: "sm123", name: "Store Manager", role: "store_manager", site_ids: [1] },
      // storekeeper_local, storekeeper_import, storekeeper_scaffolding - already exist
      // procurement_officer
      "po@canaan.co.ke": { password: "po123", name: "Procurement Officer", role: "procurement_officer", site_ids: [1] },
      // transfer_officer
      "to@canaan.co.ke": { password: "to123", name: "Transfer Officer", role: "transfer_officer", site_ids: [1] },
      // data_holder
      "dh@canaan.co.ke": { password: "dh123", name: "Data Holder", role: "data_holder", site_ids: [1] },
      // site_overseer
      "so@canaan.co.ke": { password: "so123", name: "Site Overseer", role: "site_overseer", site_ids: [1] },
      // supervisor - use a different email since supervisor@canaan.co.ke doesn't exist
      "supervisor@canaan.co.ke": { password: "so123", name: "Supervisor", role: "supervisor", site_ids: [1] },
    };

    for (const [email, info] of Object.entries(rolePasswords)) {
      // Try UPDATE first
      const siteIdsStr = info.site_ids ? `{${info.site_ids.join(',')}}` : null;
      const updateRes = await client.query(
        `UPDATE users SET password_hash = $1, name = $2, role = $3, is_active = true, site_ids = $4 WHERE email = $5 RETURNING id, name, email, role`,
        [info.password, info.name, info.role, siteIdsStr, email]
      );

      if (updateRes.rows.length > 0) {
        console.log(`Updated password for ${email}:`, updateRes.rows[0]);
      } else {
        // User doesn't exist, INSERT
        const insertRes = await client.query(
          `INSERT INTO users (email, name, password_hash, role, is_active, site_ids) VALUES ($1, $2, $3, $4, true, $5) RETURNING id, name, email, role`,
          [email, info.name, info.password, info.role, siteIdsStr]
        );
        console.log(`Created new user for ${email}:`, insertRes.rows[0]);
      }
    }

    // Also update company_owner and ceo passwords (they exist but may have wrong password)
    const existingUpdates = [
      { email: "owner@canaan.co.ke", password: "owner123" },
      { email: "ceo@canaan.co.ke", password: "ceo123" },
      { email: "finance@canaan.co.ke", password: "finance123" },
      { email: "pm1@canaan.co.ke", password: "pm123" },
      { email: "sk.local@canaan.co.ke", password: "sk123" },
      { email: "sk.import@canaan.co.ke", password: "sk123" },
      { email: "sk.scaff@canaan.co.ke", password: "sk123" },
      { email: "am@canaan.co.ke", password: "am123" },
    ];

    for (const { email, password } of existingUpdates) {
      const siteIdsStr = `{1}`;
      const roleMapLookup = {
        "owner@canaan.co.ke": { role: "company_owner", name: "Company Owner" },
        "ceo@canaan.co.ke": { role: "ceo", name: "CEO Canaan" },
        "finance@canaan.co.ke": { role: "finance", name: "Finance Officer" },
        "pm1@canaan.co.ke": { role: "project_manager", name: "Project Manager 1" },
        "sk.local@canaan.co.ke": { role: "storekeeper_local", name: "Storekeeper Local" },
        "sk.import@canaan.co.ke": { role: "storekeeper_import", name: "Storekeeper Import" },
        "sk.scaff@canaan.co.ke": { role: "storekeeper_scaffolding", name: "Storekeeper Scaffolding" },
        "am@canaan.co.ke": { role: "asset_manager", name: "Asset Manager" },
      };
      const roleInfo = roleMapLookup[email] || { role: "user", name: "User" };
      const res = await client.query(
        `UPDATE users SET password_hash = $1, role = $2, name = $3, site_ids = $4, is_active = true WHERE email = $5 RETURNING name, email, role`,
        [password, roleInfo.role, roleInfo.name, siteIdsStr, email]
      );
      console.log(`Password updated for ${email}:`, res.rows.length > 0 ? res.rows[0] : "NOT FOUND - creating...");

      if (res.rows.length === 0) {
        // Need to figure out the right role and create it
        const roleMap = {
          "owner@canaan.co.ke": { name: "Company Owner", role: "company_owner", site_ids: [1] },
          "ceo@canaan.co.ke": { name: "CEO", role: "ceo", site_ids: [1] },
          "finance@canaan.co.ke": { name: "Finance", role: "finance", site_ids: [1] },
          "pm1@canaan.co.ke": { name: "Project Manager", role: "project_manager", site_ids: [1] },
          "sk.local@canaan.co.ke": { name: "Storekeeper Local", role: "storekeeper_local", site_ids: [1] },
          "sk.import@canaan.co.ke": { name: "Storekeeper Import", role: "storekeeper_import", site_ids: [1] },
          "sk.scaff@canaan.co.ke": { name: "Storekeeper Scaffolding", role: "storekeeper_scaffolding", site_ids: [1] },
          "am@canaan.co.ke": { name: "Asset Manager", role: "asset_manager", site_ids: [1] },
        };
        const info = roleMap[email];
        if (info) {
          const siteIdsStr = `{${info.site_ids.join(',')}}`;
          const insertRes = await client.query(
            `INSERT INTO users (email, name, password_hash, role, is_active, site_ids) VALUES ($1, $2, $3, $4, true, $5) RETURNING id, name, email, role`,
            [email, info.name, password, info.role, siteIdsStr]
          );
          console.log(`Created user ${email}:`, insertRes.rows[0]);
        }
      }
    }

    // Verify all test users exist now
    console.log("\n=== Verifying all test users ===");
    const allTestEmails = [
      "admin@canaan.co.ke", "owner@canaan.co.ke", "ceo@canaan.co.ke",
      "om@canaan.co.ke", "am@canaan.co.ke", "finance@canaan.co.ke",
      "pm1@canaan.co.ke", "eng@canaan.co.ke", "sm@canaan.co.ke",
      "sk.local@canaan.co.ke", "sk.import@canaan.co.ke", "sk.scaff@canaan.co.ke",
      "po@canaan.co.ke", "to@canaan.co.ke", "dh@canaan.co.ke",
      "so@canaan.co.ke", "supervisor@canaan.co.ke"
    ];
    for (const email of allTestEmails) {
      const res = await client.query(
        `SELECT email, name, role, password_hash FROM users WHERE email = $1`,
        [email]
      );
      if (res.rows.length > 0) {
        const u = res.rows[0];
        console.log(`  ${email}: role=${u.role}, name=${u.name}`);
      } else {
        console.log(`  ${email}: MISSING`);
      }
    }

  } catch (err) {
    console.error("Error executing queries:", err);
  } finally {
    await client.end();
    console.log("Disconnected from database.");
  }
}

run().catch(console.error);
