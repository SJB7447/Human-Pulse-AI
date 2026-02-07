import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://nedtvbnodkdmofhvhpbm.supabase.co';
// Use SERVICE_ROLE_KEY for backend operations to bypass RLS
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Server operations may fail if RLS is enabled.");
}

export const supabase: SupabaseClient = createClient(url, key);
