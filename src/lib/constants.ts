// Sheet tab names
export const SHEET_USERS = 'Users';
export const SHEET_STUDENTS = 'Students';
export const SHEET_ATTENDANCE = 'Attendance';
export const SHEET_JOURNALS = 'Journals';
export const SHEET_SUBJECTS = 'Subjects';
export const SHEET_MAIN_DATA = 'Main_Data';

// Attendance statuses in Indonesian
export const ATTENDANCE_STATUSES = ['Sakit', 'Izin', 'Alpa'] as const;
export type AttendanceStatus =
  | 'Hadir'
  | 'Sakit'
  | 'Izin'
  | 'Alpa'
  | 'Present'
  | 'Sick'
  | 'Permitted'
  | 'Unpermitted';

// Roles
export const ROLES = ['Admin', 'Teacher', 'PIC'] as const;
export type UserRole = (typeof ROLES)[number];

// Subject / Activity Types
export const SUBJECT_TYPES = ['Intrakurikuler', 'Kokurikuler', 'Ekstrakurikuler'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export interface SubjectItem {
  subject_id: string;
  name: string;
  type: SubjectType;
  is_active?: string;
}

// Default initial subjects categorized by type
export const DEFAULT_SUBJECTS: { name: string; type: SubjectType }[] = [
  // 1. Intrakurikuler (12 mata pelajaran pokok)
  { name: 'Agama Kristen', type: 'Intrakurikuler' },
  { name: 'Agama Islam', type: 'Intrakurikuler' },
  { name: 'Bimbingan Konseling', type: 'Intrakurikuler' },
  { name: 'Pendidikan Pancasila', type: 'Intrakurikuler' },
  { name: 'Bahasa Indonesia', type: 'Intrakurikuler' },
  { name: 'Matematika', type: 'Intrakurikuler' },
  { name: 'Ilmu Pengetahuan Alam', type: 'Intrakurikuler' },
  { name: 'Ilmu Pengetahuan Sosial', type: 'Intrakurikuler' },
  { name: 'Bahasa Inggris', type: 'Intrakurikuler' },
  { name: 'PJOK', type: 'Intrakurikuler' },
  { name: 'Informatika', type: 'Intrakurikuler' },
  { name: 'Seni Budaya', type: 'Intrakurikuler' },

  // 2. Kokurikuler
  { name: 'Observation', type: 'Kokurikuler' },
  { name: 'Native Speaker', type: 'Kokurikuler' },
  { name: 'Project', type: 'Kokurikuler' },

  // 3. Ekstrakurikuler
  { name: 'Scout', type: 'Ekstrakurikuler' },
  { name: 'Football', type: 'Ekstrakurikuler' },
  { name: 'Painting', type: 'Ekstrakurikuler' },
];

export const SUBJECT_LIST = DEFAULT_SUBJECTS.map((s) => s.name);
export type SubjectName = string;

// Subject type styling configurations
export const SUBJECT_TYPE_CONFIG: Record<
  SubjectType,
  { label: string; badgeClass: string; color: string; bg: string; icon: string }
> = {
  Intrakurikuler: {
    label: 'Intrakurikuler',
    badgeClass: 'badge-intra',
    color: '#818cf8',
    bg: 'rgba(99, 102, 241, 0.12)',
    icon: '📚',
  },
  Kokurikuler: {
    label: 'Kokurikuler',
    badgeClass: 'badge-koku',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
    icon: '🔭',
  },
  Ekstrakurikuler: {
    label: 'Ekstrakurikuler',
    badgeClass: 'badge-ekstra',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    icon: '🎨',
  },
};

// Formal Indonesian role translations (ordered highest to lowest)
export const ROLE_LABELS: Record<UserRole, string> = {
  Admin: 'Admin',
  Teacher: 'Kepala Sekolah / Guru',
  PIC: 'Ketua Kelas / Sekertaris Kelas',
};

// Formal Indonesian attendance status helpers
export interface StatusConfig {
  label: string;
  short: string;
  badgeClass: string;
  color: string;
  bgLight: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  Hadir: {
    label: 'Hadir',
    short: 'H',
    badgeClass: 'badge-present',
    color: 'var(--success)',
    bgLight: 'rgba(16, 185, 129, 0.12)',
  },
  Present: {
    label: 'Hadir',
    short: 'H',
    badgeClass: 'badge-present',
    color: 'var(--success)',
    bgLight: 'rgba(16, 185, 129, 0.12)',
  },
  Sakit: {
    label: 'Sakit',
    short: 'S',
    badgeClass: 'badge-sick',
    color: 'var(--warning)',
    bgLight: 'rgba(245, 158, 11, 0.12)',
  },
  Sick: {
    label: 'Sakit',
    short: 'S',
    badgeClass: 'badge-sick',
    color: 'var(--warning)',
    bgLight: 'rgba(245, 158, 11, 0.12)',
  },
  Izin: {
    label: 'Izin',
    short: 'I',
    badgeClass: 'badge-permitted',
    color: 'var(--info)',
    bgLight: 'rgba(59, 130, 246, 0.12)',
  },
  Permitted: {
    label: 'Izin',
    short: 'I',
    badgeClass: 'badge-permitted',
    color: 'var(--info)',
    bgLight: 'rgba(59, 130, 246, 0.12)',
  },
  Alpa: {
    label: 'Alpa',
    short: 'A',
    badgeClass: 'badge-unpermitted',
    color: 'var(--danger)',
    bgLight: 'rgba(239, 68, 68, 0.12)',
  },
  Unpermitted: {
    label: 'Alpa',
    short: 'A',
    badgeClass: 'badge-unpermitted',
    color: 'var(--danger)',
    bgLight: 'rgba(239, 68, 68, 0.12)',
  },
};

// Normalize status to standard Indonesian term ('Hadir' | 'Sakit' | 'Izin' | 'Alpa')
export function normalizeStatus(status?: string): 'Hadir' | 'Sakit' | 'Izin' | 'Alpa' {
  if (!status) return 'Hadir';
  const s = status.toString().trim().toLowerCase();

  if (s === 'sakit' || s === 'sick' || s === 's') return 'Sakit';
  if (s === 'izin' || s === 'permitted' || s === 'i') return 'Izin';
  if (s === 'alpa' || s === 'unpermitted' || s === 'a' || s === 'absent' || s === 'tidak hadir' || s === 'unattend') return 'Alpa';

  return 'Hadir';
}

// Normalize role to canonical UserRole ('Admin' | 'Teacher' | 'PIC')
export function normalizeRole(role?: string): UserRole {
  if (!role) return 'Teacher';
  const r = role.toLowerCase().trim();
  if (r.includes('admin') || r === '1') return 'Admin';
  if (
    r.includes('guru') ||
    r.includes('teacher') ||
    r.includes('kepala') ||
    r.includes('kepsek') ||
    r.includes('sekolah') ||
    r.includes('pengajar') ||
    r === '2'
  ) {
    return 'Teacher';
  }
  if (
    r.includes('pic') ||
    r.includes('ketua') ||
    r.includes('sekertaris') ||
    r.includes('sekretaris') ||
    r.includes('wali') ||
    r.includes('siswa') ||
    r === '3'
  ) {
    return 'PIC';
  }
  return 'Teacher';
}

// User interface
export interface User {
  user_id: string;
  username: string;
  password?: string;
  role: UserRole;
  assigned_class: string;
  nip?: string;
  pin?: string;
  biometric_credential_id?: string;
  biometric_public_key?: string;
}

// Student interface
export interface Student {
  student_id: string;
  full_name: string;
  class_name: string;
  is_active: string; // "TRUE" or "FALSE"
}

// Attendance record
export interface AttendanceRecord {
  timestamp: string;
  date: string;
  class_name: string;
  student_id: string;
  full_name: string;
  attendance_status: AttendanceStatus;
  note: string;
  recorded_by_username: string;
  attachment_url?: string;
}

// Google Drive folder for journal attachments
export const DEFAULT_DRIVE_FOLDER_ID = '1ynz049ZQPhM6v03LOtl6-_ZBXeUVpKYq';

// Journal entry
export interface JournalEntry {
  journal_id: string;
  timestamp: string;
  class_name: string;
  subject_name: string;
  week_number: string;
  topic: string;
  teacher_username: string;
  photo_url?: string;
}

// Session payload (JWT)
export interface SessionPayload {
  user_id: string;
  username: string;
  role: UserRole;
  assigned_class: string;
}

