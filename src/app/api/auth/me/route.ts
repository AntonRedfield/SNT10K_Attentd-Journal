import { NextRequest, NextResponse } from 'next/server';
import { getSession, signToken, createSessionCookie } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { User, SessionPayload, normalizeRole } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's session payload and fast-login capabilities.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { data: existingUser, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('user_id', session.user_id)
      .maybeSingle();

    if (error) {
      console.error('Supabase user fetch error:', error);
    }

    return NextResponse.json({
      user: {
        ...session,
        role: normalizeRole(session.role),
        has_pin: !!(existingUser?.pin && existingUser.pin.trim().length >= 4),
        has_biometric: !!(existingUser?.biometric_credential_id && existingUser.biometric_credential_id.trim().length > 0),
        biometric_credential_id: existingUser?.biometric_credential_id || '',
      },
    });
  } catch (error) {
    console.error('Session GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/auth/me
 * Quick-edit profile for the currently logged-in user.
 * Allows updating username and/or password.
 * Automatically updates JWT session cookie upon success.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi masuk tidak valid atau telah berakhir.' }, { status: 401 });
    }

    const { username, password } = await request.json();

    if (!username || !username.trim()) {
      return NextResponse.json({ error: 'Nama pengguna (username) wajib diisi.' }, { status: 400 });
    }

    const trimmedUsername = username.trim();

    // Fetch existing user
    const { data: existingUser, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('user_id', session.user_id)
      .maybeSingle();

    if (fetchErr || !existingUser) {
      return NextResponse.json({ error: 'Data akun pengguna tidak ditemukan dalam sistem.' }, { status: 404 });
    }

    // Check duplicate username if username changed
    if (trimmedUsername.toLowerCase() !== existingUser.username?.toLowerCase()) {
      const { data: dupUser } = await supabaseAdmin
        .from('users')
        .select('user_id')
        .ilike('username', trimmedUsername)
        .neq('user_id', session.user_id)
        .maybeSingle();

      if (dupUser) {
        return NextResponse.json(
          { error: `Nama pengguna "${trimmedUsername}" sudah digunakan oleh akun lain.` },
          { status: 409 }
        );
      }
    }

    // Determine final password
    const finalPassword = password && password.trim() ? password.trim() : (existingUser.password || '');

    // Update in Supabase
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        username: trimmedUsername,
        password: finalPassword,
      })
      .eq('user_id', session.user_id);

    if (updateErr) {
      console.error('Supabase update user error:', updateErr);
      return NextResponse.json({ error: 'Gagal memperbarui profil pengguna di database.' }, { status: 500 });
    }

    // Create updated session payload & fresh JWT cookie
    const updatedPayload: SessionPayload = {
      user_id: session.user_id,
      username: trimmedUsername,
      role: (existingUser.role as any) || session.role,
      assigned_class: existingUser.assigned_class || session.assigned_class || 'ALL',
    };

    const token = await signToken(updatedPayload);
    const cookieHeader = createSessionCookie(token);

    const response = NextResponse.json({
      success: true,
      message: 'Profil berhasil diperbarui.',
      user: updatedPayload,
    });

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (error) {
    console.error('Session PUT /api/auth/me error:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui profil pengguna ke database.' },
      { status: 500 }
    );
  }
}
