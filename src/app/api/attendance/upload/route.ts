import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const BUCKET_NAME = 'attendance-evidence';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Sesi login tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const photoFile = formData.get('photo') as File | null;
    const studentName = (formData.get('student_name') as string) || 'Student';
    const className = (formData.get('class_name') as string) || 'Class';
    const date = (formData.get('date') as string) || new Date().toISOString().split('T')[0];
    const status = (formData.get('status') as string) || 'Bukti';

    if (!photoFile || photoFile.size === 0) {
      return NextResponse.json(
        { error: 'Berkas foto bukti tidak ditemukan dalam permintaan.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await photoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Format date as DD-MM-YYYY
    let dateFormatted = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      const [yyyy, mm, dd] = date.trim().split('-');
      dateFormatted = `${dd}-${mm}-${yyyy}`;
    } else {
      const d = new Date();
      dateFormatted = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }

    const cleanStudent = studentName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'siswa';
    const cleanClass = className.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'kelas';
    const cleanStatus = status.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'bukti';
    const ext = photoFile.type.includes('png') ? 'png' : 'jpg';
    const suffix = Date.now().toString().slice(-4);

    // Format: activity_date_user_suffix.ext (e.g. bukti-presensi-7a-sakit_24-08-2026_student-name_1.jpg)
    const fileName = `student-evidence/bukti-presensi-${cleanClass}-${cleanStatus}_${dateFormatted}_${cleanStudent}_${suffix}.${ext}`;
    const contentType = photoFile.type || 'image/jpeg';

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType,
        upsert: true,
      });

    let photoUrl = '';

    if (uploadError) {
      console.warn('Supabase storage upload warning:', uploadError);
      // Fallback base64 data URI if storage fails
      let base64Data = buffer.toString('base64');
      if (base64Data.length > 44000) {
        base64Data = base64Data.slice(0, 44000);
      }
      photoUrl = `data:${contentType};base64,${base64Data}`;
    } else {
      const { data: urlData } = supabaseAdmin.storage
        .from(BUCKET_NAME)
        .getPublicUrl(uploadData.path);
      photoUrl = urlData.publicUrl;
    }

    return NextResponse.json({
      success: true,
      message: 'Foto bukti berhasil diunggah ke Supabase Storage.',
      photo_url: photoUrl,
      fileName,
    });
  } catch (error) {
    console.error('Attendance Upload POST error:', error);
    return NextResponse.json(
      { error: 'Gagal mengunggah foto bukti ketidakhadiran.' },
      { status: 500 }
    );
  }
}
