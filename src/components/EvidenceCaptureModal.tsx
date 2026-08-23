'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { processEvidencePhoto, formatBytes } from '@/lib/image-compression';
import { Spinner } from '@/components/Spinner';

interface EvidenceCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  studentId: string;
  status: 'Sakit' | 'Izin' | 'Alpa';
  currentNote: string;
  existingPhotoUrl?: string;
  existingFile?: File | null;
  onSave: (data: { file: File | null; previewUrl: string | null; note: string }) => void;
}

const REASON_PRESETS: Record<'Sakit' | 'Izin' | 'Alpa', string[]> = {
  Sakit: [
    'Surat Keterangan Dokter',
    'Resep Obat / Kwitansi Klinik',
    'Rawat Inap di Rumah Sakit / Puskesmas',
    'Istirahat Sakit di Rumah',
    'Demam / Flu / Batuk',
  ],
  Izin: [
    'Disposisi / Surat Tugas Lomba',
    'Kejuaraan Olahraga / Seni Budaya',
    'Kegiatan Akademik Luar Sekolah',
    'Kepentingan Keluarga / Acara Adat',
    'Izin Kedukaan / Keluarga Sakit',
    'Urusan Pribadi Mendesak',
  ],
  Alpa: [
    'Tanpa Keterangan Resmi',
    'Nomor Orang Tua Tidak Dapat Dihubungi',
  ],
};

