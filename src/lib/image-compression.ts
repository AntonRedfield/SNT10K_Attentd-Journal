/**
 * Utility for client-side image downscaling and compression.
 * Rule:
 * - Max resolution is 1080p (1920x1080 landscape, 1080x1920 portrait)
 * - Max file size is 1MB (1,048,576 bytes)
 * - If file is already <= 1080p and <= 1MB, no adjustment is made.
 */

export interface CompressionResult {
  file: File;
  previewUrl: string;
  originalSize: number;
  finalSize: number;
  originalWidth: number;
  originalHeight: number;
  finalWidth: number;
  finalHeight: number;
  wasAdjusted: boolean;
}

const MAX_BYTES = 1024 * 1024; // 1 MB

export async function processJournalPhoto(file: File): Promise<CompressionResult> {
  const originalSize = file.size;

  // Read image dimensions
  const { width: origW, height: origH, imageElement } = await loadImage(file);

  // Determine 1080p bounds based on orientation
  const isPortrait = origH > origW;
  const maxW = isPortrait ? 1080 : 1920;
  const maxH = isPortrait ? 1920 : 1080;

  const needsResize = origW > maxW || origH > maxH;
  const needsCompress = originalSize > MAX_BYTES;

  // If already within 1080p and <= 1MB, return original as-is
  if (!needsResize && !needsCompress) {
    const previewUrl = URL.createObjectURL(file);
    return {
      file,
      previewUrl,
      originalSize,
      finalSize: originalSize,
      originalWidth: origW,
      originalHeight: origH,
      finalWidth: origW,
      finalHeight: origH,
      wasAdjusted: false,
    };
  }

  // Calculate target dimensions preserving aspect ratio
  let targetW = origW;
  let targetH = origH;

  if (needsResize) {
    const ratio = Math.min(maxW / origW, maxH / origH);
    targetW = Math.round(origW * ratio);
    targetH = Math.round(origH * ratio);
  }

  // Render on canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context tidak tersedia.');
  }

  // Quality rendering settings
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageElement, 0, 0, targetW, targetH);

  // Iteratively compress quality until size <= 1MB
  let quality = 0.92;
  let blob: Blob | null = null;
  const mimeType = 'image/jpeg';

  while (quality >= 0.3) {
    blob = await canvasToBlob(canvas, mimeType, quality);
    if (blob.size <= MAX_BYTES || quality <= 0.35) {
      break;
    }
    quality -= 0.1;
  }

  if (!blob) {
    throw new Error('Gagal memproses kompresi gambar.');
  }

  // Clean filename with .jpg extension if converted
  const cleanName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
  const processedFile = new File([blob], cleanName, {
    type: mimeType,
    lastModified: Date.now(),
  });

  const previewUrl = URL.createObjectURL(processedFile);

  return {
    file: processedFile,
    previewUrl,
    originalSize,
    finalSize: processedFile.size,
    originalWidth: origW,
    originalHeight: origH,
    finalWidth: targetW,
    finalHeight: targetH,
    wasAdjusted: true,
  };
}

function loadImage(file: File): Promise<{ width: number; height: number; imageElement: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          imageElement: img,
        });
      };
      img.onerror = () => reject(new Error('Gagal membaca format gambar'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file dari disk'));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob gagal'));
      },
      mimeType,
      quality
    );
  });
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export const processEvidencePhoto = processJournalPhoto;
export const compressImage = processJournalPhoto;

