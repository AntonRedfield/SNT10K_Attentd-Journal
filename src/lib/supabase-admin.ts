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
 * Safely and flexibly find a user by username, user_id, NIP, role, or partial name.
 */
export async function findUserByIdentifier(identifier: string): Promise<Record<string, any> | null> {
  const clean = identifier.trim();
  if (!clean) return null;

  try {
    const { data: allUsers, error } = await supabaseAdmin
      .from('users')
      .select('*');

    if (error || !allUsers || allUsers.length === 0) {
      return null;
    }

    const lowerClean = clean.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Exact match on user_id (case-insensitive)
    const exactId = allUsers.find((u) => String(u.user_id || '').toLowerCase() === clean.toLowerCase());
    if (exactId) return exactId;

    // 2. Exact match on username (case-insensitive)
    const exactUsername = allUsers.find((u) => String(u.username || '').toLowerCase() === clean.toLowerCase());
    if (exactUsername) return exactUsername;

    // 3. Exact match on NIP
    const exactNip = allUsers.find((u) => String(u.nip || '').trim() === clean && clean !== '-');
    if (exactNip) return exactNip;

    // 4. Shortcut for Admin
    if (lowerClean === 'admin' || lowerClean === 'administrator') {
      const adminUser = allUsers.find((u) => String(u.role || '').toLowerCase() === 'admin');
      if (adminUser) return adminUser;
    }

    // 5. Shortcut for Principal (Kepala Sekolah)
    if (lowerClean === 'kepsek' || lowerClean === 'kepalasekolah' || lowerClean === 'principal') {
      const kepsekUser = allUsers.find((u) => String(u.role || '').toLowerCase().includes('kepala'));
      if (kepsekUser) return kepsekUser;
    }

    // 6. Match by password alias (e.g. user enters "guru1", "guru2", "kelapa321")
    const byPass = allUsers.find((u) => String(u.password || '').toLowerCase() === clean.toLowerCase());
    if (byPass) return byPass;

    // 7. Token-based word search on username (handles "Ivan Rahas", "Erlando Leoanak", etc.)
    const cleanTokens = clean.toLowerCase().split(/[\s,.-]+/).filter((t) => t.length >= 2);
    if (cleanTokens.length > 0) {
      const tokenMatch = allUsers.find((u) => {
        const uName = String(u.username || '').toLowerCase();
        return cleanTokens.every((tok) => uName.includes(tok));
      });
      if (tokenMatch) return tokenMatch;

      // Single specific token match (e.g. "Leoanak", "Sulthoni", "Fatkhuriza")
      const singleTokenMatch = allUsers.find((u) => {
        const uName = String(u.username || '').toLowerCase();
        return cleanTokens.some((tok) => tok.length >= 4 && uName.includes(tok));
      });
      if (singleTokenMatch) return singleTokenMatch;
    }

    // 8. Normalized alphanumeric partial match
    const normalizedMatch = allUsers.find((u) => {
      const uNorm = String(u.username || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const idNorm = String(u.user_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return (lowerClean.length >= 3 && uNorm.includes(lowerClean)) || idNorm.includes(lowerClean) || (lowerClean.length >= 4 && lowerClean.includes(idNorm));
    });
    if (normalizedMatch) return normalizedMatch;

    return null;
  } catch (err) {
    console.error('Error finding user by identifier:', err);
    return null;
  }
}

