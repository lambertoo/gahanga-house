# GAHANGA House Construction Dashboard

An interactive HTML dashboard to track construction finances, monitor payments to engineers, and analyze spending by construction section and cost type.

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

2. **Start a local web server** (Required to avoid CORS errors):

### Quick Start (Easiest Method)

**On macOS/Linux:**
```bash
./start-server.sh
```

**On Windows:**
```bash
python3 -m http.server 8000
```

Then open: **http://localhost:8000** in your browser

### Alternative Methods

**Python 3:**
```bash
python3 -m http.server 8000
```

**Python 2:**
```bash
python -m SimpleHTTPServer 8000
```

**Node.js (with http-server):**
```bash
npx http-server -p 8000
```

**VS Code:**
- Install the "Live Server" extension
- Right-click on `index.html` and select "Open with Live Server"

### Why a Local Server?

Opening `index.html` directly (file://) will cause CORS (Cross-Origin Resource Sharing) errors when trying to fetch data from Google Sheets. Using a local web server (http://localhost) resolves this issue.

**Note:** The dashboard includes an automatic CORS proxy fallback, but using a local server is more reliable and faster.

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
- Use a local web server instead of opening the file directly
- Ensure the Google Sheet is published (not just shared)

### Charts Not Displaying
- Check that you have internet connection (Chart.js is loaded from CDN)
- Verify there is spending data in your sheet
- Check browser console for JavaScript errors

## File Structure

```
gahanga/
├── index.html      # Main dashboard HTML
├── app.js          # JavaScript logic and data processing
├── styles.css      # Styling
└── README.md       # This file
```

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
