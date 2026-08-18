import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows, appendRow, findRowIndex, deleteRow, updateRow } from '@/lib/google-sheets';
import { SHEET_STUDENTS, Student } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json({ error: 'Akses khusus Administrator dan Guru diperlukan.' }, { status: 403 });
    }

    const className = request.nextUrl.searchParams.get('class_name');
    const students = await getSheetRows<Student>(SHEET_STUDENTS);

    const filtered = className
      ? students.filter((s) => s.class_name === className)
      : students;

    return NextResponse.json({ students: filtered });
  } catch (error) {
    console.error('Admin students GET error:', error);
    return NextResponse.json({ error: 'Gagal memuat data siswa dari lembar kerja.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json({ error: 'Akses khusus Administrator dan Guru diperlukan.' }, { status: 403 });
    }

    const { full_name, class_name } = await request.json();

    if (!full_name || !class_name) {
      return NextResponse.json({ error: 'Nama lengkap dan kelas wajib diisi.' }, { status: 400 });
    }

    const studentId = `S-${Date.now()}`;
    await appendRow(SHEET_STUDENTS, [studentId, full_name.trim(), class_name.trim(), 'TRUE']);

    return NextResponse.json({ success: true, student_id: studentId });
  } catch (error) {
    console.error('Admin students POST error:', error);
    return NextResponse.json({ error: 'Gagal menambahkan data siswa ke lembar kerja.' }, { status: 500 });
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

    const rowIndex = await findRowIndex(SHEET_STUDENTS, (row) => row.student_id === student_id);
    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Data siswa tidak ditemukan.' }, { status: 404 });
    }

    await updateRow(SHEET_STUDENTS, rowIndex, [
      student_id, full_name.trim(), class_name.trim(), is_active || 'TRUE',
    ]);

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

    const rowIndex = await findRowIndex(SHEET_STUDENTS, (row) => row.student_id === studentId);
    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Data siswa tidak ditemukan.' }, { status: 404 });
    }

    await deleteRow(SHEET_STUDENTS, rowIndex);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin students DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menghapus data siswa.' }, { status: 500 });
  }
}
