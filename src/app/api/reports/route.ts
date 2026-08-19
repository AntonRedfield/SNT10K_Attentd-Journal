import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetRows } from '@/lib/google-sheets';
import {
  SHEET_STUDENTS,
  SHEET_ATTENDANCE,
  SHEET_JOURNALS,
  SHEET_SUBJECTS,
  SHEET_USERS,
  Student,
  AttendanceRecord,
  JournalEntry,
  SubjectItem,
  User,
  normalizeStatus,
} from '@/lib/constants';

/**
 * Helper to check if a date string falls within [startDate, endDate] inclusive.
 * Handles ISO timestamps "2026-08-12T..." and date strings "2026-08-12"
 */
function isDateInRange(dateStr: string, startDate?: string, endDate?: string): boolean {
  if (!dateStr) return true;
  // Extract YYYY-MM-DD
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

    // 1. Fetch metadata needed (classList, subjectList, teacherList)
    const [allStudents, allSubjects, allUsers] = await Promise.all([
      getSheetRows<Student>(SHEET_STUDENTS),
      getSheetRows<SubjectItem>(SHEET_SUBJECTS).catch(() => []),
      getSheetRows<User>(SHEET_USERS).catch(() => []),
    ]);

    const activeStudents = allStudents.filter(
      (s) => s.is_active?.toUpperCase() !== 'FALSE'
    );

    const classList = Array.from(new Set(activeStudents.map((s) => s.class_name).filter(Boolean))).sort();
    const teacherList = Array.from(new Set(allUsers.filter((u) => u.role === 'Teacher' || u.role === 'Admin').map((u) => u.username))).sort();
    const userList = Array.from(new Set(allUsers.map((u) => u.username).filter(Boolean))).sort();
    const subjectList = allSubjects.map((s) => ({ name: s.name, type: s.type }));

    // =========================================================================
    // REPORT TYPE: ATTENDANCE RECAP
    // =========================================================================
    if (reportType === 'attendance') {
      const allAttendance = await getSheetRows<AttendanceRecord>(SHEET_ATTENDANCE);

      // Filter students by requested class
      const targetStudents = (className && className !== 'ALL')
        ? activeStudents.filter((s) => s.class_name === className)
        : activeStudents;

      // Filter attendance records by date range & class
      const filteredRecords = allAttendance.filter((r) => {
        if (className && className !== 'ALL' && r.class_name !== className) return false;
        const recordDate = r.date || r.timestamp;
        return isDateInRange(recordDate, startDate, endDate);
      });

      // Aggregate statistics per student
      const aggregatedStudents = targetStudents.map((st, index) => {
        const studentRecords = filteredRecords.filter((r) => r.student_id === st.student_id);

        let hadir = 0;
        let sakit = 0;
        let izin = 0;
        let alpa = 0;

        studentRecords.forEach((rec) => {
          const st = normalizeStatus(rec.attendance_status);
          if (st === 'Sakit') sakit++;
          else if (st === 'Izin') izin++;
          else if (st === 'Alpa') alpa++;
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
        },
        records: aggregatedStudents,
      });
    }

    // =========================================================================
    // REPORT TYPE: JOURNAL RECAP
    // =========================================================================
    if (reportType === 'journal') {
      const allJournals = await getSheetRows<JournalEntry>(SHEET_JOURNALS);

      const filteredJournals = allJournals
        .filter((j) => {
          if (className && className !== 'ALL' && j.class_name !== className) return false;
          if (teacherName && teacherName !== 'ALL' && j.teacher_username?.toLowerCase() !== teacherName.toLowerCase()) return false;
          if (subjectName && subjectName !== 'ALL' && j.subject_name?.toLowerCase() !== subjectName.toLowerCase()) return false;
          return isDateInRange(j.timestamp, startDate, endDate);
        })
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
