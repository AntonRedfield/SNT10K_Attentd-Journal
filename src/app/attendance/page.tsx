'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { ToastProvider, useToast } from '@/components/Toast';
import { PageLoader, Spinner } from '@/components/Spinner';
import { SyncIcon } from '@/components/Icons';
import EvidenceCaptureModal from '@/components/EvidenceCaptureModal';
import { SessionPayload, Student, ATTENDANCE_STATUSES, STATUS_CONFIG, normalizeStatus, normalizeRole } from '@/lib/constants';

interface StudentAttendance {
  student_id: string;
  full_name: string;
  isAbsent: boolean; // toggle checked = tidak hadir
  status: 'Sakit' | 'Izin' | 'Alpa';
  note: string;
  attachmentFile?: File | null;
  attachmentPreview?: string | null;
  attachmentUrl?: string | null;
}

function AttendanceContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string>('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  });
  const [submitted, setSubmitted] = useState(false);

  // Evidence modal & Lightbox state
  const [activeModalStudent, setActiveModalStudent] = useState<StudentAttendance | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; title: string } | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HADIR' | 'ABSENT' | 'Sakit' | 'Izin' | 'Alpa'>('ALL');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'absent_first' | 'present_first'>('name_asc');

  // Filter & Sort students based on search query, status filter, and sort order
  const displayedStudents = useMemo(() => {
    let result = students.filter((s) =>
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (statusFilter === 'HADIR') {
      result = result.filter((s) => !s.isAbsent);
    } else if (statusFilter === 'ABSENT') {
      result = result.filter((s) => s.isAbsent);
    } else if (statusFilter === 'Sakit' || statusFilter === 'Izin' || statusFilter === 'Alpa') {
      result = result.filter((s) => s.isAbsent && s.status === statusFilter);
    }

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'name_desc') {
        return b.full_name.localeCompare(a.full_name, undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'absent_first') {
        if (a.isAbsent === b.isAbsent) return a.full_name.localeCompare(b.full_name);
        return a.isAbsent ? -1 : 1;
      }
      if (sortBy === 'present_first') {
        if (a.isAbsent === b.isAbsent) return a.full_name.localeCompare(b.full_name);
        return !a.isAbsent ? -1 : 1;
      }
      return 0;
    });

    return sorted;
  }, [students, searchQuery, statusFilter, sortBy]);

  // Fetch student list for the active class
  const fetchStudents = useCallback(async (targetClass: string) => {
    if (!targetClass) return;
    setLoading(true);
    setSubmitted(false);

    try {
      const res = await fetch(`/api/students?class_name=${encodeURIComponent(targetClass)}`);
      const data = await res.json();

      if (data.students) {
        setStudents(
          data.students.map((s: Student) => ({
            student_id: s.student_id,
            full_name: s.full_name,
            isAbsent: false,
            status: 'Sakit',
            note: '',
            attachmentFile: null,
            attachmentPreview: null,
            attachmentUrl: null,
          }))
        );
      }
    } catch {
      showToast('Gagal memuat data siswa kelas', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Sync classes from Students sheet
  const syncClasses = useCallback(async (currentUser: SessionPayload | null, isManual = false) => {
    if (isManual) setSyncing(true);
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      const classes: string[] = data.classes || [];
      setAvailableClasses(classes);

      // Determine active class
      if (currentUser) {
        if (currentUser.assigned_class && currentUser.assigned_class.toUpperCase() !== 'ALL') {
          setSelectedClass(currentUser.assigned_class);
        } else {
          setSelectedClass((prev) => (prev && classes.includes(prev) ? prev : classes[0] || ''));
        }
      }

      if (isManual) {
        showToast('Sinkronisasi data kelas & siswa berhasil!', 'success');
      }
    } catch {
      if (isManual) showToast('Gagal melakukan sinkronisasi kelas', 'error');
    } finally {
      if (isManual) setSyncing(false);
    }
  }, [showToast]);

  // Fetch session & initial class sync
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          const currentRole = normalizeRole(data.user.role);
          const u = { ...data.user, role: currentRole };
          setUser(u);
          syncClasses(u, false);
        } else {
          router.push('/');
        }
      })
      .catch(() => router.push('/'));
  }, [router, syncClasses]);

  // 5-minute background auto-sync interval
  useEffect(() => {
    const timer = setInterval(() => {
      syncClasses(user, false);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user, syncClasses]);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents(selectedClass);
    }
  }, [selectedClass, fetchStudents]);

  const toggleAbsent = (studentId: string) => {
    setStudents((prev) =>
      prev.map((s) => (s.student_id === studentId ? { ...s, isAbsent: !s.isAbsent } : s))
    );
  };

  const updateStatus = (studentId: string, status: 'Sakit' | 'Izin' | 'Alpa') => {
    setStudents((prev) =>
      prev.map((s) => (s.student_id === studentId ? { ...s, status } : s))
    );
  };

  const updateNote = (studentId: string, note: string) => {
    setStudents((prev) =>
      prev.map((s) => (s.student_id === studentId ? { ...s, note } : s))
    );
  };

  const updateEvidence = (
    studentId: string,
    data: { file: File | null; previewUrl: string | null; note: string }
  ) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.student_id !== studentId) return s;
        return {
          ...s,
          attachmentFile: data.file,
          attachmentPreview: data.previewUrl,
          attachmentUrl: data.file ? null : data.previewUrl,
          note: data.note,
        };
      })
    );
    showToast('Lampiran bukti berhasil diperbarui', 'info');
  };

  const removeEvidence = (studentId: string) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.student_id !== studentId) return s;
        if (s.attachmentPreview && s.attachmentPreview.startsWith('blob:')) {
          URL.revokeObjectURL(s.attachmentPreview);
        }
        return {
          ...s,
          attachmentFile: null,
          attachmentPreview: null,
          attachmentUrl: null,
        };
      })
    );
    showToast('Foto bukti dihapus', 'info');
  };

  const markAllPresent = () => {
    setStudents((prev) =>
      prev.map((s) => ({
        ...s,
        isAbsent: false,
        note: '',
        attachmentFile: null,
        attachmentPreview: null,
        attachmentUrl: null,
      }))
    );
    showToast('Seluruh siswa ditandai Hadir', 'info');
  };

  const handleSubmit = async () => {
    if (!user || students.length === 0) return;

    setSubmitting(true);
    setSubmitProgress('Memeriksa berkas lampiran bukti...');

    try {
      // 1. Upload any pending attachment files to Google Drive
      const studentsToUpload = students.filter((s) => s.isAbsent && s.attachmentFile);
      const studentUrlMap = new Map<string, string>();

      if (studentsToUpload.length > 0) {
        for (let i = 0; i < studentsToUpload.length; i++) {
          const s = studentsToUpload[i];
          setSubmitProgress(
            `Mengunggah bukti foto (${i + 1}/${studentsToUpload.length}): ${s.full_name}...`
          );

          const formData = new FormData();
          formData.append('photo', s.attachmentFile as File);
          formData.append('student_id', s.student_id);
          formData.append('student_name', s.full_name);
          formData.append('class_name', selectedClass);
          formData.append('date', date);
          formData.append('status', s.status);

          try {
            const uploadRes = await fetch('/api/attendance/upload', {
              method: 'POST',
              body: formData,
            });
            const uploadData = await uploadRes.json();
            if (uploadData.photo_url) {
              studentUrlMap.set(s.student_id, uploadData.photo_url);
            }
          } catch (uploadErr) {
            console.error('Failed to upload evidence for student:', s.student_id, uploadErr);
          }
        }
      }

      setSubmitProgress('Menyimpan rekaman presensi ke lembar kerja...');

      // 2. Build attendance records array
      const records = students.map((s) => {
        let finalAttachmentUrl = '';
        if (s.isAbsent) {
          if (studentUrlMap.has(s.student_id)) {
            finalAttachmentUrl = studentUrlMap.get(s.student_id) || '';
          } else if (s.attachmentUrl) {
            finalAttachmentUrl = s.attachmentUrl;
          }
        }

        return {
          student_id: s.student_id,
          full_name: s.full_name,
          attendance_status: s.isAbsent ? s.status : 'Hadir',
          note: s.isAbsent ? s.note : '',
          attachment_url: finalAttachmentUrl,
        };
      });

      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          class_name: selectedClass,
          records,
        }),
      });

      const data = await res.json();

      if (data.success) {
        showToast(`Presensi kelas ${selectedClass} berhasil disimpan!`, 'success');
        setSubmitted(true);
      } else {
        showToast(data.error || 'Gagal menyimpan data presensi', 'error');
      }
    } catch {
      showToast('Terjadi kesalahan jaringan saat menyimpan presensi', 'error');
    } finally {
      setSubmitting(false);
      setSubmitProgress('');
    }
  };

  if (!user) return <PageLoader text="Memuat modul presensi siswa..." />;

  // Statistics calculation
  const totalCount = students.length;
  const sickCount = students.filter((s) => s.isAbsent && s.status === 'Sakit').length;
  const permittedCount = students.filter((s) => s.isAbsent && s.status === 'Izin').length;
  const unpermittedCount = students.filter((s) => s.isAbsent && s.status === 'Alpa').length;
  const totalAbsent = sickCount + permittedCount + unpermittedCount;
  const presentCount = totalCount - totalAbsent;

  return (
    <>
      <Navbar user={user} />

      <main className="container-app page-enter" style={{ paddingTop: '28px', paddingBottom: '48px' }}>
        {/* Navigation & Header */}
        <div style={{ marginBottom: '22px' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: 0,
            }}
          >
            <span>←</span> Kembali ke Dasbor
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '3px' }}>
                Presensi Harian Siswa
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Perekaman kehadiran peserta didik untuk kelas <strong>{selectedClass}</strong>
              </p>
            </div>

            {/* Class Selector & Sync Button (Available for all roles) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {availableClasses.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Pilih Kelas:
                  </span>
                  <select
                    className="input-field"
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    style={{ width: '150px', padding: '7px 12px', fontSize: '13px' }}
                  >
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Kelas {cls}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => syncClasses(user, true)}
                disabled={syncing}
                className="btn btn-secondary btn-sm"
                style={{
                  padding: '7px 12px',
                  fontSize: '12.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="Sinkronkan daftar kelas dan data siswa dari lembar kerja Google Sheets (Otomatis setiap 5 menit)"
              >
                <SyncIcon size={14} className={syncing ? 'animate-spin' : ''} />
                <span>{syncing ? 'Menyinkronkan...' : 'Sinkron Kelas'}</span>
              </button>

              {(user.role === 'Admin' || user.role === 'Teacher') && (
                <button
                  type="button"
                  onClick={() => router.push('/journal')}
                  className="btn btn-primary btn-sm"
                  style={{
                    padding: '7px 12px',
                    fontSize: '12.5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#0284c7',
                  }}
                  title="Buka modul Jurnal Mengajar untuk kelas ini"
                >
                  <span>📖 Jurnal Mengajar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Date and Summary Metrics Card */}
        <div
          className="glass-card"
          style={{
            padding: 'clamp(14px, 3vw, 20px) clamp(14px, 3vw, 24px)',
            marginBottom: '18px',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            {/* Date Picker */}
            <div style={{ minWidth: '200px' }}>
              <label className="input-label" htmlFor="attendance-date" style={{ marginBottom: '6px' }}>
                Tanggal Presensi
              </label>
              <input
                id="attendance-date"
                type="date"
                className="input-field"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: 'auto', minWidth: '180px', padding: '8px 12px', fontSize: '13.5px' }}
              />
            </div>

            {/* Quick Stats Counter */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                textAlign: 'center',
                flex: '1 1 300px',
                maxWidth: '400px',
              }}
            >
              {/* Total */}
              <div style={{ background: '#f0f2f5', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e4e6eb' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {totalCount}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Total
                </div>
              </div>

              {/* Hadir */}
              <div style={{ background: '#e7f8ec', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(66, 183, 42, 0.3)' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1b7a37' }}>
                  {presentCount}
                </div>
                <div style={{ fontSize: '11px', color: '#1b7a37', fontWeight: 700, textTransform: 'uppercase' }}>
                  Hadir
                </div>
              </div>

              {/* Sakit */}
              <div style={{ background: '#fef8e7', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(247, 185, 40, 0.35)' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#b45309' }}>
                  {sickCount}
                </div>
                <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, textTransform: 'uppercase' }}>
                  Sakit
                </div>
              </div>

              {/* Izin */}
              <div style={{ background: '#eef3fa', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(30, 56, 99, 0.25)' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e3863' }}>
                  {permittedCount}
                </div>
                <div style={{ fontSize: '11px', color: '#1e3863', fontWeight: 700, textTransform: 'uppercase' }}>
                  Izin
                </div>
              </div>

              {/* Alpa */}
              <div style={{ background: '#fee8e8', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(250, 56, 62, 0.3)' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#c9252d' }}>
                  {unpermittedCount}
                </div>
                <div style={{ fontSize: '11px', color: '#c9252d', fontWeight: 700, textTransform: 'uppercase' }}>
                  Alpa
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Sorting Controls Toolbar (Available for all roles) */}
        <div
          className="glass-card"
          style={{
            padding: '14px 18px',
            marginBottom: '16px',
            background: '#ffffff',
            border: '1px solid #e4e6eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 240px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input-field"
              placeholder="🔍 Cari nama siswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: '240px', fontSize: '12.5px', padding: '7px 12px' }}
            />

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Filter:</span>
              <select
                className="input-field"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{ width: 'auto', fontSize: '12.5px', padding: '7px 10px' }}
              >
                <option value="ALL">Semua ({totalCount})</option>
                <option value="HADIR">Hadir ({presentCount})</option>
                <option value="ABSENT">Tidak Hadir ({totalAbsent})</option>
                <option value="Sakit">Sakit ({sickCount})</option>
                <option value="Izin">Izin ({permittedCount})</option>
                <option value="Alpa">Alpa ({unpermittedCount})</option>
              </select>
            </div>

            {/* Sort Order */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Urutkan:</span>
              <select
                className="input-field"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ width: 'auto', fontSize: '12.5px', padding: '7px 10px' }}
              >
                <option value="name_asc">Nama (A - Z)</option>
                <option value="name_desc">Nama (Z - A)</option>
                <option value="absent_first">Tidak Hadir di Atas</option>
                <option value="present_first">Hadir di Atas</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={markAllPresent}
            className="btn btn-secondary btn-sm"
            style={{ padding: '7px 14px', fontSize: '12.5px', whiteSpace: 'nowrap' }}
          >
            ✓ Tandai Semua Hadir
          </button>
        </div>

        {/* Info Guide */}
        <div
          style={{
            padding: '11px 16px',
            borderRadius: '8px',
            background: '#eef3fa',
            border: '1px solid rgba(30, 56, 99, 0.25)',
            fontSize: '13px',
            color: '#1e3863',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>💡</span>
          <div>
            Seluruh siswa secara bawaan berstatus <strong>Hadir</strong>. Aktifkan tuas sakelar jika siswa <strong>berhalangan hadir</strong> (Sakit, Izin, atau Alpa).
          </div>
        </div>

        {/* Student List */}
        {loading ? (
          <PageLoader text="Memuat daftar siswa..." />
        ) : students.length === 0 ? (
          <div
            className="glass-card"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              background: '#ffffff',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>👥</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Tidak Ada Siswa Aktif
            </div>
            <p style={{ fontSize: '13.5px' }}>
              Belum ada data siswa aktif yang terdaftar untuk kelas {selectedClass}.
            </p>
          </div>
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden', background: '#ffffff' }}>
            {displayedStudents.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px' }}>
                Tidak ditemukan siswa yang sesuai dengan filter atau kata kunci &quot;{searchQuery}&quot;
              </div>
            ) : (
              displayedStudents.map((student: StudentAttendance, index: number) => {
                const currentStatus = student.isAbsent ? student.status : 'Hadir';
                const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.Hadir;

                return (
                  <div
                    key={student.student_id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: index < displayedStudents.length - 1 ? '1px solid var(--border)' : 'none',
                      background: student.isAbsent ? '#fff5f5' : '#ffffff',
                      transition: 'background var(--transition)',
                    }}
                  >
                    {/* Main Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '14px',
                      }}
                    >
                      {/* Avatar & Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: student.isAbsent
                              ? '#fee8e8'
                              : '#eef3fa',
                            color: student.isAbsent ? '#fa383e' : '#1e3863',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13.5px',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {index + 1}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '14.5px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {student.full_name}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            NISN: {student.student_id}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge + Toggle Switch */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                        <span className={`badge ${config.badgeClass}`}>
                          <span className="badge-dot" />
                          {config.label}
                        </span>

                        <label
                          className="toggle-switch"
                          title={student.isAbsent ? 'Tandai sebagai Hadir' : 'Tandai sebagai Tidak Hadir'}
                        >
                          <input
                            type="checkbox"
                            checked={student.isAbsent}
                            onChange={() => toggleAbsent(student.student_id)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    </div>

                    {/* Expandable Form if Absent */}
                    {student.isAbsent && (
                      <div
                        style={{
                          marginTop: '14px',
                          paddingLeft: 'clamp(0px, 4vw, 50px)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          animation: 'pageEnter 200ms ease-out',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: '12px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {/* Reason status dropdown */}
                          <div style={{ width: 'clamp(140px, 100%, 160px)', flexShrink: 0 }}>
                            <label className="input-label" style={{ fontSize: '11.5px' }}>
                              Alasan Ketidakhadiran
                            </label>
                            <select
                              className="input-field"
                              value={student.status}
                              onChange={(e) =>
                                updateStatus(student.student_id, e.target.value as 'Sakit' | 'Izin' | 'Alpa')
                              }
                              style={{ padding: '8px 12px', fontSize: '13px' }}
                            >
                              {ATTENDANCE_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Reason note */}
                          <div style={{ flex: 1, minWidth: '180px' }}>
                            <label className="input-label" style={{ fontSize: '11.5px' }}>
                              Catatan / Keterangan Tambahan
                            </label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder={
                                student.status === 'Sakit'
                                  ? 'Contoh: Surat dokter RS / demam tinggi...'
                                  : student.status === 'Izin'
                                  ? 'Contoh: Kejuaraan O2SN / izin keluarga...'
                                  : 'Contoh: Tanpa konfirmasi orang tua...'
                              }
                              value={student.note}
                              onChange={(e) => updateNote(student.student_id, e.target.value)}
                              style={{ padding: '8px 12px', fontSize: '13px' }}
                            />
                          </div>
                        </div>

                        {/* Evidence attachment controls & preview */}
                        <div
                          style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            borderRadius: '8px',
                            border: '1px dashed #cbd5e1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px',
                          }}
                        >
                          {student.attachmentPreview || student.attachmentUrl ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              {/* Thumbnail preview */}
                              <div
                                onClick={() =>
                                  setLightboxPhoto({
                                    url: student.attachmentPreview || student.attachmentUrl || '',
                                    title: `Bukti ${student.status}: ${student.full_name}`,
                                  })
                                }
                                style={{
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '6px',
                                  overflow: 'hidden',
                                  border: '1px solid #94a3b8',
                                  cursor: 'pointer',
                                  background: '#0f172a',
                                  flexShrink: 0,
                                }}
                                title="Klik untuk memperbesar foto bukti"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={student.attachmentPreview || student.attachmentUrl || ''}
                                  alt="Bukti"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              </div>

                              <div>
                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e3863', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>📷</span>
                                  <span>Foto Bukti Terlampir</span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {student.status === 'Sakit'
                                    ? 'Surat Sakit / Resep Dokter'
                                    : student.status === 'Izin'
                                    ? 'Surat Izin / Dokumen Lomba'
                                    : 'Dokumen Keterangan'}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '15px' }}>📎</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Belum ada foto bukti (surat dokter / dispensasi lomba / surat izin).
                              </span>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {student.attachmentPreview || student.attachmentUrl ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxPhoto({
                                      url: student.attachmentPreview || student.attachmentUrl || '',
                                      title: `Bukti ${student.status}: ${student.full_name}`,
                                    })
                                  }
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '5px 10px', fontSize: '11.5px' }}
                                >
                                  👁️ Lihat
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveModalStudent(student)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '5px 10px', fontSize: '11.5px' }}
                                >
                                  ✏️ Ubah / Jepret Kamera
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeEvidence(student.student_id)}
                                  className="btn btn-secondary btn-sm"
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: '11.5px',
                                    color: '#c9252d',
                                    borderColor: '#fca5a5',
                                  }}
                                  title="Hapus foto bukti ini"
                                >
                                  🗑️ Hapus
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveModalStudent(student)}
                                className="btn btn-secondary btn-sm"
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: '#ffffff',
                                  borderColor: '#1e3863',
                                  color: '#1e3863',
                                  fontWeight: 600,
                                }}
                              >
                                <span>📸</span>
                                <span>Ambil Foto Kamera / Lampirkan Bukti</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Submit Button */}
        {students.length > 0 && !submitted && (
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleSubmit}
              className="btn btn-primary btn-lg"
              disabled={submitting}
              style={{ width: 'min(100%, 420px)', boxShadow: '0 4px 14px rgba(30, 56, 99, 0.25)' }}
            >
              {submitting ? (
                <>
                  <Spinner /> {submitProgress || 'Menyimpan Data Presensi...'}
                </>
              ) : (
                `Simpan Presensi (${totalCount} Siswa)`
              )}
            </button>

            {submitting && submitProgress && (
              <span style={{ fontSize: '12px', color: '#1e3863', fontWeight: 600 }}>
                {submitProgress}
              </span>
            )}
          </div>
        )}

        {/* Success Confirmation Card */}
        {submitted && (
          <div
            className="glass-card page-enter"
            style={{
              marginTop: '24px',
              padding: '32px 24px',
              textAlign: 'center',
              borderLeft: '4px solid var(--success)',
              background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--success-light)',
                fontSize: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              ✓
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>
              Data Presensi Berhasil Disimpan!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginBottom: '20px' }}>
              Rekapitulasi: <strong>{presentCount} Hadir</strong>, <strong>{sickCount} Sakit</strong>,{' '}
              <strong>{permittedCount} Izin</strong>, <strong>{unpermittedCount} Alpa</strong> untuk tanggal{' '}
              <strong>{date}</strong>.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                fetchStudents(selectedClass);
              }}
              className="btn btn-secondary"
            >
              Input Presensi Tanggal / Kelas Lain
            </button>
          </div>
        )}

        {/* Evidence Capture Modal */}
        {activeModalStudent && (
          <EvidenceCaptureModal
            isOpen={!!activeModalStudent}
            onClose={() => setActiveModalStudent(null)}
            studentName={activeModalStudent.full_name}
            studentId={activeModalStudent.student_id}
            status={activeModalStudent.status}
            currentNote={activeModalStudent.note}
            existingFile={activeModalStudent.attachmentFile}
            existingPhotoUrl={activeModalStudent.attachmentPreview || activeModalStudent.attachmentUrl || undefined}
            onSave={(data) => {
              updateEvidence(activeModalStudent.student_id, data);
              setActiveModalStudent(null);
            }}
          />
        )}

        {/* Lightbox Modal for Full Image View */}
        {lightboxPhoto && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(8px)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              animation: 'fadeIn 150ms ease-out',
            }}
            onClick={() => setLightboxPhoto(null)}
          >
            <div
              style={{
                position: 'relative',
                maxWidth: '90vw',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#ffffff',
                  marginBottom: '10px',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700 }}>
                  {lightboxPhoto.title}
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    color: '#ffffff',
                    fontSize: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Tutup (ESC)"
                >
                  ✕
                </button>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxPhoto.url}
                alt="Bukti Foto"
                style={{
                  maxWidth: '90vw',
                  maxHeight: '80vh',
                  objectFit: 'contain',
                  borderRadius: '10px',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                  background: '#0f172a',
                }}
              />
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function AttendancePage() {
  return (
    <ToastProvider>
      <AttendanceContent />
    </ToastProvider>
  );
}
