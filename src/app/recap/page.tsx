'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { ToastProvider, useToast } from '@/components/Toast';
import { PageLoader, Spinner } from '@/components/Spinner';
import {
  PrinterIcon,
  FilterIcon,
  CalendarIcon,
  BookOpenIcon,
  UserIcon,
  GraduationCapIcon,
  FileTextIcon,
  SyncIcon,
} from '@/components/Icons';
import { SessionPayload, normalizeRole } from '@/lib/constants';

interface AttendanceRow {
  no: number;
  student_id: string;
  full_name: string;
  class_name: string;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  totalAbsent: number;
  totalDays: number;
  percentage: string;
}

interface JournalRow {
  journal_id: string;
  timestamp: string;
  class_name: string;
  subject_name: string;
  week_number: string;
  topic: string;
  teacher_username: string;
  photo_url?: string;
}

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function RecapContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingData, setFetchingData] = useState(false);

  // Tab: 'attendance' | 'journal-teacher' | 'journal-all'
  const [activeTab, setActiveTab] = useState<'attendance' | 'journal-teacher' | 'journal-all'>('attendance');

  // Filter Presets: 'this-month' | 'specific-month' | 'semester-ganjil' | 'semester-genap' | 'custom'
  const [periodPreset, setPeriodPreset] = useState<string>('this-month');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-11
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Class & Teacher Filters
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('ALL');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');

  // Metadata Lists
  const [classList, setClassList] = useState<string[]>([]);
  const [teacherList, setTeacherList] = useState<string[]>([]);
  const [subjectList, setSubjectList] = useState<{ name: string; type: string }[]>([]);

  // Report Data
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRow[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any>(null);
  const [journalRecords, setJournalRecords] = useState<JournalRow[]>([]);

  // Sort & Filter state for displayed records (Accessible to all roles)
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceSortBy, setAttendanceSortBy] = useState<'name_asc' | 'name_desc' | 'alpa_desc' | 'sakit_desc' | 'izin_desc' | 'rate_desc' | 'rate_asc'>('name_asc');
  const [journalSearch, setJournalSearch] = useState('');
  const [journalSortBy, setJournalSortBy] = useState<'date_asc' | 'date_desc' | 'week_asc' | 'week_desc' | 'teacher_asc' | 'subject_asc'>('date_asc');
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; title: string } | null>(null);

  const displayedAttendanceRecords = useMemo(() => {
    let result = attendanceRecords.filter((r) => {
      if (!attendanceSearch) return true;
      return r.full_name.toLowerCase().includes(attendanceSearch.toLowerCase());
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (attendanceSortBy === 'name_asc') return a.full_name.localeCompare(b.full_name);
      if (attendanceSortBy === 'name_desc') return b.full_name.localeCompare(a.full_name);
      if (attendanceSortBy === 'alpa_desc') return (b.alpa || 0) - (a.alpa || 0);
      if (attendanceSortBy === 'sakit_desc') return (b.sakit || 0) - (a.sakit || 0);
      if (attendanceSortBy === 'izin_desc') return (b.izin || 0) - (a.izin || 0);
      if (attendanceSortBy === 'rate_desc') return (Number(b.percentage) || 0) - (Number(a.percentage) || 0);
      if (attendanceSortBy === 'rate_asc') return (Number(a.percentage) || 0) - (Number(b.percentage) || 0);
      return 0;
    });

    return sorted.map((item, idx) => ({ ...item, no: idx + 1 }));
  }, [attendanceRecords, attendanceSearch, attendanceSortBy]);

  const displayedJournalRecords = useMemo(() => {
    let result = journalRecords.filter((r) => {
      if (!journalSearch) return true;
      const q = journalSearch.toLowerCase();
      return (
        (r.topic && r.topic.toLowerCase().includes(q)) ||
        (r.teacher_username && r.teacher_username.toLowerCase().includes(q)) ||
        (r.subject_name && r.subject_name.toLowerCase().includes(q)) ||
        (r.week_number && String(r.week_number).includes(q))
      );
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (journalSortBy === 'date_asc') return (a.timestamp || '').localeCompare(b.timestamp || '');
      if (journalSortBy === 'date_desc') return (b.timestamp || '').localeCompare(a.timestamp || '');
      if (journalSortBy === 'week_asc') return (Number(a.week_number) || 0) - (Number(b.week_number) || 0);
      if (journalSortBy === 'week_desc') return (Number(b.week_number) || 0) - (Number(a.week_number) || 0);
      if (journalSortBy === 'teacher_asc') return (a.teacher_username || '').localeCompare(b.teacher_username || '');
      if (journalSortBy === 'subject_asc') return (a.subject_name || '').localeCompare(b.subject_name || '');
      return 0;
    });

    return sorted;
  }, [journalRecords, journalSearch, journalSortBy]);

  // Calculate actual [startDate, endDate] based on periodPreset
  const { effectiveStartDate, effectiveEndDate, periodLabel } = useMemo(() => {
    const year = selectedYear;

    if (periodPreset === 'this-month') {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDayNum = new Date(y, m + 1, 0).getDate();
      const lastDay = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      return {
        effectiveStartDate: firstDay,
        effectiveEndDate: lastDay,
        periodLabel: `Bulan ${MONTH_NAMES[m]} ${y}`,
      };
    }

    if (periodPreset === 'specific-month') {
      const m = selectedMonth;
      const firstDay = `${year}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDayNum = new Date(year, m + 1, 0).getDate();
      const lastDay = `${year}-${String(m + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      return {
        effectiveStartDate: firstDay,
        effectiveEndDate: lastDay,
        periodLabel: `Bulan ${MONTH_NAMES[m]} ${year}`,
      };
    }

    if (periodPreset === 'semester-ganjil') {
      return {
        effectiveStartDate: `${year}-07-01`,
        effectiveEndDate: `${year}-12-31`,
        periodLabel: `Semester Ganjil T.A. ${year}/${year + 1} (Juli - Desember ${year})`,
      };
    }

    if (periodPreset === 'semester-genap') {
      return {
        effectiveStartDate: `${year}-01-01`,
        effectiveEndDate: `${year}-06-30`,
        periodLabel: `Semester Genap T.A. ${year - 1}/${year} (Januari - Juni ${year})`,
      };
    }

    // Custom
    const label = customStartDate && customEndDate
      ? `${customStartDate} s/d ${customEndDate}`
      : 'Semua Periode';
    return {
      effectiveStartDate: customStartDate,
      effectiveEndDate: customEndDate,
      periodLabel: label,
    };
  }, [periodPreset, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // Initial Auth & Session Check
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          router.push('/');
          return;
        }
        const currentRole = normalizeRole(data.user.role);
        const userData = { ...data.user, role: currentRole };
        setUser(userData);
        if (currentRole !== 'Admin' && data.user.assigned_class && data.user.assigned_class.toUpperCase() !== 'ALL') {
          setSelectedClass(data.user.assigned_class);
        }
        if (currentRole === 'Teacher') {
          setSelectedTeacher(data.user.username);
        }
        setLoading(false);
      })
      .catch(() => {
        router.push('/');
      });
  }, [router]);

  // Fetch Report Data
  const loadReportData = async () => {
    setFetchingData(true);
    try {
      const typeParam = activeTab === 'attendance' ? 'attendance' : 'journal';
      const params = new URLSearchParams();
      params.set('type', typeParam);
      if (effectiveStartDate) params.set('start_date', effectiveStartDate);
      if (effectiveEndDate) params.set('end_date', effectiveEndDate);
      if (selectedClass && selectedClass !== 'ALL') params.set('class_name', selectedClass);

      if (activeTab === 'journal-teacher' && selectedTeacher && selectedTeacher !== 'ALL') {
        params.set('teacher', selectedTeacher);
      }
      if (activeTab === 'journal-teacher' && selectedSubject && selectedSubject !== 'ALL') {
        params.set('subject', selectedSubject);
      }

      const res = await fetch(`/api/reports?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Gagal memuat rekapitulasi data.', 'error');
        return;
      }

      if (data.metadata) {
        if (data.metadata.classList) setClassList(data.metadata.classList);
        if (data.metadata.teacherList) setTeacherList(data.metadata.teacherList);
        if (data.metadata.subjectList) setSubjectList(data.metadata.subjectList);
      }

      if (typeParam === 'attendance') {
        setAttendanceRecords(data.records || []);
        setAttendanceSummary(data.summary || null);
      } else {
        setJournalRecords(data.records || []);
      }
    } catch {
      showToast('Kendala jaringan saat mengambil data rekap.', 'error');
    } finally {
      setFetchingData(false);
    }
  };

  useEffect(() => {
    if (!loading && user) {
      loadReportData();
    }
  }, [loading, activeTab, effectiveStartDate, effectiveEndDate, selectedClass, selectedTeacher, selectedSubject]);

  // 5-minute auto sync
  useEffect(() => {
    const timer = setInterval(() => {
      if (!loading && user) loadReportData();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loading, user]);

  const handlePrint = () => {
    window.print();
  };

  const currentDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <PageLoader text="Memuat modul rekapitulasi..." />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <div className="no-print">
        <Navbar user={user} />
      </div>

      <main className="container-app page-enter" style={{ paddingTop: '20px', paddingBottom: '50px' }}>
        {/* =========================================================================
            HEADER & CONTROLS (Screen Only - Hidden in Print)
           ========================================================================= */}
        <div className="no-print">
          {/* Breadcrumb & Navigation */}
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={() => router.push('/dashboard')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: 0,
              }}
            >
              <span>←</span> Kembali ke Dasbor
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 800, color: '#1e3863', letterSpacing: '-0.02em', marginBottom: '2px' }}>
                  Rekapitulasi &amp; Cetak Laporan PDF
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Ringkasan presensi siswa dan jurnal pembelajaran bulanan / semester siap cetak
                </p>
              </div>

              {/* Action Buttons: Sync & Print */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    loadReportData();
                    showToast('Sinkronisasi data rekap berhasil diperbarui!', 'success');
                  }}
                  disabled={fetchingData}
                  className="btn btn-secondary btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                  }}
                  title="Sinkronkan data dari Google Sheets (Otomatis setiap 5 menit)"
                >
                  <SyncIcon size={14} className={fetchingData ? 'animate-spin' : ''} />
                  <span>{fetchingData ? 'Menyinkronkan...' : 'Sinkron Data'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="btn btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 18px',
                    boxShadow: '0 4px 12px rgba(30, 56, 99, 0.25)',
                  }}
                >
                  <PrinterIcon size={16} />
                  <span>Cetak / Unduh PDF</span>
                </button>
              </div>
            </div>
          </div>

          {/* Template Selection Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              marginBottom: '18px',
              background: '#ffffff',
              border: '1px solid #e4e6eb',
              borderRadius: '10px',
              padding: '3px',
              flexWrap: 'wrap',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            }}
          >
            <button
              onClick={() => setActiveTab('attendance')}
              style={{
                flex: 1,
                minWidth: '150px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                fontFamily: 'inherit',
                transition: 'all var(--transition)',
                background: activeTab === 'attendance' ? '#1e3863' : 'transparent',
                color: activeTab === 'attendance' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: activeTab === 'attendance' ? '0 2px 6px rgba(30, 56, 99, 0.3)' : 'none',
              }}
            >
              🎓 1. Rekap Presensi Siswa
            </button>

            <button
              onClick={() => setActiveTab('journal-teacher')}
              style={{
                flex: 1,
                minWidth: '150px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                fontFamily: 'inherit',
                transition: 'all var(--transition)',
                background: activeTab === 'journal-teacher' ? '#1e3863' : 'transparent',
                color: activeTab === 'journal-teacher' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: activeTab === 'journal-teacher' ? '0 2px 6px rgba(30, 56, 99, 0.3)' : 'none',
              }}
            >
              📖 2. Jurnal Per Guru &amp; Mapel
            </button>

            <button
              onClick={() => setActiveTab('journal-all')}
              style={{
                flex: 1,
                minWidth: '150px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                fontFamily: 'inherit',
                transition: 'all var(--transition)',
                background: activeTab === 'journal-all' ? '#1e3863' : 'transparent',
                color: activeTab === 'journal-all' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: activeTab === 'journal-all' ? '0 2px 6px rgba(30, 56, 99, 0.3)' : 'none',
              }}
            >
              📚 3. Jurnal Seluruh Guru
            </button>
          </div>

          {/* Filter Bar Controls */}
          <div
            className="glass-card"
            style={{
              padding: '16px 18px',
              marginBottom: '20px',
              background: '#ffffff',
              border: '1px solid #e4e6eb',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <FilterIcon size={16} color="#1e3863" />
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Filter Periode &amp; Parameter Laporan
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                alignItems: 'flex-end',
              }}
            >
              {/* Preset Periode */}
              <div>
                <label className="input-label" style={{ fontSize: '11.5px' }}>
                  Pilihan Waktu / Periode
                </label>
                <select
                  className="input-field"
                  value={periodPreset}
                  onChange={(e) => setPeriodPreset(e.target.value)}
                  style={{ padding: '7px 10px', fontSize: '12.5px' }}
                >
                  <option value="this-month">📅 Bulan Ini</option>
                  <option value="specific-month">📆 Pilih Bulan Tertentu</option>
                  <option value="semester-ganjil">🍂 Semester Ganjil (Juli - Des)</option>
                  <option value="semester-genap">🌱 Semester Genap (Jan - Jun)</option>
                  <option value="custom">⚙️ Rentang Tanggal Kustom</option>
                </select>
              </div>

              {/* Specific Month Pickers */}
              {periodPreset === 'specific-month' && (
                <>
                  <div>
                    <label className="input-label" style={{ fontSize: '11.5px' }}>Bulan</label>
                    <select
                      className="input-field"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx} value={idx}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="input-label" style={{ fontSize: '11.5px' }}>Tahun</label>
                    <input
                      type="number"
                      className="input-field"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>
                </>
              )}

              {/* Semester Year Picker */}
              {(periodPreset === 'semester-ganjil' || periodPreset === 'semester-genap') && (
                <div>
                  <label className="input-label" style={{ fontSize: '11.5px' }}>Tahun</label>
                  <input
                    type="number"
                    className="input-field"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    style={{ padding: '7px 10px', fontSize: '12.5px' }}
                  />
                </div>
              )}

              {/* Custom Date Pickers */}
              {periodPreset === 'custom' && (
                <>
                  <div>
                    <label className="input-label" style={{ fontSize: '11.5px' }}>Tanggal Mulai</label>
                    <input
                      type="date"
                      className="input-field"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <label className="input-label" style={{ fontSize: '11.5px' }}>Tanggal Akhir</label>
                    <input
                      type="date"
                      className="input-field"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    />
                  </div>
                </>
              )}

              {/* Filter Rombel / Kelas */}
              <div>
                <label className="input-label" style={{ fontSize: '11.5px' }}>
                  Rombel / Kelas
                </label>
                <select
                  className="input-field"
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  disabled={Boolean(user.role !== 'Admin' && user.assigned_class && user.assigned_class.toUpperCase() !== 'ALL')}
                  style={{ padding: '7px 10px', fontSize: '12.5px' }}
                >
                  <option value="ALL">Semua Kelas</option>
                  {classList.map((cls) => (
                    <option key={cls} value={cls}>
                      Kelas {cls}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Guru (Only for tab 2) */}
              {activeTab === 'journal-teacher' && (
                <>
                  <div>
                    <label className="input-label" style={{ fontSize: '11.5px' }}>
                      Guru Pengajar
                    </label>
                    <select
                      className="input-field"
                      value={selectedTeacher}
                      onChange={(e) => setSelectedTeacher(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    >
                      <option value="ALL">Semua Guru</option>
                      {teacherList.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="input-label" style={{ fontSize: '11.5px' }}>
                      Mata Pelajaran
                    </label>
                    <select
                      className="input-field"
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                      style={{ padding: '7px 10px', fontSize: '12.5px' }}
                    >
                      <option value="ALL">Semua Mapel</option>
                      {subjectList.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {/* Quick Table Sort / Search Controls for active template */}
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  paddingTop: '10px',
                  borderTop: '1px solid #f0f2f5',
                  flexWrap: 'wrap',
                }}
              >
                {activeTab === 'attendance' ? (
                  <>
                    <input
                      className="input-field"
                      placeholder="🔍 Cari nama siswa dalam tabel..."
                      value={attendanceSearch}
                      onChange={(e) => setAttendanceSearch(e.target.value)}
                      style={{ maxWidth: '240px', fontSize: '12.5px', padding: '6px 12px' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Urutkan:
                      </span>
                      <select
                        className="input-field"
                        value={attendanceSortBy}
                        onChange={(e) => setAttendanceSortBy(e.target.value as any)}
                        style={{ width: 'auto', fontSize: '12.5px', padding: '6px 10px' }}
                      >
                        <option value="name_asc">Nama Siswa (A - Z)</option>
                        <option value="name_desc">Nama Siswa (Z - A)</option>
                        <option value="alpa_desc">Alpa Terbanyak</option>
                        <option value="sakit_desc">Sakit Terbanyak</option>
                        <option value="izin_desc">Izin Terbanyak</option>
                        <option value="rate_desc">% Kehadiran Tertinggi</option>
                        <option value="rate_asc">% Kehadiran Terendah</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      className="input-field"
                      placeholder="🔍 Cari uraian materi / guru / mapel..."
                      value={journalSearch}
                      onChange={(e) => setJournalSearch(e.target.value)}
                      style={{ maxWidth: '260px', fontSize: '12.5px', padding: '6px 12px' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Urutkan:
                      </span>
                      <select
                        className="input-field"
                        value={journalSortBy}
                        onChange={(e) => setJournalSortBy(e.target.value as any)}
                        style={{ width: 'auto', fontSize: '12.5px', padding: '6px 10px' }}
                      >
                        <option value="date_asc">Tanggal (Terlama → Terbaru)</option>
                        <option value="date_desc">Tanggal (Terbaru → Terlama)</option>
                        <option value="week_asc">Minggu (1 → 52)</option>
                        <option value="week_desc">Minggu (52 → 1)</option>
                        <option value="teacher_asc">Nama Guru (A - Z)</option>
                        <option value="subject_asc">Mata Pelajaran (A - Z)</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            REPORT DOCUMENT CONTAINER (Screen Preview & Clean Printable A4 Sheet)
            Optimized for INK / TONER SAVER:
            - Pure white background
            - Thin crisp black/grey borders
            - No dark fills or heavy toner blocks
           ========================================================================= */}
        <div id="printable-report" className="report-paper">
          {/* OFFICIAL SCHOOL LETTERHEAD (KOP SURAT RESMI) */}
          <div className="kop-surat">
            <img
              src="/logo-snt.png"
              alt="Logo SNT Kemendikdasmen"
              className="kop-logo"
            />
            <div className="kop-text">
              <div className="kop-ministry">KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH</div>
              <div className="kop-school">SEKOLAH NEGERI TERINTEGRASI 10 KUPANG</div>
              <div className="kop-address">
                Jl. Pendidikan No. 10, Kota Kupang, Nusa Tenggara Timur &bull; Pos: 85000
              </div>
              <div className="kop-contact">Laman Resmi: snt.kemendikdasmen.go.id</div>
            </div>
          </div>
          <div className="kop-line-double" />

          {/* REPORT TITLE & METADATA SECTION */}
          <div style={{ textAlign: 'center', marginTop: '14px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0, color: '#000000' }}>
              {activeTab === 'attendance' && 'LAPORAN REKAPITULASI PRESENSI SISWA'}
              {activeTab === 'journal-teacher' && 'LAPORAN REKAPITULASI JURNAL AGENDA MENGAJAR GURU'}
              {activeTab === 'journal-all' && 'LAPORAN REKAPITULASI JURNAL PEMBELAJARAN KELAS'}
            </h2>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#333333', marginTop: '3px' }}>
              Periode: {periodLabel}
            </div>
          </div>

          {/* META SUB-INFO (Class, Teacher, Subject) */}
          <div className="report-meta-box">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                <tr>
                  <td style={{ width: '130px', padding: '2px 0', fontWeight: 700, color: '#000000' }}>Rombongan Belajar</td>
                  <td style={{ width: '10px', padding: '2px 0' }}>:</td>
                  <td style={{ padding: '2px 0', color: '#000000' }}>
                    {selectedClass === 'ALL' ? 'Seluruh Rombongan Belajar (Semua Kelas)' : `Kelas ${selectedClass}`}
                  </td>
                </tr>
                {activeTab === 'journal-teacher' && (
                  <>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 700, color: '#000000' }}>Guru Pengajar</td>
                      <td style={{ padding: '2px 0' }}>:</td>
                      <td style={{ padding: '2px 0', color: '#000000' }}>
                        {selectedTeacher === 'ALL' ? 'Semua Guru' : selectedTeacher}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 0', fontWeight: 700, color: '#000000' }}>Mata Pelajaran</td>
                      <td style={{ padding: '2px 0' }}>:</td>
                      <td style={{ padding: '2px 0', color: '#000000' }}>
                        {selectedSubject === 'ALL' ? 'Semua Mata Pelajaran / Kegiatan' : selectedSubject}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* =====================================================================
              TEMPLATE 1: ATTENDANCE RECAP TABLE
             ===================================================================== */}
          {activeTab === 'attendance' && (
            <>
              {fetchingData ? (
                <div style={{ padding: '30px', textAlign: 'center' }}>
                  <Spinner /> Memuat data presensi...
                </div>
              ) : attendanceRecords.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#666666', fontSize: '13px' }}>
                  Tidak ada catatan presensi pada periode ini.
                </div>
              ) : (
                <table className="ink-saver-table">
                  <thead>
                    <tr>
                      <th style={{ width: '38px', textAlign: 'center' }}>No</th>
                      <th style={{ textAlign: 'left' }}>Nama Siswa</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>Kelas</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>NIS/ID</th>
                      <th style={{ width: '65px', textAlign: 'center' }}>Sakit (S)</th>
                      <th style={{ width: '65px', textAlign: 'center' }}>Izin (I)</th>
                      <th style={{ width: '65px', textAlign: 'center' }}>Alpa (A)</th>
                      <th style={{ width: '65px', textAlign: 'center' }}>Hadir (H)</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>% Hadir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAttendanceRecords.map((row) => (
                      <tr key={row.no}>
                        <td style={{ textAlign: 'center' }}>{row.no}</td>
                        <td style={{ fontWeight: 600, color: '#000000' }}>{row.full_name}</td>
                        <td style={{ textAlign: 'center', fontSize: '11px', color: '#555555' }}>
                          {row.student_id}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: row.sakit > 0 ? 700 : 400 }}>{row.sakit}</td>
                        <td style={{ textAlign: 'center', fontWeight: row.izin > 0 ? 700 : 400 }}>{row.izin}</td>
                        <td style={{ textAlign: 'center', fontWeight: row.alpa > 0 ? 700 : 400 }}>{row.alpa}</td>
                        <td style={{ textAlign: 'center' }}>{row.hadir}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                  {attendanceSummary && (
                    <tfoot>
                      <tr style={{ fontWeight: 700, background: '#fdfdfd' }}>
                        <td colSpan={3} style={{ textAlign: 'center' }}>
                          TOTAL REKAPITULASI KELAS
                        </td>
                        <td style={{ textAlign: 'center' }}>{attendanceSummary.totalSakit}</td>
                        <td style={{ textAlign: 'center' }}>{attendanceSummary.totalIzin}</td>
                        <td style={{ textAlign: 'center' }}>{attendanceSummary.totalAlpa}</td>
                        <td style={{ textAlign: 'center' }}>{attendanceSummary.totalHadir}</td>
                        <td style={{ textAlign: 'center' }}>{attendanceSummary.classAvgPercentage}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </>
          )}

          {/* =====================================================================
              TEMPLATE 2: JOURNAL PER TEACHER TABLE
             ===================================================================== */}
          {activeTab === 'journal-teacher' && (
            <>
              {fetchingData ? (
                <div style={{ padding: '30px', textAlign: 'center' }}>
                  <Spinner /> Memuat catatan jurnal mengajar...
                </div>
              ) : journalRecords.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#666666', fontSize: '13px' }}>
                  Tidak ada agenda mengajar yang tercatat pada periode ini.
                </div>
              ) : (
                <table className="ink-saver-table">
                  <thead>
                    <tr>
                      <th style={{ width: '38px', textAlign: 'center' }}>No</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Minggu Ke-</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Tanggal</th>
                      <th style={{ textAlign: 'left' }}>Uraian Materi Pembelajaran (Details)</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Dokumentasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedJournalRecords.map((j, idx) => {
                      const cleanDate = j.timestamp ? j.timestamp.slice(0, 10) : '-';
                      return (
                        <tr key={j.journal_id || idx}>
                          <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            Minggu {j.week_number}
                          </td>
                          <td style={{ textAlign: 'center' }}>{cleanDate}</td>
                          <td style={{ lineHeight: 1.4 }}>
                            <div style={{ fontWeight: 600 }}>{j.topic}</div>
                            <div style={{ fontSize: '11px', color: '#666666', marginTop: '2px' }}>
                              Kelas {j.class_name} &bull; Diinput oleh: {j.teacher_username}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            {j.photo_url ? (
                              <div
                                style={{ cursor: 'pointer', display: 'inline-block' }}
                                onClick={() =>
                                  setLightboxPhoto({
                                    url: j.photo_url!,
                                    title: `Dokumentasi: ${j.subject_name} (Minggu ${j.week_number})`,
                                  })
                                }
                                title="Klik untuk melihat foto ukuran penuh"
                              >
                                <img
                                  src={j.photo_url}
                                  alt="Dokumentasi"
                                  className="report-photo-thumb"
                                  onError={(e) => {
                                    if (j.photo_url?.includes('/d/')) {
                                      const id = j.photo_url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
                                      if (id) (e.currentTarget as HTMLImageElement).src = `/api/drive-image?id=${id}`;
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <span style={{ color: '#999999', fontSize: '11px' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* =====================================================================
              TEMPLATE 3: JOURNAL ALL TEACHERS (PER MONTH / SEMESTER)
             ===================================================================== */}
          {activeTab === 'journal-all' && (
            <>
              {fetchingData ? (
                <div style={{ padding: '30px', textAlign: 'center' }}>
                  <Spinner /> Memuat catatan jurnal seluruh guru...
                </div>
              ) : journalRecords.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#666666', fontSize: '13px' }}>
                  Tidak ada agenda pembelajaran yang tercatat pada periode ini.
                </div>
              ) : (
                <table className="ink-saver-table">
                  <thead>
                    <tr>
                      <th style={{ width: '38px', textAlign: 'center' }}>No</th>
                      <th style={{ width: '120px', textAlign: 'left' }}>Nama Guru</th>
                      <th style={{ width: '110px', textAlign: 'left' }}>Mata Pelajaran</th>
                      <th style={{ width: '75px', textAlign: 'center' }}>Minggu</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Tanggal</th>
                      <th style={{ textAlign: 'left' }}>Topik Pembelajaran (Details)</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Dokumentasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedJournalRecords.map((j, idx) => {
                      const cleanDate = j.timestamp ? j.timestamp.slice(0, 10) : '-';
                      return (
                        <tr key={j.journal_id || idx}>
                          <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{j.teacher_username}</td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{j.subject_name}</span>
                            <span style={{ fontSize: '11px', color: '#666666', marginLeft: '6px' }}>
                              (Kelas {j.class_name})
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            Minggu {j.week_number}
                          </td>
                          <td style={{ textAlign: 'center' }}>{cleanDate}</td>
                          <td style={{ lineHeight: 1.4 }}>{j.topic}</td>
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            {j.photo_url ? (
                              <div
                                style={{ cursor: 'pointer', display: 'inline-block' }}
                                onClick={() =>
                                  setLightboxPhoto({
                                    url: j.photo_url!,
                                    title: `Dokumentasi: ${j.subject_name} - ${j.teacher_username} (Minggu ${j.week_number})`,
                                  })
                                }
                                title="Klik untuk melihat foto ukuran penuh"
                              >
                                <img
                                  src={j.photo_url}
                                  alt="Dokumentasi"
                                  className="report-photo-thumb"
                                  onError={(e) => {
                                    if (j.photo_url?.includes('/d/')) {
                                      const id = j.photo_url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
                                      if (id) (e.currentTarget as HTMLImageElement).src = `/api/drive-image?id=${id}`;
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <span style={{ color: '#999999', fontSize: '11px' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* =====================================================================
              OFFICIAL SIGNATURE BLOCK (LEMBAR PENGESAHAN)
             ===================================================================== */}
          <div className="signature-section">
            <div className="signature-box">
              <div>Mengetahui,</div>
              <div style={{ fontWeight: 700 }}>Kepala Sekolah SNT 10 Kupang</div>
              <div className="signature-space" />
              <div style={{ fontWeight: 700, textDecoration: 'underline' }}>
                ( .................................................... )
              </div>
              <div style={{ fontSize: '11px', color: '#333333' }}>NIP. .........................................</div>
            </div>

            <div className="signature-box">
              <div>Kupang, {currentDateFormatted}</div>
              <div style={{ fontWeight: 700 }}>
                {activeTab === 'attendance' && (selectedClass === 'ALL' ? 'Koordinator Presensi / Kesiswaan' : `Wali Kelas ${selectedClass}`)}
                {activeTab === 'journal-teacher' && 'Guru Mata Pelajaran Bersangkutan'}
                {activeTab === 'journal-all' && 'Koordinator Kurikulum / Tim Akademik'}
              </div>
              <div className="signature-space" />
              <div style={{ fontWeight: 700, textDecoration: 'underline' }}>
                {activeTab === 'journal-teacher' && selectedTeacher !== 'ALL'
                  ? `( ${selectedTeacher} )`
                  : '( .................................................... )'}
              </div>
              <div style={{ fontSize: '11px', color: '#333333' }}>NIP. .........................................</div>
            </div>
          </div>
        </div>
      </main>

      {/* =========================================================================
          PRINT & INK-SAVER STYLESHEET
         ========================================================================= */}
      <style jsx global>{`
        /* Screen view for paper preview */
        .report-paper {
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 28px 32px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
          margin: 0 auto;
          max-width: 900px;
          color: #000000;
        }

        .kop-surat {
          display: flex;
          align-items: center;
          gap: 16px;
          padding-bottom: 8px;
        }

        .kop-logo {
          height: 68px;
          width: auto;
          object-fit: contain;
          flex-shrink: 0;
        }

        .kop-text {
          flex: 1;
          text-align: center;
        }

        .kop-ministry {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #000000;
        }

        .kop-school {
          font-size: 15px;
          font-weight: 900;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          color: #000000;
          margin: 2px 0;
        }

        .kop-address {
          font-size: 10.5px;
          color: #333333;
        }

        .kop-contact {
          font-size: 10px;
          color: #555555;
          margin-top: 1px;
        }

        .kop-line-double {
          height: 3px;
          border-top: 2px solid #000000;
          border-bottom: 1px solid #000000;
          margin-bottom: 12px;
        }

        .report-meta-box {
          margin-bottom: 14px;
          padding-bottom: 8px;
          border-bottom: 1px dashed #cccccc;
        }

        /* Ink-saver table: clean thin lines, pure white backgrounds, no toner waste */
        .ink-saver-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
          margin-bottom: 20px;
          color: #000000;
        }

        .ink-saver-table th,
        .ink-saver-table td {
          border: 1px solid #333333;
          padding: 6px 8px;
          background: #ffffff;
        }

        .ink-saver-table th {
          font-weight: 700;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.02em;
          background: #fafafa;
        }

        .report-photo-thumb {
          max-height: 50px;
          max-width: 75px;
          width: auto;
          height: auto;
          object-fit: cover;
          border-radius: 4px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          display: block;
          margin: 0 auto;
          transition: transform 0.15s ease;
        }

        .report-photo-thumb:hover {
          transform: scale(1.05);
        }

        .signature-section {
          margin-top: 36px;
          display: flex;
          justifyContent: space-between;
          font-size: 12px;
          color: #000000;
          page-break-inside: avoid;
        }

        .signature-box {
          text-align: center;
          min-width: 220px;
        }

        .signature-space {
          height: 65px;
        }

        /* PRINT MEDIA QUERIES (@media print) */
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .report-paper {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }

          @page {
            size: A4 portrait;
            margin: 15mm 15mm 15mm 15mm;
          }

          .ink-saver-table th {
            background: transparent !important;
            -webkit-print-color-adjust: exact;
          }

          .ink-saver-table tr {
            page-break-inside: avoid;
          }

          .report-photo-thumb {
            max-height: 46px !important;
            max-width: 70px !important;
            border: 1px solid #333333 !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Lightbox Photo Preview Modal */}
      {lightboxPhoto && (
        <div
          className="modal-overlay no-print"
          onClick={() => setLightboxPhoto(null)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="modal-card page-enter"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '720px',
              width: '90%',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                {lightboxPhoto.title}
              </h3>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                maxHeight: '70vh',
                overflow: 'auto',
                borderRadius: '8px',
                background: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
              }}
            >
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '68vh',
                  objectFit: 'contain',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <a
                href={lightboxPhoto.url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '12px' }}
              >
                Buka Gambar di Tab Baru ↗
              </a>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="btn btn-primary btn-sm"
                style={{ fontSize: '12px' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function RecapPage() {
  return (
    <ToastProvider>
      <RecapContent />
    </ToastProvider>
  );
}
