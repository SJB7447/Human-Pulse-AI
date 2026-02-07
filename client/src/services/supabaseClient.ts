import { createClient, SupabaseClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (!supabaseInstance) {
    let url = envUrl;
    let key = envKey;

    // Fallback: If env vars are missing/empty, use hardcoded credentials
    if (!url || !key) {
      console.warn('[Supabase] Env vars missing. Using fallback credentials.');
      url = 'https://nedtvbnodkdmofhvhpbm.supabase.co';
      key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lZHR2Ym5vZGtkbW9maHZocGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NjAyNDAsImV4cCI6MjA4NDQzNjI0MH0.3h-uRTIZdAp8m8IMGxKF2r0uEvB5eWSvETCDQ1pCjE8';
    }

    if (url && key) {
      // console.log('[Supabase] Initializing client with:', url); // Optional: Comment out for production
      supabaseInstance = createClient(url, key);
    } else {
      console.error('[Supabase] Failed to initialize: Missing credentials even after fallback.');
      // Prevent crash with dummy client
      supabaseInstance = createClient('https://placeholder.supabase.co', 'placeholder');
    }
  }
  return supabaseInstance;
};

// Default export for backward compatibility if needed, though named export is preferred
export const supabase = getSupabase();