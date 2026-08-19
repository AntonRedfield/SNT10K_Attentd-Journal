import { NextRequest, NextResponse } from 'next/server';
import { getDriveFileStream } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const fileId = request.nextUrl.searchParams.get('id');
    if (!fileId) {
      return NextResponse.json({ error: 'Parameter ID file diperlukan.' }, { status: 400 });
    }

    // Clean file ID if full url was passed
    let cleanId = fileId;
    if (cleanId.includes('/d/')) {
      const match = cleanId.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) cleanId = match[1];
    } else if (cleanId.includes('id=')) {
      const match = cleanId.match(/id=([a-zA-Z0-9_-]+)/);
      if (match) cleanId = match[1];
    }

    const { stream, mimeType } = await getDriveFileStream(cleanId);

    // Convert NodeJS ReadableStream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });

    return new NextResponse(webStream as any, {
      headers: {
        'Content-Type': mimeType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Drive Image Proxy error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat gambar dari Google Drive.' },
      { status: 500 }
    );
  }
}
