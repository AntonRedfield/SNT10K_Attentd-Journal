import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows } from '@/lib/google-sheets';
import { SHEET_STUDENTS, Student } from '@/lib/constants';

/**
 * GET /api/classes
 * Reads and returns unique class_name list from the Student sheet.
 * Accessible by all authenticated users (Admin, Teacher, PIC).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid' }, { status: 401 });
    }

    const students = await getSheetRows<Student>(SHEET_STUDENTS);

    // Extract unique, non-empty class names from active students
    const classSet = new Set<string>();
    for (const s of students) {
      if (s.is_active?.toUpperCase() !== 'FALSE' && s.class_name && s.class_name.trim()) {
        classSet.add(s.class_name.trim());
      }
    }

    // Natural sort: e.g. VII A, VII B, VIII A, X TKJ 1, etc.
    const classes = Array.from(classSet).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    return NextResponse.json({
      classes,
      totalStudents: students.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/classes error:', error);
    return NextResponse.json(
      { error: 'Gagal membaca daftar kelas dari lembar kerja siswa' },
      { status: 500 }
    );
  }
}
