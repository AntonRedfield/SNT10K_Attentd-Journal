'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { ToastProvider, useToast } from '@/components/Toast';
import { PageLoader, Spinner } from '@/components/Spinner';
import { SyncIcon } from '@/components/Icons';
import {
  SessionPayload,
  ROLE_LABELS,
  UserRole,
  SubjectItem,
  SubjectType,
  SUBJECT_TYPES,
  SUBJECT_TYPE_CONFIG,
  normalizeRole,
} from '@/lib/constants';

type Tab = 'users' | 'students' | 'subjects';

interface UserRow {
  user_id: string;
  username: string;
  role: UserRole;
  assigned_class: string;
  nip?: string;
}

interface StudentRow {
  student_id: string;
  full_name: string;
  class_name: string;
  is_active: string;
}

function AdminContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<SessionPayload | null>(null);
  const [tab, setTab] = useState<Tab>('users');
  const [loading, setLoading] = useState(true);

  // Users State & Filter/Sort
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [userSortBy, setUserSortBy] = useState<'name_asc' | 'name_desc' | 'role_asc'>('name_asc');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'Teacher' as UserRole,
    assigned_class: 'X TKJ 1',
    nip: '',
  });
  const [addingUser, setAddingUser] = useState(false);

  // Students State & Filter/Sort
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [studentSortBy, setStudentSortBy] = useState<'name_asc' | 'name_desc' | 'class_asc' | 'active_first' | 'inactive_first'>('name_asc');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({ full_name: '', class_name: 'X TKJ 1' });
  const [addingStudent, setAddingStudent] = useState(false);

  // Subjects State & Filter/Sort
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [selectedSubjectTypeFilter, setSelectedSubjectTypeFilter] = useState<'ALL' | SubjectType>('ALL');
  const [subjectSortBy, setSubjectSortBy] = useState<'name_asc' | 'name_desc' | 'type_asc'>('name_asc');
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubject, setNewSubject] = useState<{ name: string; type: SubjectType }>({
    name: '',
    type: 'Intrakurikuler',
  });
  const [addingSubject, setAddingSubject] = useState(false);

  // Edit Modals State
  const [editingUser, setEditingUser] = useState<(UserRow & { password?: string }) | null>(null);
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [savingStudentEdit, setSavingStudentEdit] = useState(false);

  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
  const [savingSubjectEdit, setSavingSubjectEdit] = useState(false);

  // Delete modal state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'user' | 'student' | 'subject';
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filtered & Sorted users list
  const filteredUsers = useMemo(() => {
    let result = users.filter((u) => {
      const q = userSearch.toLowerCase();
      const matchesSearch = !userSearch || u.username.toLowerCase().includes(q) || u.user_id.toLowerCase().includes(q) || (u.assigned_class && u.assigned_class.toLowerCase().includes(q));
      const matchesRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
      return matchesSearch && matchesRole;
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (userSortBy === 'name_asc') return a.username.localeCompare(b.username);
      if (userSortBy === 'name_desc') return b.username.localeCompare(a.username);
      if (userSortBy === 'role_asc') return a.role.localeCompare(b.role);
      return 0;
    });
    return sorted;
  }, [users, userSearch, userRoleFilter, userSortBy]);

  // Filtered & Sorted student list
  const filteredStudents = useMemo(() => {
    let result = students.filter((s) => {
      const q = studentSearch.toLowerCase();
      const matchesSearch = !studentSearch || s.full_name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q);
      const matchesClass = selectedClassFilter === 'ALL' || s.class_name === selectedClassFilter;
      const isActive = s.is_active?.toUpperCase() === 'TRUE';
      const matchesStatus = studentStatusFilter === 'ALL' || (studentStatusFilter === 'ACTIVE' ? isActive : !isActive);
      return matchesSearch && matchesClass && matchesStatus;
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (studentSortBy === 'name_asc') return a.full_name.localeCompare(b.full_name);
      if (studentSortBy === 'name_desc') return b.full_name.localeCompare(a.full_name);
      if (studentSortBy === 'class_asc') return (a.class_name || '').localeCompare(b.class_name || '', undefined, { numeric: true });
      if (studentSortBy === 'active_first') {
        const aAct = a.is_active?.toUpperCase() === 'TRUE';
        const bAct = b.is_active?.toUpperCase() === 'TRUE';
        if (aAct === bAct) return a.full_name.localeCompare(b.full_name);
        return aAct ? -1 : 1;
      }
      if (studentSortBy === 'inactive_first') {
        const aAct = a.is_active?.toUpperCase() === 'TRUE';
        const bAct = b.is_active?.toUpperCase() === 'TRUE';
        if (aAct === bAct) return a.full_name.localeCompare(b.full_name);
        return !aAct ? -1 : 1;
      }
      return 0;
    });
    return sorted;
  }, [students, studentSearch, selectedClassFilter, studentStatusFilter, studentSortBy]);

  // Filtered & Sorted subjects list
  const filteredSubjects = useMemo(() => {
    let result = subjects.filter((s) => {
      const matchesSearch = !subjectSearch || s.name.toLowerCase().includes(subjectSearch.toLowerCase()) || s.subject_id.toLowerCase().includes(subjectSearch.toLowerCase());
      const matchesType = selectedSubjectTypeFilter === 'ALL' || s.type === selectedSubjectTypeFilter;
      return matchesSearch && matchesType;
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (subjectSortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (subjectSortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (subjectSortBy === 'type_asc') return a.type.localeCompare(b.type);
      return 0;
    });
    return sorted;
  }, [subjects, subjectSearch, selectedSubjectTypeFilter, subjectSortBy]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          const currentRole = normalizeRole(data.user.role);
          if (currentRole === 'Admin') {
            setUser({ ...data.user, role: currentRole });
          } else if (currentRole === 'Teacher') {
            setUser({ ...data.user, role: currentRole });
            setTab('students');
          } else {
            showToast('Halaman ini khusus untuk Administrator dan Guru', 'error');
            router.push('/dashboard');
          }
        } else {
          router.push('/');
        }
      })
      .catch(() => router.push('/'));
  }, [router, showToast]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {
      showToast('Gagal memuat data pengguna', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students');
      const data = await res.json();
      if (data.students) setStudents(data.students);
    } catch {
      showToast('Gagal memuat data induk siswa', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/subjects');
      const data = await res.json();
      if (data.subjects) setSubjects(data.subjects);
    } catch {
      showToast('Gagal memuat data mata pelajaran & kegiatan', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!user) return;
    if (tab === 'users') fetchUsers();
    else if (tab === 'students') fetchStudents();
    else fetchSubjects();
  }, [user, tab, fetchUsers, fetchStudents, fetchSubjects]);

  // 5-minute auto-refresh interval
  useEffect(() => {
    const timer = setInterval(() => {
      if (tab === 'users') fetchUsers();
      else if (tab === 'students') fetchStudents();
      else fetchSubjects();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [tab, fetchUsers, fetchStudents, fetchSubjects]);

  const handleManualSync = () => {
    if (tab === 'users') fetchUsers();
    else if (tab === 'students') fetchStudents();
    else fetchSubjects();
    showToast('Sinkronisasi data berhasil diperbarui!', 'success');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Akun pengguna baru berhasil ditambahkan!', 'success');
        setNewUser({ username: '', password: '', role: 'Teacher', assigned_class: 'X TKJ 1', nip: '' });
        setShowAddUser(false);
        fetchUsers();
      } else {
        showToast(data.error || 'Gagal menambahkan pengguna', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat menyimpan data pengguna', 'error');
    } finally {
      setAddingUser(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUserEdit(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editingUser.user_id,
          username: editingUser.username,
          password: editingUser.password,
          role: editingUser.role,
          assigned_class: editingUser.assigned_class,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Data akun pengguna berhasil diperbarui!', 'success');
        setEditingUser(null);
        fetchUsers();
      } else {
        showToast(data.error || 'Gagal memperbarui pengguna', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat memperbarui data pengguna', 'error');
    } finally {
      setSavingUserEdit(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingStudent(true);
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudent),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Data siswa baru berhasil ditambahkan!', 'success');
        setNewStudent({ full_name: '', class_name: 'X TKJ 1' });
        setShowAddStudent(false);
        fetchStudents();
      } else {
        showToast(data.error || 'Gagal menambahkan siswa', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat menyimpan data siswa', 'error');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setSavingStudentEdit(true);
    try {
      const res = await fetch('/api/admin/students', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: editingStudent.student_id,
          full_name: editingStudent.full_name,
          class_name: editingStudent.class_name,
          is_active: editingStudent.is_active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Data siswa berhasil diperbarui!', 'success');
        setEditingStudent(null);
        fetchStudents();
      } else {
        showToast(data.error || 'Gagal memperbarui data siswa', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat memperbarui data siswa', 'error');
    } finally {
      setSavingStudentEdit(false);
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.name.trim()) return;
    setAddingSubject(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSubject),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Mata pelajaran/kegiatan "${newSubject.name}" berhasil ditambahkan!`, 'success');
        setNewSubject({ name: '', type: 'Intrakurikuler' });
        setShowAddSubject(false);
        fetchSubjects();
      } else {
        showToast(data.error || 'Gagal menambahkan mata pelajaran', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat menyimpan data mata pelajaran', 'error');
    } finally {
      setAddingSubject(false);
    }
  };

  const handleUpdateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    setSavingSubjectEdit(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_id: editingSubject.subject_id,
          name: editingSubject.name,
          type: editingSubject.type,
          is_active: editingSubject.is_active || 'TRUE',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Mata pelajaran / kegiatan berhasil diperbarui!', 'success');
        setEditingSubject(null);
        fetchSubjects();
      } else {
        showToast(data.error || 'Gagal memperbarui mata pelajaran', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat memperbarui data mata pelajaran', 'error');
    } finally {
      setSavingSubjectEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);

    try {
      if (deleteConfirm.type === 'user') {
        const res = await fetch(`/api/admin/users?user_id=${deleteConfirm.id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Akun "${deleteConfirm.name}" berhasil dihapus`, 'success');
          fetchUsers();
        } else {
          showToast(data.error || 'Gagal menghapus akun pengguna', 'error');
        }
      } else if (deleteConfirm.type === 'student') {
        const res = await fetch(`/api/admin/students?student_id=${deleteConfirm.id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Data siswa "${deleteConfirm.name}" berhasil dihapus`, 'success');
          fetchStudents();
        } else {
          showToast(data.error || 'Gagal menghapus data siswa', 'error');
        }
      } else if (deleteConfirm.type === 'subject') {
        const res = await fetch(`/api/subjects?subject_id=${deleteConfirm.id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Mata pelajaran/kegiatan "${deleteConfirm.name}" berhasil dihapus`, 'success');
          fetchSubjects();
        } else {
          showToast(data.error || 'Gagal menghapus mata pelajaran', 'error');
        }
      }
      setDeleteConfirm(null);
    } catch {
      showToast('Terjadi kendala jaringan saat menghapus data', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (!user) return <PageLoader text="Memuat modul panel administrator..." />;

  // Unique classes for filter
  const classList = Array.from(
    new Set(students.map((s) => s.class_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const intraCount = subjects.filter((s) => s.type === 'Intrakurikuler').length;
  const kokuCount = subjects.filter((s) => s.type === 'Kokurikuler').length;
  const ekstraCount = subjects.filter((s) => s.type === 'Ekstrakurikuler').length;

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
            <div>
              <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '3px' }}>
                {user.role === 'Admin' ? 'Panel Administrator' : 'Data Induk & Kurikulum'}
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                {user.role === 'Admin'
                  ? 'Manajemen akun pengguna, master data siswa, dan kurikulum mata pelajaran'
                  : 'Manajemen master data siswa dan kurikulum mata pelajaran/kegiatan'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleManualSync}
              disabled={loading}
              className="btn btn-secondary btn-sm"
              style={{
                padding: '7px 14px',
                fontSize: '12.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Sinkronkan data dari Google Sheets (Otomatis setiap 5 menit)"
            >
              <SyncIcon size={14} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Menyinkronkan...' : 'Sinkron Data'}</span>
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '20px',
            background: '#ffffff',
            border: '1px solid #e4e6eb',
            borderRadius: '10px',
            padding: '3px',
            flexWrap: 'wrap',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          }}
        >
          {user.role === 'Admin' && (
            <button
              onClick={() => setTab('users')}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13.5px',
                fontWeight: 700,
                fontFamily: 'inherit',
                transition: 'all var(--transition)',
                background: tab === 'users' ? '#1e3863' : 'transparent',
                color: tab === 'users' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: tab === 'users' ? '0 2px 6px rgba(30, 56, 99, 0.35)' : 'none',
              }}
            >
              👤 Pengguna ({users.length})
            </button>
          )}

          <button
            onClick={() => setTab('students')}
            style={{
              flex: 1,
              minWidth: '100px',
              padding: '9px 12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13.5px',
              fontWeight: 700,
              fontFamily: 'inherit',
              transition: 'all var(--transition)',
              background: tab === 'students' ? '#1e3863' : 'transparent',
              color: tab === 'students' ? '#ffffff' : 'var(--text-secondary)',
              boxShadow: tab === 'students' ? '0 2px 6px rgba(30, 56, 99, 0.35)' : 'none',
            }}
          >
            🎓 Data Siswa ({students.length})
          </button>

          <button
            onClick={() => setTab('subjects')}
            style={{
              flex: 1,
              minWidth: '100px',
              padding: '9px 12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13.5px',
              fontWeight: 700,
              fontFamily: 'inherit',
              transition: 'all var(--transition)',
              background: tab === 'subjects' ? '#1e3863' : 'transparent',
              color: tab === 'subjects' ? '#ffffff' : 'var(--text-secondary)',
              boxShadow: tab === 'subjects' ? '0 2px 6px rgba(30, 56, 99, 0.35)' : 'none',
            }}
          >
            📚 Mapel & Kegiatan ({subjects.length})
          </button>
        </div>

        {/* USERS TAB */}
        {tab === 'users' && user.role === 'Admin' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Daftar Akun Pengguna Terdaftar
                </h2>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  Akun yang memiliki hak akses untuk masuk ke dalam aplikasi
                </p>
              </div>

              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="btn btn-primary btn-sm"
                style={{ padding: '8px 16px' }}
              >
                {showAddUser ? '✕ Tutup Formulir' : '+ Tambah Pengguna Baru'}
              </button>
            </div>

            {/* Add User Form Drawer */}
            {showAddUser && (
              <div
                className="glass-card page-enter"
                style={{
                  padding: 'clamp(16px, 3vw, 24px)',
                  marginBottom: '20px',
                  border: '1px solid #e4e6eb',
                  background: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '18px' }}>👤</span>
                  <h3 style={{ fontSize: '15px', fontWeight: 700 }}>
                    Formulir Pendaftaran Pengguna Baru
                  </h3>
                </div>

                <form onSubmit={handleAddUser}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '14px',
                      marginBottom: '18px',
                    }}
                  >
                    <div>
                      <label className="input-label">Nama Pengguna (Username)</label>
                      <input
                        className="input-field"
                        placeholder="Contoh: guru.matematika"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label className="input-label">Kata Sandi (Password)</label>
                      <input
                        className="input-field"
                        type="text"
                        placeholder="Masukkan kata sandi..."
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label className="input-label">Peran / Hak Akses</label>
                      <select
                        className="input-field"
                        value={newUser.role}
                        onChange={(e) =>
                          setNewUser({ ...newUser, role: e.target.value as UserRole })
                        }
                      >
                        <option value="Admin">Admin</option>
                        <option value="Teacher">Kepala Sekolah / Guru</option>
                        <option value="PIC">Ketua Kelas / Sekertaris Kelas</option>
                      </select>
                    </div>

                    <div>
                      <label className="input-label">Penugasan Kelas</label>
                      <input
                        className="input-field"
                        placeholder="Contoh: X TKJ 1 atau ALL"
                        value={newUser.assigned_class}
                        onChange={(e) =>
                          setNewUser({ ...newUser, assigned_class: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddUser(false)}
                      className="btn btn-secondary btn-sm"
                    >
                      Batalkan
                    </button>
                    <button
                      type="submit"
                      className="btn btn-success btn-sm"
                      disabled={addingUser}
                    >
                      {addingUser ? (
                        <>
                          <Spinner /> Menyimpan...
                        </>
                      ) : (
                        '✓ Simpan Pengguna'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Users Filter & Sort Toolbar */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '16px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                className="input-field"
                placeholder="🔍 Cari nama pengguna / ID..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ maxWidth: '260px', fontSize: '12.5px', padding: '7px 12px' }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Peran:
                </span>
                <select
                  className="input-field"
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value as any)}
                  style={{ width: 'auto', fontSize: '12.5px', padding: '7px 10px' }}
                >
                  <option value="ALL">Semua Peran ({users.length})</option>
                  <option value="Admin">Admin</option>
                  <option value="Teacher">Kepala Sekolah / Guru</option>
                  <option value="PIC">Ketua / Sekertaris Kelas</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Urutkan:
                </span>
                <select
                  className="input-field"
                  value={userSortBy}
                  onChange={(e) => setUserSortBy(e.target.value as any)}
                  style={{ width: 'auto', fontSize: '12.5px', padding: '7px 10px' }}
                >
                  <option value="name_asc">Username (A - Z)</option>
                  <option value="name_desc">Username (Z - A)</option>
                  <option value="role_asc">Peran</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            {loading ? (
              <PageLoader text="Memuat daftar akun pengguna..." />
            ) : (
              <div className="glass-card table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '48px' }}>No</th>
                      <th>Nama Pengguna</th>
                      <th>Peran / Hak Akses</th>
                      <th>Penugasan Kelas</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => {
                      const roleLabel = ROLE_LABELS[u.role] || u.role;
                      const roleBadgeClass =
                        u.role === 'Admin'
                          ? 'badge-admin'
                          : u.role === 'Teacher'
                          ? 'badge-teacher'
                          : 'badge-pic';

                      return (
                        <tr key={u.user_id}>
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {u.username}
                          </td>
                          <td>
                            <span className={`badge ${roleBadgeClass}`}>
                              <span className="badge-dot" />
                              {roleLabel}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                              }}
                            >
                              {u.assigned_class?.toUpperCase() === 'ALL'
                                ? 'Semua Kelas'
                                : `Kelas ${u.assigned_class}`}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setEditingUser({ ...u, password: '' })}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '5px 12px', fontSize: '11.5px' }}
                                title="Edit data akun pengguna ini"
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteConfirm({
                                    type: 'user',
                                    id: u.user_id,
                                    name: u.username,
                                  })
                                }
                                className="btn btn-danger btn-sm"
                                style={{ padding: '5px 12px', fontSize: '11.5px' }}
                                title="Hapus akun pengguna"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {users.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            padding: '36px',
                          }}
                        >
                          Belum ada data pengguna terdaftar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* STUDENTS TAB */}
        {tab === 'students' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Data Induk Siswa Terdaftar
                </h2>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  Daftar seluruh siswa aktif yang terdaftar dalam sistem presensi
                </p>
              </div>

              <button
                onClick={() => setShowAddStudent(!showAddStudent)}
                className="btn btn-primary btn-sm"
                style={{ padding: '8px 16px' }}
              >
                {showAddStudent ? '✕ Tutup Formulir' : '+ Tambah Siswa Baru'}
              </button>
            </div>

            {/* Add Student Form Drawer */}
            {showAddStudent && (
              <div
                className="glass-card page-enter"
                style={{
                  padding: 'clamp(16px, 3vw, 24px)',
                  marginBottom: '20px',
                  border: '1px solid #e4e6eb',
                  background: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '18px' }}>🎓</span>
                  <h3 style={{ fontSize: '15px', fontWeight: 700 }}>
                    Formulir Pendaftaran Siswa Baru
                  </h3>
                </div>

                <form onSubmit={handleAddStudent}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '14px',
                      marginBottom: '18px',
                    }}
                  >
                    <div>
                      <label className="input-label">Nama Lengkap Siswa</label>
                      <input
                        className="input-field"
                        placeholder="Contoh: Maria Magdalena"
                        value={newStudent.full_name}
                        onChange={(e) =>
                          setNewStudent({ ...newStudent, full_name: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div>
                      <label className="input-label">Rombongan Belajar (Kelas)</label>
                      <input
                        className="input-field"
                        placeholder="Contoh: X TKJ 1"
                        value={newStudent.class_name}
                        onChange={(e) =>
                          setNewStudent({ ...newStudent, class_name: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddStudent(false)}
                      className="btn btn-secondary btn-sm"
                    >
                      Batalkan
                    </button>
                    <button
                      type="submit"
                      className="btn btn-success btn-sm"
                      disabled={addingStudent}
                    >
                      {addingStudent ? (
                        <>
                          <Spinner /> Menyimpan...
                        </>
                      ) : (
                        '✓ Simpan Data Siswa'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Filter & Sort Bar */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '16px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                className="input-field"
                placeholder="🔍 Cari nama siswa / ID..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{ maxWidth: '240px', fontSize: '12.5px', padding: '7px 12px' }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Kelas:
                </span>
                <select
                  className="input-field"
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  style={{ width: 'auto', minWidth: '120px', fontSize: '12.5px', padding: '7px 10px' }}
                >
                  <option value="ALL">Semua Kelas ({students.length})</option>
                  {classList.map((cls) => (
                    <option key={cls} value={cls}>
                      Kelas {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Status:
                </span>
                <select
                  className="input-field"
                  value={studentStatusFilter}
                  onChange={(e) => setStudentStatusFilter(e.target.value as any)}
                  style={{ width: 'auto', fontSize: '12.5px', padding: '7px 10px' }}
                >
                  <option value="ALL">Semua Status</option>
                  <option value="ACTIVE">Aktif Saja</option>
                  <option value="INACTIVE">Nonaktif Saja</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Urutkan:
                </span>
                <select
                  className="input-field"
                  value={studentSortBy}
                  onChange={(e) => setStudentSortBy(e.target.value as any)}
                  style={{ width: 'auto', fontSize: '12.5px', padding: '7px 10px' }}
                >
                  <option value="name_asc">Nama (A - Z)</option>
                  <option value="name_desc">Nama (Z - A)</option>
                  <option value="class_asc">Kelas (Terkecil - Terbesar)</option>
                  <option value="active_first">Siswa Aktif Dulu</option>
                  <option value="inactive_first">Siswa Nonaktif Dulu</option>
                </select>
              </div>
            </div>

            {/* Students Table */}
            {loading ? (
              <PageLoader text="Memuat data induk siswa..." />
            ) : (
              <div className="glass-card table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '48px' }}>No</th>
                      <th>Nama Lengkap</th>
                      <th>ID Siswa</th>
                      <th>Kelas</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s, i) => {
                      const isActive = s.is_active?.toUpperCase() === 'TRUE';

                      return (
                        <tr key={s.student_id}>
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {s.full_name}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {s.student_id}
                          </td>
                          <td>
                            <span
                              style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                              }}
                            >
                              Kelas {s.class_name}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${isActive ? 'badge-present' : 'badge-unpermitted'}`}
                            >
                              <span className="badge-dot" />
                              {isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setEditingStudent({ ...s })}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '5px 12px', fontSize: '11.5px' }}
                                title="Edit data siswa ini"
                              >
                                ✏️ Edit
                              </button>
                              {user.role === 'Admin' && (
                                <button
                                  onClick={() =>
                                    setDeleteConfirm({
                                      type: 'student',
                                      id: s.student_id,
                                      name: s.full_name,
                                    })
                                  }
                                  className="btn btn-danger btn-sm"
                                  style={{ padding: '5px 12px', fontSize: '11.5px' }}
                                  title="Hapus data siswa"
                                >
                                  Hapus
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            padding: '36px',
                          }}
                        >
                          Tidak ada data siswa yang cocok dengan filter pencarian.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUBJECTS TAB */}
        {tab === 'subjects' && (
          <div>
            {/* Subject Type Overview Stat Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
              }}
            >
              <div
                className="glass-card"
                onClick={() => setSelectedSubjectTypeFilter('Intrakurikuler')}
                style={{
                  padding: '18px 20px',
                  cursor: 'pointer',
                  border: selectedSubjectTypeFilter === 'Intrakurikuler' ? '2px solid #1e3863' : '1px solid #e4e6eb',
                  background: selectedSubjectTypeFilter === 'Intrakurikuler' ? '#eef3fa' : '#ffffff',
                  transition: 'all 0.15s ease',
                  borderRadius: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    1. Intrakurikuler
                  </span>
                  <span style={{ fontSize: '20px' }}>📚</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#1e3863' }}>
                  {intraCount} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Mapel</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Mata pelajaran pokok kurikulum
                </div>
              </div>

              <div
                className="glass-card"
                onClick={() => setSelectedSubjectTypeFilter('Kokurikuler')}
                style={{
                  padding: '18px 20px',
                  cursor: 'pointer',
                  border: selectedSubjectTypeFilter === 'Kokurikuler' ? '2px solid #0284c7' : '1px solid #e4e6eb',
                  background: selectedSubjectTypeFilter === 'Kokurikuler' ? '#e0f2fe' : '#ffffff',
                  transition: 'all 0.15s ease',
                  borderRadius: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    2. Kokurikuler
                  </span>
                  <span style={{ fontSize: '20px' }}>🔭</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0284c7' }}>
                  {kokuCount} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Kegiatan</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Observation, Native Speaker, Project
                </div>
              </div>

              <div
                className="glass-card"
                onClick={() => setSelectedSubjectTypeFilter('Ekstrakurikuler')}
                style={{
                  padding: '18px 20px',
                  cursor: 'pointer',
                  border: selectedSubjectTypeFilter === 'Ekstrakurikuler' ? '2px solid #137333' : '1px solid #e4e6eb',
                  background: selectedSubjectTypeFilter === 'Ekstrakurikuler' ? '#e6f4ea' : '#ffffff',
                  transition: 'all 0.15s ease',
                  borderRadius: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    3. Ekstrakurikuler
                  </span>
                  <span style={{ fontSize: '20px' }}>🎨</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#137333' }}>
                  {ekstraCount} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Aktivitas</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Scout, Football, Painting, dll
                </div>
              </div>
            </div>

            {/* Top Bar: Search, Type Filter Pills, and Add Button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: '20px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                <input
                  className="input-field"
                  placeholder="🔍 Cari mapel / kegiatan..."
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  style={{ maxWidth: '220px', fontSize: '12.5px', padding: '7px 12px' }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Urutkan:
                  </span>
                  <select
                    className="input-field"
                    value={subjectSortBy}
                    onChange={(e) => setSubjectSortBy(e.target.value as any)}
                    style={{ width: 'auto', fontSize: '12.5px', padding: '7px 10px' }}
                  >
                    <option value="name_asc">Nama (A - Z)</option>
                    <option value="name_desc">Nama (Z - A)</option>
                    <option value="type_asc">Kategori Kurikulum</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(['ALL', ...SUBJECT_TYPES] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedSubjectTypeFilter(t)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: selectedSubjectTypeFilter === t ? 'var(--primary)' : '#d0d7de',
                        background: selectedSubjectTypeFilter === t ? '#1e3863' : '#ffffff',
                        color: selectedSubjectTypeFilter === t ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {t === 'ALL' ? 'Semua Kategori' : t}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowAddSubject(!showAddSubject)}
                className="btn btn-primary"
                style={{ padding: '9px 18px', fontSize: '13px' }}
              >
                {showAddSubject ? '✕ Tutup Formulir' : '+ Tambah Mapel / Kegiatan'}
              </button>
            </div>

            {/* Add Subject Collapsible Form Card */}
            {showAddSubject && (
              <div
                className="glass-card page-enter"
                style={{
                  padding: 'clamp(16px, 3vw, 24px)',
                  marginBottom: '24px',
                  border: '1px solid #e4e6eb',
                  background: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '18px' }}>✨</span>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                    Tambah Mata Pelajaran / Kegiatan Baru
                  </h3>
                </div>

                <form onSubmit={handleAddSubject}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: '16px',
                      marginBottom: '18px',
                    }}
                  >
                    <div>
                      <label className="input-label" htmlFor="subj_name">
                        Nama Mata Pelajaran / Kegiatan
                      </label>
                      <input
                        id="subj_name"
                        type="text"
                        className="input-field"
                        placeholder="Contoh: Bimbingan Konseling / Native Speaker / Scout..."
                        value={newSubject.name}
                        onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                        required
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="input-label" htmlFor="subj_type">
                        Tipe / Kategori Kurikulum
                      </label>
                      <select
                        id="subj_type"
                        className="input-field"
                        value={newSubject.type}
                        onChange={(e) =>
                          setNewSubject({ ...newSubject, type: e.target.value as SubjectType })
                        }
                        required
                      >
                        <option value="Intrakurikuler">📚 1. Intrakurikuler (Mata Pelajaran Pokok)</option>
                        <option value="Kokurikuler">🔭 2. Kokurikuler (Observation, Native Speaker, dll)</option>
                        <option value="Ekstrakurikuler">🎨 3. Ekstrakurikuler (Scout, Football, Painting, dll)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddSubject(false)}
                      className="btn btn-secondary"
                      disabled={addingSubject}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={addingSubject}
                      style={{ padding: '10px 22px' }}
                    >
                      {addingSubject ? (
                        <>
                          <Spinner /> Menyimpan...
                        </>
                      ) : (
                        '+ Simpan Mapel / Kegiatan'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Subjects Table */}
            {loading ? (
              <PageLoader text="Memuat daftar mata pelajaran & kegiatan..." />
            ) : (
              <div className="glass-card table-scroll-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>No</th>
                      <th>Nama Mata Pelajaran / Kegiatan</th>
                      <th>Kategori Kurikulum</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubjects.map((s, index) => {
                      const cfg = SUBJECT_TYPE_CONFIG[s.type] || SUBJECT_TYPE_CONFIG['Intrakurikuler'];
                      return (
                        <tr key={s.subject_id}>
                          <td style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>
                            {index + 1}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{cfg.icon}</span>
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                                {s.name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${cfg.badgeClass}`}>
                              {cfg.label}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-present">
                              <span className="badge-dot" /> Aktif
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setEditingSubject({ ...s })}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '5px 12px', fontSize: '11.5px' }}
                                title="Edit mata pelajaran / kegiatan ini"
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteConfirm({
                                    type: 'subject',
                                    id: s.subject_id,
                                    name: s.name,
                                  })
                                }
                                className="btn btn-danger btn-sm"
                                style={{ padding: '5px 12px', fontSize: '11.5px' }}
                                title="Hapus mata pelajaran / kegiatan ini"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredSubjects.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            padding: '36px',
                          }}
                        >
                          Tidak ada mata pelajaran atau kegiatan yang cocok dengan filter pencarian.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            EDIT USER MODAL (Admin Only)
           ========================================================= */}
        {editingUser && (
          <div className="modal-overlay">
            <div className="modal-card page-enter">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: '#eef3fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  ✏️
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Edit Akun Pengguna
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    ID: {editingUser.user_id}
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpdateUser}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                  <div>
                    <label className="input-label">Nama Pengguna (Username)</label>
                    <input
                      className="input-field"
                      value={editingUser.username}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, username: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="input-label">
                      Kata Sandi Baru{' '}
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                        (Kosongkan jika tidak ingin diubah)
                      </span>
                    </label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="Masukkan kata sandi baru..."
                      value={editingUser.password || ''}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, password: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="input-label">Peran Pengguna (Role)</label>
                    <select
                      className="input-field"
                      value={editingUser.role}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, role: e.target.value as UserRole })
                      }
                    >
                      <option value="Admin">Admin</option>
                      <option value="Teacher">Kepala Sekolah / Guru</option>
                      <option value="PIC">Ketua Kelas / Sekertaris Kelas</option>
                    </select>
                  </div>

                  {editingUser.role !== 'Admin' && (
                    <div>
                      <label className="input-label">Penugasan Rombel / Kelas</label>
                      <input
                        className="input-field"
                        placeholder="Contoh: X TKJ 1 atau ALL"
                        value={editingUser.assigned_class}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, assigned_class: e.target.value })
                        }
                        required
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="btn btn-secondary"
                    disabled={savingUserEdit}
                    style={{ flex: 1 }}
                  >
                    Batalkan
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingUserEdit}
                    style={{ flex: 1 }}
                  >
                    {savingUserEdit ? (
                      <>
                        <Spinner /> Menyimpan...
                      </>
                    ) : (
                      'Simpan Perubahan'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================
            EDIT STUDENT MODAL (Admin & Teacher)
           ========================================================= */}
        {editingStudent && (
          <div className="modal-overlay">
            <div className="modal-card page-enter">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: '#eef3fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  ✏️
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Edit Data Induk Siswa
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    ID: {editingStudent.student_id}
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpdateStudent}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                  <div>
                    <label className="input-label">Nama Lengkap Siswa</label>
                    <input
                      className="input-field"
                      value={editingStudent.full_name}
                      onChange={(e) =>
                        setEditingStudent({ ...editingStudent, full_name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="input-label">Rombongan Belajar (Kelas)</label>
                    <input
                      className="input-field"
                      value={editingStudent.class_name}
                      onChange={(e) =>
                        setEditingStudent({ ...editingStudent, class_name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="input-label">Status Keaktifan Siswa</label>
                    <select
                      className="input-field"
                      value={editingStudent.is_active?.toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE'}
                      onChange={(e) =>
                        setEditingStudent({ ...editingStudent, is_active: e.target.value })
                      }
                    >
                      <option value="TRUE">🟢 Aktif (Mengikuti Pembelajaran)</option>
                      <option value="FALSE">🔴 Nonaktif (Mutasi / Lulus / Keluar)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setEditingStudent(null)}
                    className="btn btn-secondary"
                    disabled={savingStudentEdit}
                    style={{ flex: 1 }}
                  >
                    Batalkan
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingStudentEdit}
                    style={{ flex: 1 }}
                  >
                    {savingStudentEdit ? (
                      <>
                        <Spinner /> Menyimpan...
                      </>
                    ) : (
                      'Simpan Perubahan'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================
            EDIT SUBJECT MODAL (Admin Only)
           ========================================================= */}
        {editingSubject && (
          <div className="modal-overlay">
            <div className="modal-card page-enter">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: '#eef3fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  ✏️
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Edit Mata Pelajaran / Kegiatan
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    ID: {editingSubject.subject_id}
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpdateSubject}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                  <div>
                    <label className="input-label">Nama Mata Pelajaran / Kegiatan</label>
                    <input
                      className="input-field"
                      value={editingSubject.name}
                      onChange={(e) =>
                        setEditingSubject({ ...editingSubject, name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="input-label">Tipe / Kategori Kurikulum</label>
                    <select
                      className="input-field"
                      value={editingSubject.type}
                      onChange={(e) =>
                        setEditingSubject({
                          ...editingSubject,
                          type: e.target.value as SubjectType,
                        })
                      }
                      required
                    >
                      <option value="Intrakurikuler">📚 1. Intrakurikuler (Mata Pelajaran Pokok)</option>
                      <option value="Kokurikuler">🔭 2. Kokurikuler (Observation, Native Speaker, dll)</option>
                      <option value="Ekstrakurikuler">🎨 3. Ekstrakurikuler (Scout, Football, Painting, dll)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setEditingSubject(null)}
                    className="btn btn-secondary"
                    disabled={savingSubjectEdit}
                    style={{ flex: 1 }}
                  >
                    Batalkan
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingSubjectEdit}
                    style={{ flex: 1 }}
                  >
                    {savingSubjectEdit ? (
                      <>
                        <Spinner /> Menyimpan...
                      </>
                    ) : (
                      'Simpan Perubahan'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog Modal */}
        {deleteConfirm && (
          <div className="modal-overlay">
            <div className="modal-card page-enter" style={{ maxWidth: '420px' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: '#fee8e8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    margin: '0 auto 12px',
                  }}
                >
                  ⚠️
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  Konfirmasi Penghapusan Data
                </h3>
                <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Apakah Anda yakin ingin menghapus{' '}
                  {deleteConfirm.type === 'user'
                    ? 'akun pengguna'
                    : deleteConfirm.type === 'student'
                    ? 'data siswa'
                    : 'mata pelajaran / kegiatan'}{' '}
                  <strong>&quot;{deleteConfirm.name}&quot;</strong>? Tindakan ini akan menghapus data secara permanen dari basis data Google Sheets.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="btn btn-secondary"
                  disabled={deleting}
                  style={{ flex: 1 }}
                >
                  Batalkan
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="btn btn-danger"
                  disabled={deleting}
                  style={{ flex: 1 }}
                >
                  {deleting ? (
                    <>
                      <Spinner /> Menghapus...
                    </>
                  ) : (
                    'Ya, Hapus Data'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function AdminPage() {
  return (
    <ToastProvider>
      <AdminContent />
    </ToastProvider>
  );
}
