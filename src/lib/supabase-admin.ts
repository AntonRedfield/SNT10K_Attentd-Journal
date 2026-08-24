import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  'https://nhqtsbdeviaikjyjrujc.supabase.co';

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
