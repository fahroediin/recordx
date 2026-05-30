import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─── Chrome Storage Adapter ──────────────────────────────────
// MV3 service workers don't have localStorage access.
// This adapter bridges supabase-js to chrome.storage.local.
const chromeStorageAdapter = {
  async getItem(key) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  },
  async setItem(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key) {
    await chrome.storage.local.remove(key);
  },
};

// ─── Determine Storage Adapter ───────────────────────────────
// Use chrome.storage.local in extension context, localStorage in web context
function getStorageAdapter() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chromeStorageAdapter;
  }
  return undefined; // Use default localStorage
}

// ─── Create Supabase Client ─────────────────────────────────
let supabaseInstance = null;

export function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[RecordX] Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
    return null;
  }

  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: getStorageAdapter(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // We handle redirects manually in the extension
      flowType: 'pkce',
    },
  });

  return supabaseInstance;
}

export default getSupabase;
