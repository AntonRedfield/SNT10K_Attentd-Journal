'use client';

import { useState, useEffect } from 'react';
import {
  isFastLoginPromptDismissed,
  setFastLoginPromptDismissed,
  getBiometricPlatformLabel,
  isBiometricAvailable,
} from '@/lib/webauthn';
import { SessionPayload } from '@/lib/constants';

interface FastLoginPromptModalProps {
  user: SessionPayload & { has_pin?: boolean; has_biometric?: boolean };
  onOpenSetup: () => void;
}

export function FastLoginPromptModal({ user, onOpenSetup }: FastLoginPromptModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [bioLabel, setBioLabel] = useState('Sidik Jari & Face ID');
  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || !user.user_id) return;

    // Check if dismissed before
    if (isFastLoginPromptDismissed(user.user_id)) {
      return;
    }

    // Check if already has PIN or Biometrics
    if (user.has_pin || user.has_biometric) {
      return;
    }

    // Fetch latest status
    fetch(`/api/auth/fast-login?user_id=${encodeURIComponent(user.user_id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data || data.error) return;
        if (!data.has_pin && !data.has_biometric) {
          // Check biometric availability
          isBiometricAvailable().then((supported) => {
            setBioAvailable(supported);
            setBioLabel(getBiometricPlatformLabel());
            // Show prompt after slight delay for smooth page transition
            setTimeout(() => {
              setIsOpen(true);
            }, 700);
          });
        }
      })
      .catch(() => {});
  }, [user]);

  const handleDismiss = () => {
    setFastLoginPromptDismissed(user.user_id);
    setIsOpen(false);
  };

  const handleSetupNow = () => {
    setFastLoginPromptDismissed(user.user_id);
    setIsOpen(false);
    onOpenSetup();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div
        className="modal-card page-enter"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '28px 24px',
          borderRadius: '20px',
          background: '#ffffff',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.18)',
          textAlign: 'center',
        }}
      >
        {/* Animated Badge Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #1e3863 0%, #2563eb 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '30px',
            color: '#ffffff',
            boxShadow: '0 8px 20px rgba(37, 99, 235, 0.3)',
          }}
        >
          ⚡
        </div>

        <h3
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: '#1e3863',
            marginBottom: '8px',
            letterSpacing: '-0.02em',
          }}
        >
          Aktifkan Masuk Cepat?
        </h3>

        <p
          style={{
            fontSize: '13.5px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: '20px',
          }}
        >
          Masuk ke akun Anda di perangkat ini lebih praktis dan instan tanpa perlu mengetik ulang ID &amp; kata sandi setiap saat.
        </p>

        {/* Features Preview List */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '22px',
            textAlign: 'left',
          }}
        >
          {bioAvailable !== false && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>👆</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e3863' }}>
                  {bioLabel}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Otentikasi aman dalam 1 detik dengan sensor biometrik perangkat
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>🔢</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e3863' }}>
                PIN Angka 6 Digit
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Kombinasi angka rahasia cepat &amp; mudah diingat
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={handleSetupNow}
            className="btn btn-primary btn-lg"
            style={{
              width: '100%',
              fontSize: '14.5px',
              padding: '12px',
              borderRadius: '10px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #1e3863, #2563eb)',
            }}
          >
            ⚡ Setup Masuk Cepat Sekarang
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: 600,
              padding: '8px',
              cursor: 'pointer',
            }}
          >
            Nanti Saja
          </button>
        </div>
      </div>
    </div>
  );
}
