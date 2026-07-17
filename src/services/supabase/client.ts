import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
const disabledForLocalTests = import.meta.env.VITE_DISABLE_SUPABASE === 'true';

export const supabase: SupabaseClient | null = !disabledForLocalTests && url && publishableKey ? createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } }
}) : null;
export const isCloudEnabled = Boolean(supabase);
