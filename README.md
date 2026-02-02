# GAHANGA House Construction Dashboard

An interactive dashboard (now a **React / Next.js app**) to track construction finances, monitor payments to engineers, and analyze spending by construction section and cost type.

## Features

- **Financial Summary Cards**: View total money given, total spending, balance, and transaction count
- **Interactive Filters**: Filter transactions by date range, construction section, cost type, and transaction type
- **Data Visualizations**:
  - Pie chart showing spending breakdown by construction section
  - Bar chart showing spending by cost type
  - Line chart showing timeline of money in vs spending
- **Transaction Table**: Sortable table with all transaction details including running balance

## Setup

1. **Publish your Google Sheet to the web:**
   - Open your Google Sheet
   - Go to **File → Share → Publish to web**
   - Make sure both **"Details"** and **"Settings"** sheets are published
   - Choose **"Comma-separated values (.csv)"** format
   - Click **"Publish"**
   - Note: The dashboard primarily uses the **"Details"** sheet for transaction data

2. **Run the app locally:**

### Quick Start (Easiest Method)

**Install dependencies:**
```bash
npm install
```

**Start dev server:**
```bash
npm run dev
```

Then open: **http://localhost:3000** in your browser

### Alternative Methods

If you want a production build locally:

```bash
npm run build
npm start
```

## Data Requirements

The dashboard fetches data from two sheets:

### Details Sheet (Main Data Source)
Your Google Sheet's **"Details"** sheet should have the following columns:
- **Date**: Transaction date
- **Section**: Construction section (Foundation, Roofing, Structure/Walls, etc.)
- **Task / Description**: Description of the task/expense
- **Cost**: Spending/expenses
- **Money In**: Payments made to the engineer
- **Cost Type**: Type of cost (Material, Manpower, Other, cash in, cash out, Repairing)
- **Payment Method**: Method of payment (Cash, Mobile Money, Bank Transfer, etc.)
- **Vendor / Contractor**: Vendor or contractor name (optional)
- **Status**: Transaction status (optional)

### Settings Sheet (Reference Data - Optional)
The **"Settings"** sheet is used for reference data and should have:
- **Section**: Construction section name
- **PaymentMethod**: Default payment method
- **Status**: Default status
- **CostType**: Default cost type

## Troubleshooting

### Data Not Loading
- Ensure your Google Sheet is published to the web
- Check that the "Overview" sheet contains data
- Verify the sheet has the required columns (Date, Money In, Cost.2)
- Check browser console for error messages

### CORS Errors
- This app uses a same-origin `/api/sheets` proxy to avoid browser CORS issues
- Ensure the Google Sheet is published (not just shared)

### Charts Not Displaying
- Check that you have internet connection (Chart.js is loaded from CDN)
- Verify there is spending data in your sheet
- Check browser console for JavaScript errors

## File Structure

```
gahanga/
├── app/            # Next.js app (React)
├── app/api/sheets  # Google Sheets CSV proxy (avoids CORS on Vercel)
├── app/ui          # Dashboard UI components
└── README.md       # This file
```

## Deploy to Vercel

1. Push to GitHub (already done)
2. In Vercel, import the GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Deploy

## Private Google Sheet (recommended setup)

If your Google Sheet is **private**, the app must use the **Google Sheets API** (server-side). The frontend still loads data from `/api/sheets`, but the server uses credentials from environment variables.

### Option A (recommended / keyless): Vercel OIDC + Google Workload Identity Federation

This is the most secure option because you **do not store any service account key** in Vercel. Vercel issues a short-lived OIDC token and Google exchanges it for short-lived credentials (service account impersonation). See:

- Vercel OIDC overview: `https://vercel.com/docs/oidc`
- Vercel ↔︎ GCP setup: `https://vercel.com/docs/oidc/gcp`
- Google Workload Identity Federation: `https://docs.cloud.google.com/iam/docs/workload-identity-federation`

**Vercel env vars to set:**

- `GOOGLE_SHEET_ID`: your spreadsheet id (from the URL, looks like `1AbC...`)
- `GCP_PROJECT_NUMBER`
- `GCP_SERVICE_ACCOUNT_EMAIL` (you said: `gahanga-webcrower@ferrous-syntax-377008.iam.gserviceaccount.com`)
- `GCP_WORKLOAD_IDENTITY_POOL_ID`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- (optional) `GOOGLE_SHEETS_DETAILS_TAB`: defaults to `Details`
- (optional) `GOOGLE_SHEETS_SETTINGS_TAB`: defaults to `Settings`

**Google Sheet sharing:**

- Share the spreadsheet with the service account email (Viewer access is enough).

### Option B: Service Account JSON (simpler, but stores a key)

1. Create a Google Cloud **Service Account** and download its JSON key.
2. Share your Google Sheet with the service account email (Viewer access is enough).
3. In Vercel → Project → Settings → Environment Variables, set:

- `GOOGLE_SHEET_ID`: your spreadsheet id (from the URL, looks like `1AbC...`)
- `GOOGLE_SERVICE_ACCOUNT_JSON`: the full JSON key contents (as a single env var)
- (optional) `GOOGLE_SHEETS_DETAILS_TAB`: defaults to `Details`
- (optional) `GOOGLE_SHEETS_SETTINGS_TAB`: defaults to `Settings`

### Option C: OAuth Client (Client ID/Secret + Refresh Token)

If you prefer using your OAuth client:

- `GOOGLE_SHEET_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

This requires generating a refresh token once (locally) and then storing it in Vercel env vars.

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Modern browsers with JavaScript enabled

## Notes

- The dashboard automatically fetches data from your published Google Sheet
- Data is processed client-side (no server required)
- All calculations and filtering happen in your browser
- The dashboard updates automatically when you refresh the page (if your Google Sheet data has changed)
