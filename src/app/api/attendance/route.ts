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
    const date = request.nextUrl.searchParams.get('date');

    let query = supabaseAdmin
      .from('attendance')
      .select('*')
      .order('timestamp', { ascending: false });

    if (className && className.toUpperCase() !== 'ALL') {
      query = query.eq('class_name', className);
    }

    if (date) {
      query = query.eq('date', date);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error('Supabase attendance query error:', error);
      return NextResponse.json({ error: 'Gagal memuat data presensi dari database.' }, { status: 500 });
    }

    return NextResponse.json({ records: records || [] });
  } catch (error) {
    console.error('Attendance GET error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data presensi dari database.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid atau telah berakhir.' }, { status: 401 });
    }

    const { date, class_name, records } = await request.json();

    if (!date || !class_name || !records || !Array.isArray(records)) {
      return NextResponse.json(
        { error: 'Data tidak lengkap: tanggal, nama kelas, dan daftar siswa wajib disertakan.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const rowsToInsert = records.map(
      (r: { student_id: string; full_name: string; attendance_status: string; note?: string; attachment_url?: string }) => ({
        timestamp: now,
        date: date.trim(),
        class_name: class_name.trim(),
        student_id: r.student_id.trim(),
        full_name: r.full_name.trim(),
        attendance_status: r.attendance_status || 'Hadir',
        note: r.note || '',
        recorded_by_username: session.username,
        attachment_url: r.attachment_url || '',
      })
    );

    const { error: insertErr } = await supabaseAdmin
      .from('attendance')
      .insert(rowsToInsert);

    if (insertErr) {
      console.error('Supabase attendance insert error:', insertErr);
      return NextResponse.json({ error: 'Gagal menyimpan data presensi ke database.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Presensi kelas ${class_name} untuk tanggal ${date} berhasil disimpan (${rowsToInsert.length} siswa).`,
    });
  } catch (error) {
    console.error('Attendance POST error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan data presensi ke database.' },
      { status: 500 }
    );
  }
}
