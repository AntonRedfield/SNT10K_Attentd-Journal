'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/Spinner';
import {
  getStoredFastLoginProfile,
  saveFastLoginProfile,
  clearStoredFastLoginProfile,
  isBiometricAvailable,
  getBiometricPlatformLabel,
  getBiometricAssertion,
  FastLoginStoredProfile,
} from '@/lib/webauthn';
import { ROLE_LABELS, normalizeRole } from '@/lib/constants';

export default function LoginPage() {
  const router = useRouter();

  // Login mode: 'fast' | 'standard'
  const [loginMode, setLoginMode] = useState<'fast' | 'standard'>('standard');
  const [fastProfile, setFastProfile] = useState<FastLoginStoredProfile | null>(null);

  // Standard Login states
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // PIN Login states
  const [pin, setPin] = useState('');

  // Biometric states
  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null);
  const [bioLabel, setBioLabel] = useState('Biometrik (Sidik Jari / Face ID)');

  // Status & loading
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    // Check device biometric support
    isBiometricAvailable().then((supported) => {
      setBioAvailable(supported);
      setBioLabel(getBiometricPlatformLabel());
    });

    // Check if device has stored fast login profile
    const stored = getStoredFastLoginProfile();
    if (stored) {
      if (stored.has_pin || stored.has_biometric) {
        setFastProfile(stored);
        setLoginMode('fast');
      }

      // Automatically sync latest status with server in background
      if (stored.user_id) {
        fetch(`/api/auth/fast-login?user_id=${encodeURIComponent(stored.user_id)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data && !data.error) {
              const updatedProfile: FastLoginStoredProfile = {
                ...stored,
                username: data.username || stored.username,
                role: data.role || stored.role,
                assigned_class: data.assigned_class || stored.assigned_class,
                has_pin: !!data.has_pin,
                has_biometric: !!data.has_biometric,
                biometric_credential_id: data.biometric_credential_id || stored.biometric_credential_id,
              };
              saveFastLoginProfile(updatedProfile);
              if (updatedProfile.has_pin || updatedProfile.has_biometric) {
                setFastProfile(updatedProfile);
                setLoginMode('fast');
              }
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  // 1. Standard ID + Password Login
  const handleStandardLogin = async (e: React.FormEvent) => {
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

      // Save user to device profile safely
      if (data.user) {
        const stored = getStoredFastLoginProfile();
        const isSameUser = stored && stored.user_id === data.user.user_id;

        const hasPin = data.has_pin !== undefined ? !!data.has_pin : (isSameUser ? !!stored?.has_pin : false);
        const hasBio = data.has_biometric !== undefined ? !!data.has_biometric : (isSameUser ? !!stored?.has_biometric : false);
        const bioCredId = data.biometric_credential_id || (isSameUser ? stored?.biometric_credential_id : undefined);

        saveFastLoginProfile({
          user_id: data.user.user_id,
          username: data.user.username,
          role: data.user.role,
          assigned_class: data.user.assigned_class,
          has_pin: hasPin,
          has_biometric: hasBio,
          biometric_credential_id: bioCredId,
        });
      }

      router.push('/dashboard');
    } catch {
      setError('Terjadi kendala jaringan. Silakan periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  // 2. PIN Fast Login
  const handlePinLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fastProfile?.user_id || !pin) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/fast-login/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: fastProfile.user_id,
          pin: pin.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'PIN yang Anda masukkan salah.');
        setPin('');
        return;
      }

      // Update profile timestamp
      saveFastLoginProfile({
        ...fastProfile,
        has_pin: true,
      });

      router.push('/dashboard');
    } catch {
      setError('Gagal menghubungi server untuk verifikasi PIN.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Biometric Fast Login (Face ID / Fingerprint / Touch ID / Windows Hello)
  const handleBiometricLogin = async () => {
    if (!fastProfile?.user_id) return;
    setError('');
    setBioLoading(true);

    try {
      // 1. Get challenge
      const chRes = await fetch('/api/auth/fast-login/biometric');
      const { challenge, error: chErr } = await chRes.json();
      if (chErr || !challenge) {
        throw new Error(chErr || 'Gagal memperoleh challenge verifikasi.');
      }

      // 2. Get credential ID from profile or fetch from status
      let credId = fastProfile.biometric_credential_id;
      if (!credId) {
        const stRes = await fetch(`/api/auth/fast-login?user_id=${encodeURIComponent(fastProfile.user_id)}`);
        const stData = await stRes.json();
        credId = stData.biometric_credential_id;
      }

      if (!credId) {
        throw new Error('Kredensial biometrik belum terdaftar pada akun ini.');
      }

      // 3. Trigger native biometric prompt
      const assertion = await getBiometricAssertion(credId, challenge);

      // 4. Verify assertion on server
      const verRes = await fetch('/api/auth/fast-login/biometric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          user_id: fastProfile.user_id,
          credential_id: assertion.id,
          client_data_json: assertion.clientDataJSON,
          authenticator_data: assertion.authenticatorData,
          signature: assertion.signature,
        }),
      });

      const verData = await verRes.json();
      if (!verRes.ok || !verData.success) {
        throw new Error(verData.error || 'Verifikasi biometrik tidak berhasil.');
      }

      // Update stored profile
      saveFastLoginProfile({
        ...fastProfile,
        has_biometric: true,
        biometric_credential_id: credId,
      });

      router.push('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('dibatalkan') || msg.includes('canceled') || msg.includes('NotAllowedError')) {
        setError('Otentikasi biometrik dibatalkan. Anda tetap dapat masuk dengan PIN atau Kata Sandi.');
      } else {
        setError(msg || 'Sensor biometrik tidak dapat diakses saat ini.');
      }
    } finally {
      setBioLoading(false);
    }
  };

  // Switch to different account / reset fast profile
  const handleSwitchAccount = () => {
    clearStoredFastLoginProfile();
    setFastProfile(null);
    setLoginMode('standard');
    setUserId('');
    setPassword('');
    setPin('');
    setError('');
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
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
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
                height: '180px',
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

        {/* ======================================================== */}
        {/* VIEW 1: FAST LOGIN (PIN & BIOMETRICS) */}
        {/* ======================================================== */}
        {loginMode === 'fast' && fastProfile && (
          <div>
            {/* Stored User Profile Badge */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1e3863, #3b82f6)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '16px',
                  }}
                >
                  {fastProfile.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e3863' }}>
                    {fastProfile.username}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {ROLE_LABELS[normalizeRole(fastProfile.role)] || fastProfile.role || 'Pengguna'}
                    {fastProfile.assigned_class && fastProfile.assigned_class !== 'ALL' && ` • Kelas ${fastProfile.assigned_class}`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSwitchAccount}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                Ganti Akun
              </button>
            </div>

            {/* Option A: Biometric Login (If enabled and supported) */}
            {fastProfile.has_biometric && (
              <div style={{ marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={bioLoading || loading}
                  className="btn btn-primary btn-lg"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '15px',
                    fontWeight: 700,
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #1e3863 0%, #2563eb 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  {bioLoading ? (
                    <>
                      <Spinner /> Membaca Sensor...
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '20px' }}>👆</span> Masuk dengan {bioLabel}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Divider if both Biometric and PIN exist */}
            {fastProfile.has_biometric && fastProfile.has_pin && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '16px 0',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                <span style={{ padding: '0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  atau gunakan PIN
                </span>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              </div>
            )}

            {/* Option B: PIN Login */}
            {fastProfile.has_pin && (
              <form onSubmit={handlePinLogin} style={{ marginBottom: '16px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label" htmlFor="login-pin" style={{ textAlign: 'center' }}>
                    Masukkan PIN Masuk Cepat (6 Digit)
                  </label>
                  <input
                    id="login-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    className="input-field"
                    placeholder="● ● ● ● ● ●"
                    value={pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setPin(val);
                      if (val.length === 6) {
                        // Auto-submit on 6th digit entered
                        setTimeout(() => {
                          setLoading(true);
                          fetch('/api/auth/fast-login/verify-pin', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              user_id: fastProfile.user_id,
                              pin: val,
                            }),
                          })
                            .then((r) => r.json())
                            .then((data) => {
                              if (data.success) {
                                router.push('/dashboard');
                              } else {
                                setError(data.error || 'PIN yang Anda masukkan salah.');
                                setPin('');
                                setLoading(false);
                              }
                            })
                            .catch(() => {
                              setError('Gagal menghubungi server.');
                              setLoading(false);
                            });
                        }, 200);
                      }
                    }}
                    autoFocus
                    style={{
                      textAlign: 'center',
                      fontSize: '22px',
                      letterSpacing: '8px',
                      fontWeight: 800,
                      padding: '12px',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading || pin.length < 4}
                  style={{ width: '100%', fontSize: '15px', borderRadius: '10px' }}
                >
                  {loading ? (
                    <>
                      <Spinner /> Memverifikasi PIN...
                    </>
                  ) : (
                    'Masuk dengan PIN'
                  )}
                </button>
              </form>
            )}

            {/* Switch to standard password login */}
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => {
                  setLoginMode('standard');
                  setUserId(fastProfile.username || fastProfile.user_id);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1e3863',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: '6px',
                }}
              >
                🔑 Masuk dengan Kata Sandi Biasa
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: STANDARD LOGIN (USER ID & PASSWORD) */}
        {/* ======================================================== */}
        {loginMode === 'standard' && (
          <div>
            <form onSubmit={handleStandardLogin}>
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

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
                style={{ width: '100%', marginBottom: '14px', fontSize: '15px', borderRadius: '8px' }}
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

            {/* Link to Fast Login if profile is present */}
            {fastProfile && (fastProfile.has_pin || fastProfile.has_biometric) ? (
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('fast');
                    setError('');
                  }}
                  style={{
                    background: '#f0f7ff',
                    border: '1px solid #bae6fd',
                    color: '#0369a1',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  ⚡ Beralih ke Masuk Cepat ({fastProfile.username})
                </button>
              </div>
            ) : (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  textAlign: 'center',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginBottom: '14px',
                }}
              >
                💡 <strong>Masuk Cepat:</strong> PIN 6-digit &amp; Sidik Jari/Face ID dapat diaktifkan setelah Anda masuk.
              </div>
            )}
          </div>
        )}

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
