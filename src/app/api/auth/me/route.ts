import { NextRequest, NextResponse } from 'next/server';
import { getSession, signToken, createSessionCookie } from '@/lib/auth';
import { getSheetRows, findRowIndex, updateRow } from '@/lib/google-sheets';
import { SHEET_USERS, User, SessionPayload, normalizeRole } from '@/lib/constants';

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's session payload.
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

    const users = await getSheetRows<User>(SHEET_USERS);
    const existingUser = users.find((u) => u.user_id === session.user_id);

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

    // Fetch existing users from sheet
    const users = await getSheetRows<User>(SHEET_USERS);
    const existingUser = users.find((u) => u.user_id === session.user_id);

    const rowIndex = await findRowIndex(SHEET_USERS, (row) => row.user_id === session.user_id);
    if (rowIndex === -1 || !existingUser) {
      return NextResponse.json({ error: 'Data akun pengguna tidak ditemukan dalam sistem.' }, { status: 404 });
    }

    // Check duplicate username if username changed
    if (trimmedUsername.toLowerCase() !== existingUser.username?.toLowerCase()) {
      const isDuplicate = users.some(
        (u) => u.user_id !== session.user_id && u.username?.toLowerCase() === trimmedUsername.toLowerCase()
      );
      if (isDuplicate) {
        return NextResponse.json(
          { error: `Nama pengguna "${trimmedUsername}" sudah digunakan oleh akun lain.` },
          { status: 409 }
        );
      }
    }

    // Determine final password
    const finalPassword = password && password.trim() ? password.trim() : (existingUser.password || '');

    // Update row in Google Sheets (user_id, username, password, role, assigned_class, nip, pin, biometric_credential_id, biometric_public_key)
    await updateRow(SHEET_USERS, rowIndex, [
      session.user_id,
      trimmedUsername,
      finalPassword,
      existingUser.role || session.role,
      existingUser.assigned_class || session.assigned_class || 'ALL',
      existingUser.nip || '',
      existingUser.pin || '',
      existingUser.biometric_credential_id || '',
      existingUser.biometric_public_key || '',
    ]);

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
      { error: 'Gagal memperbarui profil pengguna ke lembar kerja.' },
      { status: 500 }
    );
  }
}
