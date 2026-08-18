'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SessionPayload, ROLE_LABELS, normalizeRole } from '@/lib/constants';
import { Spinner } from '@/components/Spinner';
import { SettingsIcon, LogoutIcon, LockIcon } from '@/components/Icons';

interface NavbarProps {
  user: SessionPayload;
}

export default function Navbar({ user: initialUser }: NavbarProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionPayload>(initialUser);
  const [showEditModal, setShowEditModal] = useState(false);
  const [username, setUsername] = useState(initialUser.username);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed to redirect anyway
    }
    router.push('/');
  };

  const handleOpenEdit = () => {
    setUsername(currentUser.username);
    setPassword('');
    setConfirmPassword('');
    setShowPasswordFields(false);
    setError('');
    setSuccess('');
    setShowEditModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim()) {
      setError('Nama pengguna (username) tidak boleh kosong.');
      return;
    }

    if (password && password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok dengan kata sandi baru.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim() ? password.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal memperbarui profil pengguna.');
        return;
      }

      setSuccess('Profil akun Anda berhasil diperbarui!');
      if (data.user) {
        setCurrentUser(data.user);
      }

      // Briefly wait to show success message then close and refresh
      setTimeout(() => {
        setShowEditModal(false);
        router.refresh();
      }, 1000);
    } catch {
      setError('Terjadi kendala jaringan saat menyimpan perubahan profil.');
    } finally {
      setSaving(false);
    }
  };

  const currentRole = normalizeRole(currentUser.role);
  const roleLabel = ROLE_LABELS[currentRole] || currentUser.role;
  const roleBadgeClass =
    currentRole === 'Admin'
      ? 'badge-admin'
      : currentRole === 'Teacher'
      ? 'badge-teacher'
      : 'badge-pic';

  return (
    <>
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: '#ffffff',
          borderBottom: '1px solid #e4e6eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          className="container-app"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '56px',
            padding: '8px 0',
          }}
        >
          {/* Logo / Brand */}
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              minWidth: 0,
              flexShrink: 1,
            }}
          >
            <img
              src="/logo-snt.png"
              alt="Logo SNT Kemendikdasmen"
              className="navbar-logo"
              style={{
                height: '36px',
                width: 'auto',
                objectFit: 'contain',
                display: 'block',
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                className="navbar-brand-title"
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#1e3863',
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap',
                }}
              >
                SNT 10 Kupang
              </div>
              <div
                className="hide-mobile"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                }}
              >
                Presensi &amp; Jurnal Kelas
              </div>
            </div>
          </button>

          {/* User Info Bar (Gear | Username | Role) + Logout Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* Unified User Info Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '4px 10px',
                gap: '8px',
              }}
            >
              {/* 1. Gear Logo Button */}
              <button
                type="button"
                onClick={handleOpenEdit}
                title="Edit informasi akun saya"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#1e3863',
                  transition: 'all var(--transition)',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <SettingsIcon size={15} />
              </button>

              {/* Vertical Divider */}
              <div style={{ width: '1px', height: '16px', background: '#cbd5e1', flexShrink: 0 }} />

              {/* 2. Username */}
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  maxWidth: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={currentUser.username}
              >
                {currentUser.username}
              </div>

              {/* Vertical Divider */}
              <div style={{ width: '1px', height: '16px', background: '#cbd5e1', flexShrink: 0 }} />

              {/* 3. Role */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <span className={`badge ${roleBadgeClass}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                  <span className="badge-dot" />
                  {roleLabel}
                </span>
                {currentUser.assigned_class && currentUser.assigned_class.toUpperCase() !== 'ALL' && (
                  <span
                    className="hide-mobile"
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      background: '#ffffff',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    {currentUser.assigned_class}
                  </span>
                )}
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="btn btn-secondary btn-sm"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '8px',
                whiteSpace: 'nowrap',
              }}
              title="Keluar dari sesi saat ini"
            >
              <span className="hide-mobile">Keluar</span>
              <LogoutIcon size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* Quick Edit Profile Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-card page-enter" style={{ maxWidth: '440px' }}>
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
                  color: '#1e3863',
                }}
              >
                <SettingsIcon size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit Informasi Akun
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Perbarui nama pengguna atau ganti kata sandi Anda
                </p>
              </div>
            </div>

            {/* Account Metadata Overview */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#f0f2f5',
                border: '1px solid #e4e6eb',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '6px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Hak Akses
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e3863' }}>
                  {roleLabel}
                </div>
              </div>
              {currentUser.assigned_class && currentUser.assigned_class.toUpperCase() !== 'ALL' && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Penugasan Rombel
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Kelas {currentUser.assigned_class}
                  </div>
                </div>
              )}
            </div>

            {/* Error & Success Banners */}
            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#fee8e8',
                  border: '1px solid #fa383e',
                  color: '#c9252d',
                  fontSize: '12.5px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>⚠️</span>
                <div>{error}</div>
              </div>
            )}

            {success && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#e7f8ec',
                  border: '1px solid #42b72a',
                  color: '#1b7a37',
                  fontSize: '12.5px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>✓</span>
                <div>{success}</div>
              </div>
            )}

            <form onSubmit={handleSaveProfile}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label className="input-label" htmlFor="edit-username">
                    Nama Pengguna (Username)
                  </label>
                  <input
                    id="edit-username"
                    type="text"
                    className="input-field"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="Masukkan nama pengguna..."
                  />
                </div>

                {!showPasswordFields ? (
                  <button
                    type="button"
                    onClick={() => setShowPasswordFields(true)}
                    style={{
                      background: 'none',
                      border: '1px dashed #cbd5e1',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      color: '#1e3863',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <LockIcon size={14} /> Ingin Mengganti Kata Sandi? Klik di sini
                  </button>
                ) : (
                  <>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="input-label" htmlFor="edit-password" style={{ margin: 0 }}>
                          Kata Sandi Baru
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasswordFields(false);
                            setPassword('');
                            setConfirmPassword('');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '11.5px',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          ✕ Batal Ganti Kata Sandi
                        </button>
                      </div>
                      <input
                        id="edit-password"
                        type="password"
                        className="input-field"
                        placeholder="Masukkan kata sandi baru..."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="input-label" htmlFor="edit-confirm-password">
                        Konfirmasi Kata Sandi Baru
                      </label>
                      <input
                        id="edit-confirm-password"
                        type="password"
                        className="input-field"
                        placeholder="Ulangi kata sandi baru..."
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary"
                  disabled={saving}
                  style={{ flex: 1 }}
                >
                  Batalkan
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ flex: 1 }}
                >
                  {saving ? (
                    <>
                      <Spinner /> Menyimpan...
                    </>
                  ) : (
                    'Simpan Profil'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
