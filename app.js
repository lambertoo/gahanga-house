// Google Sheets URL - Using /pub?output=csv format (simpler, exports published sheet)
const GOOGLE_SHEET_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQq1BmWCARHg41kA2M-29jnot50W_c-O76dT3tKSkDAqn8jU4LMjArUKjnd1eZEV0roeALrMB7jWT5C';
const DETAILS_SHEET_URL = `${GOOGLE_SHEET_BASE}/pub?output=csv`; // Details sheet - main transaction data
// Settings sheet - try pub format first, fallback to export format
const SETTINGS_SHEET_URL_PUB = `${GOOGLE_SHEET_BASE}/pub?output=csv&gid=1`; // Try pub format
const SETTINGS_SHEET_URL = `${GOOGLE_SHEET_BASE}/export?format=csv&gid=1`; // Fallback to export format

// CORS proxy as fallback (if direct fetch fails)
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// Global data storage
let allTransactions = [];
let filteredTransactions = [];
let charts = {};
let settingsData = {}; // Settings sheet data for reference

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupFilters();
});

// Fetch with CORS proxy fallback
async function fetchWithProxy(url) {
    try {
        // Try direct fetch first
        const response = await fetch(url);
        if (response.ok) {
            return await response.text();
        }
        throw new Error(`HTTP ${response.status}`);
    } catch (error) {
        // If direct fetch fails (likely CORS), try with proxy
        console.warn('Direct fetch failed, trying CORS proxy...', error.message);
        try {
            const proxyUrl = CORS_PROXY + encodeURIComponent(url);
            const proxyResponse = await fetch(proxyUrl);
            if (!proxyResponse.ok) {
                throw new Error(`Proxy fetch failed: HTTP ${proxyResponse.status}`);
            }
            return await proxyResponse.text();
        } catch (proxyError) {
            throw new Error(`Failed to fetch data. CORS issue detected. Please use a local web server. Original error: ${error.message}`);
        }
    }
}

// Try to find the correct sheet ID by testing multiple gid values
async function findSheetByGid(gidValues, sheetName) {
    for (const gid of gidValues) {
        try {
            // Try both URL formats
            const url1 = `${GOOGLE_SHEET_BASE}/export?format=csv&gid=${gid}`;
            const url2 = `${GOOGLE_SHEET_BASE}/pub?output=csv&gid=${gid}`;
            console.log(`Trying ${sheetName} sheet with gid=${gid}...`);
            
            let csvText;
            try {
                csvText = await fetchWithProxy(url1);
            } catch (e) {
                csvText = await fetchWithProxy(url2);
            }
            
            // Check if we got HTML instead of CSV
            if (csvText.trim().startsWith('<')) {
                console.warn(`gid=${gid} returned HTML, trying next...`);
                continue;
            }
            
            if (!csvText || csvText.trim().length === 0) {
                console.warn(`gid=${gid} returned empty data, trying next...`);
                continue;
            }
            
            // Try to parse as CSV
            const parsed = Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.trim()
            });
            
            // Check if this looks like the Details sheet (has Date, Cost, Money In columns)
            if (sheetName === 'Details') {
                const hasDate = parsed.meta.fields && parsed.meta.fields.some(f => 
                    f.toLowerCase().includes('date') || f.toLowerCase() === 'date'
                );
                const hasCost = parsed.meta.fields && parsed.meta.fields.some(f => 
                    f.toLowerCase() === 'cost'
                );
                const hasMoneyIn = parsed.meta.fields && parsed.meta.fields.some(f => 
                    f.toLowerCase().includes('money') || f.toLowerCase() === 'money in'
                );
                
                if (hasDate && (hasCost || hasMoneyIn) && parsed.data.length > 0) {
                    console.log(`Found Details sheet at gid=${gid}`);
                    return { csv: csvText, parsed: parsed, gid: gid };
                }
            } else if (sheetName === 'Settings') {
                // Settings sheet should have Section column
                const hasSection = parsed.meta.fields && parsed.meta.fields.some(f => 
                    f.toLowerCase() === 'section'
                );
                if (hasSection && parsed.data.length > 0) {
                    console.log(`Found Settings sheet at gid=${gid}`);
                    return { csv: csvText, parsed: parsed, gid: gid };
                }
            }
        } catch (error) {
            console.warn(`Error trying gid=${gid}:`, error.message);
            continue;
        }
    }
    return null;
}

