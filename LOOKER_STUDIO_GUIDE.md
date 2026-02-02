# Google Looker Studio Dashboard Setup Guide

## Overview
This guide will help you convert your HTML dashboard into a Google Looker Studio dashboard that connects directly to your Google Sheet.

## Step-by-Step Setup

### 1. Prepare Your Google Sheet

1. **Ensure your Google Sheet is accessible:**
   - Open your `GAHANGA HOUSE CONSTRUCTION` Google Sheet
   - Make sure both **Details** and **Settings** sheets are present
   - Ensure the sheet is shared appropriately (if working with a team)

2. **Verify data structure:**
   - Details sheet should have: Date, Section, Task / Description, Cost, Money In, Money In Method, Payment Method, Cost Type, etc.
   - Settings sheet should have: Section, PaymentMethod, Status, CostType

### 2. Create a New Looker Studio Dashboard

1. **Go to Looker Studio:**
   - Visit: https://datastudio.google.com
   - Sign in with your Google account

2. **Create a new data source:**
   - Click **"Create"** → **"Data Source"**
   - Select **"Google Sheets"** from the connectors
   - Find and select your `GAHANGA HOUSE CONSTRUCTION` spreadsheet
   - Select the **"Details"** sheet

3. **Configure the data source:**
   - Set field types:
     - **Date**: Date field (format: DD/MM/YYYY or auto-detect)
     - **Cost**: Number (currency)
     - **Money In**: Number (currency)
     - **Section**: Text/Dimension
     - **Cost Type**: Text/Dimension
     - **Payment Method**: Text/Dimension
     - **Money In Method**: Text/Dimension
   - Click **"Add a connection"** or **"Done"**

### 3. Create Summary Cards

1. **Total Money Given:**
   - Insert → **Scorecard**
   - Metric: `SUM(Money In)`
   - Format: Currency (RWF)

2. **Total Spending:**
   - Insert → **Scorecard**
   - Metric: `SUM(Cost)`
   - Format: Currency (RWF)

3. **Balance:**
   - Insert → **Scorecard**
   - Metric: `SUM(Money In) - SUM(Cost)`
   - Format: Currency (RWF)
   - Conditional formatting: Green if positive, Red if negative

4. **Transaction Count:**
   - Insert → **Scorecard**
   - Metric: `COUNT(Date)`
   - Format: Number

### 4. Create Section Summary Cards

1. **Insert a Table:**
   - Insert → **Table**
   - Dimensions: `Section`
   - Metrics:
     - `SUM(Cost)` (rename to "Total Spending")
     - `SUM(Money In)` (rename to "Total Received")
   - Add conditional formatting for spending amounts

2. **Or create individual cards per section:**
   - Use Filter controls + Scorecards for each section

### 5. Create Visualizations

#### Spending by Section (Pie Chart)
- Insert → **Pie Chart**
- Dimension: `Section`
- Metric: `SUM(Cost)`

#### Spending by Cost Type (Bar Chart)
- Insert → **Bar Chart**
- Dimension: `Cost Type`
- Metric: `SUM(Cost)`
- Apply colors based on cost type:
  - Material: Blue
  - Manpower: Green
  - Other: Amber
  - cash in: Green
  - cash out: Red
  - Repairing: Purple

#### Timeline: Money In vs Spending
- Insert → **Time Series Chart**
- Dimension: `Date`
- Metrics:
  - `SUM(Money In)` (series 1, green)
  - `SUM(Cost)` (series 2, red)

#### Spending by Payment Method
- Insert → **Bar Chart**
- Dimension: `Payment Method`
- Metric: `SUM(Cost)`

#### Money Received by Method
- Insert → **Bar Chart`
- Dimension: `Money In Method`
- Metric: `SUM(Money In)`

### 6. Create Transaction Table

1. **Insert a Table:**
   - Insert → **Table`
   - Dimensions:
     - `Date`
     - `Section`
     - `Task / Description`
     - `Cost Type`
     - `Payment Method`
     - `Money In Method`
   - Metrics:
     - `Money In`
     - `Cost`
   - Sorting: Date (Ascending)

2. **Add calculated field for Running Balance:**
   - Resource → **Manage calculated fields**
   - Create a field: `Running Balance`
   - Formula: `RUNNING_SUM(Money In - Cost)`

### 7. Add Filters

1. **Date Range Filter:**
   - Insert → **Date Range Control**
   - Field: `Date`

2. **Section Filter:**
   - Insert → **Filter Control`
   - Dimension: `Section`

3. **Cost Type Filter:**
   - Insert → **Filter Control`
   - Dimension: `Cost Type`

### 8. Style and Format

1. **Theme:**
   - Theme and Layout → Choose a theme or customize colors

2. **Layout:**
   - Arrange components in a grid layout
   - Use section headers to organize groups

3. **Conditional Formatting:**
   - Apply colors to match cost types
   - Use conditional formatting for balances

### 9. Share the Dashboard

1. **Click "Share" button**
2. **Add people or get shareable link**
3. **Set permissions** (Viewer, Editor, Owner)

## Advanced Features

### Blended Data Sources (for Settings Sheet)

1. **Add Settings sheet as second data source:**
   - Add another data source from same Google Sheet
   - Select "Settings" sheet

2. **Create a blended data source:**
   - Resource → **Manage blended data`
   - Join on `Section` field
   - Include fields from both sources

### Calculated Fields Examples

- **Balance**: `SUM(Money In) - SUM(Cost)`
- **Percentage by Section**: `SUM(Cost) / TOTAL(SUM(Cost))`
- **Average Transaction**: `AVG(Cost)`

### Filter Interactions

- Set filters to affect multiple charts
- Use filter interactions for drill-down capabilities

## Tips and Best Practices

1. **Performance:**
   - Use date range filters to limit data
   - Consider creating aggregated views in your Google Sheet

2. **Data Refresh:**
   - Data refreshes automatically when Google Sheet is updated
   - Can set manual refresh schedules if needed

3. **Mobile View:**
   - Use responsive layouts
   - Test on mobile devices

4. **Branding:**
   - Add logos
   - Customize colors to match your brand
   - Add title and descriptions

## Comparison: HTML Dashboard vs Looker Studio

| Feature | HTML Dashboard | Looker Studio |
|---------|---------------|---------------|
| Setup | Code-based | Visual drag-and-drop |
| Data Connection | Requires published sheet | Direct Google Sheets integration |
| Sharing | Manual server setup | Built-in sharing |
| Mobile | Responsive HTML | Native mobile support |
| Updates | Auto-refresh on page load | Real-time from Google Sheet |
| Customization | Full code control | Limited by Looker Studio features |
| Cost | Free (hosting needed) | Free |

## Need Help?

If you need assistance setting up specific visualizations or have questions about Looker Studio features, refer to:
- [Looker Studio Help Center](https://support.google.com/looker-studio/)
- [Looker Studio Community](https://support.google.com/looker-studio/community)

## Alternative: Hybrid Approach

You can also:
1. Keep your HTML dashboard for custom features
2. Create a Looker Studio dashboard for sharing with stakeholders
3. Use both depending on the audience
