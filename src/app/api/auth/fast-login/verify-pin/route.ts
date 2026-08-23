import { NextRequest, NextResponse } from 'next/server';
import { getSheetRows } from '@/lib/google-sheets';
import { signToken, createSessionCookie } from '@/lib/auth';
import { SHEET_USERS, User, SessionPayload, normalizeRole } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = (body.user_id || body.username || '').trim();
    const pin = String(body.pin || '').trim();

    if (!identifier || !pin) {
      return NextResponse.json(
        { error: 'ID Pengguna dan PIN 6-digit wajib diisi.' },
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
      return NextResponse.json(
        { error: 'Pengguna tidak ditemukan dalam sistem.' },
        { status: 404 }
      );
    }

    if (!user.pin || user.pin.trim() === '') {
      return NextResponse.json(
        { error: 'Fitur PIN belum diaktifkan pada akun ini. Silakan masuk dengan kata sandi terlebih dahulu.' },
        { status: 400 }
      );
    }

    if (user.pin.trim() !== pin) {
      return NextResponse.json(
        { error: 'PIN yang dimasukkan tidak cocok. Silakan coba lagi.' },
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
    console.error('Verify PIN login error:', errMsg, error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat memproses login PIN.', details: errMsg },
      { status: 500 }
    );
  }
}
