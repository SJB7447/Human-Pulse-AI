import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://nedtvbnodkdmofhvhpbm.supabase.co';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const hasUsableServiceRole = Boolean(serviceRoleKey) && serviceRoleKey !== anonKey;
// Prefer service role for backend mutations. Fallback to anon for local read paths.
const key = hasUsableServiceRole ? serviceRoleKey : anonKey;

if (!hasUsableServiceRole) {
  console.warn(
    '[Supabase] SUPABASE_SERVICE_ROLE_KEY is missing or equals anon key. ' +
    'Admin/write operations may fail under RLS.'
  );
}

export const supabase: SupabaseClient = createClient(url, key);
