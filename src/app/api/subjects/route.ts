import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getSheetRows,
  appendRow,
  appendRows,
  createSheetTab,
  findRowIndex,
  deleteRow,
  updateRow,
} from '@/lib/google-sheets';
import {
  SHEET_SUBJECTS,
  DEFAULT_SUBJECTS,
  SubjectItem,
  SubjectType,
  SUBJECT_TYPES,
} from '@/lib/constants';

/**
 * GET /api/subjects
 * Retrieves all active subjects / activities grouped or listed.
 * Accessible by all authenticated users (Admin, Teacher, PIC).
 * Auto-creates and seeds the 'Subjects' tab with default subjects if not yet present.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let subjects: SubjectItem[] = [];
    try {
      const rows = await getSheetRows<Record<string, string>>(SHEET_SUBJECTS);
      subjects = rows
        .filter((r) => r.is_active !== 'FALSE' && r.name)
        .map((r) => ({
          subject_id: r.subject_id || `SUBJ-${Math.random()}`,
          name: r.name,
          type: (SUBJECT_TYPES.includes(r.type as SubjectType)
            ? r.type
            : 'Intrakurikuler') as SubjectType,
          is_active: r.is_active || 'TRUE',
        }));
    } catch {
      // Sheet might not exist yet; we'll initialize below
      subjects = [];
    }

    // Auto-seed if empty
    if (subjects.length === 0) {
      try {
        await createSheetTab(SHEET_SUBJECTS, ['subject_id', 'name', 'type', 'is_active']);
        const seedRows = DEFAULT_SUBJECTS.map((item, idx) => [
          `SUBJ-INIT-${idx + 1}`,
          item.name,
          item.type,
          'TRUE',
        ]);
        await appendRows(SHEET_SUBJECTS, seedRows);

        subjects = DEFAULT_SUBJECTS.map((item, idx) => ({
          subject_id: `SUBJ-INIT-${idx + 1}`,
          name: item.name,
          type: item.type,
          is_active: 'TRUE',
        }));
      } catch (seedErr) {
        console.error('Failed to auto-seed Subjects tab:', seedErr);
        // Fallback in-memory defaults
        subjects = DEFAULT_SUBJECTS.map((item, idx) => ({
          subject_id: `SUBJ-INIT-${idx + 1}`,
          name: item.name,
          type: item.type,
          is_active: 'TRUE',
        }));
      }
    }

    return NextResponse.json({ subjects });
  } catch (error) {
    console.error('GET /api/subjects error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data mata pelajaran' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/subjects
 * Adds a new subject / activity under a specific type.
 * ONLY accessible by Admin.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json(
        { error: 'Hanya Administrator dan Guru yang memiliki akses menambah mata pelajaran atau kegiatan' },
        { status: 403 }
      );
    }

    const { name, type } = await request.json();

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Nama mata pelajaran / kegiatan wajib diisi' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const validTypes: SubjectType[] = ['Intrakurikuler', 'Kokurikuler', 'Ekstrakurikuler'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Tipe kategori harus Intrakurikuler, Kokurikuler, atau Ekstrakurikuler' },
        { status: 400 }
      );
    }

    // Ensure sheet tab exists
    await createSheetTab(SHEET_SUBJECTS, ['subject_id', 'name', 'type', 'is_active']);

    // Check for duplicate name in same type
    const existing = await getSheetRows<Record<string, string>>(SHEET_SUBJECTS);
    const duplicate = existing.some(
      (r) =>
        r.name?.trim().toLowerCase() === trimmedName.toLowerCase() &&
        r.type === type &&
        r.is_active !== 'FALSE'
    );

    if (duplicate) {
      return NextResponse.json(
        { error: `Mata pelajaran / kegiatan "${trimmedName}" pada kategori ${type} sudah terdaftar` },
        { status: 400 }
      );
    }

    const subjectId = `SUBJ-${Date.now()}`;
    await appendRow(SHEET_SUBJECTS, [subjectId, trimmedName, type, 'TRUE']);

    return NextResponse.json({
      success: true,
      subject: {
        subject_id: subjectId,
        name: trimmedName,
        type,
        is_active: 'TRUE',
      },
    });
  } catch (error) {
    console.error('POST /api/subjects error:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat menambahkan mata pelajaran' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/subjects
 * Updates an existing subject / activity (name, type, is_active).
 * ONLY accessible by Admin.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json(
        { error: 'Hanya Administrator dan Guru yang memiliki akses mengubah mata pelajaran atau kegiatan' },
        { status: 403 }
      );
    }

    const { subject_id, name, type, is_active } = await request.json();

    if (!subject_id || !name || !name.trim()) {
      return NextResponse.json(
        { error: 'ID dan nama mata pelajaran / kegiatan wajib diisi' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const validTypes: SubjectType[] = ['Intrakurikuler', 'Kokurikuler', 'Ekstrakurikuler'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Tipe kategori harus Intrakurikuler, Kokurikuler, atau Ekstrakurikuler' },
        { status: 400 }
      );
    }

    const rowIndex = await findRowIndex(
      SHEET_SUBJECTS,
      (row) => row.subject_id === subject_id
    );

    if (rowIndex === -1) {
      return NextResponse.json(
        { error: 'Mata pelajaran / kegiatan tidak ditemukan' },
        { status: 404 }
      );
    }

    await updateRow(SHEET_SUBJECTS, rowIndex, [
      subject_id,
      trimmedName,
      type,
      is_active || 'TRUE',
    ]);

    return NextResponse.json({
      success: true,
      subject: {
        subject_id,
        name: trimmedName,
        type,
        is_active: is_active || 'TRUE',
      },
    });
  } catch (error) {
    console.error('PUT /api/subjects error:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui data mata pelajaran' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/subjects?subject_id=...
 * Removes a subject / activity from the list.
 * ONLY accessible by Admin.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || (session.role !== 'Admin' && session.role !== 'Teacher')) {
      return NextResponse.json(
        { error: 'Hanya Administrator dan Guru yang memiliki hak menghapus mata pelajaran' },
        { status: 403 }
      );
    }

    const subjectId = request.nextUrl.searchParams.get('subject_id');
    if (!subjectId) {
      return NextResponse.json(
        { error: 'ID mata pelajaran wajib disertakan' },
        { status: 400 }
      );
    }

    const rowIndex = await findRowIndex(
      SHEET_SUBJECTS,
      (row) => row.subject_id === subjectId
    );

    if (rowIndex === -1) {
      return NextResponse.json(
        { error: 'Mata pelajaran tidak ditemukan' },
        { status: 404 }
      );
    }

    await deleteRow(SHEET_SUBJECTS, rowIndex);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/subjects error:', error);
    return NextResponse.json(
      { error: 'Gagal menghapus mata pelajaran' },
      { status: 500 }
    );
  }
}
