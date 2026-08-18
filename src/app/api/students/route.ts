import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows, findRowIndex, updateRow } from '@/lib/google-sheets';
import { SHEET_STUDENTS, Student } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid atau telah berakhir.' }, { status: 401 });
    }

    const className = request.nextUrl.searchParams.get('class_name') || session.assigned_class;

    // Non-admin users can only see their assigned class
    if (session.role !== 'Admin' && className !== session.assigned_class && session.assigned_class?.toUpperCase() !== 'ALL') {
      return NextResponse.json({ error: 'Akses ditolak: Anda hanya dapat mengakses data kelas yang ditugaskan.' }, { status: 403 });
    }

    const students = await getSheetRows<Student>(SHEET_STUDENTS);
    const filtered = students.filter(
      (s) => s.class_name === className && s.is_active?.toUpperCase() === 'TRUE'
    );

    return NextResponse.json({ students: filtered });
  } catch (error) {
    console.error('Students error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data siswa kelas dari lembar kerja.' },
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

    const rowIndex = await findRowIndex(SHEET_STUDENTS, (row) => row.student_id === student_id);
    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Data siswa tidak ditemukan.' }, { status: 404 });
    }

    await updateRow(SHEET_STUDENTS, rowIndex, [
      student_id,
      full_name.trim(),
      class_name.trim(),
      is_active || 'TRUE',
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Students PUT error:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui data siswa.' },
      { status: 500 }
    );
  }
}
