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
 * Automatically configures public read access for embedding & print display.
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
    supportsTeamDrives: true,
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
