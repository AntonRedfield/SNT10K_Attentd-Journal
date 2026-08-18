import { google, sheets_v4 } from 'googleapis';

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

function getSheets(): sheets_v4.Sheets {
  if (sheetsInstance) return sheetsInstance;

  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const private_key = formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  const spreadsheetId = (process.env.GOOGLE_SHEET_ID || '').trim();

  if (!client_email) {
    throw new Error('Konfigurasi GOOGLE_SERVICE_ACCOUNT_EMAIL belum diisi di Environment Variables.');
  }
  if (!private_key) {
    throw new Error('Konfigurasi GOOGLE_PRIVATE_KEY belum diisi di Environment Variables.');
  }
  if (!spreadsheetId) {
    throw new Error('Konfigurasi GOOGLE_SHEET_ID belum diisi di Environment Variables.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email,
      private_key,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

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
        obj[header] = row[i] || '';
      });
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
 * Returns the 1-based sheet row number (for deletion).
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
      const obj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        obj[header] = rows[i][idx] || '';
      });
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
