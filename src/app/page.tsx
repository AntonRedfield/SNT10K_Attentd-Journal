'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/Spinner';

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId.trim(), password: password.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        const fullMsg = data.details
          ? `${data.error} (Detail: ${data.details})`
          : data.error || 'ID Pengguna atau kata sandi tidak sesuai.';
        setError(fullMsg);
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Terjadi kendala jaringan. Silakan periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        background: '#f0f2f5',
      }}
    >
      <div
        className="glass-card page-enter"
        style={{
          width: '100%',
          maxWidth: '500px',
          padding: 'clamp(24px, 5vw, 40px) clamp(20px, 5vw, 36px)',
          background: '#ffffff',
          border: '1px solid #e4e6eb',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              padding: '0',
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
            }}
          >
            <img
              src="/logo-snt.png"
              alt="Logo SNT Kemendikdasmen"
              style={{
                height: '225px',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#1e3863',
              marginBottom: '4px',
            }}
          >
            SNT 10 Kupang
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: 1.4 }}>
            Sistem Informasi Presensi Siswa &amp; Jurnal Agenda Pembelajaran
          </p>
        </div>

        {/* Form Login */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label className="input-label" htmlFor="user_id">
              ID Pengguna (User ID)
            </label>
            <input
              id="user_id"
              type="text"
              className="input-field"
              placeholder="Contoh: ADM01 / U-001 / ID Akun..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="input-label" htmlFor="password">
                Kata Sandi (Password)
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1e3863',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontWeight: 600,
                }}
              >
                {showPassword ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className="input-field"
              placeholder="Masukkan kata sandi..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#fee8e8',
                border: '1px solid #fa383e',
                color: '#c9252d',
                fontSize: '13px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
              <div>{error}</div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%', marginBottom: '16px', fontSize: '15px', borderRadius: '8px' }}
          >
            {loading ? (
              <>
                <Spinner /> Memproses Masuk...
              </>
            ) : (
              'Masuk ke Aplikasi'
            )}
          </button>
        </form>

        {/* Footer info */}
        <div
          style={{
            textAlign: 'center',
            paddingTop: '16px',
            borderTop: '1px solid #e4e6eb',
          }}
        >
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Kemendikdasmen RI &bull; Sekolah Negeri Terintegrasi 10 Kupang
          </p>
        </div>
      </div>
    </div>
  );
}
