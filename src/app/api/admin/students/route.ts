import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json({ error: 'Akses khusus Administrator dan Guru diperlukan.' }, { status: 403 });
    }

    const className = request.nextUrl.searchParams.get('class_name');
    let query = supabaseAdmin
      .from('students')
      .select('*')
      .order('full_name', { ascending: true });

    if (className && className !== 'ALL') {
      query = query.eq('class_name', className);
    }

    const { data: students, error } = await query;

    if (error) {
      console.error('Admin students GET error:', error);
      return NextResponse.json({ error: 'Gagal memuat data siswa dari database.' }, { status: 500 });
    }

    const formatted = (students || []).map((s) => ({
      ...s,
      is_active: s.is_active ? 'TRUE' : 'FALSE',
    }));

    return NextResponse.json({ students: formatted });
  } catch (error) {
    console.error('Admin students GET error:', error);
    return NextResponse.json({ error: 'Gagal memuat data siswa dari database.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json({ error: 'Akses khusus Administrator dan Guru diperlukan.' }, { status: 403 });
    }

    const { student_id, full_name, class_name } = await request.json();

    if (!full_name || !class_name) {
      return NextResponse.json({ error: 'Nama lengkap dan kelas wajib diisi.' }, { status: 400 });
    }

    const studentId = student_id && student_id.trim() ? student_id.trim() : `S-${Date.now()}`;
    const { error: insertErr } = await supabaseAdmin
      .from('students')
      .insert({
        student_id: studentId,
        full_name: full_name.trim(),
        class_name: class_name.trim(),
        is_active: true,
      });

    if (insertErr) {
      console.error('Supabase student insert error:', insertErr);
      return NextResponse.json({ error: 'Gagal menambahkan data siswa ke database.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, student_id: studentId });
  } catch (error) {
    console.error('Admin students POST error:', error);
    return NextResponse.json({ error: 'Gagal menambahkan data siswa ke database.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json({ error: 'Hanya Administrator dan Guru yang memiliki hak mengubah data siswa.' }, { status: 403 });
    }

    const { student_id, full_name, class_name, is_active } = await request.json();

    if (!student_id || !full_name || !class_name) {
      return NextResponse.json({ error: 'Parameter ID siswa, nama lengkap, dan kelas wajib disertakan.' }, { status: 400 });
    }

    const isActiveBool = is_active === undefined || is_active === true || is_active === 'TRUE' || is_active === 'true';

    const { error: updateErr } = await supabaseAdmin
      .from('students')
      .update({
        full_name: full_name.trim(),
        class_name: class_name.trim(),
        is_active: isActiveBool,
      })
      .eq('student_id', student_id);

    if (updateErr) {
      console.error('Supabase student update error:', updateErr);
      return NextResponse.json({ error: 'Gagal memperbarui data siswa di database.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin students PUT error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui data siswa.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json({ error: 'Akses khusus Administrator dan Guru diperlukan.' }, { status: 403 });
    }

    const studentId = request.nextUrl.searchParams.get('student_id');
    if (!studentId) {
      return NextResponse.json({ error: 'Parameter ID siswa wajib disertakan.' }, { status: 400 });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from('students')
      .delete()
      .eq('student_id', studentId);

    if (deleteErr) {
      console.error('Supabase student delete error:', deleteErr);
      return NextResponse.json({ error: 'Gagal menghapus data siswa dari database.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin students DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menghapus data siswa.' }, { status: 500 });
  }
}
