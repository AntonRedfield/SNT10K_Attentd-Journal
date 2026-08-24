import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Akses khusus Administrator diperlukan.' }, { status: 403 });
    }

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('user_id, username, role, assigned_class, nip, pin, biometric_credential_id, created_at')
      .order('username', { ascending: true });

    if (error) {
      console.error('Admin users GET error:', error);
      return NextResponse.json({ error: 'Gagal memuat data pengguna dari database.' }, { status: 500 });
    }

    return NextResponse.json({ users: users || [] });
  } catch (error) {
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'Gagal memuat data pengguna dari database.' }, { status: 500 });
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

    const cleanUsername = username.trim();

    // Check for duplicate username
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('user_id')
      .ilike('username', cleanUsername)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Nama pengguna (username) sudah terdaftar dalam sistem.' }, { status: 409 });
    }

    const userId = `U-${Date.now()}`;
    const { error: insertErr } = await supabaseAdmin
      .from('users')
      .insert({
        user_id: userId,
        username: cleanUsername,
        password: password.trim(),
        role,
        assigned_class: assigned_class.trim(),
        nip: nip ? nip.trim() : '',
      });

    if (insertErr) {
      console.error('Supabase user insert error:', insertErr);
      return NextResponse.json({ error: 'Gagal menambahkan akun pengguna ke database.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, user_id: userId });
  } catch (error) {
    console.error('Admin users POST error:', error);
    return NextResponse.json({ error: 'Gagal menambahkan akun pengguna ke database.' }, { status: 500 });
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

    const cleanUsername = username.trim();

    // Check duplicate username if changing
    const { data: dup } = await supabaseAdmin
      .from('users')
      .select('user_id')
      .ilike('username', cleanUsername)
      .neq('user_id', user_id)
      .maybeSingle();

    if (dup) {
      return NextResponse.json({ error: 'Nama pengguna (username) sudah digunakan oleh akun lain.' }, { status: 409 });
    }

    const updates: Record<string, string> = {
      username: cleanUsername,
      role: role || 'Teacher',
      assigned_class: assigned_class ? assigned_class.trim() : 'ALL',
      nip: nip !== undefined ? nip.trim() : '',
    };

    if (password && password.trim()) {
      updates.password = password.trim();
    }

    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('user_id', user_id);

    if (updateErr) {
      console.error('Supabase user update error:', updateErr);
      return NextResponse.json({ error: 'Gagal memperbarui data pengguna.' }, { status: 500 });
    }

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

    const { error: deleteErr } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('user_id', userId);

    if (deleteErr) {
      console.error('Supabase user delete error:', deleteErr);
      return NextResponse.json({ error: 'Gagal menghapus data pengguna dari database.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin users DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menghapus data pengguna.' }, { status: 500 });
  }
}
