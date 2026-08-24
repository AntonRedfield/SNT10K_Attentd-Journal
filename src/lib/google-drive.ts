import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { getGoogleAuth } from './google-sheets';
import { DEFAULT_DRIVE_FOLDER_ID } from './constants';

let driveInstance: drive_v3.Drive | null = null;

export function getDrive(): drive_v3.Drive {
  if (driveInstance) return driveInstance;
  const auth = getGoogleAuth();
  driveInstance = google.drive({ version: 'v3', auth });
  return driveInstance;
}

export interface UploadDriveResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
  directUrl: string;
  thumbnailUrl: string;
}

/**
 * Upload an image buffer directly to the specified Google Drive folder.
 * Supports Google Apps Script Web App (Personal 15GB Drive) and Google Service Account.
 */
export async function uploadFileToDrive({
  buffer,
  fileName,
  mimeType = 'image/jpeg',
  folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || DEFAULT_DRIVE_FOLDER_ID,
}: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  folderId?: string;
}): Promise<UploadDriveResult> {
  const webAppUrl =
    process.env.GOOGLE_DRIVE_WEBAPP_URL?.trim() ||
    process.env.GOOGLE_APPS_SCRIPT_URL?.trim();

  // Method 1: Google Apps Script Web App (Bypasses Service Account 0MB quota on personal Gmail)
  if (webAppUrl) {
    try {
      const base64 = buffer.toString('base64');
      const payload = {
        folderId,
        fileName,
        mimeType,
        base64,
      };

      const res = await fetch(webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data && (data.fileId || data.directUrl || data.webViewLink)) {
        const fileId = data.fileId || '';
        const directUrl = data.directUrl || (fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : '');
        const webViewLink = data.webViewLink || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : '');
        const thumbnailUrl = data.thumbnailUrl || (fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` : directUrl);

        return {
          fileId,
          fileName,
          webViewLink,
          directUrl: directUrl || webViewLink,
          thumbnailUrl,
        };
      }
      console.warn('Google Apps Script Web App returned non-success:', data);
    } catch (webAppErr) {
      console.error('Google Apps Script Web App upload error:', webAppErr);
    }
  }

  // Method 2: Google Service Account
  try {
    const drive = getDrive();

    // Create readable stream from buffer
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType,
      body: bufferStream,
    };

    // Upload file to Google Drive
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      supportsAllDrives: true,
      fields: 'id, name, webViewLink, webContentLink, thumbnailLink',
    });

    const fileId = response.data.id;
    if (!fileId) {
      throw new Error('Gagal mendapatkan ID file setelah upload ke Google Drive.');
    }

    // Grant public read permission to allow image rendering in the app and report prints
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true,
      });
    } catch (permErr) {
      console.warn('Note: Could not explicitly set public reader permission on Drive file:', permErr);
    }

    // Direct image URL for high-res embedding
    const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    const webViewLink = response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
    const thumbnailUrl = response.data.thumbnailLink || `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;

    return {
      fileId,
      fileName: response.data.name || fileName,
      webViewLink,
      directUrl,
      thumbnailUrl,
    };
  } catch (driveErr) {
    console.error('Direct Google Drive API upload error:', driveErr);
    throw driveErr;
  }
}

/**
 * Retrieve a file stream and metadata from Google Drive for streaming/proxying.
 */
export async function getDriveFileStream(fileId: string): Promise<{
  stream: NodeJS.ReadableStream;
  mimeType: string;
  name: string;
}> {
  const drive = getDrive();

  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType',
  });

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return {
    stream: res.data as NodeJS.ReadableStream,
    mimeType: meta.data.mimeType || 'image/jpeg',
    name: meta.data.name || 'image.jpg',
  };
}
