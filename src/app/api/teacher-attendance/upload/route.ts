import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeRole } from '@/lib/constants';

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

    const normalizedRole = normalizeRole(session.role);
    if (normalizedRole !== 'Teacher' && normalizedRole !== 'Admin') {
      return NextResponse.json(
        { error: 'Fitur presensi swafoto ini khusus untuk akun dengan peran Guru/Pendidik.' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const photoFile = formData.get('photo') as File | null;
    const teacherName = (formData.get('teacher_name') as string) || session.username || 'Guru';
    const type = (formData.get('type') as string) || 'Masuk';
    const date = (formData.get('date') as string) || new Date().toISOString().split('T')[0];

    if (!photoFile || photoFile.size === 0) {
      return NextResponse.json(
        { error: 'Berkas foto selfie presensi tidak ditemukan dalam permintaan.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await photoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Sanitize file name
    const cleanTeacher = teacherName.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Guru';
    const cleanType = type.trim().replace(/[^a-zA-Z0-9]/g, '_') || 'Masuk';
    const cleanDate = date.trim().replace(/[^a-zA-Z0-9-]/g, '') || 'date';
    const ext = photoFile.type.includes('png') ? 'png' : 'jpg';

    const fileName = `teacher-attendance/${cleanDate}/${session.user_id}_${cleanTeacher}_${cleanType}_${Date.now().toString().slice(-4)}.${ext}`;
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
      console.warn('Supabase teacher attendance photo upload warning:', uploadError);
      // Fallback base64 data URI if storage fails
      let base64Data = buffer.toString('base64');
      if (base64Data.length > 50000) {
        base64Data = base64Data.slice(0, 50000);
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
      message: 'Foto selfie presensi berhasil diunggah.',
      photo_url: photoUrl,
      fileName,
    });
  } catch (error) {
    console.error('Teacher Attendance Upload POST error:', error);
    return NextResponse.json(
      { error: 'Gagal mengunggah foto selfie presensi guru.' },
      { status: 500 }
    );
  }
}
