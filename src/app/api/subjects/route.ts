import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  SubjectItem,
  SubjectType,
  SUBJECT_TYPES,
} from '@/lib/constants';

/**
 * GET /api/subjects
 * Retrieves all active subjects / activities grouped or listed.
 * Accessible by all authenticated users (Admin, Teacher, PIC).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('subjects')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Supabase subjects query error:', error);
      return NextResponse.json({ error: 'Gagal memuat data mata pelajaran' }, { status: 500 });
    }

    const subjects: SubjectItem[] = (rows || []).map((r) => ({
      subject_id: r.subject_id,
      name: r.name,
      type: (SUBJECT_TYPES.includes(r.type as SubjectType)
        ? r.type
        : 'Intrakurikuler') as SubjectType,
      is_active: r.is_active ? 'TRUE' : 'FALSE',
    }));

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
 * Accessible by Admin and Teacher.
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

    // Check for duplicate name in same type
    const { data: existing } = await supabaseAdmin
      .from('subjects')
      .select('subject_id')
      .ilike('name', trimmedName)
      .eq('type', type)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `Mata pelajaran / kegiatan "${trimmedName}" pada kategori ${type} sudah terdaftar` },
        { status: 400 }
      );
    }

    const subjectId = `SUBJ-${Date.now()}`;
    const { error: insertErr } = await supabaseAdmin
      .from('subjects')
      .insert({
        subject_id: subjectId,
        name: trimmedName,
        type,
        is_active: true,
      });

    if (insertErr) {
      console.error('Supabase insert subject error:', insertErr);
      return NextResponse.json({ error: 'Gagal menambahkan mata pelajaran ke database' }, { status: 500 });
    }

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
 * Accessible by Admin and Teacher.
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

    const isActiveBool = is_active === undefined || is_active === true || is_active === 'TRUE' || is_active === 'true';

    const { error: updateErr } = await supabaseAdmin
      .from('subjects')
      .update({
        name: trimmedName,
        type,
        is_active: isActiveBool,
      })
      .eq('subject_id', subject_id);

    if (updateErr) {
      console.error('Supabase update subject error:', updateErr);
      return NextResponse.json({ error: 'Gagal memperbarui data mata pelajaran di database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      subject: {
        subject_id,
        name: trimmedName,
        type,
        is_active: isActiveBool ? 'TRUE' : 'FALSE',
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
 * Accessible by Admin and Teacher.
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

    const { error: deleteErr } = await supabaseAdmin
      .from('subjects')
      .delete()
      .eq('subject_id', subjectId);

    if (deleteErr) {
      console.error('Supabase delete subject error:', deleteErr);
      return NextResponse.json({ error: 'Gagal menghapus mata pelajaran dari database' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/subjects error:', error);
    return NextResponse.json(
      { error: 'Gagal menghapus mata pelajaran' },
      { status: 500 }
    );
  }
}
