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

/**
 * Safely find a user by username or user_id without PostgREST .or() comma-splitting errors.
 */
export async function findUserByIdentifier(identifier: string): Promise<Record<string, any> | null> {
  const clean = identifier.trim();
  if (!clean) return null;

  try {
    // 1. Try exact or case-insensitive match on username
    const { data: byUsername, error: errUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('username', clean)
      .maybeSingle();

    if (!errUser && byUsername) {
      return byUsername;
    }

    // 2. Try exact or case-insensitive match on user_id
    const { data: byUserId, error: errId } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('user_id', clean)
      .maybeSingle();

    if (!errId && byUserId) {
      return byUserId;
    }

    // 3. Fallback: Substring search on username (handles partial names like "Ivan Rahas")
    const { data: byPartial, error: errPartial } = await supabaseAdmin
      .from('users')
      .select('*')
      .ilike('username', `%${clean}%`)
      .limit(1);

    if (!errPartial && byPartial && byPartial.length > 0) {
      return byPartial[0];
    }

    return null;
  } catch (err) {
    console.error('Error finding user by identifier:', err);
    return null;
  }
}

