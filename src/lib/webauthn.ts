/**
 * WebAuthn & Fast Login utilities
 * Optimized for Windows (Windows Hello), macOS (Touch ID), iOS / iPadOS (Face ID / Touch ID), and Android biometrics.
 */

// Helper: Convert ArrayBuffer to Base64URL string
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper: Convert Base64URL string to Uint8Array
export function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check if WebAuthn and platform biometric authenticators are available on this device/browser.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;

  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return !!available;
    }
  } catch (e) {
    console.warn('Error checking platform authenticator:', e);
  }
  return false;
}

/**
 * Get friendly platform biometric name based on user agent (Windows, iOS, macOS, Android).
 */
export function getBiometricPlatformLabel(): string {
  if (typeof window === 'undefined') return 'Sidik Jari & Face ID';
  const ua = navigator.userAgent || navigator.vendor || '';

  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'Face ID / Touch ID (iOS & iPad)';
  }
  if (/Macintosh|Mac OS X/i.test(ua) && !('ontouchend' in document)) {
    return 'Touch ID (macOS)';
  }
  if (/Android/i.test(ua)) {
    return 'Sidik Jari / Face Unlock (Android)';
  }
  if (/Windows/i.test(ua)) {
    return 'Windows Hello (Sidik Jari / Face / PIN)';
  }
  return 'Biometrik (Sidik Jari / Face ID)';
}

export interface FastLoginStoredProfile {
  user_id: string;
  username: string;
  role?: string;
  assigned_class?: string;
  has_pin?: boolean;
  has_biometric?: boolean;
  biometric_credential_id?: string;
  last_login_timestamp?: number;
}

const FAST_LOGIN_STORAGE_KEY = 'snt10k_fast_login_profile';
const FAST_LOGIN_DISMISSED_KEY = 'snt10k_fast_login_dismissed_';

/**
 * Save fast login profile in local device storage
 */
export function saveFastLoginProfile(profile: FastLoginStoredProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      FAST_LOGIN_STORAGE_KEY,
      JSON.stringify({
        ...profile,
        last_login_timestamp: Date.now(),
      })
    );
  } catch (e) {
    console.error('Failed to save fast login profile to localStorage:', e);
  }
}

/**
 * Retrieve stored fast login profile from device storage
 */
export function getStoredFastLoginProfile(): FastLoginStoredProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FAST_LOGIN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FastLoginStoredProfile;
  } catch {
    return null;
  }
}

/**
 * Clear stored fast login profile
 */
export function clearStoredFastLoginProfile(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(FAST_LOGIN_STORAGE_KEY);
  } catch {}
}

/**
 * Check if the first-time prompt was already dismissed by this user
 */
export function isFastLoginPromptDismissed(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return localStorage.getItem(`${FAST_LOGIN_DISMISSED_KEY}${userId}`) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark fast login first-time prompt as dismissed
 */
export function setFastLoginPromptDismissed(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(`${FAST_LOGIN_DISMISSED_KEY}${userId}`, 'true');
  } catch {}
}

/**
 * Register biometric credential using WebAuthn Platform Authenticator
 */
export async function createBiometricCredential(
  userId: string,
  username: string,
  challengeString: string
): Promise<{ credentialId: string; rawId: string; clientDataJSON: string; attestationObject: string }> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('Web Authentication (Biometrik) tidak didukung pada browser/perangkat ini.');
  }

  const challengeBytes = base64UrlToUint8Array(challengeString);
  const userIdBytes = new TextEncoder().encode(userId);

  const creationOptions: CredentialCreationOptions = {
    publicKey: {
      challenge: challengeBytes as BufferSource,
      rp: {
        name: 'SNT 10 Kupang - Presensi & Jurnal',
        id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
      },
      user: {
        id: userIdBytes as BufferSource,
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        requireResidentKey: false,
      },
      timeout: 60000,
      attestation: 'none',
    },
  };

  const credential = (await navigator.credentials.create(creationOptions)) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error('Pendaftaran biometrik dibatalkan.');
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialId = bufferToBase64Url(credential.rawId);
  const rawId = bufferToBase64Url(credential.rawId);
  const clientDataJSON = bufferToBase64Url(response.clientDataJSON);
  const attestationObject = bufferToBase64Url(response.attestationObject);

  return {
    credentialId,
    rawId,
    clientDataJSON,
    attestationObject,
  };
}

/**
 * Authenticate using biometric credential
 */
export async function getBiometricAssertion(
  credentialId: string,
  challengeString: string
): Promise<{ id: string; clientDataJSON: string; authenticatorData: string; signature: string }> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('Web Authentication (Biometrik) tidak didukung pada browser/perangkat ini.');
  }

  const challengeBytes = base64UrlToUint8Array(challengeString);
  const credIdBytes = base64UrlToUint8Array(credentialId);

  const requestOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: challengeBytes as BufferSource,
      allowCredentials: [
        {
          id: credIdBytes as BufferSource,
          type: 'public-key',
          transports: ['internal'],
        },
      ],
      userVerification: 'preferred',
      timeout: 60000,
      rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
    },
  };

  const assertion = (await navigator.credentials.get(requestOptions)) as PublicKeyCredential | null;
  if (!assertion) {
    throw new Error('Verifikasi biometrik dibatalkan.');
  }

  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    id: assertion.id,
    clientDataJSON: bufferToBase64Url(response.clientDataJSON),
    authenticatorData: bufferToBase64Url(response.authenticatorData),
    signature: bufferToBase64Url(response.signature),
  };
}
