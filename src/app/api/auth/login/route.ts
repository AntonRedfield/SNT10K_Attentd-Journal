import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, findUserByIdentifier } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
import { signToken, createSessionCookie } from '@/lib/auth';
import { User, SessionPayload, normalizeRole } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = (body.user_id || body.username || '').trim();
    const password = (body.password || '').trim();

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'ID Pengguna dan kata sandi wajib diisi.' },
        { status: 400 }
      );
    }

    // Safe lookup by username or user_id without PostgREST comma issues
    const user = await findUserByIdentifier(identifier);

    if (!user) {
      return NextResponse.json(
        { error: 'ID Pengguna atau nama pengguna tidak ditemukan.' },
        { status: 401 }
      );
    }

    const upass = String(user.password ?? '').trim();
    if (upass !== password) {
      return NextResponse.json(
        { error: 'Kata sandi tidak sesuai. Silakan periksa kembali.' },
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

    const hasPin = !!(user.pin && user.pin.trim().length >= 4);
    const hasBiometric = !!(user.biometric_credential_id && user.biometric_credential_id.trim().length > 0);

    const token = await signToken(payload);
    const response = NextResponse.json({
      success: true,
      user: payload,
      has_pin: hasPin,
      has_biometric: hasBiometric,
      biometric_credential_id: user.biometric_credential_id || '',
    });

    response.headers.set('Set-Cookie', createSessionCookie(token));
    return response;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Login processing error:', errMsg, error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan pada server saat memproses login.', details: errMsg },
      { status: 500 }
    );
  }
}
