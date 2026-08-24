import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeRole } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Sesi login tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    const normalizedRole = normalizeRole(session.role);
    const { searchParams } = request.nextUrl;
    const requestedDate = searchParams.get('date');
    const requestedUserId = searchParams.get('user_id');
    const requestedMonth = searchParams.get('month'); // YYYY-MM

    let query = supabaseAdmin
      .from('teacher_attendance')
      .select('*')
      .order('timestamp', { ascending: false });

    // Non-admin can only see their own attendance
    if (normalizedRole !== 'Admin') {
      query = query.eq('user_id', session.user_id);
    } else if (requestedUserId && requestedUserId !== 'ALL') {
      query = query.eq('user_id', requestedUserId);
    }

    if (requestedDate) {
      query = query.eq('date', requestedDate);
    } else if (requestedMonth) {
      query = query.gte('date', `${requestedMonth}-01`).lte('date', `${requestedMonth}-31`);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error('Supabase teacher_attendance GET error:', error);
      return NextResponse.json(
        { error: 'Gagal memuat catatan presensi guru dari database.' },
        { status: 500 }
      );
    }

    // Check today's status for the logged-in user
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: todayRecords } = await supabaseAdmin
      .from('teacher_attendance')
      .select('*')
      .eq('user_id', session.user_id)
      .eq('date', todayStr)
      .order('timestamp', { ascending: true });

    const masukRecord = todayRecords?.find((r) => r.type === 'Masuk') || null;
    const pulangRecord = todayRecords?.find((r) => r.type === 'Pulang') || null;

    return NextResponse.json({
      success: true,
      records: records || [],
      todayStatus: {
        has_checked_in: !!masukRecord,
        has_checked_out: !!pulangRecord,
        masuk: masukRecord,
        pulang: pulangRecord,
      },
    });
  } catch (error) {
    console.error('Teacher Attendance GET error:', error);
    return NextResponse.json(
      { error: 'Gagal memuat data presensi guru.' },
      { status: 500 }
    );
  }
}

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
        { error: 'Fitur ini khusus untuk akun dengan peran Guru/Pendidik.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      type = 'Masuk',
      attendance_status = 'Hadir',
      photo_url,
      latitude,
      longitude,
      accuracy,
      address,
      note,
    } = body;

    if (!photo_url) {
      return NextResponse.json(
        { error: 'Foto selfie kehadiran wajib diambil.' },
        { status: 400 }
      );
    }

    // Fetch official user information from database
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('user_id, username, role, nip')
      .eq('user_id', session.user_id)
      .single();

    const username = dbUser?.username || session.username;
    const nip = dbUser?.nip || '-';

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS

    const newRecord = {
      user_id: session.user_id,
      username,
      nip,
      date: dateStr,
      time: timeStr,
      timestamp: now.toISOString(),
      type: type === 'Pulang' ? 'Pulang' : 'Masuk',
      attendance_status: attendance_status || 'Hadir',
      photo_url,
      latitude: typeof latitude === 'number' ? latitude : null,
      longitude: typeof longitude === 'number' ? longitude : null,
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      address: address || null,
      note: note ? String(note).trim() : null,
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('teacher_attendance')
      .insert(newRecord)
      .select()
      .single();

    if (insertError) {
      console.error('Teacher attendance insert error:', insertError);
      return NextResponse.json(
        { error: 'Gagal menyimpan catatan presensi guru ke database.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Presensi ${newRecord.type} berhasil direkam pada pukul ${timeStr} WITA.`,
      record: inserted,
    });
  } catch (error) {
    console.error('Teacher Attendance POST error:', error);
    return NextResponse.json(
      { error: 'Gagal merekam presensi guru.' },
      { status: 500 }
    );
  }
}
