import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { uploadFileToDrive } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

const BUCKET_NAME = 'attendance-evidence';

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

    let query = supabaseAdmin
      .from('journals')
      .select('*')
      .order('timestamp', { ascending: false });

    if (className && className.toUpperCase() !== 'ALL') {
      query = query.eq('class_name', className);
    }

    const { data: journals, error } = await query;

    if (error) {
      console.error('Supabase journal GET error:', error);
      return NextResponse.json({ error: 'Gagal memuat catatan jurnal dari database.' }, { status: 500 });
    }

    // Sort by week_number numerically if possible
    const sorted = (journals || []).sort((a, b) => Number(a.week_number || 0) - Number(b.week_number || 0));

    return NextResponse.json({ journals: sorted });
  } catch (error) {
    console.error('Journal GET error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat catatan jurnal dari database.' },
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

          const d = new Date();
          const dateFormatted = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
          const sanitizedSubject = subjectName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'mapel';
          const sanitizedUser = session.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'guru';
          const ext = photoFile.type.includes('png') ? 'png' : 'jpg';
          const suffix = Date.now().toString().slice(-4);

          // Format: activity_date_user_suffix.ext (e.g. journal-math_24-08-2026_teacher-name_1.jpg)
          const baseFileName = `journal-${sanitizedSubject}_${dateFormatted}_${sanitizedUser}_${suffix}.${ext}`;
          const contentType = photoFile.type || 'image/jpeg';

          // 1. Primary: Upload directly to Google Drive
          try {
            const driveRes = await uploadFileToDrive({
              buffer,
              fileName: baseFileName,
              mimeType: contentType,
            });
            if (driveRes && (driveRes.directUrl || driveRes.webViewLink)) {
              photoUrl = driveRes.directUrl || driveRes.webViewLink;
            }
          } catch (driveErr) {
            console.warn('Google Drive journal photo upload warning, attempting Supabase storage fallback:', driveErr);
          }

          // 2. Secondary Fallback: Supabase Storage if Drive is not configured
          if (!photoUrl) {
            const fileName = `journals/${baseFileName}`;
            const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
              .from(BUCKET_NAME)
              .upload(fileName, buffer, {
                contentType,
                upsert: true,
              });

            if (!uploadErr && uploadData) {
              const { data: urlData } = supabaseAdmin.storage
                .from(BUCKET_NAME)
                .getPublicUrl(uploadData.path);
              photoUrl = urlData.publicUrl;
            } else {
              let base64Data = buffer.toString('base64');
              if (base64Data.length > 44000) {
                base64Data = base64Data.slice(0, 44000);
              }
              photoUrl = `data:${contentType};base64,${base64Data}`;
            }
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

    const { error: insertErr } = await supabaseAdmin
      .from('journals')
      .insert({
        journal_id: journalId,
        timestamp: now,
        class_name: className.trim(),
        subject_name: subjectName.trim(),
        week_number: String(weekNum),
        topic: topic.trim(),
        teacher_username: session.username,
        photo_url: photoUrl,
      });

    if (insertErr) {
      console.error('Supabase journal insert error:', insertErr);
      return NextResponse.json({ error: 'Gagal menyimpan catatan jurnal ke database.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Catatan agenda mengajar dan dokumentasi berhasil disimpan.',
      journal_id: journalId,
      photo_url: photoUrl,
    });
  } catch (error) {
    console.error('Journal POST error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan catatan jurnal ke database.' },
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

    const { error: deleteErr } = await supabaseAdmin
      .from('journals')
      .delete()
      .eq('journal_id', journalId);

    if (deleteErr) {
      console.error('Supabase journal delete error:', deleteErr);
      return NextResponse.json({ error: 'Gagal menghapus catatan jurnal dari database.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Catatan jurnal berhasil dihapus.',
    });
  } catch (error) {
    console.error('Journal DELETE error:', error);
    return NextResponse.json(
      { error: 'Gagal menghapus catatan jurnal dari database.' },
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
          const d = new Date();
          const dateFormatted = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
          const sanitizedSubject = subjectName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'mapel';
          const sanitizedUser = session.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'guru';
          const ext = photoFile.type.includes('png') ? 'png' : 'jpg';
          const suffix = Date.now().toString().slice(-4);
          const baseFileName = `journal-${sanitizedSubject}_${dateFormatted}_${sanitizedUser}_${suffix}.${ext}`;
          const contentType = photoFile.type || 'image/jpeg';

          // 1. Primary: Upload directly to Google Drive
          try {
            const driveRes = await uploadFileToDrive({
              buffer,
              fileName: baseFileName,
              mimeType: contentType,
            });
            if (driveRes && (driveRes.directUrl || driveRes.webViewLink)) {
              photoUrl = driveRes.directUrl || driveRes.webViewLink;
            }
          } catch (driveErr) {
            console.warn('Google Drive journal photo update warning, attempting Supabase storage fallback:', driveErr);
          }

          // 2. Secondary Fallback: Supabase Storage if Drive is not configured
          if (!photoUrl) {
            const fileName = `journals/${baseFileName}`;
            const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
              .from(BUCKET_NAME)
              .upload(fileName, buffer, {
                contentType,
                upsert: true,
              });

            if (!uploadErr && uploadData) {
              const { data: urlData } = supabaseAdmin.storage
                .from(BUCKET_NAME)
                .getPublicUrl(uploadData.path);
              photoUrl = urlData.publicUrl;
            } else {
              let base64Data = buffer.toString('base64');
              if (base64Data.length > 44000) {
                base64Data = base64Data.slice(0, 44000);
              }
              photoUrl = `data:${contentType};base64,${base64Data}`;
            }
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

    // Fetch existing
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('journals')
      .select('*')
      .eq('journal_id', journalId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Catatan jurnal tidak ditemukan.' }, { status: 404 });
    }

    let finalPhotoUrl = existing.photo_url || '';
    if (removePhoto) {
      finalPhotoUrl = '';
    } else if (hasNewPhoto) {
      finalPhotoUrl = photoUrl;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('journals')
      .update({
        class_name: className.trim(),
        subject_name: subjectName.trim(),
        week_number: String(weekNum),
        topic: topic.trim(),
        photo_url: finalPhotoUrl,
      })
      .eq('journal_id', journalId);

    if (updateErr) {
      console.error('Supabase journal update error:', updateErr);
      return NextResponse.json({ error: 'Gagal memperbarui catatan jurnal di database.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Catatan agenda mengajar berhasil diperbarui.',
      journal_id: journalId,
      photo_url: finalPhotoUrl,
    });
  } catch (error) {
    console.error('Journal PUT error:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui catatan jurnal di database.' },
      { status: 500 }
    );
  }
}
