import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid atau telah berakhir.' }, { status: 401 });
    }

    const className = request.nextUrl.searchParams.get('class_name') || session.assigned_class;

    // Non-admin users can only see their assigned class unless assigned to ALL
    if (session.role !== 'Admin' && className !== session.assigned_class && session.assigned_class?.toUpperCase() !== 'ALL') {
      return NextResponse.json({ error: 'Akses ditolak: Anda hanya dapat mengakses data kelas yang ditugaskan.' }, { status: 403 });
    }

    let query = supabaseAdmin
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (className && className.toUpperCase() !== 'ALL') {
      query = query.eq('class_name', className);
    }

    const { data: students, error } = await query;

    if (error) {
      console.error('Supabase students query error:', error);
      return NextResponse.json({ error: 'Gagal memuat data siswa dari database.' }, { status: 500 });
    }

    // Return with is_active formatted as "TRUE" for backward compatibility
    const formatted = (students || []).map((s) => ({
      ...s,
      is_active: s.is_active ? 'TRUE' : 'FALSE',
    }));

    return NextResponse.json({ students: formatted });
  } catch (error) {
    console.error('Students error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data siswa kelas dari database.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json(
        { error: 'Hanya Administrator dan Guru yang memiliki hak mengubah data siswa.' },
        { status: 403 }
      );
    }

    const { student_id, full_name, class_name, is_active } = await request.json();

    if (!student_id || !full_name || !class_name) {
      return NextResponse.json(
        { error: 'Parameter ID siswa, nama lengkap, dan kelas wajib disertakan.' },
        { status: 400 }
      );
    }

    const isActiveBool = is_active === true || is_active === 'TRUE' || is_active === 'true';

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
    console.error('Students PUT error:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui data siswa.' },
      { status: 500 }
    );
  }
}
