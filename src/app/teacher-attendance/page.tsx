'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { ToastProvider, useToast } from '@/components/Toast';
import { PageLoader, Spinner } from '@/components/Spinner';
import { SyncIcon } from '@/components/Icons';
import {
  SessionPayload,
  ROLE_LABELS,
  normalizeRole,
  TeacherAttendanceRecord,
} from '@/lib/constants';
import { processJournalPhoto, formatBytes } from '@/lib/image-compression';

function TeacherAttendanceContent() {
  const router = useRouter();
  const { showToast } = useToast();

  const [user, setUser] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Time & Date State
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDateFormatted, setCurrentDateFormatted] = useState<string>('');

  // Attendance Form State
  const [attendanceType, setAttendanceType] = useState<'Masuk' | 'Pulang'>('Masuk');
  const [attendanceStatus, setAttendanceStatus] = useState<'Hadir' | 'Dinas Luar' | 'Izin' | 'Sakit'>('Hadir');
  const [note, setNote] = useState('');

  // Photo & Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [capturedPhotoFile, setCapturedPhotoFile] = useState<File | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoStats, setPhotoStats] = useState<{
    originalSize: number;
    finalSize: number;
    dimensions: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Geolocation State
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);

  // Today's Status & History
  const [todayStatus, setTodayStatus] = useState<{
    has_checked_in: boolean;
    has_checked_out: boolean;
    masuk: TeacherAttendanceRecord | null;
    pulang: TeacherAttendanceRecord | null;
  } | null>(null);

  const [historyRecords, setHistoryRecords] = useState<TeacherAttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilterDate, setHistoryFilterDate] = useState<string>('');

  // Admin monitor view state
  const [adminViewDate, setAdminViewDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [adminRecords, setAdminRecords] = useState<TeacherAttendanceRecord[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'self-attendance' | 'admin-monitor'>('self-attendance');

  // Lightbox modal state
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; title: string } | null>(null);

  // Digital clock updater
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' WITA'
      );
      setCurrentDateFormatted(
        now.toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch current user session
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          router.push('/');
          return;
        }
        const currentRole = normalizeRole(data.user.role);
        if (currentRole !== 'Teacher' && currentRole !== 'Admin') {
          showToast('Fitur ini khusus untuk akun dengan peran Guru/Pendidik.', 'error');
          router.push('/dashboard');
          return;
        }
        setUser(data.user);
        if (currentRole === 'Admin') {
          setActiveTab('admin-monitor');
        }
      })
      .catch(() => router.push('/'))
      .finally(() => setLoading(false));
  }, [router, showToast]);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start camera helper
  const startCamera = useCallback(async (mode: 'user' | 'environment') => {
    stopCamera();
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Perangkat atau peramban ini tidak mendukung akses kamera langsung.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera start error:', err);
      let msg = 'Tidak dapat mengakses kamera selfie.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Izin akses kamera ditolak. Silakan izinkan peramban mengakses kamera di setelan situs.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Perangkat kamera selfie tidak terdeteksi pada perangkat ini.';
      }
      setCameraError(msg);
      setCameraActive(false);
    }
  }, [stopCamera]);

  // Request GPS Geolocation
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Perangkat atau peramban ini tidak mendukung geolokasi GPS.');
      return;
    }

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGeoLoading(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        let msg = 'Gagal mendeteksi lokasi GPS.';
        if (err.code === 1) {
          msg = 'Izin lokasi (GPS) ditolak. Mohon aktifkan izin GPS di peramban Anda.';
        } else if (err.code === 2) {
          msg = 'Sinyal GPS tidak tersedia atau posisi tidak dapat ditentukan.';
        } else if (err.code === 3) {
          msg = 'Waktu permintaan lokasi GPS habis.';
        }
        setGeoError(msg);
        setGeoLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000,
      }
    );
  }, []);

  // Fetch Attendance Records for this teacher & today's status
  const fetchMyAttendance = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const url = historyFilterDate
        ? `/api/teacher-attendance?date=${encodeURIComponent(historyFilterDate)}`
        : `/api/teacher-attendance`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setHistoryRecords(data.records || []);
        if (data.todayStatus) {
          setTodayStatus(data.todayStatus);
          // Suggest Next Shift
          if (data.todayStatus.has_checked_in && !data.todayStatus.has_checked_out) {
            setAttendanceType('Pulang');
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch attendance history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilterDate]);

  // Fetch Admin Records for monitor tab
  const fetchAdminAttendance = useCallback(async () => {
    setAdminLoading(true);
    try {
      const res = await fetch(`/api/teacher-attendance?date=${encodeURIComponent(adminViewDate)}`);
      const data = await res.json();
      if (data.success) {
        setAdminRecords(data.records || []);
      }
    } catch (err) {
      console.error('Failed to fetch admin attendance monitor:', err);
    } finally {
      setAdminLoading(false);
    }
  }, [adminViewDate]);

  // Load initial data & trigger GPS automatically
  useEffect(() => {
    if (user) {
      fetchMyAttendance();
      requestLocation();
    }
  }, [user, fetchMyAttendance, requestLocation]);

  // Fetch admin view when date changes
  useEffect(() => {
    if (user && normalizeRole(user.role) === 'Admin' && activeTab === 'admin-monitor') {
      fetchAdminAttendance();
    }
  }, [user, activeTab, fetchAdminAttendance]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Take Snapshot from Camera
  const takeSnapshot = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If facingMode is user (selfie), mirror it naturally
    if (facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        stopCamera();

        const rawFile = new File([blob], `selfie_${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        await handleProcessFile(rawFile);
      },
      'image/jpeg',
      0.9
    );
  };

  // Process photo with image-compression (<= 1MB, 1080p max)
  const handleProcessFile = async (file: File) => {
    setProcessingPhoto(true);
    try {
      const result = await processJournalPhoto(file);
      setCapturedPhotoFile(result.file);
      setPreviewPhotoUrl(result.previewUrl);
      setPhotoStats({
        originalSize: result.originalSize,
        finalSize: result.finalSize,
        dimensions: `${result.finalWidth}x${result.finalHeight}`,
      });
      showToast(
        `Foto selfie siap (${formatBytes(result.finalSize)}, ${result.finalWidth}x${result.finalHeight}px)`,
        'success'
      );
    } catch (err: any) {
      console.error('Photo compression error:', err);
      showToast(err.message || 'Gagal memproses foto', 'error');
    } finally {
      setProcessingPhoto(false);
    }
  };

  // Handle File Input Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    await handleProcessFile(file);
    e.target.value = '';
  };

  // Retake photo
  const handleRetakePhoto = () => {
    setCapturedPhotoFile(null);
    setPreviewPhotoUrl(null);
    setPhotoStats(null);
    startCamera(facingMode);
  };

  // Switch between front/back camera
  const handleToggleCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Submit Teacher Attendance
  const handleSubmitAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!capturedPhotoFile && !previewPhotoUrl) {
      showToast('Wajib mengambil swafoto (selfie) presensi terlebih dahulu.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      let finalPhotoUrl = previewPhotoUrl || '';

      // 1. Upload photo if file is present
      if (capturedPhotoFile) {
        const formData = new FormData();
        formData.append('photo', capturedPhotoFile);
        formData.append('teacher_name', user.username);
        formData.append('type', attendanceType);
        formData.append('date', new Date().toISOString().split('T')[0]);

        const uploadRes = await fetch('/api/teacher-attendance/upload', {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();

        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error || 'Gagal mengunggah foto selfie presensi.');
        }
        finalPhotoUrl = uploadData.photo_url;
      }

      // 2. Submit Attendance Record
      const res = await fetch('/api/teacher-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: attendanceType,
          attendance_status: attendanceStatus,
          photo_url: finalPhotoUrl,
          latitude: coords?.latitude || null,
          longitude: coords?.longitude || null,
          accuracy: coords?.accuracy || null,
          address: coords ? `Lat: ${coords.latitude.toFixed(6)}, Lng: ${coords.longitude.toFixed(6)}` : null,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyimpan presensi guru.');
      }

      showToast(data.message || 'Presensi berhasil dicatat!', 'success');

      // Reset form
      setCapturedPhotoFile(null);
      setPreviewPhotoUrl(null);
      setPhotoStats(null);
      setNote('');
      stopCamera();

      // Refresh data
      fetchMyAttendance();
    } catch (err: any) {
      console.error('Submit teacher attendance error:', err);
      showToast(err.message || 'Terjadi kesalahan saat mengirim presensi', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return <PageLoader text="Memuat modul Presensi Guru..." />;
  }

  const currentRole = normalizeRole(user.role);
  const isAdmin = currentRole === 'Admin';

  return (
    <>
      <Navbar user={user} />

      <main className="container-app page-enter" style={{ paddingTop: '20px', paddingBottom: '60px' }}>
        {/* Breadcrumb & Navigation */}
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: 0,
            }}
          >
            <span>←</span> Kembali ke Dasbor
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '20px' }}>📸</span>
                <h1 style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: '#1e3863', letterSpacing: '-0.02em', margin: 0 }}>
                  Presensi Guru &amp; Pegawai
                </h1>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                Swafoto (Selfie) &amp; Pencatatan Koordinat Geolokasi GPS Otomatis
              </p>
            </div>

            {/* Live Clock Pill */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
              }}
            >
              <span style={{ fontSize: '16px' }}>⏰</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e3863', fontFamily: 'monospace' }}>
                  {currentTime || 'Memuat...'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {currentDateFormatted || 'Hari ini'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Toggle (if Admin) */}
        {isAdmin && (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '20px',
              borderBottom: '2px solid #e2e8f0',
              paddingBottom: '2px',
            }}
          >
            <button
              onClick={() => setActiveTab('self-attendance')}
              className="btn btn-sm"
              style={{
                background: activeTab === 'self-attendance' ? '#1e3863' : 'transparent',
                color: activeTab === 'self-attendance' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px 8px 0 0',
                padding: '8px 16px',
              }}
            >
              📸 Formulir Presensi Saya
            </button>
            <button
              onClick={() => setActiveTab('admin-monitor')}
              className="btn btn-sm"
              style={{
                background: activeTab === 'admin-monitor' ? '#1e3863' : 'transparent',
                color: activeTab === 'admin-monitor' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px 8px 0 0',
                padding: '8px 16px',
              }}
            >
              📋 Pantau Presensi Seluruh Guru ({adminRecords.length})
            </button>
          </div>
        )}

        {/* =========================================================================
            TAB 1: TEACHER SELF ATTENDANCE FORM
           ========================================================================= */}
        {activeTab === 'self-attendance' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* LEFT COLUMN: Camera & Form */}
            <div className="glass-card" style={{ padding: '22px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
              {/* Today's Status Header Card */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Status Presensi Hari Ini:
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      flex: 1,
                      minWidth: '130px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: todayStatus?.has_checked_in ? '#e7f8ec' : '#fee8e8',
                      border: todayStatus?.has_checked_in ? '1px solid #a7f3d0' : '1px solid #fecaca',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: todayStatus?.has_checked_in ? '#065f46' : '#991b1b' }}>
                      🟢 Presensi Masuk
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: todayStatus?.has_checked_in ? '#047857' : '#b91c1c' }}>
                      {todayStatus?.masuk ? `${todayStatus.masuk.time} WITA` : 'Belum Rekam'}
                    </div>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      minWidth: '130px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: todayStatus?.has_checked_out ? '#e0f2fe' : '#f1f5f9',
                      border: todayStatus?.has_checked_out ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: todayStatus?.has_checked_out ? '#0369a1' : 'var(--text-muted)' }}>
                      🔵 Presensi Pulang
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: todayStatus?.has_checked_out ? '#0284c7' : 'var(--text-muted)' }}>
                      {todayStatus?.pulang ? `${todayStatus.pulang.time} WITA` : 'Belum Rekam'}
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitAttendance}>
                {/* 1. Select Shift (Masuk / Pulang) */}
                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label" style={{ marginBottom: '6px' }}>
                    Jenis Presensi
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setAttendanceType('Masuk')}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: attendanceType === 'Masuk' ? '2px solid #1e3863' : '1px solid #cbd5e1',
                        background: attendanceType === 'Masuk' ? '#eef3fa' : '#ffffff',
                        color: attendanceType === 'Masuk' ? '#1e3863' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>🌅</span>
                      <span>Presensi Masuk</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAttendanceType('Pulang')}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: attendanceType === 'Pulang' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                        background: attendanceType === 'Pulang' ? '#e0f2fe' : '#ffffff',
                        color: attendanceType === 'Pulang' ? '#0284c7' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>🌇</span>
                      <span>Presensi Pulang</span>
                    </button>
                  </div>
                </div>

                {/* 2. Select Status */}
                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label" style={{ marginBottom: '6px' }}>
                    Kondisi / Status Kehadiran
                  </label>
                  <select
                    className="input-field"
                    value={attendanceStatus}
                    onChange={(e) => setAttendanceStatus(e.target.value as any)}
                  >
                    <option value="Hadir">🟢 Hadir di Sekolah (Tatap Muka)</option>
                    <option value="Dinas Luar">🚙 Dinas Luar / Tugas Luar Sekolah</option>
                    <option value="Izin">🟡 Izin Resmi</option>
                    <option value="Sakit">🔴 Sakit</option>
                  </select>
                </div>

                {/* 3. Camera / Swafoto Selfie Section */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="input-label" style={{ margin: 0 }}>
                      Swafoto Selfie (Wajib Kamera Wajah)
                    </label>
                    {cameraActive && (
                      <button
                        type="button"
                        onClick={handleToggleCamera}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0284c7',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        🔄 Balik Kamera ({facingMode === 'user' ? 'Depan' : 'Belakang'})
                      </button>
                    )}
                  </div>

                  {/* Viewport Card */}
                  <div
                    style={{
                      background: '#0f172a',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      position: 'relative',
                      minHeight: '260px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px dashed #cbd5e1',
                    }}
                  >
                    {/* Live Video Element */}
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '280px',
                        objectFit: 'cover',
                        display: cameraActive ? 'block' : 'none',
                        transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                      }}
                    />

                    {/* Snapshot Preview */}
                    {previewPhotoUrl && !cameraActive && (
                      <div style={{ position: 'relative', width: '100%', height: '280px' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewPhotoUrl}
                          alt="Selfie Preview"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                        {/* Overlay Tag */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '10px',
                            background: 'rgba(0, 0, 0, 0.65)',
                            color: '#ffffff',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          ✅ Foto Siap • {photoStats ? `${formatBytes(photoStats.finalSize)}` : ''}
                        </div>
                      </div>
                    )}

                    {/* Placeholder when camera is inactive and no photo */}
                    {!cameraActive && !previewPhotoUrl && (
                      <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '42px', marginBottom: '8px' }}>🤳</div>
                        <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                          Kamera Selfie Belum Aktif
                        </div>
                        <p style={{ fontSize: '12px', maxWidth: '240px', margin: '0 auto 12px' }}>
                          Klik tombol di bawah untuk menyalakan kamera depan atau unggah foto
                        </p>
                      </div>
                    )}

                    {/* Camera Error Message */}
                    {cameraError && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(15, 23, 42, 0.9)',
                          padding: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          color: '#f87171',
                          fontSize: '12.5px',
                        }}
                      >
                        <span style={{ fontSize: '24px', marginBottom: '6px' }}>⚠️</span>
                        <div>{cameraError}</div>
                      </div>
                    )}
                  </div>

                  {/* Camera Control Buttons */}
                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {!cameraActive && !previewPhotoUrl && (
                      <button
                        type="button"
                        onClick={() => startCamera(facingMode)}
                        className="btn btn-primary"
                        style={{ flex: '1 1 180px', padding: '10px', fontSize: '13px' }}
                      >
                        📷 Nyalakan Kamera Selfie
                      </button>
                    )}

                    {cameraActive && (
                      <>
                        <button
                          type="button"
                          onClick={takeSnapshot}
                          className="btn btn-success"
                          style={{
                            flex: '1 1 180px',
                            padding: '10px',
                            fontSize: '13.5px',
                            fontWeight: 800,
                            background: '#16a34a',
                          }}
                        >
                          📸 Ambil Swafoto Sekarang
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '8px 12px' }}
                        >
                          Tutup
                        </button>
                      </>
                    )}

                    {previewPhotoUrl && !cameraActive && (
                      <button
                        type="button"
                        onClick={handleRetakePhoto}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, padding: '8px 12px' }}
                      >
                        🔄 Ambil Ulang Swafoto
                      </button>
                    )}

                    {/* File Upload Fallback */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '8px 12px', fontSize: '12px' }}
                      title="Pilih foto dari galeri atau berkas perangkat"
                    >
                      📁 Unggah Berkas
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>

                {/* 4. GPS Geolocation Status Box */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '15px' }}>📍</span>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Lokasi Presensi (GPS)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={requestLocation}
                      disabled={geoLoading}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <SyncIcon size={12} className={geoLoading ? 'animate-spin' : ''} />
                      <span>{geoLoading ? 'Mendeteksi...' : 'Perbarui GPS'}</span>
                    </button>
                  </div>

                  {geoLoading ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Spinner /> Mengunci sinyal koordinat GPS...
                    </div>
                  ) : coords ? (
                    <div>
                      <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#1e3863', fontWeight: 600 }}>
                        {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span
                          style={{
                            fontSize: '10.5px',
                            background: '#e0f2fe',
                            color: '#0369a1',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 700,
                          }}
                        >
                          Akurasi: ±{coords.accuracy}m
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '11.5px', color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}
                        >
                          🗺️ Buka di Google Maps ↗
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                      {geoError || 'Lokasi GPS belum terdeteksi. Klik "Perbarui GPS" di atas.'}
                    </div>
                  )}
                </div>

                {/* 5. Optional Note Input */}
                <div style={{ marginBottom: '20px' }}>
                  <label className="input-label">Catatan / Keterangan (Opsional)</label>
                  <input
                    className="input-field"
                    placeholder="Contoh: Mengikuti rapat dinas / Mengajar jam pertama"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                {/* 6. Submit Button */}
                <button
                  type="submit"
                  disabled={submitting || processingPhoto}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #1e3863 0%, #2d518d 100%)',
                    boxShadow: '0 4px 12px rgba(30, 56, 99, 0.25)',
                  }}
                >
                  {submitting ? (
                    <>
                      <Spinner /> Mengirimkan Presensi...
                    </>
                  ) : (
                    `✓ Kirim Presensi ${attendanceType} Sekarang`
                  )}
                </button>
              </form>
            </div>

            {/* RIGHT COLUMN: My Attendance History Table */}
            <div className="glass-card" style={{ padding: '22px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>📑</span>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Riwayat Presensi Saya
                  </h2>
                </div>

                <input
                  type="date"
                  className="input-field"
                  value={historyFilterDate}
                  onChange={(e) => setHistoryFilterDate(e.target.value)}
                  style={{ width: 'auto', padding: '5px 10px', fontSize: '12px' }}
                />
              </div>

              {historyLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <Spinner /> Memuat riwayat presensi...
                </div>
              ) : historyRecords.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Belum ada catatan presensi pada periode yang dipilih.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto' }}>
                  {historyRecords.map((rec, idx) => {
                    const isMasuk = rec.type === 'Masuk';
                    return (
                      <div
                        key={rec.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          gap: '12px',
                        }}
                      >
                        {/* Left: Thumbnail & Details */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          {/* Thumbnail */}
                          {rec.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={rec.photo_url}
                              alt="Selfie"
                              onClick={() =>
                                setLightboxPhoto({
                                  url: rec.photo_url,
                                  title: `Swafoto ${rec.type} - ${rec.username} (${rec.date} ${rec.time})`,
                                })
                              }
                              style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '8px',
                                objectFit: 'cover',
                                cursor: 'pointer',
                                border: '1px solid #cbd5e1',
                              }}
                              title="Klik untuk perbesar foto"
                            />
                          ) : (
                            <div
                              style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '8px',
                                background: '#e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                              }}
                            >
                              👤
                            </div>
                          )}

                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: isMasuk ? '#e7f8ec' : '#e0f2fe',
                                  color: isMasuk ? '#065f46' : '#0369a1',
                                }}
                              >
                                {rec.type}
                              </span>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {rec.time} WITA
                              </span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                              📅 {rec.date}
                            </div>
                            {rec.note && (
                              <div style={{ fontSize: '11.5px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>
                                &quot;{rec.note}&quot;
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: GPS Maps Link */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {rec.latitude && rec.longitude ? (
                            <a
                              href={`https://www.google.com/maps?q=${rec.latitude},${rec.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <span>📍</span>
                              <span>GPS Maps</span>
                            </a>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tanpa GPS</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: ADMIN / KEPALA SEKOLAH DAILY MONITOR TABLE
           ========================================================================= */}
        {isAdmin && activeTab === 'admin-monitor' && (
          <div className="glass-card" style={{ padding: '22px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Pantauan Kehadiran Guru Harian
                </h2>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
                  Tinjau swafoto dan koordinat geolokasi kedatangan guru &amp; staf sekolah
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="🔍 Cari nama guru..."
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  style={{ maxWidth: '200px', padding: '6px 12px', fontSize: '12px' }}
                />

                <input
                  type="date"
                  className="input-field"
                  value={adminViewDate}
                  onChange={(e) => setAdminViewDate(e.target.value)}
                  style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}
                />

                <button
                  type="button"
                  onClick={fetchAdminAttendance}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  <SyncIcon size={12} className={adminLoading ? 'animate-spin' : ''} />
                  <span>Segarkan</span>
                </button>
              </div>
            </div>

            {adminLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Spinner /> Memuat data pantauan presensi...
              </div>
            ) : adminRecords.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px' }}>
                Belum ada guru yang melakukan presensi swafoto pada tanggal {adminViewDate}.
              </div>
            ) : (
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px' }}>No</th>
                      <th style={{ width: '60px' }}>Foto</th>
                      <th>Nama Guru / Pendidik</th>
                      <th>NIP</th>
                      <th>Jam (WITA)</th>
                      <th>Jenis</th>
                      <th>Status</th>
                      <th>Lokasi GPS</th>
                      <th>Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminRecords
                      .filter((r) => !adminSearch || r.username.toLowerCase().includes(adminSearch.toLowerCase()))
                      .map((rec, i) => (
                        <tr key={rec.id || i}>
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td>
                            {rec.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={rec.photo_url}
                                alt="Selfie"
                                onClick={() =>
                                  setLightboxPhoto({
                                    url: rec.photo_url,
                                    title: `Swafoto ${rec.type} - ${rec.username} (${rec.date} ${rec.time})`,
                                  })
                                }
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '6px',
                                  objectFit: 'cover',
                                  cursor: 'pointer',
                                  border: '1px solid #cbd5e1',
                                }}
                                title="Klik untuk perbesar"
                              />
                            ) : (
                              <span>-</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {rec.username}
                          </td>
                          <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            {rec.nip || '-'}
                          </td>
                          <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                            {rec.time}
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: rec.type === 'Masuk' ? '#e7f8ec' : '#e0f2fe',
                                color: rec.type === 'Masuk' ? '#065f46' : '#0369a1',
                              }}
                            >
                              {rec.type}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-present">
                              <span className="badge-dot" />
                              {rec.attendance_status || 'Hadir'}
                            </span>
                          </td>
                          <td>
                            {rec.latitude && rec.longitude ? (
                              <a
                                href={`https://www.google.com/maps?q=${rec.latitude},${rec.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '11.5px',
                                  color: '#0284c7',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <span>📍</span>
                                <span>Lihat Peta ↗</span>
                              </a>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>
                          <td style={{ fontSize: '12px', color: '#475569' }}>
                            {rec.note || '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* =========================================================
          LIGHTBOX MODAL FOR SELFIE PHOTO ENLARGEMENT
         ========================================================= */}
      {lightboxPhoto && (
        <div
          className="modal-overlay"
          onClick={() => setLightboxPhoto(null)}
          style={{ zIndex: 1000, background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(5px)' }}
        >
          <div
            className="modal-card page-enter"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '480px',
              padding: '16px',
              background: '#ffffff',
              borderRadius: '12px',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'left' }}>
                {lightboxPhoto.title}
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '6px',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                ✕
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxPhoto.url}
              alt="Foto Presensi"
              style={{
                width: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            />

            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%' }}
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function TeacherAttendancePage() {
  return (
    <ToastProvider>
      <TeacherAttendanceContent />
    </ToastProvider>
  );
}
