import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { User, normalizeRole } from '@/lib/constants';

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

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .or(`user_id.ilike.${targetUserId},username.ilike.${targetUserId}`)
      .maybeSingle();

    if (error || !user) {
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
 * Set or update PIN for the logged-in user.
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

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ pin })
      .eq('user_id', session.user_id);

    if (updateErr) {
      console.error('Fast login PIN POST error:', updateErr);
      return NextResponse.json({ error: 'Gagal menyimpan PIN masuk cepat.' }, { status: 500 });
    }

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

    const updates: Record<string, string> = {};
    if (type === 'pin' || type === 'all') {
      updates.pin = '';
    }
    if (type === 'biometric' || type === 'all') {
      updates.biometric_credential_id = '';
      updates.biometric_public_key = '';
    }

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('user_id', session.user_id);

    if (updateErr) {
      console.error('Fast login DELETE error:', updateErr);
      return NextResponse.json({ error: 'Gagal menonaktifkan fitur masuk cepat.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${type === 'pin' ? 'PIN' : type === 'biometric' ? 'Biometrik' : 'Semua Fast Login'} berhasil dinonaktifkan.`,
    });
  } catch (error) {
    console.error('Fast login DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menonaktifkan fitur masuk cepat.' }, { status: 500 });
  }
}
