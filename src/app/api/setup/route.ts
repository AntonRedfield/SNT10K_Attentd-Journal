import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_SUBJECTS } from '@/lib/constants';

/**
 * POST /api/setup
 * Verifies Supabase tables, storage buckets, and seeds default records if missing.
 * Only accessible by Admin role.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const results: string[] = [];

    // 1. Verify Users Table & Admin
    const { data: users, error: userErr } = await supabaseAdmin
      .from('users')
      .select('user_id, username')
      .limit(5);

    if (userErr) {
      results.push(`❌ Error accessing users table: ${userErr.message}`);
    } else {
      results.push(`✅ Users table verified (${users?.length || 0} sample users loaded)`);
    }

    // 2. Verify Students Table
    const { count: studentCount, error: studentErr } = await supabaseAdmin
      .from('students')
      .select('*', { count: 'exact', head: true });

    if (studentErr) {
      results.push(`❌ Error accessing students table: ${studentErr.message}`);
    } else {
      results.push(`✅ Students table verified (${studentCount || 0} students)`);
    }

    // 3. Verify Subjects Table & Seed if empty
    const { data: existingSubjects, error: subjErr } = await supabaseAdmin
      .from('subjects')
      .select('subject_id');

    if (subjErr) {
      results.push(`❌ Error accessing subjects table: ${subjErr.message}`);
    } else if (!existingSubjects || existingSubjects.length === 0) {
      for (let i = 0; i < DEFAULT_SUBJECTS.length; i++) {
        await supabaseAdmin.from('subjects').insert({
          subject_id: `SUBJ-INIT-${i + 1}`,
          name: DEFAULT_SUBJECTS[i].name,
          type: DEFAULT_SUBJECTS[i].type,
          is_active: true,
        });
      }
      results.push(`✅ Seeded ${DEFAULT_SUBJECTS.length} default subjects into Supabase`);
    } else {
      results.push(`✅ Subjects table verified (${existingSubjects.length} subjects found)`);
    }

    // 4. Verify Attendance Table
    const { count: attCount, error: attErr } = await supabaseAdmin
      .from('attendance')
      .select('*', { count: 'exact', head: true });

    if (attErr) {
      results.push(`❌ Error accessing attendance table: ${attErr.message}`);
    } else {
      results.push(`✅ Attendance table verified (${attCount || 0} records)`);
    }

    // 5. Verify Journals Table
    const { count: jrnCount, error: jrnErr } = await supabaseAdmin
      .from('journals')
      .select('*', { count: 'exact', head: true });

    if (jrnErr) {
      results.push(`❌ Error accessing journals table: ${jrnErr.message}`);
    } else {
      results.push(`✅ Journals table verified (${jrnCount || 0} journals)`);
    }

    // 6. Verify Storage Bucket
    const { data: buckets, error: bErr } = await supabaseAdmin.storage.listBuckets();
    if (bErr) {
      results.push(`⚠️ Warning checking storage buckets: ${bErr.message}`);
    } else {
      const hasBucket = buckets?.some((b) => b.name === 'attendance-evidence');
      if (hasBucket) {
        results.push('✅ Supabase Storage bucket "attendance-evidence" is active');
      } else {
        results.push('⚠️ Storage bucket "attendance-evidence" not listed (check Supabase Dashboard)');
      }
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
