import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows, findRowIndex, updateRow } from '@/lib/google-sheets';
import { SHEET_USERS, User, normalizeRole } from '@/lib/constants';

/**
 * GET /api/auth/fast-login?user_id=...
 * Check if a user has PIN and/or Biometrics set up.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    const searchParams = request.nextUrl.searchParams;
    const requestedUserId = searchParams.get('user_id');

    const targetUserId = requestedUserId || session?.user_id;
    if (!targetUserId) {
      return NextResponse.json({ error: 'ID Pengguna diperlukan.' }, { status: 400 });
    }

    const users = await getSheetRows<User>(SHEET_USERS);
    const user = users.find(
      (u) =>
        String(u.user_id || '').toLowerCase() === targetUserId.toLowerCase() ||
        String(u.username || '').toLowerCase() === targetUserId.toLowerCase()
    );

    if (!user) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    const hasPin = !!(user.pin && user.pin.trim().length >= 4);
    const hasBiometric = !!(user.biometric_credential_id && user.biometric_credential_id.trim().length > 0);

    return NextResponse.json({
      user_id: user.user_id,
      username: user.username,
      role: normalizeRole(user.role),
      assigned_class: user.assigned_class || 'ALL',
      has_pin: hasPin,
      has_biometric: hasBiometric,
      biometric_credential_id: user.biometric_credential_id || '',
    });
  } catch (error) {
    console.error('Fast login status GET error:', error);
    return NextResponse.json({ error: 'Gagal memeriksa status fast login.' }, { status: 500 });
  }
}

/**
 * POST /api/auth/fast-login
 * Set or update 6-digit PIN for the logged-in user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi tidak valid atau telah berakhir.' }, { status: 401 });
    }

    const body = await request.json();
    const pin = String(body.pin || '').trim();

    if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN harus berupa 4 hingga 8 digit angka (disarankan 6 digit).' },
        { status: 400 }
      );
    }

    const users = await getSheetRows<User>(SHEET_USERS);
    const existingUser = users.find((u) => u.user_id === session.user_id);
    const rowIndex = await findRowIndex(SHEET_USERS, (row) => row.user_id === session.user_id);

    if (rowIndex === -1 || !existingUser) {
      return NextResponse.json({ error: 'Data pengguna tidak ditemukan.' }, { status: 404 });
    }

    await updateRow(SHEET_USERS, rowIndex, [
      existingUser.user_id,
      existingUser.username,
      existingUser.password || '',
      existingUser.role || session.role,
      existingUser.assigned_class || session.assigned_class || 'ALL',
      existingUser.nip || '',
      pin,
      existingUser.biometric_credential_id || '',
      existingUser.biometric_public_key || '',
    ]);

    return NextResponse.json({
      success: true,
      message: 'PIN Masuk Cepat berhasil disimpan.',
      has_pin: true,
    });
  } catch (error) {
    console.error('Fast login PIN POST error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan PIN masuk cepat.' }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/fast-login
 * Remove PIN or Biometric for current user.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi tidak valid.' }, { status: 401 });
    }

    const type = request.nextUrl.searchParams.get('type') || 'pin'; // 'pin' | 'biometric' | 'all'

    const users = await getSheetRows<User>(SHEET_USERS);
    const existingUser = users.find((u) => u.user_id === session.user_id);
    const rowIndex = await findRowIndex(SHEET_USERS, (row) => row.user_id === session.user_id);

    if (rowIndex === -1 || !existingUser) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    const newPin = type === 'pin' || type === 'all' ? '' : (existingUser.pin || '');
    const newBioId = type === 'biometric' || type === 'all' ? '' : (existingUser.biometric_credential_id || '');
    const newBioKey = type === 'biometric' || type === 'all' ? '' : (existingUser.biometric_public_key || '');

    await updateRow(SHEET_USERS, rowIndex, [
      existingUser.user_id,
      existingUser.username,
      existingUser.password || '',
      existingUser.role || session.role,
      existingUser.assigned_class || session.assigned_class || 'ALL',
      existingUser.nip || '',
      newPin,
      newBioId,
      newBioKey,
    ]);

    return NextResponse.json({
      success: true,
      message: `${type === 'pin' ? 'PIN' : type === 'biometric' ? 'Biometrik' : 'Semua Fast Login'} berhasil dinonaktifkan.`,
    });
  } catch (error) {
    console.error('Fast login DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menonaktifkan fitur masuk cepat.' }, { status: 500 });
  }
}
