import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows, appendRow, findRowIndex, deleteRow, updateRow } from '@/lib/google-sheets';
import { SHEET_JOURNALS, JournalEntry } from '@/lib/constants';
import { uploadFileToDrive } from '@/lib/google-drive';

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
      .filter((j) => !className || className.toUpperCase() === 'ALL' || j.class_name === className)
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

    let className = '';
    let subjectName = '';
    let weekNumber = '';
    let topic = '';
    let photoUrl = '';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      className = (formData.get('class_name') as string) || '';
      subjectName = (formData.get('subject_name') as string) || '';
      weekNumber = (formData.get('week_number') as string) || '';
      topic = (formData.get('topic') as string) || '';

      const photoFile = formData.get('photo') as File | null;
      if (photoFile && photoFile.size > 0) {
        try {
          const arrayBuffer = await photoFile.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const sanitizedSubject = subjectName.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Subject';
          const sanitizedUser = session.username.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'User';
          const ext = photoFile.type.includes('png') ? 'png' : 'jpg';
          const fileName = `${sanitizedSubject}_week${weekNumber}_${sanitizedUser}.${ext}`;

          try {
            const uploadResult = await uploadFileToDrive({
              buffer,
              fileName,
              mimeType: photoFile.type || 'image/jpeg',
            });

            // Use direct URL or drive direct link
            photoUrl = uploadResult.directUrl || uploadResult.webViewLink;
          } catch (uploadError) {
            console.warn('Google Drive Upload notice. Using direct embedded image storage fallback:', uploadError);
            let base64Data = buffer.toString('base64');
            const mime = photoFile.type || 'image/jpeg';
            if (base64Data.length > 44000) {
              base64Data = base64Data.slice(0, 44000);
            }
            photoUrl = `data:${mime};base64,${base64Data}`;
          }
        } catch (fileErr) {
          console.error('Photo buffer processing error:', fileErr);
        }
      }
    } else {
      const body = await request.json();
      className = body.class_name || '';
      subjectName = body.subject_name || '';
      weekNumber = body.week_number || '';
      topic = body.topic || '';
      photoUrl = body.photo_url || '';
    }

    if (!className || !subjectName || !weekNumber || !topic) {
      return NextResponse.json(
        { error: 'Seluruh kolom (kelas, mata pelajaran, minggu ke-, topik) wajib diisi.' },
        { status: 400 }
      );
    }

    const weekNum = Number(weekNumber);
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
      className,
      subjectName,
      String(weekNum),
      topic,
      session.username,
      photoUrl,
    ]);

    return NextResponse.json({
      success: true,
      message: 'Catatan agenda mengajar dan dokumentasi berhasil disimpan.',
      journal_id: journalId,
      photo_url: photoUrl,
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

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid atau telah berakhir.' }, { status: 401 });
    }

    if (session.role === 'PIC') {
      return NextResponse.json({ error: 'Akses ditolak: Modul jurnal hanya untuk Guru dan Administrator.' }, { status: 403 });
    }

    let journalId = '';
    let className = '';
    let subjectName = '';
    let weekNumber = '';
    let topic = '';
    let photoUrl = '';
    let hasNewPhoto = false;
    let removePhoto = false;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      journalId = (formData.get('journal_id') as string) || '';
      className = (formData.get('class_name') as string) || '';
      subjectName = (formData.get('subject_name') as string) || '';
      weekNumber = (formData.get('week_number') as string) || '';
      topic = (formData.get('topic') as string) || '';
      removePhoto = formData.get('remove_photo') === 'true';

      const photoFile = formData.get('photo') as File | null;
      if (photoFile && photoFile.size > 0) {
        hasNewPhoto = true;
        try {
          const arrayBuffer = await photoFile.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const sanitizedSubject = subjectName.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Subject';
          const sanitizedUser = session.username.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'User';
          const ext = photoFile.type.includes('png') ? 'png' : 'jpg';
          const fileName = `${sanitizedSubject}_week${weekNumber}_${sanitizedUser}.${ext}`;

          try {
            const uploadResult = await uploadFileToDrive({
              buffer,
              fileName,
              mimeType: photoFile.type || 'image/jpeg',
            });
            photoUrl = uploadResult.directUrl || uploadResult.webViewLink;
          } catch (uploadError) {
            console.warn('Google Drive Upload notice in PUT. Using direct embedded image storage fallback:', uploadError);
            let base64Data = buffer.toString('base64');
            const mime = photoFile.type || 'image/jpeg';
            if (base64Data.length > 44000) {
              base64Data = base64Data.slice(0, 44000);
            }
            photoUrl = `data:${mime};base64,${base64Data}`;
          }
        } catch (fileErr) {
          console.error('Photo buffer processing error:', fileErr);
        }
      }
    } else {
      const body = await request.json();
      journalId = body.journal_id || '';
      className = body.class_name || '';
      subjectName = body.subject_name || '';
      weekNumber = body.week_number || '';
      topic = body.topic || '';
      if (body.photo_url !== undefined) {
        photoUrl = body.photo_url;
        hasNewPhoto = true;
      }
      removePhoto = body.remove_photo === true;
    }

    if (!journalId) {
      return NextResponse.json({ error: 'ID jurnal (journal_id) wajib diisi.' }, { status: 400 });
    }

    if (!className || !subjectName || !weekNumber || !topic) {
      return NextResponse.json(
        { error: 'Seluruh kolom (kelas, mata pelajaran, minggu ke-, topik) wajib diisi.' },
        { status: 400 }
      );
    }

    const weekNum = Number(weekNumber);
    if (isNaN(weekNum) || weekNum < 1 || weekNum > 52) {
      return NextResponse.json(
        { error: 'Nomor pertemuan/minggu harus antara 1 sampai 52.' },
        { status: 400 }
      );
    }

    // Read existing row to preserve timestamp, teacher, and photo_url if not replaced
    const journals = await getSheetRows<JournalEntry>(SHEET_JOURNALS);
    const existing = journals.find((j) => j.journal_id === journalId);

    const rowIndex = await findRowIndex(SHEET_JOURNALS, (row) => row.journal_id === journalId);
    if (rowIndex === -1 || !existing) {
      return NextResponse.json({ error: 'Catatan jurnal tidak ditemukan.' }, { status: 404 });
    }

    let finalPhotoUrl = existing.photo_url || '';
    if (removePhoto) {
      finalPhotoUrl = '';
    } else if (hasNewPhoto) {
      finalPhotoUrl = photoUrl;
    }

    await updateRow(SHEET_JOURNALS, rowIndex, [
      journalId,
      existing.timestamp || new Date().toISOString(),
      className,
      subjectName,
      String(weekNum),
      topic,
      existing.teacher_username || session.username,
      finalPhotoUrl,
    ]);

    return NextResponse.json({
      success: true,
      message: 'Catatan agenda mengajar berhasil diperbarui.',
      journal_id: journalId,
      photo_url: finalPhotoUrl,
    });
  } catch (error) {
    console.error('Journal PUT error:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui catatan jurnal di lembar kerja.' },
      { status: 500 }
    );
  }
}
