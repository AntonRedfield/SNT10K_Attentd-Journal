import { NextRequest, NextResponse } from 'next/server';
import { getSheetRows } from '@/lib/google-sheets';
import { signToken, createSessionCookie } from '@/lib/auth';
import { SHEET_USERS, User, SessionPayload, normalizeRole } from '@/lib/constants';

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

    const users = await getSheetRows<User>(SHEET_USERS);
    const targetId = identifier.toLowerCase();

    const user = users.find((u) => {
      const uid = String(u.user_id ?? '').trim().toLowerCase();
      const uname = String(u.username ?? '').trim().toLowerCase();
      const upass = String(u.password ?? '').trim();
      return (uid === targetId || uname === targetId) && upass === password;
    });

    if (!user) {
      return NextResponse.json(
        { error: 'ID Pengguna atau kata sandi tidak sesuai.' },
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
    console.error('Login processing error:', errMsg, error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan pada server saat memproses login.', details: errMsg },
      { status: 500 }
    );
  }
}
