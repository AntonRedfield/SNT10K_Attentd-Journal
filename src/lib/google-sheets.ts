import { google, sheets_v4, Auth } from 'googleapis';
import fs from 'fs';
import path from 'path';

let sheetsInstance: sheets_v4.Sheets | null = null;

function formatPrivateKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) return undefined;
  let key = rawKey.trim();

  // If user pasted entire service-account JSON into GOOGLE_PRIVATE_KEY
  if (key.startsWith('{') && key.endsWith('}')) {
    try {
      const parsed = JSON.parse(key);
      if (parsed.private_key) key = parsed.private_key.trim();
    } catch {}
  }

  // 1. Remove wrapping quotes (single or double)
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  // 2. Unescape escaped quotes if present
  key = key.replace(/\\"/g, '"').replace(/\\'/g, "'");

  // 3. Normalize all escaped newlines
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 4. Reconstruct clean PEM if headers exist
  const headerMatch = key.match(/-----BEGIN [A-Z ]+-----/);
  const footerMatch = key.match(/-----END [A-Z ]+-----/);

  if (headerMatch && footerMatch) {
    const header = headerMatch[0];
    const footer = footerMatch[0];
    const headerIndex = key.indexOf(header);
    const footerIndex = key.indexOf(footer);

    const body = key
      .substring(headerIndex + header.length, footerIndex)
      .replace(/\s+/g, ''); // strip all spaces/newlines from base64 content

    const chunks = body.match(/.{1,64}/g) || [body];
    return `${header}\n${chunks.join('\n')}\n${footer}\n`;
  }

  return key;
}

export function getGoogleAuth(): Auth.GoogleAuth {
  // 0. Check if physical JSON service account file exists on disk
  try {
    const possiblePaths = [
      path.join(process.cwd(), 'src', 'lib', 'absensi-snt-10-kupang-52cc0f517847.json'),
      path.join(process.cwd(), 'absensi-snt-10-kupang-52cc0f517847.json'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return new google.auth.GoogleAuth({
          keyFile: p,
          scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive',
          ],
        });
      }
    }
  } catch {
    // Fall back to env vars
  }

  let client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  let private_key = formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY);


  // 1. Check if full JSON (raw or base64) is provided via GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_CREDENTIALS
  const fullJsonRaw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (fullJsonRaw) {
    try {
      let jsonStr = fullJsonRaw.trim();
      if (!jsonStr.startsWith('{')) {
        jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8');
      }
      if (jsonStr.startsWith('{')) {
        const parsed = JSON.parse(jsonStr);
        if (parsed.client_email) client_email = parsed.client_email.trim();
        if (parsed.private_key) private_key = formatPrivateKey(parsed.private_key);
      }
    } catch (e) {
      console.error('Failed to parse full service account JSON:', e);
    }
  }

  // 2. Check if private key alone was base64-encoded
  const b64Key = process.env.GOOGLE_PRIVATE_KEY_BASE64;
  if (b64Key && !private_key) {
    try {
      const decoded = Buffer.from(b64Key.trim(), 'base64').toString('utf8');
      private_key = formatPrivateKey(decoded);
    } catch {}
  }

  if (!client_email) {
    throw new Error('Konfigurasi GOOGLE_SERVICE_ACCOUNT_EMAIL belum diisi di Environment Variables.');
  }
  if (!private_key) {
    throw new Error('Konfigurasi GOOGLE_PRIVATE_KEY belum diisi di Environment Variables.');
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email,
      private_key,
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

function getSheets(): sheets_v4.Sheets {
  if (sheetsInstance) return sheetsInstance;

  const spreadsheetId = (process.env.GOOGLE_SHEET_ID || '').trim();
  if (!spreadsheetId) {
    throw new Error('Konfigurasi GOOGLE_SHEET_ID belum diisi di Environment Variables.');
  }

  const auth = getGoogleAuth();
  sheetsInstance = google.sheets({ version: 'v4', auth });
  return sheetsInstance;
}


const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '';

/**
 * Execute with auto-retry on network timeout/transient error.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 800): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const isNetworkError =
        err instanceof Error &&
        (err.message.includes('ETIMEDOUT') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('ENOTFOUND') ||
          err.message.includes('rateLimitExceeded') ||
          err.message.includes('socket hang up'));

      if (isNetworkError && i < retries - 1) {
        await new Promise((res) => setTimeout(res, delay * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Read all rows from a sheet tab. Returns array of objects keyed by header names.
 */
export async function getSheetRows<T = Record<string, string>>(
  sheetName: string
): Promise<T[]> {
  return withRetry(async () => {
    const sheets = getSheets();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) return [];

    const headers = rows[0] as string[];
    return rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, i) => {
        const rawHeader = header || '';
        obj[rawHeader] = row[i] || '';
        const normKey = rawHeader.trim().toLowerCase().replace(/\s+/g, '_');
        if (normKey && !obj[normKey]) {
          obj[normKey] = row[i] || '';
        }
      });

      // Fallback for Users sheet to guarantee fields even if header row was short
      if (sheetName === 'Users') {
        obj.user_id = obj.user_id || row[0] || '';
        obj.username = obj.username || row[1] || '';
        obj.password = obj.password || row[2] || '';
        obj.role = obj.role || row[3] || '';
        obj.assigned_class = obj.assigned_class || row[4] || '';
        obj.nip = obj.nip || row[5] || '';
        obj.pin = obj.pin || (row[6] !== undefined ? row[6] : '');
        obj.biometric_credential_id = obj.biometric_credential_id || (row[7] !== undefined ? row[7] : '');
        obj.biometric_public_key = obj.biometric_public_key || (row[8] !== undefined ? row[8] : '');
      }

      // Fallback for Attendance sheet if headers vary
      if (sheetName === 'Attendance') {
        obj.timestamp = obj.timestamp || row[0] || '';
        obj.date = obj.date || row[1] || '';
        obj.class_name = obj.class_name || row[2] || '';
        obj.student_id = obj.student_id || row[3] || '';
        obj.full_name = obj.full_name || row[4] || '';
        obj.attendance_status = obj.attendance_status || obj.status || row[5] || '';
        obj.note = obj.note || row[6] || '';
        obj.recorded_by_username = obj.recorded_by_username || row[7] || '';
        obj.attachment_url = obj.attachment_url || obj.photo_url || obj.evidence_url || (row[8] !== undefined ? row[8] : '');
      }

      // Fallback for Students sheet
      if (sheetName === 'Students') {
        obj.student_id = obj.student_id || row[0] || '';
        obj.full_name = obj.full_name || row[1] || '';
        obj.class_name = obj.class_name || row[2] || '';
        obj.is_active = obj.is_active !== undefined ? obj.is_active : (row[3] || 'TRUE');
      }

      // Fallback for Journals if photo_url was appended before header update
      if (sheetName === 'Journals') {
        obj.journal_id = obj.journal_id || row[0] || '';
        obj.timestamp = obj.timestamp || row[1] || '';
        obj.class_name = obj.class_name || row[2] || '';
        obj.subject_name = obj.subject_name || row[3] || '';
        obj.week_number = obj.week_number || row[4] || '';
        obj.topic = obj.topic || row[5] || '';
        obj.teacher_username = obj.teacher_username || row[6] || '';
        if (!obj.photo_url && row[7]) {
          obj.photo_url = row[7];
        }
      }
      return obj as T;
    });
  });
}

