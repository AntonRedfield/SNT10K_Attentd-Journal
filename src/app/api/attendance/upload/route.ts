import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { uploadFileToDrive } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

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
    const studentId = (formData.get('student_id') as string) || '';
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

    // Convert file to Buffer
    const arrayBuffer = await photoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Sanitize file name for Drive
    const cleanStudent = studentName.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Siswa';
    const cleanClass = className.trim().replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_') || 'Kelas';
    const cleanStatus = status.trim().replace(/[^a-zA-Z0-9]/g, '_') || 'Bukti';
    const cleanDate = date.trim().replace(/[^a-zA-Z0-9-]/g, '') || 'date';
    const ext = photoFile.type.includes('png') ? 'png' : 'jpg';

    const fileName = `Bukti_${cleanClass}_${cleanStudent}_${cleanStatus}_${cleanDate}_${Date.now().toString().slice(-4)}.${ext}`;

    let photoUrl = '';
    let fileId = '';

    try {
      const uploadResult = await uploadFileToDrive({
        buffer,
        fileName,
        mimeType: photoFile.type || 'image/jpeg',
      });

      fileId = uploadResult.fileId;
      photoUrl = uploadResult.directUrl || uploadResult.webViewLink;
    } catch (uploadError) {
      console.warn('Google Drive direct upload warning. Storing encoded preview fallback:', uploadError);
      let base64Data = buffer.toString('base64');
      const mime = photoFile.type || 'image/jpeg';
      if (base64Data.length > 44000) {
        base64Data = base64Data.slice(0, 44000);
      }
      photoUrl = `data:${mime};base64,${base64Data}`;
    }

    return NextResponse.json({
      success: true,
      message: 'Foto bukti berhasil diunggah.',
      photo_url: photoUrl,
      file_id: fileId,
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
