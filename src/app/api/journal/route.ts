import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows, appendRow, findRowIndex, deleteRow } from '@/lib/google-sheets';
import { SHEET_JOURNALS, JournalEntry } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid atau telah berakhir.' }, { status: 401 });
    }

    if (session.role === 'PIC') {
      return NextResponse.json({ error: 'Akses ditolak: Modul jurnal hanya untuk Guru dan Administrator.' }, { status: 403 });
    }

    const className = request.nextUrl.searchParams.get('class_name') || session.assigned_class;

    const journals = await getSheetRows<JournalEntry>(SHEET_JOURNALS);
    const filtered = journals
      .filter((j) => j.class_name === className)
      .sort((a, b) => Number(a.week_number) - Number(b.week_number));

    return NextResponse.json({ journals: filtered });
  } catch (error) {
    console.error('Journal GET error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat catatan jurnal dari lembar kerja.' },
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

    if (session.role === 'PIC') {
      return NextResponse.json({ error: 'Akses ditolak: Modul jurnal hanya untuk Guru dan Administrator.' }, { status: 403 });
    }

    const { class_name, subject_name, week_number, topic } = await request.json();

    if (!class_name || !subject_name || !week_number || !topic) {
      return NextResponse.json(
        { error: 'Seluruh kolom (kelas, mata pelajaran, minggu ke-, topik) wajib diisi.' },
        { status: 400 }
      );
    }

    const weekNum = Number(week_number);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > 52) {
      return NextResponse.json(
        { error: 'Nomor pertemuan/minggu harus antara 1 sampai 52.' },
        { status: 400 }
      );
    }

    const journalId = `J-${Date.now()}`;
    const now = new Date().toISOString();

    await appendRow(SHEET_JOURNALS, [
      journalId,
      now,
      class_name,
      subject_name,
      String(weekNum),
      topic,
      session.username,
    ]);

    return NextResponse.json({
      success: true,
      message: 'Catatan agenda mengajar berhasil disimpan.',
      journal_id: journalId,
    });
  } catch (error) {
    console.error('Journal POST error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan catatan jurnal ke lembar kerja.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid atau telah berakhir.' }, { status: 401 });
    }

    if (session.role === 'PIC') {
      return NextResponse.json({ error: 'Akses ditolak: Modul jurnal hanya untuk Guru dan Administrator.' }, { status: 403 });
    }

    const journalId = request.nextUrl.searchParams.get('journal_id');
    if (!journalId) {
      return NextResponse.json(
        { error: 'Parameter ID jurnal wajib disertakan.' },
        { status: 400 }
      );
    }

    const rowIndex = await findRowIndex(SHEET_JOURNALS, (row) => row.journal_id === journalId);

    if (rowIndex === -1) {
      return NextResponse.json(
        { error: 'Catatan jurnal tidak ditemukan.' },
        { status: 404 }
      );
    }

    await deleteRow(SHEET_JOURNALS, rowIndex);

    return NextResponse.json({
      success: true,
      message: 'Catatan jurnal berhasil dihapus.',
    });
  } catch (error) {
    console.error('Journal DELETE error:', error);
    return NextResponse.json(
      { error: 'Gagal menghapus catatan jurnal dari lembar kerja.' },
      { status: 500 }
    );
  }
}
