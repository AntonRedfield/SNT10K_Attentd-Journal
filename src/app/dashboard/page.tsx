'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { ToastProvider, useToast } from '@/components/Toast';
import { Spinner } from '@/components/Spinner';
import { PageLoader } from '@/components/PageLoader';
import { SessionPayload, ROLE_LABELS, normalizeRole } from '@/lib/constants';
import { CalendarIcon, SettingsIcon } from '@/components/Icons';

function DashboardContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          router.push('/');
          return;
        }
        setUser(data.user);
      })
      .catch(() => router.push('/'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleSetup = async () => {
    setSetupLoading(true);
    try {
      const res = await fetch('/api/setup', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        showToast('Inisialisasi sistem berhasil dijalankan!', 'success');
      } else {
        showToast(data.error || 'Gagal menjalankan inisialisasi sistem', 'error');
      }
    } catch {
      showToast('Terjadi kendala jaringan saat inisialisasi', 'error');
    } finally {
      setSetupLoading(false);
    }
  };

  if (loading || !user) return <PageLoader text="Memuat dasbor pengguna..." />;

  const currentRole = normalizeRole(user.role);
  const roleLabel = ROLE_LABELS[currentRole] || user.role;
  const isAssignedAll = !user.assigned_class || user.assigned_class.toUpperCase() === 'ALL';

  const menuItems = [
    {
      title: 'Presensi Siswa',
      subtitle: 'Pencatatan Kehadiran',
      description: 'Rekam dan tinjau status kehadiran harian siswa (Hadir, Sakit, Izin, Alpa) secara real-time.',
      icon: '✅',
      path: '/attendance',
      gradient: 'linear-gradient(135deg, #1e3863 0%, #2d518d 100%)',
      accentColor: '#1e3863',
      roles: ['Admin', 'Teacher', 'PIC'],
    },
    {
      title: 'Presensi Guru & Pegawai',
      subtitle: 'Swafoto & Geolokasi GPS',
      description: 'Lakukan presensi kehadiran pendidik harian menggunakan swafoto (selfie) dan pelacakan koordinat GPS otomatis.',
      icon: '📸',
      path: '/teacher-attendance',
      gradient: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
      accentColor: '#be123c',
      roles: ['Admin', 'Teacher'],
    },
    {
      title: 'Jurnal Mengajar',
      subtitle: 'Agenda Pembelajaran',
      description: 'Kelola agenda kegiatan belajar mengajar mingguan, materi pokok, dan topik pembelajaran kelas.',
      icon: '📖',
      path: '/journal',
      gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
      accentColor: '#0284c7',
      roles: ['Admin', 'Teacher'],
    },
    {
      title: currentRole === 'Admin' ? 'Panel Administrator' : 'Data Induk & Kurikulum',
      subtitle: currentRole === 'Admin' ? 'Pengelolaan Sistem' : 'Kelola Siswa & Mapel',
      description:
        currentRole === 'Admin'
          ? 'Manajemen akun pengguna, master data siswa per kelas, dan kurikulum mapel / kegiatan.'
          : 'Tambah, edit, dan kelola data induk siswa serta kurikulum mata pelajaran/kegiatan.',
      icon: currentRole === 'Admin' ? '⚙️' : '🎓',
      path: '/admin',
      gradient: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
      accentColor: '#1b5e20',
      roles: ['Admin', 'Teacher'],
    },
    {
      title: 'Rekap & Cetak Laporan PDF',
      subtitle: 'Dokumen & PDF Siap Cetak',
      description: 'Rekapitulasi presensi dan agenda jurnal bulanan / semester dengan tata letak hemat tinta dan kop resmi.',
      icon: '📄',
      path: '/recap',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
      accentColor: '#6d28d9',
      roles: ['Admin', 'Teacher', 'PIC'],
    },
  ];

  const visibleItems = menuItems.filter((item) => item.roles.includes(currentRole));

  const todayFormatted = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <Navbar user={user} />

      <main className="container-app page-enter" style={{ paddingTop: '20px', paddingBottom: '40px' }}>
        {/* Welcome Section */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#1e3863',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                background: '#eef3fa',
                padding: '3px 9px',
                borderRadius: '6px',
                border: '1px solid rgba(30, 56, 99, 0.2)',
              }}
            >
              Dasbor Terpadu
            </span>
          </div>
          <h1
            style={{
              fontSize: 'clamp(18px, 4vw, 24px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              marginBottom: '4px',
            }}
          >
            Selamat Datang, {user.username} 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
            {user.role === 'Admin'
              ? 'Anda memiliki akses penuh untuk mengelola data presensi, jurnal, siswa, mata pelajaran, dan akun pengguna.'
              : `Kelola presensi dan kegiatan pembelajaran untuk rombongan belajar kelas ${user.assigned_class}.`}
          </p>
        </div>

        {/* Overview Stats Bar */}
        <div
          className="glass-card"
          style={{
            padding: '14px 16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            background: '#ffffff',
            border: '1px solid #e4e6eb',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: '#eef3fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1e3863',
                flexShrink: 0,
              }}
            >
              <CalendarIcon size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Hari &amp; Tanggal
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {todayFormatted}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div
              style={{
                background: '#f0f2f5',
                padding: '5px 10px',
                borderRadius: '6px',
                border: '1px solid #e4e6eb',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              {roleLabel}
            </div>
            <div
              style={{
                background: '#eef3fa',
                padding: '5px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(30, 56, 99, 0.2)',
                fontSize: '12px',
                fontWeight: 700,
                color: '#1e3863',
              }}
            >
              {isAssignedAll ? 'Semua Kelas' : `Kelas ${user.assigned_class}`}
            </div>
          </div>
        </div>

        {/* Feature Navigation Grid */}
        <div style={{ marginBottom: '14px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Menu Utama
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {visibleItems.map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className="glass-card glass-card-interactive"
              style={{
                padding: '22px',
                textAlign: 'left',
                border: '1px solid #e4e6eb',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '185px',
                background: '#ffffff',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: item.gradient,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      color: '#ffffff',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                    }}
                  >
                    {item.icon}
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      color: item.accentColor,
                      fontWeight: 700,
                      background: `${item.accentColor}14`,
                      padding: '4px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    {item.subtitle}
                  </span>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {item.description}
                </p>
              </div>

              <div
                style={{
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid #e4e6eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#1e3863',
                }}
              >
                <span>Buka Modul</span>
                <span>➔</span>
              </div>
            </button>
          ))}
        </div>

        {/* Admin Tools Section */}
        {user.role === 'Admin' && (
          <div
            className="glass-card"
            style={{
              padding: '18px',
              border: '1px solid #e4e6eb',
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ color: '#1e3863', display: 'flex', alignItems: 'center' }}>
                <SettingsIcon size={18} />
              </span>
              <h3 style={{ fontSize: '14px', fontWeight: 700 }}>
                Inisialisasi &amp; Sinkronisasi Google Sheets
              </h3>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
              Perbarui struktur tab lembar kerja Google Sheets dan sinkronkan data awal sistem.
            </p>
            <button
              onClick={handleSetup}
              className="btn btn-secondary btn-sm"
              disabled={setupLoading}
              style={{ width: '100%' }}
            >
              {setupLoading ? (
                <>
                  <Spinner /> Menjalankan...
                </>
              ) : (
                'Jalankan Inisialisasi Lembar Kerja'
              )}
            </button>
          </div>
        )}
      </main>
    </>
  );
}

export default function DashboardPage() {
  return (
    <ToastProvider>
      <DashboardContent />
    </ToastProvider>
  );
}
