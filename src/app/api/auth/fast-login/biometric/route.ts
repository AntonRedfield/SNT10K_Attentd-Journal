import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession, signToken, createSessionCookie } from '@/lib/auth';
import { getSheetRows, findRowIndex, updateRow } from '@/lib/google-sheets';
import { SHEET_USERS, User, SessionPayload, normalizeRole } from '@/lib/constants';

/**
 * GET /api/auth/fast-login/biometric
 * Generates a challenge for WebAuthn authentication/registration.
 */
export async function GET() {
  try {
    const randomBytes = crypto.randomBytes(32);
    const challenge = randomBytes.toString('base64url');
    return NextResponse.json({ challenge });
  } catch (error) {
    console.error('Challenge generation error:', error);
    return NextResponse.json({ error: 'Gagal membuat challenge biometrik.' }, { status: 500 });
  }
}

/**
 * POST /api/auth/fast-login/biometric
 * Handles registration and verification of biometric credentials.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || 'verify'; // 'register' | 'verify'

    // ==========================================
    // ACTION: REGISTER BIOMETRIC
    // ==========================================
    if (action === 'register') {
      const session = await getSession(request);
      if (!session) {
        return NextResponse.json({ error: 'Sesi tidak valid atau telah berakhir.' }, { status: 401 });
      }

      const credentialId = String(body.credential_id || '').trim();
      const rawId = String(body.raw_id || credentialId).trim();

      if (!credentialId) {
        return NextResponse.json({ error: 'Data kredensial biometrik tidak valid.' }, { status: 400 });
      }

      const users = await getSheetRows<User>(SHEET_USERS);
      const existingUser = users.find((u) => u.user_id === session.user_id);
      const rowIndex = await findRowIndex(SHEET_USERS, (row) => row.user_id === session.user_id);

      if (rowIndex === -1 || !existingUser) {
        return NextResponse.json({ error: 'Pengguna tidak ditemukan dalam sistem.' }, { status: 404 });
      }

      await updateRow(SHEET_USERS, rowIndex, [
        existingUser.user_id,
        existingUser.username,
        existingUser.password || '',
        existingUser.role || session.role,
        existingUser.assigned_class || session.assigned_class || 'ALL',
        existingUser.nip || '',
        existingUser.pin || '',
        credentialId,
        rawId,
      ]);

      return NextResponse.json({
        success: true,
        message: 'Biometrik (Sidik Jari / Face ID) berhasil didaftarkan.',
        credential_id: credentialId,
      });
    }

    // ==========================================
    // ACTION: VERIFY BIOMETRIC LOGIN
    // ==========================================
    const identifier = (body.user_id || body.username || '').trim();
    const credentialId = String(body.credential_id || body.id || '').trim();

    if (!identifier || !credentialId) {
      return NextResponse.json(
        { error: 'ID Pengguna dan Kredensial Biometrik wajib disertakan.' },
        { status: 400 }
      );
    }

    const users = await getSheetRows<User>(SHEET_USERS);
    const targetId = identifier.toLowerCase();

    const user = users.find((u) => {
      const uid = String(u.user_id ?? '').trim().toLowerCase();
      const uname = String(u.username ?? '').trim().toLowerCase();
      return uid === targetId || uname === targetId;
    });

    if (!user) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    if (!user.biometric_credential_id || user.biometric_credential_id.trim() === '') {
      return NextResponse.json(
        { error: 'Biometrik belum didaftarkan pada akun ini di perangkat ini.' },
        { status: 400 }
      );
    }

    // Verify credential ID matches
    if (user.biometric_credential_id.trim() !== credentialId) {
      return NextResponse.json(
        { error: 'Kredensial biometrik tidak cocok dengan pendaftaran akun ini.' },
        { status: 401 }
      );
    }

    const canonicalRole = normalizeRole(user.role);

    const payload: SessionPayload = {
      user_id: String(user.user_id || identifier),
      username: String(user.username || identifier),
      role: canonicalRole,
      assigned_class: String(user.assigned_class || 'ALL'),
    };

    const token = await signToken(payload);
    const response = NextResponse.json({
      success: true,
      user: payload,
    });

    response.headers.set('Set-Cookie', createSessionCookie(token));
    return response;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Biometric processing error:', errMsg, error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat memproses biometrik.', details: errMsg },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/fast-login/biometric
 * Removes biometric credential for current user.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi tidak valid.' }, { status: 401 });
    }

    const users = await getSheetRows<User>(SHEET_USERS);
    const existingUser = users.find((u) => u.user_id === session.user_id);
    const rowIndex = await findRowIndex(SHEET_USERS, (row) => row.user_id === session.user_id);

    if (rowIndex === -1 || !existingUser) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    await updateRow(SHEET_USERS, rowIndex, [
      existingUser.user_id,
      existingUser.username,
      existingUser.password || '',
      existingUser.role || session.role,
      existingUser.assigned_class || session.assigned_class || 'ALL',
      existingUser.nip || '',
      existingUser.pin || '',
      '',
      '',
    ]);

    return NextResponse.json({
      success: true,
      message: 'Biometrik berhasil dinonaktifkan dari akun Anda.',
    });
  } catch (error) {
    console.error('Biometric DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menonaktifkan biometrik.' }, { status: 500 });
  }
}