// Load data from Google Sheets
async function loadData() {
    const loadingOverlay = document.getElementById('loading');
    loadingOverlay.classList.remove('hidden');

    try {
        // First, try the direct /pub?output=csv URL (simplest format)
        console.log('Fetching Details sheet using /pub?output=csv format...');
        let detailsCsv;
        let detailsParsed;
        
        try {
            detailsCsv = await fetchWithProxy(DETAILS_SHEET_URL);
            
            // Check if we got HTML instead of CSV
            if (detailsCsv.trim().startsWith('<')) {
                throw new Error('Received HTML instead of CSV');
            }
            
            if (!detailsCsv || detailsCsv.trim().length === 0) {
                throw new Error('Received empty data');
            }
            
            // Parse the CSV
            detailsParsed = Papa.parse(detailsCsv, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.trim()
            });
            
            // Validate it's the Details sheet
            const hasDate = detailsParsed.meta.fields && detailsParsed.meta.fields.some(f => 
                f.toLowerCase().includes('date') || f.toLowerCase() === 'date'
            );
            const hasCost = detailsParsed.meta.fields && detailsParsed.meta.fields.some(f => 
                f.toLowerCase() === 'cost'
            );
            const hasMoneyIn = detailsParsed.meta.fields && detailsParsed.meta.fields.some(f => 
                f.toLowerCase().includes('money') || f.toLowerCase() === 'money in'
            );
            
            if (!hasDate || (!hasCost && !hasMoneyIn) || !detailsParsed.data || detailsParsed.data.length === 0) {
                throw new Error('Data does not match Details sheet format');
            }
            
            console.log('Successfully loaded Details sheet using /pub?output=csv format');
        } catch (directError) {
            console.warn('Direct /pub?output=csv failed, trying alternative methods...', directError.message);
            
            // Fallback: Try to find Details sheet using gid values
            console.log('Searching for Details sheet using gid values...');
            const gidValues = [2, 0, 1, 3, 4, 5]; // Try Details (2) first, then others
            const detailsResult = await findSheetByGid(gidValues, 'Details');
            
            if (!detailsResult) {
                throw new Error('Could not find Details sheet. Please ensure your Google Sheet is published and contains a sheet with Date, Cost, and Money In columns.');
            }
            
            detailsParsed = detailsResult.parsed;
        }
        
        if (!detailsParsed.data || detailsParsed.data.length === 0) {
            throw new Error('No data found in the Details sheet. Please check that the sheet contains data.');
        }

        // Load Settings sheet (important for organization)
        try {
            console.log('Loading Settings sheet for organization...');
            let settingsCsv;
            try {
                settingsCsv = await fetchWithProxy(SETTINGS_SHEET_URL_PUB);
            } catch (e) {
                console.warn('Pub format failed, trying export format...');
                settingsCsv = await fetchWithProxy(SETTINGS_SHEET_URL);
            }
            
            if (settingsCsv && !settingsCsv.trim().startsWith('<')) {
                const settingsParsed = Papa.parse(settingsCsv, {
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: (header) => header.trim()
                });
                
                // Store settings data for reference and organization
                settingsParsed.data.forEach(row => {
                    if (row.Section) {
                        settingsData[row.Section] = {
                            section: row.Section.trim(),
                            paymentMethod: row.PaymentMethod ? row.PaymentMethod.trim() : '',
                            status: row.Status ? row.Status.trim() : '',
                            costType: row.CostType ? row.CostType.trim() : ''
                        };
                    }
                });
                console.log('Settings data loaded:', Object.keys(settingsData).length, 'sections configured');
            } else {
                console.warn('Settings sheet not found or returned HTML');
            }
        } catch (settingsError) {
            console.warn('Could not load Settings sheet:', settingsError.message);
            // Settings sheet is optional, continue without it
        }

        // Process Details sheet data
        allTransactions = processData(detailsParsed.data);
        filteredTransactions = [...allTransactions];
        
        if (allTransactions.length === 0) {
            throw new Error('No valid transactions found. Please check the data format in your Details sheet.');
        }
        
        console.log('Loaded', allTransactions.length, 'transactions');
        
        updateSummaryCards();
        updateSectionCards();
        updateFilters();
        renderCharts();
        renderTable();
        
        loadingOverlay.classList.add('hidden');
    } catch (error) {
        console.error('Error loading data:', error);
        const isCorsError = error.message.includes('CORS');
        loadingOverlay.innerHTML = `
            <div style="text-align: center; padding: 20px; max-width: 600px;">
                <p style="color: #ef4444; font-size: 1.2rem; margin-bottom: 10px; font-weight: 600;">Error loading data</p>
                <p style="color: #64748b; margin-bottom: 10px;">${error.message}</p>
                ${isCorsError ? `
                    <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: left;">
                        <p style="color: #92400e; font-weight: 600; margin-bottom: 10px;">🔧 CORS Issue Detected</p>
                        <p style="color: #78350f; font-size: 0.9rem; margin-bottom: 10px;">You're opening the file directly. Use a local web server instead:</p>
                        <div style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 0.85rem; margin: 10px 0;">
                            <div style="margin-bottom: 8px;"># Python 3:</div>
                            <div>python3 -m http.server 8000</div>
                            <div style="margin-top: 12px; margin-bottom: 8px;"># Then open: <span style="color: #60a5fa;">http://localhost:8000</span></div>
                        </div>
                        <div style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 0.85rem; margin: 10px 0;">
                            <div style="margin-bottom: 8px;"># Node.js (if you have it):</div>
                            <div>npx http-server -p 8000</div>
                        </div>
                    </div>
                ` : ''}
                <div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: left;">
                    <p style="color: #0c4a6e; font-weight: 600; margin-bottom: 10px;">📋 How to Fix This:</p>
                    <ol style="color: #075985; font-size: 0.9rem; margin-left: 20px; line-height: 1.8;">
                        <li>Open your Google Sheet</li>
                        <li>Go to <strong>File → Share → Publish to web</strong></li>
                        <li>Select <strong>"Entire workbook"</strong> or select each sheet individually</li>
                        <li>Choose <strong>"Comma-separated values (.csv)"</strong> format</li>
                        <li>Click <strong>"Publish"</strong></li>
                        <li>Make sure the <strong>Details</strong> sheet is published</li>
                        <li>Refresh this page</li>
                    </ol>
                    <p style="color: #075985; font-size: 0.85rem; margin-top: 10px;">
                        <strong>Note:</strong> The dashboard will automatically try to find the correct sheet. If you continue to see this error, check the browser console (F12) for more details.
                    </p>
                </div>
                <p style="color: #64748b; margin-top: 20px; font-size: 0.9rem;">
                    Required columns in Details sheet:<br>
                    • <strong>Date</strong> - Transaction date<br>
                    • <strong>Cost</strong> - Spending/expenses<br>
                    • <strong>Money In</strong> - Payments to engineer<br>
                    • <strong>Section</strong> - Construction section (optional but recommended)
                </p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; transition: background 0.2s;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
                    Retry
                </button>
            </div>
        `;
    }
}

