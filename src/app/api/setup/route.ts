import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createSheetTab, appendRow, getSheetRows } from '@/lib/google-sheets';
import {
  SHEET_USERS,
  SHEET_STUDENTS,
  SHEET_ATTENDANCE,
  SHEET_JOURNALS,
  SHEET_SUBJECTS,
  SHEET_MAIN_DATA,
  DEFAULT_SUBJECTS,
} from '@/lib/constants';

/**
 * POST /api/setup
 * Creates all required sheet tabs (Users, Students, Attendance, Journals, Subjects)
 * and seeds initial data from main_data sheet.
 * Only accessible by Admin role.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const results: string[] = [];

    // 1. Create Users sheet with headers
    await createSheetTab(SHEET_USERS, [
      'user_id', 'username', 'password', 'role', 'assigned_class', 'nip', 'pin', 'biometric_credential_id', 'biometric_public_key',
    ]);
    results.push('✅ Users sheet created');

    // 2. Create Students sheet with headers
    await createSheetTab(SHEET_STUDENTS, [
      'student_id', 'full_name', 'class_name', 'is_active',
    ]);
    results.push('✅ Students sheet created');

    // 3. Create Attendance sheet with headers
    await createSheetTab(SHEET_ATTENDANCE, [
      'timestamp', 'date', 'class_name', 'student_id', 'full_name',
      'attendance_status', 'note', 'recorded_by_username', 'attachment_url',
    ]);
    results.push('✅ Attendance sheet created');

    // 4. Create Journals sheet with headers
    await createSheetTab(SHEET_JOURNALS, [
      'journal_id', 'timestamp', 'class_name', 'subject_name',
      'week_number', 'topic', 'teacher_username', 'photo_url',
    ]);
    results.push('✅ Journals sheet created');

    // 5. Create Subjects sheet with headers & seed default subjects
    await createSheetTab(SHEET_SUBJECTS, [
      'subject_id', 'name', 'type', 'is_active',
    ]);
    const existingSubjects = await getSheetRows<Record<string, string>>(SHEET_SUBJECTS);
    if (existingSubjects.length === 0) {
      for (let i = 0; i < DEFAULT_SUBJECTS.length; i++) {
        await appendRow(SHEET_SUBJECTS, [
          `SUBJ-INIT-${i + 1}`,
          DEFAULT_SUBJECTS[i].name,
          DEFAULT_SUBJECTS[i].type,
          'TRUE',
        ]);
      }
      results.push(`✅ Subjects sheet created & seeded ${DEFAULT_SUBJECTS.length} subjects`);
    } else {
      results.push('ℹ️ Subjects sheet already exists');
    }

    // 5. Ensure admin account exists in Users sheet
    const existingUsers = await getSheetRows<Record<string, string>>(SHEET_USERS);
    const adminExists = existingUsers.some((u) => u.username === 'sistema@snt10kupang');

    if (!adminExists) {
      await appendRow(SHEET_USERS, [
        'U-ADMIN-001',
        'sistema@snt10kupang',
        'sistem@absensnt10K',
        'Admin',
        'ALL',
      ]);
      results.push('✅ Admin account created');
    } else {
      results.push('ℹ️ Admin account already exists');
    }

    // 6. Try to import students from main_data sheet
    try {
      const mainData = await getSheetRows<Record<string, string>>(SHEET_MAIN_DATA);
      if (mainData.length > 0) {
        // Check existing students to avoid duplicates
        const existingStudents = await getSheetRows<Record<string, string>>(SHEET_STUDENTS);
        const existingIds = new Set(existingStudents.map((s) => s.student_id));

        let importCount = 0;
        for (const row of mainData) {
          // Attempt to map main_data columns to Students columns
          const studentId = row.student_id || row.id || `S-${Date.now()}-${importCount}`;
          const fullName = row.full_name || row.name || row.nama || '';
          const className = row.class_name || row.class || row.kelas || '';
          const role = row.role || row.jabatan || '';

          if (fullName && className && !existingIds.has(studentId)) {
            // Only import if it looks like student data (not officer data)
            if (!role || role.toLowerCase() === 'student' || role.toLowerCase() === 'siswa') {
              await appendRow(SHEET_STUDENTS, [
                studentId,
                fullName,
                className,
                'TRUE',
              ]);
              importCount++;
            }
          }
        }
        results.push(`✅ Imported ${importCount} students from main_data`);

        // Also try to create PIC/Teacher accounts from main_data officers
        let officerCount = 0;
        for (const row of mainData) {
          const role = row.role || row.jabatan || '';
          const name = row.full_name || row.name || row.nama || '';
          const className = row.class_name || row.class || row.kelas || '';

          if (role && role.toLowerCase() !== 'student' && role.toLowerCase() !== 'siswa' && name) {
            const username = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
            const userExists = existingUsers.some((u) => u.username === username);

            if (!userExists) {
              const mappedRole = role.toLowerCase().includes('teacher') || role.toLowerCase().includes('guru')
                ? 'Teacher'
                : 'PIC';

              await appendRow(SHEET_USERS, [
                `U-${Date.now()}-${officerCount}`,
                username,
                username + '123', // Default password
                mappedRole,
                className,
              ]);
              officerCount++;
            }
          }
        }
        if (officerCount > 0) {
          results.push(`✅ Created ${officerCount} user accounts from main_data officers`);
        }
      }
    } catch {
      results.push('ℹ️ main_data sheet not found or empty — skipped import');
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: 'Setup failed: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
