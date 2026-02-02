import { google } from 'googleapis';
import { ExternalAccountClient } from 'google-auth-library';

export const runtime = 'nodejs';

const DEFAULT_GOOGLE_SHEET_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQq1BmWCARHg41kA2M-29jnot50W_c-O76dT3tKSkDAqn8jU4LMjArUKjnd1eZEV0roeALrMB7jWT5C';

function getBaseUrl() {
  return (
    process.env.GOOGLE_SHEET_BASE ||
    process.env.NEXT_PUBLIC_GOOGLE_SHEET_BASE ||
    DEFAULT_GOOGLE_SHEET_BASE
  );
}

function getPrivateSpreadsheetId() {
  return process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || '';
}

function getGcpProjectNumber() {
  return process.env.GCP_PROJECT_NUMBER || '';
}

function getGcpServiceAccountEmail() {
  return process.env.GCP_SERVICE_ACCOUNT_EMAIL || '';
}

function getWorkloadIdentityPoolId() {
  return process.env.GCP_WORKLOAD_IDENTITY_POOL_ID || '';
}

function getWorkloadIdentityPoolProviderId() {
  return process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID || '';
}

function hasVercelWifConfig() {
  return (
    !!getPrivateSpreadsheetId() &&
    !!getGcpProjectNumber() &&
    !!getGcpServiceAccountEmail() &&
    !!getWorkloadIdentityPoolId() &&
    !!getWorkloadIdentityPoolProviderId()
  );
}

function getDetailsTabName() {
  return process.env.GOOGLE_SHEETS_DETAILS_TAB || 'Details';
}

function getSettingsTabName() {
  return process.env.GOOGLE_SHEETS_SETTINGS_TAB || 'Settings';
}

function hasServiceAccountConfig() {
  return (
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (!!process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL &&
      !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
  );
}

function hasOAuthRefreshConfig() {
  return (
    !!process.env.GOOGLE_OAUTH_CLIENT_ID &&
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

function hasPrivateSheetsConfig() {
  return (
    !!getPrivateSpreadsheetId() &&
    (hasVercelWifConfig() || hasServiceAccountConfig() || hasOAuthRefreshConfig())
  );
}

function isValidGid(value) {
  return typeof value === 'string' && /^[0-9]+$/.test(value);
}

function buildGoogleCsvUrl({ sheet, format, gid }) {
  const base = getBaseUrl();

  if (format === 'pub') {
    // Published CSV URL format.
    if (sheet === 'details' && !gid) {
      return `${base}/pub?output=csv`;
    }
    if (!gid) {
      throw new Error('gid is required for this request');
    }
    return `${base}/pub?output=csv&gid=${gid}`;
  }

  if (format === 'export') {
    if (!gid) {
      throw new Error('gid is required for export format');
    }
    return `${base}/export?format=csv&gid=${gid}`;
  }

  throw new Error('Invalid format');
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function valuesToCsv(values) {
  if (!Array.isArray(values) || values.length === 0) return '';
  const maxLen = values.reduce((m, row) => Math.max(m, Array.isArray(row) ? row.length : 0), 0);
  return values
    .map((row) => {
      const cells = Array.from({ length: maxLen }, (_, i) => escapeCsvCell((row || [])[i] ?? ''));
      return cells.join(',');
    })
    .join('\n');
}

async function getGoogleAuth() {
  // Preferred for Vercel: keyless OIDC -> Google Workload Identity Federation.
  // This avoids storing service account key JSON in Vercel env vars.
  // Vercel provides the OIDC token in:
  // - builds/dev: process.env.VERCEL_OIDC_TOKEN
  // - functions: request header "x-vercel-oidc-token"
  // We'll wire the token into google-auth-library's ExternalAccountClient.
  //
  // Docs:
  // - https://vercel.com/docs/oidc and https://vercel.com/docs/oidc/gcp
  // - https://docs.cloud.google.com/iam/docs/workload-identity-federation
  if (hasVercelWifConfig()) {
    throw new Error(
      'Vercel WIF auth requires the request object. Use getGoogleAuthFromRequest(request) instead.'
    );
  }

  if (hasServiceAccountConfig()) {
    let clientEmail;
    let privateKey;

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      clientEmail = parsed.client_email;
      privateKey = parsed.private_key;
    } else {
      clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
      privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    }

    if (!clientEmail || !privateKey) {
      throw new Error('Service account credentials are incomplete.');
    }

    const normalizedKey = String(privateKey).replace(/\\n/g, '\n');

    return new google.auth.JWT({
      email: clientEmail,
      key: normalizedKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }

  if (hasOAuthRefreshConfig()) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    });
    return oauth2Client;
  }

  throw new Error('No Google auth configured.');
}

async function getGoogleAuthFromRequest(request) {
  if (!hasVercelWifConfig()) {
    return await getGoogleAuth();
  }

  const vercelOidcToken =
    request.headers.get('x-vercel-oidc-token') || process.env.VERCEL_OIDC_TOKEN || '';

  if (!vercelOidcToken) {
    throw new Error(
      'Missing Vercel OIDC token. Ensure "Secure backend access with OIDC federation" is enabled in Vercel project settings.'
    );
  }

  const projectNumber = getGcpProjectNumber();
  const poolId = getWorkloadIdentityPoolId();
  const providerId = getWorkloadIdentityPoolProviderId();
  const serviceAccountEmail = getGcpServiceAccountEmail();

  const authClient = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: async () => vercelOidcToken,
    },
  });

  return authClient;
}