export default function EvidenceCaptureModal({
  isOpen,
  onClose,
  studentName,
  studentId,
  status,
  currentNote,
  existingPhotoUrl,
  existingFile,
  onSave,
}: EvidenceCaptureModalProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'file'>('camera');
  const [note, setNote] = useState(currentNote || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(existingFile || null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingPhotoUrl || null);
  const [processing, setProcessing] = useState(false);
  const [fileStats, setFileStats] = useState<{
    originalSize: number;
    finalSize: number;
    dimensions: string;
  } | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      setNote(currentNote || '');
      setSelectedFile(existingFile || null);
      setPreviewUrl(existingPhotoUrl || null);
      setFileStats(null);
      setCameraError(null);
      if (!existingPhotoUrl && !existingFile) {
        setActiveTab('camera');
      } else {
        setActiveTab('file');
      }
    }
  }, [isOpen, currentNote, existingPhotoUrl, existingFile]);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start camera helper
  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    stopCamera();
    setCameraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Kamera tidak didukung oleh browser Anda. Gunakan opsi unggah berkas atau kamera perangkat bawaan.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('getUserMedia error:', err);
      if (mode === 'environment') {
        // Fallback to any camera
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.play().catch(() => {});
          }
          setCameraActive(true);
          return;
        } catch {}
      }
      setCameraError('Izin akses kamera belum diberikan atau kamera sedang digunakan aplikasi lain. Anda dapat mengunggah foto melalui galeri / tombol di bawah.');
    }
  }, [stopCamera]);

  // Manage camera on tab/open change
  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !previewUrl) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, previewUrl, facingMode, startCamera, stopCamera]);

  // Handle Capture from Live Video
  const handleCaptureSnapshot = async () => {
    if (!videoRef.current || !cameraActive) return;

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        setProcessing(true);
        try {
          const snapshotFile = new File([blob], `Kamera_${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          const compressed = await processEvidencePhoto(snapshotFile);
          setSelectedFile(compressed.file);
          setPreviewUrl(compressed.previewUrl);
          setFileStats({
            originalSize: compressed.originalSize,
            finalSize: compressed.finalSize,
            dimensions: `${compressed.finalWidth}×${compressed.finalHeight}`,
          });
          stopCamera();
        } catch (err) {
          console.error('Compression error after capture:', err);
        } finally {
          setProcessing(false);
        }
      }, 'image/jpeg', 0.95);
    } catch (err) {
      console.error('Capture snapshot error:', err);
    }
  };

  // Handle File Upload from Input (Gallery / Device)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Format berkas harus berupa gambar (JPG, PNG, WEBP).');
      return;
    }

    setProcessing(true);
    try {
      const compressed = await processEvidencePhoto(file);
      setSelectedFile(compressed.file);
      setPreviewUrl(compressed.previewUrl);
      setFileStats({
        originalSize: compressed.originalSize,
        finalSize: compressed.finalSize,
        dimensions: `${compressed.finalWidth}×${compressed.finalHeight}`,
      });
      stopCamera();
    } catch (err) {
      console.error('File compression error:', err);
      alert('Gagal memproses gambar. Silakan coba berkas foto lain.');
    } finally {
      setProcessing(false);
    }
  };

  // Switch facing mode (Front / Back camera)
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Remove current photo
  const handleRemovePhoto = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileStats(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
    if (activeTab === 'camera') {
      startCamera(facingMode);
    }
  };

  // Preset click handler
  const handlePresetClick = (presetText: string) => {
    if (!note.trim()) {
      setNote(presetText);
    } else if (!note.includes(presetText)) {
      setNote(`${presetText} - ${note}`);
    }
  };

  // Save changes and close modal
  const handleConfirmSave = () => {
    onSave({
      file: selectedFile,
      previewUrl: previewUrl,
      note: note.trim(),
    });
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  const presets = REASON_PRESETS[status] || REASON_PRESETS.Sakit;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 150ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCamera();
          onClose();
        }
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          animation: 'scaleUp 180ms ease-out',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontSize: '18px' }}>
                {status === 'Sakit' ? '🩺' : status === 'Izin' ? '📝' : '⚠️'}
              </span>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Lampiran Bukti Ketidakhadiran
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
              Siswa: <strong>{studentName}</strong> ({studentId}) • Status: <span style={{ fontWeight: 700, color: status === 'Sakit' ? '#b45309' : status === 'Izin' ? '#1e3863' : '#c9252d' }}>{status}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            style={{
              background: '#e2e8f0',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '15px',
              cursor: 'pointer',
              color: '#475569',
              fontWeight: 700,
              flexShrink: 0,
            }}
            title="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          {/* Quick Presets Section */}
          <div style={{ marginBottom: '16px' }}>
            <label className="input-label" style={{ fontSize: '12px', marginBottom: '6px' }}>
              🏷️ Rekomendasi Keterangan / Jenis Dokumen:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {presets.map((preset) => {
                const isSelected = note.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    style={{
                      padding: '5px 10px',
                      fontSize: '11.5px',
                      borderRadius: '6px',
                      border: isSelected ? '1px solid #1e3863' : '1px solid #cbd5e1',
                      background: isSelected ? '#eef3fa' : '#f8fafc',
                      color: isSelected ? '#1e3863' : '#334155',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'left',
                    }}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note Input */}
          <div style={{ marginBottom: '18px' }}>
            <label className="input-label" htmlFor="modal-note-input" style={{ fontSize: '12px', marginBottom: '4px' }}>
              Catatan / Detail Surat (Dokter / Dispensasi Lomba):
            </label>
            <input
              id="modal-note-input"
              type="text"
              className="input-field"
              placeholder="Contoh: Surat sakit dr. Budi Santoso / Surat tugas lomba renang kota"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ fontSize: '13px', padding: '8px 12px' }}
            />
          </div>

          {/* Evidence Photo Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="input-label" style={{ fontSize: '12px', margin: 0 }}>
                📷 Foto Dokumen / Resep / Surat Bukti:
              </label>

              {!previewUrl && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('camera');
                      startCamera(facingMode);
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      borderRadius: '6px',
                      border: 'none',
                      background: activeTab === 'camera' ? '#1e3863' : '#e2e8f0',
                      color: activeTab === 'camera' ? '#ffffff' : '#475569',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    📸 Kamera
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('file');
                      stopCamera();
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      borderRadius: '6px',
                      border: 'none',
                      background: activeTab === 'file' ? '#1e3863' : '#e2e8f0',
                      color: activeTab === 'file' ? '#ffffff' : '#475569',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    📁 Galeri / Berkas
                  </button>
                </div>
              )}
            </div>

            {/* PROCESSING SPINNER */}
            {processing && (
              <div
                style={{
                  padding: '30px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px dashed #94a3b8',
                }}
              >
                <Spinner />
                <div style={{ fontSize: '13px', color: '#475569', marginTop: '8px', fontWeight: 600 }}>
                  Memproses & mengompresi gambar bukti...
                </div>
              </div>
            )}

            {/* PREVIEW OF ATTACHED PHOTO */}
            {!processing && previewUrl && (
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    maxHeight: '260px',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Pratinjau Bukti"
                    style={{
                      width: '100%',
                      maxHeight: '260px',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      backdropFilter: 'blur(4px)',
                      color: '#ffffff',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {fileStats ? `${formatBytes(fileStats.finalSize)} • ${fileStats.dimensions}` : 'Bukti Foto Terpasang'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="btn btn-secondary btn-sm"
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#c9252d',
                      borderColor: '#fca5a5',
                    }}
                  >
                    🗑️ Hapus Foto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleRemovePhoto();
                      setActiveTab('camera');
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    🔄 Ambil Ulang Kamera
                  </button>
                </div>
              </div>
            )}

            {/* LIVE CAMERA CAPTURE VIEW */}
            {!processing && !previewUrl && activeTab === 'camera' && (
              <div
                style={{
                  background: '#0f172a',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {cameraError ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: '#f87171' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>📷⚠️</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
                      {cameraError}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '12px' }}
                      >
                        📸 Buka Kamera Bawaan HP
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('file')}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '12px', color: '#ffffff', borderColor: '#475569' }}
                      >
                        📁 Pilih dari Galeri
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '240px',
                        objectFit: 'cover',
                        display: 'block',
                        background: '#000000',
                      }}
                    />

                    {/* Camera Overlay Bar */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '12px 16px',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Switch Camera */}
                      <button
                        type="button"
                        onClick={toggleFacingMode}
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          border: 'none',
                          color: '#ffffff',
                          borderRadius: '50%',
                          width: '38px',
                          height: '38px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          cursor: 'pointer',
                        }}
                        title="Balik Kamera (Depan/Belakang)"
                      >
                        🔄
                      </button>

                      {/* Big Shutter Button */}
                      <button
                        type="button"
                        onClick={handleCaptureSnapshot}
                        style={{
                          background: '#ffffff',
                          border: '4px solid rgba(255, 255, 255, 0.4)',
                          borderRadius: '50%',
                          width: '54px',
                          height: '54px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '20px',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                          transition: 'transform 0.1s ease',
                        }}
                        title="Ambil Foto Dokumen"
                      >
                        📸
                      </button>

                      {/* Native Camera input fallback */}
                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          border: 'none',
                          color: '#ffffff',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                        title="Gunakan Aplikasi Kamera Bawaan HP"
                      >
                        Kamera HP
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* FILE PICKER / GALLERY VIEW */}
            {!processing && !previewUrl && activeTab === 'file' && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #94a3b8',
                  borderRadius: '12px',
                  padding: '24px 16px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Klik untuk Memilih Foto Bukti
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Mendukung JPG, PNG, WEBP. Ukuran akan disesuaikan otomatis (maks. 1080p / 1MB).
                </p>
              </div>
            )}

            {/* Hidden File Inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <input
              ref={nativeCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="btn btn-secondary btn-sm"
            style={{ padding: '8px 16px' }}
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleConfirmSave}
            className="btn btn-primary btn-sm"
            style={{
              padding: '8px 18px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#1e3863',
            }}
          >
            <span>✓</span>
            <span>Simpan Lampiran Bukti</span>
          </button>
        </div>
      </div>
    </div>
  );
}