// Process and clean the data from Details sheet
function processData(rawData) {
    const transactions = [];
    let runningBalance = 0;

    rawData.forEach((row, index) => {
        // Skip completely empty rows or header rows
        // Need at least Date or financial data (Money In or Cost)
        if ((!row.Date || row.Date === '') && 
            (!row['Money In'] || row['Money In'] === '' || isNaN(parseFloat(row['Money In']))) && 
            (!row.Cost || row.Cost === '' || isNaN(parseFloat(row.Cost)))) {
            return;
        }

        // Parse date - handle multiple formats
        let date = null;
        if (row.Date) {
            date = parseDate(row.Date);
        }

        // Get section (use previous section if empty)
        let section = row.Section || (transactions.length > 0 ? transactions[transactions.length - 1].section : 'Unknown');
        if (section) {
            section = section.trim();
            // Normalize section names (fix case inconsistencies)
            if (section.toLowerCase() === 'transport') {
                section = 'Transport';
            }
        }
        
        // Get cost type
        const costType = (row['Cost Type'] || 'Unknown').trim();

        // Parse money in (payments to engineer)
        const moneyIn = parseNumber(row['Money In']);

        // Parse spending (Cost column in Details sheet)
        const spending = parseNumber(row.Cost);

        // Get task description
        const taskDescription = row['Task / Description'] || '';

        // Get payment methods separately:
        // - Payment Method: how money was spent (for spending transactions)
        // - Money In Method: how money was received by engineer (for money in transactions)
        // Note: In the actual data, Payment Method column is often empty, so we use Money In Method
        // for spending transactions when Payment Method is not available
        let paymentMethod = row['Payment Method'] || ''; // For spending
        const moneyInMethod = row['Money In Method'] || ''; // For money received
        
        // If Payment Method is empty but we have spending, use Money In Method as payment method
        // (This handles the case where Money In Method is used for both spending and money in)
        if (!paymentMethod && spending > 0 && moneyInMethod) {
            paymentMethod = moneyInMethod;
        }

        // Get vendor/contractor
        const vendor = row['Vendor / Contractor'] || '';

        // Skip rows with no financial data
        // Note: Some transactions might have both Cost and Money In (e.g., payment received and expense in same transaction)
        if (!moneyIn && !spending) {
            return;
        }
        
        // Handle special case: if both moneyIn and spending exist in same row
        // This might be a payment received that was immediately spent
        // We'll treat it as two separate transactions for clarity

        // Update running balance
        runningBalance += (moneyIn || 0) - (spending || 0);

        transactions.push({
            date: date,
            dateString: row.Date || '',
            section: section,
            costType: costType,
            moneyIn: moneyIn || 0,
            spending: spending || 0,
            balance: runningBalance,
            taskDescription: taskDescription,
            paymentMethod: paymentMethod, // How money was spent
            moneyInMethod: moneyInMethod, // How money was received by engineer
            vendor: vendor,
            status: row.Status || '',
            taskId: row['Task ID'] || null,
            originalIndex: index
        });
    });

    // Sort by date
    transactions.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date - b.date;
    });

    return transactions;
}