async function fetchPrivateSheetCsv({ sheet, request }) {
  const spreadsheetId = getPrivateSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error(
      'Missing GOOGLE_SHEET_ID (private sheet mode). Set it to your spreadsheet id from the Google Sheets URL.'
    );
  }

  const tabName = sheet === 'settings' ? getSettingsTabName() : getDetailsTabName();
  const auth = await getGoogleAuthFromRequest(request);
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabName,
    majorDimension: 'ROWS',
  });

  const values = res.data.values || [];
  return valuesToCsv(values);
}

export async function GET(request) {
  const url = new URL(request.url);
  const sheet = url.searchParams.get('sheet') || 'details';
  const format = url.searchParams.get('format') || 'pub';
  const gidParam = url.searchParams.get('gid');

  if (sheet !== 'details' && sheet !== 'settings') {
    return Response.json({ error: 'Invalid sheet' }, { status: 400 });
  }

  if (gidParam && !isValidGid(gidParam)) {
    return Response.json({ error: 'Invalid gid' }, { status: 400 });
  }

  // PRIVATE SHEET MODE (Google Sheets API via OAuth refresh token or Service Account)
  // This avoids CORS and works on Vercel even for private spreadsheets.
  if (hasPrivateSheetsConfig()) {
    try {
      const csv = await fetchPrivateSheetCsv({ sheet, request });
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      return Response.json(
        {
          error: `Private sheet fetch failed: ${e.message}`,
          hint:
            'For Vercel keyless auth: set GOOGLE_SHEET_ID + GCP_* env vars and configure Workload Identity Federation. Ensure the Google Sheet is shared with the service account email. For fallback: set GOOGLE_SERVICE_ACCOUNT_* or GOOGLE_OAUTH_* env vars.',
        },
        { status: 502 }
      );
    }
  }

  // PUBLIC / PUBLISHED CSV MODE (works only if the sheet is published to web)
  const gid =
    gidParam ||
    (sheet === 'settings' ? '1' : undefined); // Settings default gid is 1 in the original project

  let targetUrl;
  try {
    targetUrl = buildGoogleCsvUrl({ sheet, format, gid });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  try {
    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        // Helps Google return CSV reliably in some cases.
        'User-Agent': 'gahanga-house-dashboard',
      },
    });

    const text = await res.text();

    if (!res.ok) {
      return new Response(text, {
        status: res.status,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return Response.json(
      { error: `Failed to fetch Google Sheets CSV: ${e.message}` },
      { status: 502 }
    );
  }
}

