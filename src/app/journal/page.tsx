'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { ToastProvider, useToast } from '@/components/Toast';
import { PageLoader, Spinner } from '@/components/Spinner';
import { SyncIcon } from '@/components/Icons';
import {
  SessionPayload,
  JournalEntry,
  Student,
  SubjectItem,
  SUBJECT_TYPE_CONFIG,
  normalizeRole,
} from '@/lib/constants';

function JournalContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [subjectName, setSubjectName] = useState<string>('');
  const [weekNumber, setWeekNumber] = useState('1');
  const [topic, setTopic] = useState('');
  const [filterSubject, setFilterSubject] = useState('ALL');

  const [syncing, setSyncing] = useState(false);

  // Sync classes from Students sheet
  const syncClasses = useCallback(async (currentUser: SessionPayload | null, isManual = false) => {
    if (isManual) setSyncing(true);
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      const classes: string[] = data.classes || [];
      setAvailableClasses(classes);

      if (currentUser) {
        if (currentUser.assigned_class && currentUser.assigned_class.toUpperCase() !== 'ALL') {
          setSelectedClass(currentUser.assigned_class);
        } else {
          setSelectedClass((prev) => (prev && classes.includes(prev) ? prev : classes[0] || ''));
        }
      }

      if (isManual) {
        showToast('Sinkronisasi data kelas berhasil!', 'success');
      }
    } catch {
      if (isManual) showToast('Gagal melakukan sinkronisasi kelas', 'error');
    } finally {
      if (isManual) setSyncing(false);
    }
  }, [showToast]);

  // Fetch session
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          const currentRole = normalizeRole(data.user.role);
          if (currentRole === 'PIC') {
            showToast('Modul jurnal hanya dapat diakses oleh Guru dan Administrator', 'error');
            router.push('/dashboard');
            return;
          }
          const u = { ...data.user, role: currentRole };
          setUser(u);
          syncClasses(u, false);
        } else {
          router.push('/');
        }
      })
      .catch(() => router.push('/'));
  }, [router, showToast, syncClasses]);

  // 5-minute background auto-sync
  useEffect(() => {
    const timer = setInterval(() => {
      syncClasses(user, false);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user, syncClasses]);

  // Load subjects dynamically from API
  useEffect(() => {
    fetch('/api/subjects')
      .then((r) => r.json())
      .then((data) => {
        if (data.subjects) setSubjects(data.subjects);
      })
      .catch(() => {});
  }, []);

  const fetchJournals = useCallback(
    async (targetClass: string) => {
      if (!targetClass) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/journal?class_name=${encodeURIComponent(targetClass)}`);
        const data = await res.json();
        if (data.journals) setJournals(data.journals);
      } catch {
        showToast('Gagal memuat riwayat jurnal kelas', 'error');
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (selectedClass) {
      fetchJournals(selectedClass);
    }
  }, [selectedClass, fetchJournals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedClass) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_name: selectedClass,
          subject_name: subjectName.trim(),
          week_number: weekNumber,
          topic: topic.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast('Catatan jurnal agenda mengajar berhasil ditambahkan!', 'success');
        setSubjectName('');
        setTopic('');
        fetchJournals(selectedClass);
      } else {
        showToast(data.error || 'Gagal menambahkan catatan jurnal', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat menyimpan jurnal', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/journal?journal_id=${deleteTargetId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        showToast('Catatan jurnal berhasil dihapus', 'success');
        setDeleteTargetId(null);
        fetchJournals(selectedClass);
      } else {
        showToast(data.error || 'Gagal menghapus jurnal', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat menghapus data', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const [searchJournalQuery, setSearchJournalQuery] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('ALL');
  const [sortJournalBy, setSortJournalBy] = useState<'week_asc' | 'week_desc' | 'date_desc' | 'date_asc' | 'subject_asc'>('week_asc');

  if (!user) return <PageLoader text="Memuat modul jurnal agenda mengajar..." />;

  // Unique list of teachers in loaded journals
  const availableTeachers = Array.from(
    new Set(journals.map((j) => j.teacher_username).filter(Boolean))
  ).sort();

  // Filter and sort journals
  const displayedJournals = useMemo(() => {
    let result = journals.filter((j) => {
      if (filterSubject !== 'ALL' && j.subject_name.trim().toLowerCase() !== filterSubject.trim().toLowerCase()) return false;
      if (filterTeacher !== 'ALL' && j.teacher_username?.toLowerCase() !== filterTeacher.toLowerCase()) return false;
      if (searchJournalQuery) {
        const q = searchJournalQuery.toLowerCase();
        const matchTopic = j.topic?.toLowerCase().includes(q);
        const matchSubj = j.subject_name?.toLowerCase().includes(q);
        const matchTeacher = j.teacher_username?.toLowerCase().includes(q);
        if (!matchTopic && !matchSubj && !matchTeacher) return false;
      }
      return true;
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sortJournalBy === 'week_asc') return (Number(a.week_number) || 0) - (Number(b.week_number) || 0);
      if (sortJournalBy === 'week_desc') return (Number(b.week_number) || 0) - (Number(a.week_number) || 0);
      if (sortJournalBy === 'date_desc') return (b.timestamp || '').localeCompare(a.timestamp || '');
      if (sortJournalBy === 'date_asc') return (a.timestamp || '').localeCompare(b.timestamp || '');
      if (sortJournalBy === 'subject_asc') return (a.subject_name || '').localeCompare(b.subject_name || '');
      return 0;
    });

    return sorted;
  }, [journals, filterSubject, filterTeacher, searchJournalQuery, sortJournalBy]);

  // Group journals by week number
  const grouped = displayedJournals.reduce<Record<string, JournalEntry[]>>((acc: Record<string, JournalEntry[]>, j: JournalEntry) => {
    const week = j.week_number;
    if (!acc[week]) acc[week] = [];
    acc[week].push(j);
    return acc;
  }, {});

  const sortedWeeks = Object.keys(grouped).sort((a, b) => {
    if (sortJournalBy === 'week_desc') return Number(b) - Number(a);
    return Number(a) - Number(b);
  });

  // Subject categorization
  const intraSubjects = subjects.filter((s) => s.type === 'Intrakurikuler');
  const kokuSubjects = subjects.filter((s) => s.type === 'Kokurikuler');
  const ekstraSubjects = subjects.filter((s) => s.type === 'Ekstrakurikuler');

  return (
    <>
      <Navbar user={user} />

      <main className="container-app page-enter" style={{ paddingTop: '20px', paddingBottom: '40px' }}>
        {/* Navigation & Header */}
        <div style={{ marginBottom: '18px' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: 0,
            }}
          >
            <span>←</span> Kembali ke Dasbor
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '3px' }}>
                Jurnal Agenda Mengajar
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Dokumentasi materi dan capaian pembelajaran kelas <strong>{selectedClass}</strong>
              </p>
            </div>

            {/* Class Selector for Admin */}
            {/* Class Selector & Sync Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {(user.role === 'Admin' || user.role === 'Teacher' || !user.assigned_class || user.assigned_class.toUpperCase() === 'ALL') && availableClasses.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Kelas:
                  </span>
                  <select
                    className="input-field"
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    style={{ width: '130px', padding: '7px 10px', fontSize: '12.5px' }}
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
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="Sinkronkan daftar kelas dari lembar kerja Google Sheets (Otomatis setiap 5 menit)"
              >
                <SyncIcon size={13} className={syncing ? 'animate-spin' : ''} />
                <span>{syncing ? 'Menyinkronkan...' : 'Sinkron Kelas'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Add Journal Form Card */}
        <div
          className="glass-card"
          style={{
            padding: 'clamp(16px, 3vw, 24px)',
            marginBottom: '24px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <span style={{ fontSize: '18px' }}>📝</span>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Tambah Catatan Agenda Pembelajaran
            </h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="input-label" htmlFor="subject" style={{ margin: 0 }}>
                    Mata Pelajaran / Kegiatan
                  </label>
                  {user.role === 'Admin' && (
                    <button
                      type="button"
                      onClick={() => router.push('/admin')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-light)',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      ⚙️ Kelola di Admin
                    </button>
                  )}
                </div>
                <select
                  id="subject"
                  className="input-field"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  required
                >
                  <option value="">-- Pilih Mata Pelajaran / Kegiatan --</option>
                  {intraSubjects.length > 0 && (
                    <optgroup label="📚 1. Intrakurikuler (Mata Pelajaran Pokok)">
                      {intraSubjects.map((subj) => (
                        <option key={subj.subject_id} value={subj.name}>
                          {subj.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {kokuSubjects.length > 0 && (
                    <optgroup label="🔭 2. Kokurikuler (Observation, Native Speaker, dll)">
                      {kokuSubjects.map((subj) => (
                        <option key={subj.subject_id} value={subj.name}>
                          {subj.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {ekstraSubjects.length > 0 && (
                    <optgroup label="🎨 3. Ekstrakurikuler (Scout, Football, Painting, dll)">
                      {ekstraSubjects.map((subj) => (
                        <option key={subj.subject_id} value={subj.name}>
                          {subj.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="week">
                  Pertemuan / Minggu Ke-
                </label>
                <input
                  id="week"
                  type="number"
                  className="input-field"
                  placeholder="1 - 52"
                  min={1}
                  max={52}
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(e.target.value)}
                  required
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label className="input-label" htmlFor="topic">
                  Uraian Materi Pokok / Topik Pembelajaran
                </label>
                <input
                  id="topic"
                  type="text"
                  className="input-field"
                  placeholder="Contoh: Pembahasan Algoritma Pencarian dan Struktur Data..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                style={{ padding: '10px 22px' }}
              >
                {submitting ? (
                  <>
                    <Spinner /> Menyimpan Jurnal...
                  </>
                ) : (
                  '+ Simpan Catatan Jurnal'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Filter & Sorting Controls Toolbar (Available for all roles) */}
        <div
          className="glass-card"
          style={{
            padding: '14px 18px',
            marginBottom: '20px',
            background: '#ffffff',
            border: '1px solid #e4e6eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
            <input
              type="text"
              className="input-field"
              placeholder="🔍 Cari topik / mapel / guru..."
              value={searchJournalQuery}
              onChange={(e) => setSearchJournalQuery(e.target.value)}
              style={{ maxWidth: '240px', fontSize: '12.5px', padding: '7px 12px' }}
            />

            {/* Subject Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Mapel:</span>
              <select
                className="input-field"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                style={{ width: 'auto', minWidth: '160px', padding: '7px 10px', fontSize: '12.5px' }}
              >
                <option value="ALL">Semua Mapel</option>
                {intraSubjects.length > 0 && (
                  <optgroup label="📚 Intrakurikuler">
                    {intraSubjects.map((subj) => (
                      <option key={subj.subject_id} value={subj.name}>
                        {subj.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {kokuSubjects.length > 0 && (
                  <optgroup label="🔭 Kokurikuler">
                    {kokuSubjects.map((subj) => (
                      <option key={subj.subject_id} value={subj.name}>
                        {subj.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {ekstraSubjects.length > 0 && (
                  <optgroup label="🎨 Ekstrakurikuler">
                    {ekstraSubjects.map((subj) => (
                      <option key={subj.subject_id} value={subj.name}>
                        {subj.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Teacher Filter */}
            {availableTeachers.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Guru:</span>
                <select
                  className="input-field"
                  value={filterTeacher}
                  onChange={(e) => setFilterTeacher(e.target.value)}
                  style={{ width: 'auto', minWidth: '140px', padding: '7px 10px', fontSize: '12.5px' }}
                >
                  <option value="ALL">Semua Guru</option>
                  {availableTeachers.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Order */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Urutkan:</span>
              <select
                className="input-field"
                value={sortJournalBy}
                onChange={(e) => setSortJournalBy(e.target.value as any)}
                style={{ width: 'auto', fontSize: '12.5px', padding: '7px 10px' }}
              >
                <option value="week_asc">Minggu: 1 → 52</option>
                <option value="week_desc">Minggu: 52 → 1</option>
                <option value="date_desc">Tanggal: Terbaru</option>
                <option value="date_asc">Tanggal: Terlama</option>
                <option value="subject_asc">Mapel (A - Z)</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
            Menampilkan {displayedJournals.length} dari {journals.length} Catatan
          </div>
        </div>

        {/* Timeline Content */}
        {loading ? (
          <PageLoader text="Memuat riwayat agenda..." />
        ) : sortedWeeks.length === 0 ? (
          <div
            className="glass-card"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📖</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Belum Ada Catatan Jurnal
            </div>
            <p style={{ fontSize: '13.5px' }}>
              Gunakan formulir di atas untuk mencatat agenda dan materi ajar pertama kelas ini.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {sortedWeeks.map((week) => (
              <div key={week} className="glass-card" style={{ overflow: 'hidden' }}>
                {/* Week Header */}
                <div
                  style={{
                    padding: '12px 20px',
                    background: '#f7f8fa',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        color: '#1e3863',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        background: '#eef3fa',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(30, 56, 99, 0.25)',
                      }}
                    >
                      Minggu Ke-{week}
                    </span>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {grouped[week].length} agenda materi
                    </span>
                  </div>
                </div>

                {/* Entry Rows */}
                {grouped[week].map((entry: JournalEntry, i: number) => {
                  const matchedSubj = subjects.find(
                    (s) =>
                      s.name.trim().toLowerCase() === entry.subject_name.trim().toLowerCase()
                  );
                  const typeCfg = matchedSubj ? SUBJECT_TYPE_CONFIG[matchedSubj.type] : null;

                  return (
                    <div
                      key={entry.journal_id}
                      style={{
                        padding: '16px 20px',
                        borderBottom:
                          i < grouped[week].length - 1 ? '1px solid var(--border)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '4px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '15px',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {entry.subject_name}
                          </span>
                          {typeCfg && (
                            <span
                              className={`badge ${typeCfg.badgeClass}`}
                              style={{ fontSize: '10.5px', padding: '2px 7px' }}
                            >
                              {typeCfg.icon} {typeCfg.label}
                            </span>
                          )}
                          {entry.teacher_username && (
                            <span
                              style={{
                                fontSize: '11.5px',
                                color: 'var(--text-secondary)',
                                background: '#f0f2f5',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                border: '1px solid #e4e6eb',
                              }}
                            >
                              👤 {entry.teacher_username}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '13.5px',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.4,
                          }}
                        >
                          {entry.topic}
                        </div>
                      </div>

                      {entry.timestamp && (
                        <span
                          style={{
                            fontSize: '11.5px',
                            color: 'var(--text-muted)',
                            background: '#f0f2f5',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid #e4e6eb',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {entry.timestamp}
                        </span>
                      )}

                      <button
                        onClick={() => setDeleteTargetId(entry.journal_id)}
                        className="btn btn-danger btn-sm"
                        style={{ flexShrink: 0, padding: '6px 12px', fontSize: '12px' }}
                        title="Hapus catatan agenda ini"
                      >
                        Hapus
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTargetId && (
          <div className="modal-overlay">
            <div
              className="modal-card page-enter"
              style={{
                maxWidth: '400px',
                border: '1px solid rgba(244, 63, 94, 0.3)',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>⚠️</div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, marginBottom: '6px' }}>
                  Konfirmasi Penghapusan
                </h3>
                <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Apakah Anda yakin ingin menghapus catatan jurnal mengajar ini? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setDeleteTargetId(null)}
                  className="btn btn-secondary"
                  disabled={deleting}
                  style={{ flex: 1 }}
                >
                  Batalkan
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="btn btn-danger"
                  disabled={deleting}
                  style={{ flex: 1 }}
                >
                  {deleting ? <Spinner /> : 'Ya, Hapus Jurnal'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function JournalPage() {
  return (
    <ToastProvider>
      <JournalContent />
    </ToastProvider>
  );
}
