import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  Student,
  AttendanceRecord,
  JournalEntry,
  SubjectItem,
  User,
  normalizeStatus,
} from '@/lib/constants';

function isDateInRange(dateStr: string, startDate?: string, endDate?: string): boolean {
  if (!dateStr) return true;
  const cleanDate = dateStr.slice(0, 10);
  if (startDate && cleanDate < startDate) return false;
  if (endDate && cleanDate > endDate) return false;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Sesi login tidak valid atau telah berakhir.' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const reportType = searchParams.get('type') || 'attendance'; // 'attendance' | 'journal'
    const startDate = searchParams.get('start_date') || undefined; // YYYY-MM-DD
    const endDate = searchParams.get('end_date') || undefined; // YYYY-MM-DD
    const className = searchParams.get('class_name') || (session.role === 'Admin' ? 'ALL' : session.assigned_class);
    const teacherName = searchParams.get('teacher') || 'ALL';
    const subjectName = searchParams.get('subject') || 'ALL';

    // 1. Fetch metadata in parallel from Supabase
    const [studentsRes, subjectsRes, usersRes] = await Promise.all([
      supabaseAdmin.from('students').select('*').eq('is_active', true),
      supabaseAdmin.from('subjects').select('*').eq('is_active', true),
      supabaseAdmin.from('users').select('username, role, nip'),
    ]);

    const activeStudents = (studentsRes.data || []) as Student[];
    const allSubjects = (subjectsRes.data || []) as SubjectItem[];
    const allUsers = (usersRes.data || []) as User[];

    const classList = Array.from(new Set(activeStudents.map((s) => s.class_name).filter(Boolean))).sort();
    const teacherList = Array.from(new Set(allUsers.filter((u) => u.role === 'Teacher' || u.role === 'Admin').map((u) => u.username))).sort();
    const userList = allUsers.map((u) => ({
      username: u.username || '',
      role: u.role || '',
      nip: u.nip || (u as any).NIP || '',
    }));
    const subjectList = allSubjects.map((s) => ({ name: s.name, type: s.type }));

    // =========================================================================
    // REPORT TYPE: ATTENDANCE RECAP
    // =========================================================================
    if (reportType === 'attendance') {
      let query = supabaseAdmin.from('attendance').select('*');

      if (className && className !== 'ALL') {
        query = query.eq('class_name', className);
      }
      if (startDate) {
        query = query.gte('date', startDate);
      }
      if (endDate) {
        query = query.lte('date', endDate);
      }

      const { data: attendanceData, error: attErr } = await query;
      if (attErr) {
        console.error('Supabase attendance report error:', attErr);
        return NextResponse.json({ error: 'Gagal memuat rekap presensi.' }, { status: 500 });
      }

      const allAttendance = (attendanceData || []) as AttendanceRecord[];

      // Filter target students
      const targetStudents = (className && className !== 'ALL')
        ? activeStudents.filter((s) => s.class_name === className)
        : activeStudents;

      // Aggregate statistics per student
      const aggregatedStudents = targetStudents.map((st, index) => {
        const targetId = (st.student_id || '').toString().trim().toLowerCase();
        const targetName = (st.full_name || '').toString().trim().toLowerCase();

        const studentRecords = allAttendance.filter((r) => {
          const recId = (r.student_id || '').toString().trim().toLowerCase();
          if (recId && targetId && recId === targetId) return true;

          const recName = (r.full_name || '').toString().trim().toLowerCase();
          if (recName && targetName && recName === targetName) return true;

          return false;
        });

        let hadir = 0;
        let sakit = 0;
        let izin = 0;
        let alpa = 0;

        studentRecords.forEach((rec) => {
          const statusVal = rec.attendance_status || (rec as any).status;
          const statusNorm = normalizeStatus(statusVal);
          if (statusNorm === 'Sakit') sakit++;
          else if (statusNorm === 'Izin') izin++;
          else if (statusNorm === 'Alpa') alpa++;
          else hadir++;
        });

        const totalDaysRecorded = hadir + sakit + izin + alpa;
        const totalAbsent = sakit + izin + alpa;
        const attendancePercentage = totalDaysRecorded > 0
          ? ((hadir / totalDaysRecorded) * 100).toFixed(1)
          : '100.0';

        return {
          no: index + 1,
          student_id: st.student_id,
          full_name: st.full_name,
          class_name: st.class_name,
          hadir,
          sakit,
          izin,
          alpa,
          totalAbsent,
          totalDays: totalDaysRecorded,
          percentage: attendancePercentage,
        };
      });

      // Overall class statistics summary
      const totalHadir = aggregatedStudents.reduce((sum, s) => sum + s.hadir, 0);
      const totalSakit = aggregatedStudents.reduce((sum, s) => sum + s.sakit, 0);
      const totalIzin = aggregatedStudents.reduce((sum, s) => sum + s.izin, 0);
      const totalAlpa = aggregatedStudents.reduce((sum, s) => sum + s.alpa, 0);
      const totalAllDays = totalHadir + totalSakit + totalIzin + totalAlpa;
      const classAvgPercentage = totalAllDays > 0
        ? ((totalHadir / totalAllDays) * 100).toFixed(1)
        : '100.0';

      // Extract absence records with notes and attachment evidence
      const absenceRecords = allAttendance
        .filter((r) => {
          const norm = normalizeStatus(r.attendance_status || (r as any).status);
          return norm !== 'Hadir';
        })
        .map((r) => ({
          date: r.date || (r.timestamp ? r.timestamp.slice(0, 10) : ''),
          student_id: r.student_id,
          full_name: r.full_name,
          class_name: r.class_name,
          attendance_status: normalizeStatus(r.attendance_status || (r as any).status),
          note: r.note || '',
          recorded_by_username: r.recorded_by_username || '',
          attachment_url: r.attachment_url || (r as any).photo_url || '',
        }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      return NextResponse.json({
        reportType: 'attendance',
        filter: {
          className,
          startDate: startDate || '',
          endDate: endDate || '',
        },
        metadata: {
          classList,
          teacherList,
          userList,
        },
        summary: {
          totalStudents: aggregatedStudents.length,
          totalHadir,
          totalSakit,
          totalIzin,
          totalAlpa,
          classAvgPercentage,
          totalAbsenceRecords: absenceRecords.length,
          totalEvidenceAttached: absenceRecords.filter((a) => !!a.attachment_url).length,
        },
        records: aggregatedStudents,
        absenceRecords,
      });
    }

    // =========================================================================
    // REPORT TYPE: JOURNAL RECAP
    // =========================================================================
    if (reportType === 'journal') {
      let query = supabaseAdmin.from('journals').select('*');

      if (className && className !== 'ALL') {
        query = query.eq('class_name', className);
      }
      if (teacherName && teacherName !== 'ALL') {
        query = query.ilike('teacher_username', teacherName);
      }
      if (subjectName && subjectName !== 'ALL') {
        query = query.ilike('subject_name', subjectName);
      }

      const { data: journalData, error: jErr } = await query;
      if (jErr) {
        console.error('Supabase journals report error:', jErr);
        return NextResponse.json({ error: 'Gagal memuat rekap jurnal.' }, { status: 500 });
      }

      const allJournals = (journalData || []) as JournalEntry[];

      const filteredJournals = allJournals
        .filter((j) => isDateInRange(j.timestamp, startDate, endDate))
        .sort((a, b) => {
          const wA = Number(a.week_number) || 0;
          const wB = Number(b.week_number) || 0;
          if (wA !== wB) return wA - wB;
          return (a.timestamp || '').localeCompare(b.timestamp || '');
        });

      return NextResponse.json({
        reportType: 'journal',
        filter: {
          className,
          teacherName,
          subjectName,
          startDate: startDate || '',
          endDate: endDate || '',
        },
        metadata: {
          classList,
          teacherList,
          userList,
          subjectList,
        },
        summary: {
          totalEntries: filteredJournals.length,
        },
        records: filteredJournals,
      });
    }

    return NextResponse.json({ error: 'Tipe laporan tidak valid.' }, { status: 400 });
  } catch (error) {
    console.error('Reports GET error:', error);
    return NextResponse.json(
      { error: 'Gagal memproses data rekapitulasi laporan.' },
      { status: 500 }
    );
  }
}
