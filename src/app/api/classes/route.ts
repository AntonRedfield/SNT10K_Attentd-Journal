import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/classes
 * Reads and returns unique class_name list from the students table.
 * Accessible by all authenticated users (Admin, Teacher, PIC).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid' }, { status: 401 });
    }

    const { data: students, error } = await supabaseAdmin
      .from('students')
      .select('class_name, is_active')
      .eq('is_active', true);

    if (error) {
      console.error('GET /api/classes Supabase error:', error);
      return NextResponse.json({ error: 'Gagal membaca daftar kelas dari database' }, { status: 500 });
    }

    const classSet = new Set<string>();
    for (const s of students || []) {
      if (s.class_name && s.class_name.trim()) {
        classSet.add(s.class_name.trim());
      }
    }

    const classes = Array.from(classSet).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    return NextResponse.json({
      classes,
      totalStudents: students?.length || 0,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/classes error:', error);
    return NextResponse.json(
      { error: 'Gagal membaca daftar kelas dari database' },
      { status: 500 }
    );
  }
}