/**
 * Append multiple rows to a sheet in a single batch call.
 */
export async function appendRows(
  sheetName: string,
  rows: string[][]
): Promise<void> {
  return withRetry(async () => {
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    });
  });
}

/**
 * Append a single row to a sheet.
 */
export async function appendRow(
  sheetName: string,
  row: string[]
): Promise<void> {
  await appendRows(sheetName, [row]);
}

/**
 * Find row index (0-based, excluding header) matching a predicate.
 * Returns the 1-based sheet row number (for deletion or update).
 */
export async function findRowIndex(
  sheetName: string,
  predicate: (row: Record<string, string>) => boolean
): Promise<number> {
  return withRetry(async () => {
    const sheets = getSheets();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) return -1;

    const headers = rows[0] as string[];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const obj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        const rawHeader = header || '';
        obj[rawHeader] = row[idx] || '';
        const normKey = rawHeader.trim().toLowerCase().replace(/\s+/g, '_');
        if (normKey && !obj[normKey]) {
          obj[normKey] = row[idx] || '';
        }
      });

      // Positional fallbacks for Users
      if (sheetName === 'Users') {
        obj.user_id = obj.user_id || row[0] || '';
        obj.username = obj.username || row[1] || '';
        obj.password = obj.password || row[2] || '';
        obj.role = obj.role || row[3] || '';
        obj.assigned_class = obj.assigned_class || row[4] || '';
        obj.nip = obj.nip || row[5] || '';
        obj.pin = obj.pin || (row[6] !== undefined ? row[6] : '');
        obj.biometric_credential_id = obj.biometric_credential_id || (row[7] !== undefined ? row[7] : '');
        obj.biometric_public_key = obj.biometric_public_key || (row[8] !== undefined ? row[8] : '');
      }

      if (sheetName === 'Students') {
        obj.student_id = obj.student_id || row[0] || '';
        obj.full_name = obj.full_name || row[1] || '';
        obj.class_name = obj.class_name || row[2] || '';
        obj.is_active = obj.is_active !== undefined ? obj.is_active : (row[3] || 'TRUE');
      }

      if (predicate(obj)) return i + 1; // 1-based for Sheets API
    }
    return -1;
  });
}

/**
 * Delete a row by its 1-based row number. Requires the sheet's gid (sheetId).
 */
export async function deleteRow(
  sheetName: string,
  rowNumber: number
): Promise<void> {
  return withRetry(async () => {
    const sheets = getSheets();

    // First get the sheet ID (gid) from the sheet name
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === sheetName
    );

    if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
      throw new Error(`Lembar kerja "${sheetName}" tidak ditemukan`);
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheet.properties.sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1, // 0-based
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });
  });
}

/**
 * Update a specific cell value.
 */
export async function updateCell(
  sheetName: string,
  rowNumber: number,
  columnIndex: number,
  value: string
): Promise<void> {
  return withRetry(async () => {
    const sheets = getSheets();
    const colLetter = String.fromCharCode(65 + columnIndex); // A=0, B=1, ...
    const range = `${sheetName}!${colLetter}${rowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[value]],
      },
    });
  });
}

/**
 * Create a new sheet tab with headers.
 */
export async function createSheetTab(
  sheetName: string,
  headers: string[]
): Promise<void> {
  return withRetry(async () => {
    const sheets = getSheets();

    // Check if sheet already exists
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const exists = spreadsheet.data.sheets?.some(
      (s) => s.properties?.title === sheetName
    );

    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetName },
              },
            },
          ],
        },
      });
    }

    // Write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
  });
}

/**
 * Update an entire row (used for editing user/student data).
 */
export async function updateRow(
  sheetName: string,
  rowNumber: number,
  values: string[]
): Promise<void> {
  return withRetry(async () => {
    const sheets = getSheets();
    const range = `${sheetName}!A${rowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });
  });
}