// Parse date from various formats
function parseDate(dateString) {
    if (!dateString) return null;
    
    // Handle Excel date serial numbers
    if (typeof dateString === 'number') {
        return new Date((dateString - 25569) * 86400 * 1000);
    }

    // Handle DD/MM/YYYY format
    const ddmmyyyy = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
        return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    }

    // Handle YYYY-MM-DD format
    const yyyymmdd = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (yyyymmdd) {
        return new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
    }

    // Try standard Date parsing
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
}

// Parse number, handling invalid values
function parseNumber(value) {
    if (!value || value === 'NaN' || value === '#REF!' || value === '') {
        return 0;
    }
    
    if (typeof value === 'number') {
        return value;
    }

    const num = parseFloat(value.toString().replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

// Update summary cards
function updateSummaryCards() {
    const totalMoneyIn = filteredTransactions.reduce((sum, t) => sum + t.moneyIn, 0);
    const totalSpending = filteredTransactions.reduce((sum, t) => sum + t.spending, 0);
    const balance = totalMoneyIn - totalSpending;
    const transactionCount = filteredTransactions.length;

    document.getElementById('total-money-in').textContent = formatCurrency(totalMoneyIn);
    document.getElementById('total-spending').textContent = formatCurrency(totalSpending);
    document.getElementById('balance').textContent = formatCurrency(balance);
    document.getElementById('balance').className = balance >= 0 ? 'card-value positive' : 'card-value negative';
    document.getElementById('transaction-count').textContent = transactionCount.toLocaleString();
}

// Update section cards showing spending per section
function updateSectionCards() {
    const sectionData = {};
    
    // Calculate spending by section
    filteredTransactions.forEach(t => {
        if (t.spending > 0 && t.section && t.section !== 'Unknown') {
            if (!sectionData[t.section]) {
                sectionData[t.section] = {
                    total: 0,
                    costTypes: {},
                    paymentMethods: {},
                    moneyIn: 0,
                    moneyInMethods: {}
                };
            }
            sectionData[t.section].total += t.spending;
            
            // Track spending by cost type
            if (t.costType && t.costType !== 'Unknown') {
                sectionData[t.section].costTypes[t.costType] = 
                    (sectionData[t.section].costTypes[t.costType] || 0) + t.spending;
            }
            
            // Track spending by payment method
            if (t.paymentMethod) {
                sectionData[t.section].paymentMethods[t.paymentMethod] = 
                    (sectionData[t.section].paymentMethods[t.paymentMethod] || 0) + t.spending;
            }
        }
        
        // Track money in by section
        if (t.moneyIn > 0 && t.section && t.section !== 'Unknown') {
            if (!sectionData[t.section]) {
                sectionData[t.section] = {
                    total: 0,
                    costTypes: {},
                    paymentMethods: {},
                    moneyIn: 0,
                    moneyInMethods: {}
                };
            }
            sectionData[t.section].moneyIn += t.moneyIn;
            
            // Track money in by method
            if (t.moneyInMethod) {
                sectionData[t.section].moneyInMethods[t.moneyInMethod] = 
                    (sectionData[t.section].moneyInMethods[t.moneyInMethod] || 0) + t.moneyIn;
            }
        }
    });

    // Use Settings sheet order if available, otherwise sort by total spending
    let sortedSections;
    if (Object.keys(settingsData).length > 0) {
        // Sort by Settings sheet order first, then by total spending
        const settingsOrder = Object.keys(settingsData);
        sortedSections = Object.entries(sectionData).sort((a, b) => {
            const aIndex = settingsOrder.indexOf(a[0]);
            const bIndex = settingsOrder.indexOf(b[0]);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return b[1].total - a[1].total; // Fallback to spending amount
        });
    } else {
        // Sort sections by total spending (descending)
        sortedSections = Object.entries(sectionData)
            .sort((a, b) => b[1].total - a[1].total);
    }

    const container = document.getElementById('section-cards-grid');
    container.innerHTML = '';

    if (sortedSections.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No spending data by section found.</p>';
        return;
    }

    sortedSections.forEach(([section, data]) => {
        const card = document.createElement('div');
        card.className = 'section-card';
        
        // Get section info from Settings if available
        const sectionInfo = settingsData[section] || {};
        
        // Create cost type breakdown
        const costTypeItems = Object.entries(data.costTypes)
            .sort((a, b) => b[1] - a[1])
            .map(([type, amount]) => {
                const percentage = ((amount / data.total) * 100).toFixed(1);
                return `
                    <div class="cost-type-item">
                        <span class="cost-type-label" style="background-color: ${getCostTypeColor(type)}">${type}</span>
                        <span class="cost-type-amount">${formatCurrency(amount)} (${percentage}%)</span>
                    </div>
                `;
            }).join('');

        // Create payment method breakdown for spending
        const paymentMethodItems = Object.entries(data.paymentMethods || {})
            .sort((a, b) => b[1] - a[1])
            .map(([method, amount]) => {
                const percentage = ((amount / data.total) * 100).toFixed(1);
                return `
                    <div class="payment-method-item">
                        <span class="payment-method-label">💳 ${method || 'Not specified'}</span>
                        <span class="payment-method-amount">${formatCurrency(amount)} (${percentage}%)</span>
                    </div>
                `;
            }).join('');

        // Create money in method breakdown
        const moneyInMethodItems = Object.entries(data.moneyInMethods || {})
            .sort((a, b) => b[1] - a[1])
            .map(([method, amount]) => {
                const percentage = data.moneyIn > 0 ? ((amount / data.moneyIn) * 100).toFixed(1) : '0';
                return `
                    <div class="payment-method-item">
                        <span class="payment-method-label">💰 ${method || 'Not specified'}</span>
                        <span class="payment-method-amount">${formatCurrency(amount)} (${percentage}%)</span>
                    </div>
                `;
            }).join('');

        card.innerHTML = `
            <div class="section-card-header">
                <h3>${section}</h3>
                <div class="section-card-totals">
                    ${data.moneyIn > 0 ? `<p class="section-card-money-in">💰 Received: ${formatCurrency(data.moneyIn)}</p>` : ''}
                    <p class="section-card-total">💸 Spent: ${formatCurrency(data.total)}</p>
                </div>
                ${sectionInfo.status ? `<p class="section-status" style="color: ${getStatusColor(sectionInfo.status)}; font-size: 0.85rem; margin-top: 8px;">Status: ${sectionInfo.status}</p>` : ''}
            </div>
            <div class="section-card-body">
                ${data.moneyIn > 0 && moneyInMethodItems ? `
                    <div class="breakdown-section">
                        <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">Money Received By:</h4>
                        ${moneyInMethodItems}
                    </div>
                ` : ''}
                ${paymentMethodItems ? `
                    <div class="breakdown-section">
                        <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600; margin-top: 12px;">Spending By Payment Method:</h4>
                        ${paymentMethodItems}
                    </div>
                ` : ''}
                ${costTypeItems ? `
                    <div class="breakdown-section">
                        <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600; margin-top: 12px;">Spending By Cost Type:</h4>
                        ${costTypeItems}
                    </div>
                ` : ''}
                ${!costTypeItems && !paymentMethodItems && !moneyInMethodItems ? 
                    '<p style="color: #64748b; font-size: 0.85rem;">No breakdown data available</p>' : ''}
            </div>
        `;
        
        container.appendChild(card);
    });
}

// Get color for cost type
function getCostTypeColor(costType) {
    const colorMap = {
        'Material': '#2563eb',      // Blue
        'Manpower': '#10b981',      // Green
        'Other': '#f59e0b',         // Amber
        'cash in': '#10b981',       // Green
        'cash out': '#ef4444',      // Red
        'Repairing': '#8b5cf6',     // Purple
        'Unknown': '#64748b'        // Gray
    };
    return colorMap[costType] || '#64748b';
}

// Get color for status
function getStatusColor(status) {
    const statusMap = {
        'Completed': '#10b981',      // Green
        'In Progress': '#2563eb',    // Blue
        'Not Started': '#64748b',   // Gray
        'Delayed': '#ef4444'         // Red
    };
    return statusMap[status] || '#64748b';
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'RWF',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount).replace('RWF', 'RWF ');
}

// Setup filter event listeners
function setupFilters() {
    document.getElementById('date-from').addEventListener('change', applyFilters);
    document.getElementById('date-to').addEventListener('change', applyFilters);
    document.getElementById('section-filter').addEventListener('change', applyFilters);
    document.getElementById('cost-type-filter').addEventListener('change', applyFilters);
    document.getElementById('transaction-type-filter').addEventListener('change', applyFilters);
    document.getElementById('reset-filters').addEventListener('click', resetFilters);
}

// Update filter dropdowns with available options
function updateFilters() {
    const sections = [...new Set(allTransactions.map(t => t.section).filter(s => s && s !== 'Unknown'))].sort();
    const costTypes = [...new Set(allTransactions.map(t => t.costType).filter(c => c && c !== 'Unknown'))].sort();

    const sectionFilter = document.getElementById('section-filter');
    sections.forEach(section => {
        const option = document.createElement('option');
        option.value = section;
        option.textContent = section;
        sectionFilter.appendChild(option);
    });

    const costTypeFilter = document.getElementById('cost-type-filter');
    costTypes.forEach(costType => {
        const option = document.createElement('option');
        option.value = costType;
        option.textContent = costType;
        costTypeFilter.appendChild(option);
    });

    // Set date range defaults
    const dates = allTransactions.map(t => t.date).filter(d => d);
    if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        document.getElementById('date-from').valueAsDate = minDate;
        document.getElementById('date-to').valueAsDate = maxDate;
    }
}

