import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows, appendRows } from '@/lib/google-sheets';
import { SHEET_ATTENDANCE, AttendanceRecord } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid atau telah berakhir.' }, { status: 401 });
    }

    const className = request.nextUrl.searchParams.get('class_name') || session.assigned_class;
    const date = request.nextUrl.searchParams.get('date');

    const records = await getSheetRows<AttendanceRecord>(SHEET_ATTENDANCE);
    let filtered = records.filter((r) => r.class_name === className);

    if (date) {
      filtered = filtered.filter((r) => r.date === date);
    }

    return NextResponse.json({ records: filtered });
  } catch (error) {
    console.error('Attendance GET error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data presensi dari lembar kerja.' },
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

    // Build 2D array for batch append
    const rows: string[][] = records.map(
      (r: { student_id: string; full_name: string; attendance_status: string; note?: string; attachment_url?: string }) => [
        now,                      // timestamp
        date,                     // date
        class_name,               // class_name
        r.student_id,             // student_id
        r.full_name,              // full_name
        r.attendance_status,      // attendance_status
        r.note || '',             // note
        session.username,         // recorded_by_username
        r.attachment_url || '',   // attachment_url (Drive link / photo proof)
      ]
    );

    // Single batch append
    await appendRows(SHEET_ATTENDANCE, rows);

    return NextResponse.json({
      success: true,
      message: `Presensi kelas ${class_name} untuk tanggal ${date} berhasil disimpan (${rows.length} siswa).`,
    });
  } catch (error) {
    console.error('Attendance POST error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan data presensi ke lembar kerja.' },
      { status: 500 }
    );
  }
}
