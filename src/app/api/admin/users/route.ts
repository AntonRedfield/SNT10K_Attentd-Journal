import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows, appendRow, findRowIndex, deleteRow, updateRow } from '@/lib/google-sheets';
import { SHEET_USERS, User } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Akses khusus Administrator diperlukan.' }, { status: 403 });
    }

    const users = await getSheetRows<User>(SHEET_USERS);
    // Don't return passwords to the frontend
    const sanitized = users.map(({ password: _p, ...rest }) => rest);
    return NextResponse.json({ users: sanitized });
  } catch (error) {
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'Gagal memuat data pengguna dari lembar kerja.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Akses khusus Administrator diperlukan.' }, { status: 403 });
    }

    const { username, password, role, assigned_class, nip } = await request.json();

    if (!username || !password || !role || !assigned_class) {
      return NextResponse.json({ error: 'Seluruh kolom pendaftaran pengguna wajib diisi.' }, { status: 400 });
    }

    // Check for duplicate username
    const users = await getSheetRows<User>(SHEET_USERS);
    if (users.some((u) => u.username?.toLowerCase() === username.trim().toLowerCase())) {
      return NextResponse.json({ error: 'Nama pengguna (username) sudah terdaftar dalam sistem.' }, { status: 409 });
    }

    const userId = `U-${Date.now()}`;
    await appendRow(SHEET_USERS, [
      userId,
      username.trim(),
      password.trim(),
      role,
      assigned_class.trim(),
      nip ? nip.trim() : '',
    ]);

    return NextResponse.json({ success: true, user_id: userId });
  } catch (error) {
    console.error('Admin users POST error:', error);
    return NextResponse.json({ error: 'Gagal menambahkan akun pengguna ke lembar kerja.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Akses khusus Administrator diperlukan.' }, { status: 403 });
    }

    const { user_id, username, password, role, assigned_class, nip } = await request.json();

    if (!user_id || !username) {
      return NextResponse.json({ error: 'Parameter ID dan nama pengguna wajib disertakan.' }, { status: 400 });
    }

    const users = await getSheetRows<User>(SHEET_USERS);
    const existingUser = users.find((u) => u.user_id === user_id);

    const rowIndex = await findRowIndex(SHEET_USERS, (row) => row.user_id === user_id);
    if (rowIndex === -1 || !existingUser) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    // Check duplicate username if username changed
    if (username.trim().toLowerCase() !== existingUser.username?.toLowerCase()) {
      if (users.some((u) => u.user_id !== user_id && u.username?.toLowerCase() === username.trim().toLowerCase())) {
        return NextResponse.json({ error: 'Nama pengguna (username) sudah digunakan oleh akun lain.' }, { status: 409 });
      }
    }

    const finalPassword = password && password.trim() ? password.trim() : (existingUser.password || '');

    await updateRow(SHEET_USERS, rowIndex, [
      user_id,
      username.trim(),
      finalPassword,
      role || existingUser.role,
      assigned_class ? assigned_class.trim() : (existingUser.assigned_class || 'ALL'),
      nip !== undefined ? nip.trim() : (existingUser.nip || ''),
      existingUser.pin || '',
      existingUser.biometric_credential_id || '',
      existingUser.biometric_public_key || '',
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin users PUT error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui data pengguna.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Akses khusus Administrator diperlukan.' }, { status: 403 });
    }

    const userId = request.nextUrl.searchParams.get('user_id');
    if (!userId) {
      return NextResponse.json({ error: 'Parameter ID pengguna wajib disertakan.' }, { status: 400 });
    }

    const rowIndex = await findRowIndex(SHEET_USERS, (row) => row.user_id === userId);
    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    await deleteRow(SHEET_USERS, rowIndex);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin users DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menghapus data pengguna.' }, { status: 500 });
  }
}