// Apply filters
function applyFilters() {
    const dateFrom = document.getElementById('date-from').valueAsDate;
    const dateTo = document.getElementById('date-to').valueAsDate;
    const section = document.getElementById('section-filter').value;
    const costType = document.getElementById('cost-type-filter').value;
    const transactionType = document.getElementById('transaction-type-filter').value;

    filteredTransactions = allTransactions.filter(transaction => {
        // Date filter
        if (dateFrom && transaction.date && transaction.date < dateFrom) {
            return false;
        }
        if (dateTo && transaction.date) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (transaction.date > toDate) {
                return false;
            }
        }

        // Section filter
        if (section && transaction.section !== section) {
            return false;
        }

        // Cost type filter
        if (costType && transaction.costType !== costType) {
            return false;
        }

        // Transaction type filter
        if (transactionType === 'money-in' && transaction.moneyIn === 0) {
            return false;
        }
        if (transactionType === 'spending' && transaction.spending === 0) {
            return false;
        }

        return true;
    });

    updateSummaryCards();
    updateSectionCards();
    renderCharts();
    renderTable();
}

// Reset filters
function resetFilters() {
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    document.getElementById('section-filter').value = '';
    document.getElementById('cost-type-filter').value = '';
    document.getElementById('transaction-type-filter').value = '';
    
    // Reset to default date range
    const dates = allTransactions.map(t => t.date).filter(d => d);
    if (dates.length > 0) {
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        document.getElementById('date-from').valueAsDate = minDate;
        document.getElementById('date-to').valueAsDate = maxDate;
    }
    
    applyFilters();
}

