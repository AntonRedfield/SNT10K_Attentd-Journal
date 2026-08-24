import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  'https://nhqtsbdeviaikjyjrujc.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey
);
