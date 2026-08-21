// CDL Site Management — config.js
// Central configuration and Supabase client export

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';

// Environment variables (set in Netlify / .env)
// Access via fetch in browser or from Netlify functions
// For browser-based apps, Supabase env vars are injected at build time
export const SUPABASE_URL = 'https://dljvplrbjogncwrpmfsj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsanZwbHJiam9nbmN3cnBtZnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjAxMzIsImV4cCI6MjA5NDA5NjEzMn0.GmsMNKlRos6ZChy143_YrSlDB477RHPxkRqA0wGJB1E';

// App metadata
export const APP_CLIENT = 'Canaan Developers Ltd · Nairobi, Kenya';
export const LOGO_URL = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODQiIGhlaWdodD0iODQiIHZpZXdCb3g9IjAgMCA4NCA4NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyLjMgMEE0MCA0MCAwIDI2IDMaY2xhc3M9ImxvZ28tZmxvYXQiIHN0eWxlPSJmb250LWZhbWlseTogJ2FyaWFsLTYyJyIgZm9udC1zaXplOiA0cHg7IGZpbGw6ICdyZWFkbWluJz48L3BhdGg+Cjwvc3ZnPgo=';

// Export Supabase client for all modules to use
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// App constants
export const APP_NAME = 'CDL Site Management';
export const APP_VERSION = 'v11.0';
export const SITES = [
  { id: 1, name: 'Aura Peponi', type: 'residential' },
  { id: 2, name: 'Aura Riverside', type: 'residential' },
  { id: 3, name: 'Miotoni (Karen)', type: 'residential' },
  { id: 4, name: 'SBC', type: 'residential' },
  { id: 5, name: 'EL-Signature', type: 'residential' },
  { id: 6, name: 'OKAS', type: 'residential' },
  { id: 7, name: 'Altura (Upper Hill)', type: 'commercial' },
  { id: 8, name: 'Whispering Oaks (Karen)', type: 'residential' },
  { id: 9, name: 'Enchanting Oaks', type: 'residential' },
  { id: 10, name: 'Nyari', type: 'residential' },
  { id: 11, name: 'Central Store (GRS/Mlolongo)', type: 'warehouse' }
];

// AI message limits per role
// Only strategic/executive roles have AI access by default.
// Operational roles are blocked at BOTH the UI and the backend Netlify function.
// Custom roles with ai:access permission in role_permissions table can still get access.
export const AI_MSG_LIMITS = {
  admin: Infinity,
  company_owner: 20,
  ceo: 7,
  asset_manager: 7,       // Enabled: oversees plant/equipment across all sites
  office_manager: 0,
  finance: 0,
  // --- BLOCKED ROLES (ai:access custom permission can override per user) ---
  project_manager: 0,
  engineer: 0,
  store_manager: 0,
  storekeeper_local: 0,
  storekeeper_import: 0,
  storekeeper_scaffolding: 0,
  procurement_officer: 0,
  transfer_officer: 0,
  data_holder: 0,
  supervisor: 0,
  site_overseer: 0,
};

// AI keys are stored server-side in Netlify env (GEMINI_KEYS).
// Do NOT add keys here — they will be scanned and revoked by Google.
export const GEMINI_KEYS = []; // kept for legacy import compat
export const GEMINI_MODEL_PRIMARY = "gemini-3.6-flash";
export const GEMINI_MODEL_FALLBACK = "gemini-3.6-flash";
export async function syncLiveSites() {
  try {
    const { data: dbSites } = await supabase.from('sites').select('*').order('id', { ascending: true });
    if (dbSites && dbSites.length > 0) {
      SITES.splice(0, SITES.length, ...dbSites);
    }
  } catch (_) {}
}