// Render charts
function renderCharts() {
    renderSectionChart();
    renderCostTypeChart();
    renderTimelineChart();
}

// Render spending by section pie chart
function renderSectionChart() {
    const ctx = document.getElementById('section-chart').getContext('2d');
    
    // Calculate spending by section
    const sectionData = {};
    filteredTransactions.forEach(t => {
        if (t.spending > 0) {
            sectionData[t.section] = (sectionData[t.section] || 0) + t.spending;
        }
    });

    const labels = Object.keys(sectionData).sort((a, b) => sectionData[b] - sectionData[a]);
    const data = labels.map(label => sectionData[label]);

    if (charts.section) {
        charts.section.destroy();
    }

    charts.section = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = formatCurrency(context.parsed);
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Render spending by cost type bar chart
function renderCostTypeChart() {
    const ctx = document.getElementById('cost-type-chart').getContext('2d');
    
    // Calculate spending by cost type
    const costTypeData = {};
    filteredTransactions.forEach(t => {
        if (t.spending > 0) {
            costTypeData[t.costType] = (costTypeData[t.costType] || 0) + t.spending;
        }
    });

    const labels = Object.keys(costTypeData).sort((a, b) => costTypeData[b] - costTypeData[a]);
    const data = labels.map(label => costTypeData[label]);
    const colors = labels.map(label => getCostTypeColor(label));

    if (charts.costType) {
        charts.costType.destroy();
    }

    charts.costType = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Spending',
                data: data,
                backgroundColor: colors,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

// Render timeline chart (money in vs spending)
function renderTimelineChart() {
    const ctx = document.getElementById('timeline-chart').getContext('2d');
    
    // Group by date
    const dateData = {};
    filteredTransactions.forEach(t => {
        if (t.date) {
            const dateKey = t.date.toISOString().split('T')[0];
            if (!dateData[dateKey]) {
                dateData[dateKey] = { moneyIn: 0, spending: 0 };
            }
            dateData[dateKey].moneyIn += t.moneyIn;
            dateData[dateKey].spending += t.spending;
        }
    });

    const dates = Object.keys(dateData).sort();
    const moneyInData = dates.map(d => dateData[d].moneyIn);
    const spendingData = dates.map(d => dateData[d].spending);

    if (charts.timeline) {
        charts.timeline.destroy();
    }

    charts.timeline = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => formatDateShort(d)),
            datasets: [
                {
                    label: 'Money In',
                    data: moneyInData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Spending',
                    data: spendingData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

// Format date for display
function formatDateShort(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format date for table
function formatDateFull(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Render transaction table
function renderTable() {
    const tbody = document.getElementById('transaction-tbody');
    tbody.innerHTML = '';

    if (filteredTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">No transactions found matching the filters.</td></tr>';
        return;
    }

    // Sort by date (oldest to newest, then by original index for same dates)
    const sorted = [...filteredTransactions].sort((a, b) => {
        if (!a.date && !b.date) {
            // If both have no date, sort by original index (ascending)
            return (a.originalIndex || 0) - (b.originalIndex || 0);
        }
        if (!a.date) return 1;
        if (!b.date) return -1;
        // Primary sort: date (ascending - oldest first)
        const dateDiff = a.date - b.date;
        if (dateDiff !== 0) return dateDiff;
        // Secondary sort: original index (for same dates)
        return (a.originalIndex || 0) - (b.originalIndex || 0);
    });

    sorted.forEach(transaction => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDateFull(transaction.date)}</td>
            <td>${transaction.section}</td>
            <td>${transaction.taskDescription || '-'}</td>
            <td>${transaction.costType}</td>
            <td class="number ${transaction.moneyIn > 0 ? 'positive' : ''}">${transaction.moneyIn > 0 ? formatCurrency(transaction.moneyIn) : '-'}</td>
            <td>${transaction.moneyInMethod || '-'}</td>
            <td class="number ${transaction.spending > 0 ? 'negative' : ''}">${transaction.spending > 0 ? formatCurrency(transaction.spending) : '-'}</td>
            <td>${transaction.paymentMethod || '-'}</td>
            <td class="number ${transaction.balance >= 0 ? 'positive' : 'negative'}">${formatCurrency(transaction.balance)}</td>
        `;
        tbody.appendChild(row);
    });

    // Add table sorting functionality
    addTableSorting();
}

// Add sorting functionality to table headers
function addTableSorting() {
    const headers = document.querySelectorAll('#transaction-table thead th');
    headers.forEach((header, index) => {
        header.addEventListener('click', () => {
            sortTable(index);
        });
    });
}

// Sort table by column
let sortColumn = -1;
let sortDirection = 'asc';

function sortTable(columnIndex) {
    const tbody = document.getElementById('transaction-tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    if (sortColumn === columnIndex) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = columnIndex;
        sortDirection = 'asc';
    }

    rows.sort((a, b) => {
        const aText = a.cells[columnIndex].textContent.trim();
        const bText = b.cells[columnIndex].textContent.trim();

        // Try to parse as number
        const aNum = parseFloat(aText.replace(/[^0-9.-]/g, ''));
        const bNum = parseFloat(bText.replace(/[^0-9.-]/g, ''));

        if (!isNaN(aNum) && !isNaN(bNum)) {
            return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Compare as strings
        return sortDirection === 'asc' 
            ? aText.localeCompare(bText)
            : bText.localeCompare(aText);
    });

    rows.forEach(row => tbody.appendChild(row));
}
