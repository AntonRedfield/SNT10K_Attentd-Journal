'use client';

import { useState, useEffect } from 'react';
import { Spinner } from '@/components/Spinner';
import {
  isBiometricAvailable,
  getBiometricPlatformLabel,
  createBiometricCredential,
  saveFastLoginProfile,
  getStoredFastLoginProfile,
} from '@/lib/webauthn';
import { SessionPayload } from '@/lib/constants';

interface FastLoginSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: SessionPayload & { has_pin?: boolean; has_biometric?: boolean };
  onUpdated?: () => void;
}

export function FastLoginSetupModal({
  isOpen,
  onClose,
  user,
  onUpdated,
}: FastLoginSetupModalProps) {
  const [activeTab, setActiveTab] = useState<'pin' | 'biometric'>('pin');
  
  // PIN state
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [hasPin, setHasPin] = useState(user.has_pin || false);

  // Biometric state
  const [bioSupported, setBioSupported] = useState<boolean | null>(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [hasBio, setHasBio] = useState(user.has_biometric || false);
  const [bioLabel, setBioLabel] = useState('Biometrik (Sidik Jari / Face ID)');

  // Messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setSuccess('');
    setPin('');
    setConfirmPin('');
    setHasPin(user.has_pin || false);
    setHasBio(user.has_biometric || false);

    setBioLabel(getBiometricPlatformLabel());
    isBiometricAvailable().then((supported) => {
      setBioSupported(supported);
      if (supported && !user.has_pin && !user.has_biometric) {
        // Default to biometric tab if supported and none configured
        setActiveTab('biometric');
      }
    });

    // Check status from server
    fetch(`/api/auth/fast-login?user_id=${encodeURIComponent(user.user_id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setHasPin(!!data.has_pin);
          setHasBio(!!data.has_biometric);
        }
      })
      .catch(() => {});
  }, [isOpen, user]);

  if (!isOpen) return null;

  // Handle saving PIN
  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setError('PIN harus berupa 4 hingga 8 digit angka.');
      return;
    }

    if (pin !== confirmPin) {
      setError('Konfirmasi PIN tidak cocok dengan PIN yang Anda masukkan.');
      return;
    }

    setPinLoading(true);
    try {
      const res = await fetch('/api/auth/fast-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal menyimpan PIN.');
        return;
      }

      setHasPin(true);
      setSuccess('PIN Masuk Cepat berhasil disimpan!');
      const currentProfile = getStoredFastLoginProfile();
      saveFastLoginProfile({
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        assigned_class: user.assigned_class,
        has_pin: true,
        has_biometric: currentProfile && currentProfile.user_id === user.user_id ? currentProfile.has_biometric : hasBio,
        biometric_credential_id: currentProfile && currentProfile.user_id === user.user_id ? currentProfile.biometric_credential_id : undefined,
      });

      onUpdated?.();
    } catch {
      setError('Terjadi kendala jaringan saat menyimpan PIN.');
    } finally {
      setPinLoading(false);
    }
  };

  // Handle removing PIN
  const handleRemovePin = async () => {
    if (!confirm('Apakah Anda yakin ingin menonaktifkan metode Masuk dengan PIN?')) return;

    setError('');
    setSuccess('');
    setPinLoading(true);
    try {
      const res = await fetch('/api/auth/fast-login?type=pin', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal menonaktifkan PIN.');
        return;
      }

      setHasPin(false);
      setPin('');
      setConfirmPin('');
      setSuccess('PIN Masuk Cepat telah dinonaktifkan.');

      const currentProfile = getStoredFastLoginProfile();
      if (currentProfile && currentProfile.user_id === user.user_id) {
        saveFastLoginProfile({
          ...currentProfile,
          has_pin: false,
        });
      }

      onUpdated?.();
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setPinLoading(false);
    }
  };

  // Handle registering Biometric (Sidik Jari / Face ID)
  const handleRegisterBiometric = async () => {
    setError('');
    setSuccess('');
    setBioLoading(true);

    try {
      // 1. Get challenge from server
      const chRes = await fetch('/api/auth/fast-login/biometric');
      const { challenge, error: chErr } = await chRes.json();
      if (chErr || !challenge) {
        throw new Error(chErr || 'Gagal memperoleh token challenge biometrik.');
      }

      // 2. Request platform authenticator creation (Touch ID, Face ID, Windows Hello, Fingerprint)
      const cred = await createBiometricCredential(user.user_id, user.username, challenge);

      // 3. Send credential ID to server
      const regRes = await fetch('/api/auth/fast-login/biometric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          credential_id: cred.credentialId,
          raw_id: cred.rawId,
        }),
      });

      const regData = await regRes.json();
      if (!regRes.ok || !regData.success) {
        throw new Error(regData.error || 'Gagal menyimpan data biometrik di server.');
      }

      setHasBio(true);
      setSuccess(`${bioLabel} berhasil didaftarkan untuk akun ini!`);

      // Update local storage
      const currentProfile = getStoredFastLoginProfile();
      saveFastLoginProfile({
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        assigned_class: user.assigned_class,
        has_pin: currentProfile && currentProfile.user_id === user.user_id ? (currentProfile.has_pin ?? hasPin) : hasPin,
        has_biometric: true,
        biometric_credential_id: cred.credentialId,
      });

      onUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('dibatalkan') || msg.includes('canceled') || msg.includes('NotAllowedError')) {
        setError('Pendaftaran biometrik dibatalkan oleh pengguna.');
      } else {
        setError(msg || 'Gagal mendaftarkan sensor biometrik perangkat.');
      }
    } finally {
      setBioLoading(false);
    }
  };

  // Handle removing Biometric
  const handleRemoveBiometric = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus pendaftaran biometrik pada perangkat ini?')) return;

    setError('');
    setSuccess('');
    setBioLoading(true);
    try {
      const res = await fetch('/api/auth/fast-login/biometric', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal menonaktifkan biometrik.');
        return;
      }

      setHasBio(false);
      setSuccess('Pendaftaran biometrik berhasil dihapus.');

      const currentProfile = getStoredFastLoginProfile();
      if (currentProfile && currentProfile.user_id === user.user_id) {
        saveFastLoginProfile({
          ...currentProfile,
          has_biometric: false,
          biometric_credential_id: undefined,
        });
      }

      onUpdated?.();
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setBioLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-card page-enter"
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '24px',
          borderRadius: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #1e3863, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '20px',
                boxShadow: '0 4px 12px rgba(30, 56, 99, 0.2)',
              }}
            >
              ⚡
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1e3863', margin: 0 }}>
                Pengaturan Masuk Cepat
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Login praktis via PIN 6-digit &amp; Biometrik
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Selection */}
        <div
          style={{
            display: 'flex',
            background: '#f1f5f9',
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '16px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('pin');
              setError('');
              setSuccess('');
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: '8px',
              background: activeTab === 'pin' ? '#ffffff' : 'transparent',
              color: activeTab === 'pin' ? '#1e3863' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: activeTab === 'pin' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            🔢 PIN Angka {hasPin && <span style={{ fontSize: '11px', color: '#10b981' }}>●</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('biometric');
              setError('');
              setSuccess('');
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: '8px',
              background: activeTab === 'biometric' ? '#ffffff' : 'transparent',
              color: activeTab === 'biometric' ? '#1e3863' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: activeTab === 'biometric' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            👆 Biometrik {hasBio && <span style={{ fontSize: '11px', color: '#10b981' }}>●</span>}
          </button>
        </div>

        {/* Error and Success alerts */}
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

        {/* TAB 1: PIN */}
        {activeTab === 'pin' && (
          <div>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Status PIN Masuk Cepat
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: hasPin ? '#16a34a' : '#64748b' }}>
                  {hasPin ? '✅ PIN Aktif' : '⚪ Belum Dikonfigurasi'}
                </div>
              </div>
              {hasPin && (
                <button
                  type="button"
                  onClick={handleRemovePin}
                  disabled={pinLoading}
                  style={{
                    background: 'none',
                    border: '1px solid #fca5a5',
                    color: '#dc2626',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Hapus PIN
                </button>
              )}
            </div>

            <form onSubmit={handleSavePin}>
              <div style={{ marginBottom: '14px' }}>
                <label className="input-label" htmlFor="fast-pin">
                  {hasPin ? 'Ganti PIN Baru (6 Digit Angka)' : 'Buat PIN Masuk Cepat (6 Digit Angka)'}
                </label>
                <input
                  id="fast-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  className="input-field"
                  placeholder="Masukkan 6 angka PIN..."
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="input-label" htmlFor="fast-confirm-pin">
                  Konfirmasi PIN Baru
                </label>
                <input
                  id="fast-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  className="input-field"
                  placeholder="Ulangi 6 angka PIN..."
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={pinLoading || !pin}
                  style={{ flex: 1 }}
                >
                  {pinLoading ? (
                    <>
                      <Spinner /> Menyimpan...
                    </>
                  ) : hasPin ? (
                    'Perbarui PIN'
                  ) : (
                    'Simpan PIN'
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: BIOMETRICS */}
        {activeTab === 'biometric' && (
          <div>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Sensor: {bioLabel}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: hasBio ? '#16a34a' : '#64748b' }}>
                  {hasBio ? '✅ Biometrik Aktif' : '⚪ Belum Didaftarkan'}
                </div>
              </div>
              {hasBio && (
                <button
                  type="button"
                  onClick={handleRemoveBiometric}
                  disabled={bioLoading}
                  style={{
                    background: 'none',
                    border: '1px solid #fca5a5',
                    color: '#dc2626',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Hapus Biometrik
                </button>
              )}
            </div>

            {bioSupported === false ? (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  color: '#92400e',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  marginBottom: '18px',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  ℹ️ Sensor Biometrik Tidak Tersedia
                </div>
                Perangkat atau browser ini belum mendukung sensor biometrik (WebAuthn). Anda tetap dapat menggunakan metode <strong>PIN 6-Digit</strong> atau <strong>ID &amp; Kata Sandi</strong> seperti biasa.
              </div>
            ) : (
              <div style={{ marginBottom: '18px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>
                  Gunakan sensor <strong>Sidik Jari (Fingerprint)</strong>, <strong>Face ID</strong>, atau <strong>Windows Hello</strong> di perangkat ini untuk masuk ke aplikasi tanpa perlu mengetik kata sandi lagi.
                </p>

                <button
                  type="button"
                  onClick={handleRegisterBiometric}
                  disabled={bioLoading}
                  className="btn btn-primary btn-lg"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    padding: '12px',
                    background: 'linear-gradient(135deg, #1e3863, #2563eb)',
                  }}
                >
                  {bioLoading ? (
                    <>
                      <Spinner /> Menunggu Verifikasi Sensor...
                    </>
                  ) : hasBio ? (
                    '🔄 Daftarkan Ulang Sensor Perangkat Ini'
                  ) : (
                    '👆 Aktifkan Sidik Jari / Face ID Sekarang'
                  )}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{ width: '100%' }}
              >
                Selesai / Tutup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
