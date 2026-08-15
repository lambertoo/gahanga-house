'use client';

import Papa from 'papaparse';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChartCanvas from './charts/ChartCanvas';

const CHART_PALETTE = [
  '#a06b2e',
  '#5f7d5a',
  '#8a6f9e',
  '#b3924a',
  '#6f8fa3',
  '#a85b52',
  '#7d7461',
  '#4f6d7a',
  '#9d5f7c',
  '#66735c',
];
const MONEY_IN_COLOR = '#3f7d5c';
const SPENDING_COLOR = '#a85141';
const ACCENT_COLOR = '#a06b2e';
const MUTED_COLOR = '#877d6d';
const HAIRLINE_COLOR = 'rgba(47, 42, 36, 0.07)';

function parseNumber(value) {
  if (!value || value === 'NaN' || value === '#REF!' || value === '') return 0;
  if (typeof value === 'number') return value;
  const num = parseFloat(value.toString().replace(/,/g, ''));
  return Number.isNaN(num) ? 0 : num;
}

function parseDate(dateString) {
  if (!dateString) return null;

  // Excel serial numbers
  if (typeof dateString === 'number') {
    return new Date((dateString - 25569) * 86400 * 1000);
  }

  // Sheet publishes MM/DD/YYYY; older exports were DD/MM/YYYY. A first part > 12 can only be a day.
  const slash_date = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash_date) {
    const first_part = parseInt(slash_date[1], 10);
    const second_part = parseInt(slash_date[2], 10);
    const year = parseInt(slash_date[3], 10);
    if (first_part > 12) return new Date(year, second_part - 1, first_part);
    return new Date(year, first_part - 1, second_part);
  }

  // YYYY-MM-DD
  const yyyymmdd = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (yyyymmdd) {
    return new Date(parseInt(yyyymmdd[1], 10), parseInt(yyyymmdd[2], 10) - 1, parseInt(yyyymmdd[3], 10));
  }

  const parsed = new Date(dateString);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYmdToLocalDate(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDateShort(ymd) {
  const d = parseYmdToLocalDate(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatDateFull(date) {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'RWF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('RWF', 'RWF ');
}

function formatPlainAmount(amount) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
}

function formatCompactRwf(amount) {
  const absolute_amount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (absolute_amount >= 1_000_000) return `${sign}${(absolute_amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (absolute_amount >= 1_000) return `${sign}${Math.round(absolute_amount / 1_000)}K`;
  return `${sign}${absolute_amount}`;
}

function getCostTypeColor(costType) {
  const colorMap = {
    Material: '#b3924a',
    Manpower: '#5f7d5a',
    Transport: '#6f8fa3',
    'Transfer fee': '#8a6f9e',
    Repairing: '#a85b52',
    Electricity: '#4f6d7a',
    'Money received': MONEY_IN_COLOR,
    'Cash in': MONEY_IN_COLOR,
    'Cash out': SPENDING_COLOR,
    Other: '#7d7461',
    Unknown: '#7d7461',
  };
  return colorMap[costType] || '#7d7461';
}

function getStatusColor(status) {
  const statusMap = {
    Completed: MONEY_IN_COLOR,
    'In Progress': ACCENT_COLOR,
    'Not Started': MUTED_COLOR,
    Delayed: SPENDING_COLOR,
  };
  return statusMap[status] || MUTED_COLOR;
}

function parseCsv(csvText) {
  return Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
}

function processTransactions(rawData) {
  const transactions = [];
  let runningBalance = 0;

  rawData.forEach((row, index) => {
    if (
      (!row.Date || row.Date === '') &&
      (!row['Money In'] || row['Money In'] === '' || Number.isNaN(parseFloat(row['Money In']))) &&
      (!row.Cost || row.Cost === '' || Number.isNaN(parseFloat(row.Cost)))
    ) {
      return;
    }

    const date = row.Date ? parseDate(row.Date) : null;

    let section = row.Section || (transactions.length > 0 ? transactions[transactions.length - 1].section : 'Unknown');
    if (section) {
      section = section.trim();
      if (section.toLowerCase() === 'transport') section = 'Transport';
    }

    let costType = (row['Cost Type'] || 'Unknown').trim();
    if (costType) costType = costType.charAt(0).toUpperCase() + costType.slice(1);
    const moneyIn = parseNumber(row['Money In']);
    const spending = parseNumber(row.Cost);
    const taskDescription = row['Task / Description'] || '';

    let paymentMethod = row['Payment Method'] || '';
    const moneyInMethod = row['Money In Method'] || '';
    if (!paymentMethod && spending > 0 && moneyInMethod) paymentMethod = moneyInMethod;

    const vendor = row['Vendor / Contractor'] || '';

    if (!moneyIn && !spending) return;

    runningBalance += (moneyIn || 0) - (spending || 0);

    transactions.push({
      date,
      dateString: row.Date || '',
      section,
      costType,
      moneyIn: moneyIn || 0,
      spending: spending || 0,
      balance: runningBalance,
      taskDescription,
      paymentMethod,
      moneyInMethod,
      vendor,
      status: row.Status || '',
      taskId: row['Task ID'] || null,
      originalIndex: index,
    });
  });

  transactions.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date - b.date;
  });

  return transactions;
}

async function fetchSheetCsv({ sheet, format, gid }) {
  const params = new URLSearchParams();
  params.set('sheet', sheet);
  params.set('format', format);
  if (gid !== undefined && gid !== null) params.set('gid', String(gid));

  const res = await fetch(`/api/sheets?${params.toString()}`, { cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Failed to fetch ${sheet} sheet (HTTP ${res.status})`);
  }
  return text;
}

async function findSheetByGid(gidValues, sheetName) {
  for (const gid of gidValues) {
    try {
      let csvText;
      try {
        csvText = await fetchSheetCsv({ sheet: sheetName.toLowerCase(), format: 'export', gid });
      } catch {
        csvText = await fetchSheetCsv({ sheet: sheetName.toLowerCase(), format: 'pub', gid });
      }

      if (csvText.trim().startsWith('<')) continue;
      if (!csvText || csvText.trim().length === 0) continue;

      const parsed = parseCsv(csvText);

      if (sheetName === 'Details') {
        const hasDate = parsed.meta.fields?.some((f) => f.toLowerCase().includes('date') || f.toLowerCase() === 'date');
        const hasCost = parsed.meta.fields?.some((f) => f.toLowerCase() === 'cost');
        const hasMoneyIn = parsed.meta.fields?.some((f) => f.toLowerCase().includes('money') || f.toLowerCase() === 'money in');
        if (hasDate && (hasCost || hasMoneyIn) && parsed.data.length > 0) {
          return { csv: csvText, parsed, gid };
        }
      } else if (sheetName === 'Settings') {
        const hasSection = parsed.meta.fields?.some((f) => f.toLowerCase() === 'section');
        if (hasSection && parsed.data.length > 0) {
          return { csv: csvText, parsed, gid };
        }
      }
    } catch {
      // keep trying other gid
    }
  }
  return null;
}

const COMPACT_MONEY_SCALE = {
  y: {
    beginAtZero: true,
    grid: { color: HAIRLINE_COLOR },
    border: { display: false },
    ticks: { callback: (value) => formatCompactRwf(value) },
  },
  x: {
    grid: { display: false },
    border: { display: false },
  },
};

function buildDoughnut(labels, data) {
  return {
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: CHART_PALETTE,
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = formatCurrency(context.parsed);
              const total = context.dataset.data.reduce((x, y) => x + y, 0);
              const percentage = total ? ((context.parsed / total) * 100).toFixed(1) : '0.0';
              return `${label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
    },
  };
}

function buildBar(labels, data, colors) {
  return {
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderRadius: 7,
          maxBarThickness: 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (context) => formatCurrency(context.parsed.y) },
        },
      },
      scales: COMPACT_MONEY_SCALE,
    },
  };
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={`segment ${option.value === value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatCard({ label, value, note, tone, index }) {
  return (
    <div className="surface stat-card rise" style={{ '--i': index }}>
      <div className="stat-eyebrow">{label}</div>
      <div>
        <div className={`stat-value ${tone || ''}`}>{value}</div>
        {note ? <div className="stat-note">{note}</div> : null}
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [settingsData, setSettingsData] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    section: '',
    costType: '',
    transactionType: '',
  });

  const [sort, setSort] = useState({ column: null, direction: 'asc' });

  const view = searchParams.get('view') || 'overview';
  const viewSection = searchParams.get('section') || '';
  const viewMoneyInMethod = searchParams.get('moneyInMethod') || '';
  const viewPaymentMethod = searchParams.get('paymentMethod') || '';

  const setView = useCallback(
    (next) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(next).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') sp.delete(k);
        else sp.set(k, String(v));
      });
      router.push(`/?${sp.toString()}`);
    },
    [router, searchParams]
  );

  const navTo = useCallback(
    (next) => {
      setView(next);
      setSidebarOpen(false);
    },
    [setView]
  );

  // Mobile UX: lock scroll + allow Esc to close menu
  useEffect(() => {
    if (!sidebarOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [sidebarOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // DETAILS
      let detailsParsed;
      try {
        const detailsCsv = await fetchSheetCsv({ sheet: 'details', format: 'pub' });
        if (detailsCsv.trim().startsWith('<') || !detailsCsv.trim()) {
          throw new Error('Received HTML/empty instead of CSV');
        }
        detailsParsed = parseCsv(detailsCsv);

        const hasDate = detailsParsed.meta.fields?.some((f) => f.toLowerCase().includes('date') || f.toLowerCase() === 'date');
        const hasCost = detailsParsed.meta.fields?.some((f) => f.toLowerCase() === 'cost');
        const hasMoneyIn = detailsParsed.meta.fields?.some((f) => f.toLowerCase().includes('money') || f.toLowerCase() === 'money in');
        if (!hasDate || (!hasCost && !hasMoneyIn) || !detailsParsed.data?.length) {
          throw new Error('Data does not match Details sheet format');
        }
      } catch {
        const detailsResult = await findSheetByGid([2, 0, 1, 3, 4, 5], 'Details');
        if (!detailsResult) {
          throw new Error(
            'Could not find Details sheet. Please ensure your Google Sheet is published and contains a sheet with Date, Cost, and Money In columns.'
          );
        }
        detailsParsed = detailsResult.parsed;
      }

      // SETTINGS (optional)
      const nextSettingsData = {};
      try {
        let settingsCsv;
        try {
          settingsCsv = await fetchSheetCsv({ sheet: 'settings', format: 'pub', gid: 1 });
        } catch {
          settingsCsv = await fetchSheetCsv({ sheet: 'settings', format: 'export', gid: 1 });
        }

        if (settingsCsv && !settingsCsv.trim().startsWith('<')) {
          const settingsParsed = parseCsv(settingsCsv);
          settingsParsed.data.forEach((row) => {
            if (row.Section) {
              nextSettingsData[row.Section] = {
                section: row.Section.trim(),
                paymentMethod: row.PaymentMethod ? row.PaymentMethod.trim() : '',
                status: row.Status ? row.Status.trim() : '',
                costType: row.CostType ? row.CostType.trim() : '',
              };
            }
          });
        }
      } catch {
        // optional
      }

      const transactions = processTransactions(detailsParsed.data || []);
      if (!transactions.length) {
        throw new Error('No valid transactions found. Please check the data format in your Details sheet.');
      }

      setSettingsData(nextSettingsData);
      setAllTransactions(transactions);

      // Default date range
      const dates = transactions.map((t) => t.date).filter(Boolean);
      if (dates.length) {
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        setFilters((f) => ({
          ...f,
          dateFrom: toYmd(minDate),
          dateTo: toYmd(maxDate),
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sections = useMemo(() => {
    return [...new Set(allTransactions.map((t) => t.section).filter((s) => s && s !== 'Unknown'))].sort();
  }, [allTransactions]);

  const moneyInMethods = useMemo(() => {
    return [
      ...new Set(
        allTransactions
          .filter((t) => t.moneyIn > 0)
          .map((t) => t.moneyInMethod)
          .filter((m) => m && m.trim().length > 0)
      ),
    ].sort();
  }, [allTransactions]);

  const paymentMethods = useMemo(() => {
    return [
      ...new Set(
        allTransactions
          .filter((t) => t.spending > 0)
          .map((t) => t.paymentMethod)
          .filter((m) => m && m.trim().length > 0)
      ),
    ].sort();
  }, [allTransactions]);

  const costTypes = useMemo(() => {
    return [...new Set(allTransactions.map((t) => t.costType).filter((c) => c && c !== 'Unknown'))].sort();
  }, [allTransactions]);

  const filteredTransactions = useMemo(() => {
    const dateFrom = parseYmdToLocalDate(filters.dateFrom);
    const dateTo = parseYmdToLocalDate(filters.dateTo);
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    const base = allTransactions.filter((t) => {
      if (dateFrom && t.date && t.date < dateFrom) return false;
      if (dateTo && t.date && t.date > dateTo) return false;
      if (filters.section && t.section !== filters.section) return false;
      if (filters.costType && t.costType !== filters.costType) return false;
      if (filters.transactionType === 'money-in' && t.moneyIn === 0) return false;
      if (filters.transactionType === 'spending' && t.spending === 0) return false;
      return true;
    });

    // View-level drilldowns (sidebar)
    if (view === 'section') {
      if (!viewSection) return base;
      return base.filter((t) => t.section === viewSection);
    }
    if (view === 'money-in') {
      if (!viewMoneyInMethod) return base.filter((t) => t.moneyIn > 0);
      return base.filter((t) => t.moneyIn > 0 && (t.moneyInMethod || '') === viewMoneyInMethod);
    }
    if (view === 'payment-method') {
      if (!viewPaymentMethod) return base.filter((t) => t.spending > 0);
      return base.filter((t) => t.spending > 0 && (t.paymentMethod || '') === viewPaymentMethod);
    }

    return base;
  }, [allTransactions, filters, view, viewSection, viewMoneyInMethod, viewPaymentMethod]);

  const totals = useMemo(() => {
    const totalMoneyIn = filteredTransactions.reduce((sum, t) => sum + t.moneyIn, 0);
    const totalSpending = filteredTransactions.reduce((sum, t) => sum + t.spending, 0);
    const balance = totalMoneyIn - totalSpending;

    const dated = filteredTransactions.filter((t) => t.date);
    let averageDailySpend = 0;
    if (dated.length) {
      const first_day = Math.min(...dated.map((t) => t.date.getTime()));
      const last_day = Math.max(...dated.map((t) => t.date.getTime()));
      const day_span = Math.max(1, Math.round((last_day - first_day) / 86400000) + 1);
      averageDailySpend = totalSpending / day_span;
    }

    return {
      totalMoneyIn,
      totalSpending,
      balance,
      averageDailySpend,
      transactionCount: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  const sectionCards = useMemo(() => {
    const sectionData = {};

    filteredTransactions.forEach((t) => {
      const section = t.section;
      if (!section || section === 'Unknown') return;

      if (!sectionData[section]) {
        sectionData[section] = {
          total: 0,
          costTypes: {},
          paymentMethods: {},
          moneyIn: 0,
          moneyInMethods: {},
        };
      }

      if (t.spending > 0) {
        sectionData[section].total += t.spending;
        if (t.costType && t.costType !== 'Unknown') {
          sectionData[section].costTypes[t.costType] = (sectionData[section].costTypes[t.costType] || 0) + t.spending;
        }
        if (t.paymentMethod) {
          sectionData[section].paymentMethods[t.paymentMethod] =
            (sectionData[section].paymentMethods[t.paymentMethod] || 0) + t.spending;
        }
      }

      if (t.moneyIn > 0) {
        sectionData[section].moneyIn += t.moneyIn;
        if (t.moneyInMethod) {
          sectionData[section].moneyInMethods[t.moneyInMethod] =
            (sectionData[section].moneyInMethods[t.moneyInMethod] || 0) + t.moneyIn;
        }
      }
    });

    const settingsOrder = Object.keys(settingsData);
    const entries = Object.entries(sectionData);

    if (settingsOrder.length) {
      entries.sort((a, b) => {
        const aIndex = settingsOrder.indexOf(a[0]);
        const bIndex = settingsOrder.indexOf(b[0]);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return b[1].total - a[1].total;
      });
    } else {
      entries.sort((a, b) => b[1].total - a[1].total);
    }

    return entries;
  }, [filteredTransactions, settingsData]);

  const tableRows = useMemo(() => {
    const baseSorted = [...filteredTransactions].sort((a, b) => {
      if (!a.date && !b.date) return (a.originalIndex || 0) - (b.originalIndex || 0);
      if (!a.date) return 1;
      if (!b.date) return -1;
      const dateDiff = a.date - b.date;
      if (dateDiff !== 0) return dateDiff;
      return (a.originalIndex || 0) - (b.originalIndex || 0);
    });

    if (!sort.column) return baseSorted;

    const dir = sort.direction === 'asc' ? 1 : -1;
    const rows = [...baseSorted];

    rows.sort((a, b) => {
      const col = sort.column;

      const getVal = (t) => {
        switch (col) {
          case 'date':
            return t.date ? t.date.getTime() : null;
          case 'moneyIn':
            return t.moneyIn;
          case 'spending':
            return t.spending;
          case 'balance':
            return t.balance;
          case 'section':
            return t.section || '';
          case 'taskDescription':
            return t.taskDescription || '';
          case 'costType':
            return t.costType || '';
          case 'moneyInMethod':
            return t.moneyInMethod || '';
          case 'paymentMethod':
            return t.paymentMethod || '';
          default:
            return '';
        }
      };

      const av = getVal(a);
      const bv = getVal(b);

      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

      if (typeof av === 'number' && typeof bv === 'number') return dir * (av - bv);
      return dir * String(av).localeCompare(String(bv));
    });

    return rows;
  }, [filteredTransactions, sort]);

  const sectionChart = useMemo(() => {
    const sectionData = {};
    filteredTransactions.forEach((t) => {
      if (t.spending > 0) {
        sectionData[t.section] = (sectionData[t.section] || 0) + t.spending;
      }
    });
    const labels = Object.keys(sectionData).sort((a, b) => sectionData[b] - sectionData[a]);
    return buildDoughnut(labels, labels.map((l) => sectionData[l]));
  }, [filteredTransactions]);

  const moneyInBySectionChart = useMemo(() => {
    const sectionData = {};
    filteredTransactions.forEach((t) => {
      if (t.moneyIn > 0) {
        sectionData[t.section] = (sectionData[t.section] || 0) + t.moneyIn;
      }
    });
    const labels = Object.keys(sectionData).sort((a, b) => sectionData[b] - sectionData[a]);
    return buildDoughnut(labels, labels.map((l) => sectionData[l]));
  }, [filteredTransactions]);

  const moneyInByMethodChart = useMemo(() => {
    const methodData = {};
    filteredTransactions.forEach((t) => {
      if (t.moneyIn > 0) {
        const key = t.moneyInMethod || 'Not specified';
        methodData[key] = (methodData[key] || 0) + t.moneyIn;
      }
    });
    const labels = Object.keys(methodData).sort((a, b) => methodData[b] - methodData[a]);
    return buildBar(labels, labels.map((l) => methodData[l]), MONEY_IN_COLOR);
  }, [filteredTransactions]);

  const spendingByPaymentMethodChart = useMemo(() => {
    const methodData = {};
    filteredTransactions.forEach((t) => {
      if (t.spending > 0) {
        const key = t.paymentMethod || 'Not specified';
        methodData[key] = (methodData[key] || 0) + t.spending;
      }
    });
    const labels = Object.keys(methodData).sort((a, b) => methodData[b] - methodData[a]);
    return buildBar(labels, labels.map((l) => methodData[l]), SPENDING_COLOR);
  }, [filteredTransactions]);

  const costTypeChart = useMemo(() => {
    const costTypeData = {};
    filteredTransactions.forEach((t) => {
      if (t.spending > 0) costTypeData[t.costType] = (costTypeData[t.costType] || 0) + t.spending;
    });
    const labels = Object.keys(costTypeData).sort((a, b) => costTypeData[b] - costTypeData[a]);
    return buildBar(labels, labels.map((l) => costTypeData[l]), labels.map((l) => getCostTypeColor(l)));
  }, [filteredTransactions]);

  const monthlyCashflowChart = useMemo(() => {
    const monthData = {};
    filteredTransactions.forEach((t) => {
      if (!t.date) return;
      const month_key = toYmd(t.date).slice(0, 7);
      if (!monthData[month_key]) monthData[month_key] = { moneyIn: 0, spending: 0 };
      monthData[month_key].moneyIn += t.moneyIn;
      monthData[month_key].spending += t.spending;
    });

    const months = Object.keys(monthData).sort();

    return {
      data: {
        labels: months.map(formatMonthLabel),
        datasets: [
          {
            label: 'Money In',
            data: months.map((m) => monthData[m].moneyIn),
            backgroundColor: MONEY_IN_COLOR,
            borderRadius: 6,
            maxBarThickness: 22,
          },
          {
            label: 'Spending',
            data: months.map((m) => monthData[m].spending),
            backgroundColor: SPENDING_COLOR,
            borderRadius: 6,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
            },
          },
        },
        scales: COMPACT_MONEY_SCALE,
      },
    };
  }, [filteredTransactions]);

  const cumulativeBalanceSeries = useMemo(() => {
    const netByDay = {};
    filteredTransactions.forEach((t) => {
      if (!t.date) return;
      const day_key = toYmd(t.date);
      netByDay[day_key] = (netByDay[day_key] || 0) + t.moneyIn - t.spending;
    });

    const days = Object.keys(netByDay).sort();
    let running_balance = 0;
    const balances = days.map((d) => {
      running_balance += netByDay[d];
      return Math.round(running_balance);
    });
    return { days, balances };
  }, [filteredTransactions]);

  const cashPositionChart = useMemo(() => {
    const { days, balances } = cumulativeBalanceSeries;
    return {
      data: {
        labels: days.map(formatDateShort),
        datasets: [
          {
            label: 'Cash on hand',
            data: balances,
            borderColor: ACCENT_COLOR,
            backgroundColor: 'rgba(160, 107, 46, 0.09)',
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            pointHitRadius: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (context) => `Cash on hand: ${formatCurrency(context.parsed.y)}` },
          },
        },
        scales: {
          y: {
            grid: { color: HAIRLINE_COLOR },
            border: { display: false },
            ticks: { callback: (value) => formatCompactRwf(value) },
          },
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { maxTicksLimit: 10 },
          },
        },
      },
    };
  }, [cumulativeBalanceSeries]);

  const heroSparklineChart = useMemo(() => {
    const { days, balances } = cumulativeBalanceSeries;
    return {
      data: {
        labels: days,
        datasets: [
          {
            data: balances,
            borderColor: ACCENT_COLOR,
            backgroundColor: 'rgba(160, 107, 46, 0.12)',
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    };
  }, [cumulativeBalanceSeries]);

  const topExpenses = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.spending > 0)
      .sort((a, b) => b.spending - a.spending)
      .slice(0, 8);
  }, [filteredTransactions]);

  const onHeaderClick = (column) => {
    setSort((s) => {
      if (s.column === column) {
        return { column, direction: s.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  const resetFilters = () => {
    const dates = allTransactions.map((t) => t.date).filter(Boolean);
    const next = {
      dateFrom: '',
      dateTo: '',
      section: '',
      costType: '',
      transactionType: '',
    };
    if (dates.length) {
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      next.dateFrom = toYmd(minDate);
      next.dateTo = toYmd(maxDate);
    }
    setFilters(next);
  };

  const pageTitle = useMemo(() => {
    if (view === 'section') return viewSection ? `Section: ${viewSection}` : 'Section';
    if (view === 'money-in') return viewMoneyInMethod ? `Money In: ${viewMoneyInMethod}` : 'Money In';
    if (view === 'payment-method') return viewPaymentMethod ? `Spending: ${viewPaymentMethod}` : 'Spending';
    return 'Overview';
  }, [view, viewSection, viewMoneyInMethod, viewPaymentMethod]);

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-header">
          <div>
            <div className="sidebar-title">Gahanga House</div>
            <div className="sidebar-subtitle">Construction finance</div>
          </div>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${view === 'overview' ? 'active' : ''}`}
            onClick={() => navTo({ view: 'overview', section: '', moneyInMethod: '', paymentMethod: '' })}
            type="button"
          >
            Overview
          </button>
          <button
            className={`nav-item ${view === 'money-in' ? 'active' : ''}`}
            onClick={() => navTo({ view: 'money-in', moneyInMethod: '', section: '', paymentMethod: '' })}
            type="button"
          >
            Money In
          </button>
          <button
            className={`nav-item ${view === 'payment-method' ? 'active' : ''}`}
            onClick={() => navTo({ view: 'payment-method', paymentMethod: '', section: '', moneyInMethod: '' })}
            type="button"
          >
            Spending
          </button>

          <div className="nav-section">
            <div className="nav-section-title">Sections</div>
            {sections.map((s) => (
              <button
                key={s}
                className={`nav-item ${view === 'section' && viewSection === s ? 'active' : ''}`}
                onClick={() => navTo({ view: 'section', section: s, moneyInMethod: '', paymentMethod: '' })}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>

        </nav>
      </aside>

      <button
        type="button"
        className="sidebar-overlay"
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
      />

      <main className="main">
        <div className="main-topbar">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            aria-controls="sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div className="main-topbar-content">
            <div className="main-title">{pageTitle}</div>
            <div className="main-subtitle">Filter and drill down by section, method, and time</div>
          </div>
        </div>

        <div className="container">
          {error ? (
            <section className="surface error-card">
              <h2>Error loading data</h2>
              <p>{error}</p>
              <div className="error-hint">
                <p style={{ fontWeight: 600, marginBottom: 8 }}>How to fix</p>
                <ol>
                  <li>Confirm your Vercel environment variables are set (GOOGLE_SHEET_ID + GCP_* for WIF)</li>
                  <li>Confirm the sheet is shared with the service account email</li>
                  <li>Redeploy and retry</li>
                </ol>
              </div>
              <button className="btn-retry" onClick={loadData}>
                Retry
              </button>
            </section>
          ) : null}

          {view === 'money-in' ? (
            <div className="segmented-row rise" style={{ '--i': 0 }}>
              <SegmentedControl
                options={[{ value: '', label: 'All methods' }, ...moneyInMethods.map((m) => ({ value: m, label: m }))]}
                value={viewMoneyInMethod}
                onChange={(m) => setView({ view: 'money-in', moneyInMethod: m, section: '', paymentMethod: '' })}
              />
            </div>
          ) : null}

          {view === 'payment-method' ? (
            <div className="segmented-row rise" style={{ '--i': 0 }}>
              <SegmentedControl
                options={[{ value: '', label: 'All methods' }, ...paymentMethods.map((m) => ({ value: m, label: m }))]}
                value={viewPaymentMethod}
                onChange={(m) => setView({ view: 'payment-method', paymentMethod: m, section: '', moneyInMethod: '' })}
              />
            </div>
          ) : null}

          {/* Hero */}
          <section className="hero">
            <div className="surface hero-balance rise" style={{ '--i': 0 }}>
              <div className="stat-eyebrow">Cash on hand</div>
              <div className={`hero-number ${totals.balance < 0 ? 'negative-balance' : ''}`}>
                <span className="money-unit">RWF</span>
                {formatPlainAmount(totals.balance)}
              </div>
              <div className="hero-meta">
                <span>
                  Received <span className="money">{formatCurrency(totals.totalMoneyIn)}</span>
                </span>
                <span>
                  Spent <span className="money">{formatCurrency(totals.totalSpending)}</span>
                </span>
              </div>
              <div className="hero-spark">
                <ChartCanvas type="line" data={heroSparklineChart.data} options={heroSparklineChart.options} />
              </div>
            </div>

            <div className="stat-grid">
              <StatCard
                label="Money received"
                value={formatCurrency(totals.totalMoneyIn)}
                tone="positive-tone"
                index={1}
              />
              <StatCard
                label="Total spending"
                value={formatCurrency(totals.totalSpending)}
                tone="negative-tone"
                index={2}
              />
              <StatCard
                label="Average spend per day"
                value={formatCurrency(totals.averageDailySpend)}
                note="Across the selected date range"
                index={3}
              />
              <StatCard
                label="Transactions"
                value={totals.transactionCount.toLocaleString()}
                note="Rows in the selected range"
                index={4}
              />
            </div>
          </section>

          {/* Section Summary Cards (Overview only) */}
          {view === 'overview' ? (
            <section className="section-cards rise" style={{ '--i': 5 }}>
              <h2 className="section-heading">Spending by section</h2>
              <div className="section-cards-grid">
                {sectionCards.length === 0 ? (
                  <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                    No spending data by section found.
                  </p>
                ) : (
                  sectionCards.map(([section, data]) => {
                    const sectionInfo = settingsData[section] || {};

                    const costTypeItems = Object.entries(data.costTypes || {})
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 3)
                      .map(([type, amount]) => {
                        const percentage = data.total ? ((amount / data.total) * 100).toFixed(1) : '0.0';
                        return (
                          <div className="cost-type-item" key={`ct-${section}-${type}`}>
                            <span className="cost-type-label" style={{ backgroundColor: getCostTypeColor(type) }}>
                              {type}
                            </span>
                            <span className="cost-type-amount money">
                              {formatCurrency(amount)} ({percentage}%)
                            </span>
                          </div>
                        );
                      });

                    const paymentMethodItems = Object.entries(data.paymentMethods || {})
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 2)
                      .map(([method, amount]) => {
                        const percentage = data.total ? ((amount / data.total) * 100).toFixed(1) : '0.0';
                        return (
                          <div className="payment-method-item" key={`pm-${section}-${method}`}>
                            <span className="payment-method-label">{method || 'Not specified'}</span>
                            <span className="payment-method-amount money">
                              {formatCurrency(amount)} ({percentage}%)
                            </span>
                          </div>
                        );
                      });

                    return (
                      <div
                        className="surface section-card clickable"
                        key={section}
                        role="button"
                        tabIndex={0}
                        onClick={() => setView({ view: 'section', section, moneyInMethod: '', paymentMethod: '' })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setView({ view: 'section', section, moneyInMethod: '', paymentMethod: '' });
                          }
                        }}
                      >
                        <div className="section-card-header">
                          <h3>{section}</h3>
                          <div className="section-card-totals">
                            {data.moneyIn > 0 ? (
                              <p className="section-card-money-in money">Received: {formatCurrency(data.moneyIn)}</p>
                            ) : null}
                            <p className="section-card-total money">Spent: {formatCurrency(data.total)}</p>
                          </div>
                          {sectionInfo.status ? (
                            <p className="section-status" style={{ color: getStatusColor(sectionInfo.status) }}>
                              Status: {sectionInfo.status}
                            </p>
                          ) : null}
                        </div>

                        <div className="section-card-body">
                          {paymentMethodItems.length ? (
                            <div className="breakdown-section">
                              <h4 className="breakdown-title">Top payment methods</h4>
                              {paymentMethodItems}
                            </div>
                          ) : null}

                          {costTypeItems.length ? (
                            <div className="breakdown-section">
                              <h4 className="breakdown-title">Top cost types</h4>
                              {costTypeItems}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          ) : null}

          {/* Filters */}
          <section className="surface filters rise" style={{ '--i': 6 }}>
            <h2 className="section-heading">Filters</h2>
            <div className="filter-group">
              <div className="filter-item">
                <label htmlFor="date-from">From date</label>
                <input
                  type="date"
                  id="date-from"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                />
              </div>
              <div className="filter-item">
                <label htmlFor="date-to">To date</label>
                <input
                  type="date"
                  id="date-to"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                />
              </div>
              <div className="filter-item">
                <label htmlFor="section-filter">Section</label>
                <select
                  id="section-filter"
                  value={filters.section}
                  onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value }))}
                >
                  <option value="">All sections</option>
                  {sections.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-item">
                <label htmlFor="cost-type-filter">Cost type</label>
                <select
                  id="cost-type-filter"
                  value={filters.costType}
                  onChange={(e) => setFilters((f) => ({ ...f, costType: e.target.value }))}
                >
                  <option value="">All cost types</option>
                  {costTypes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-item">
                <label htmlFor="transaction-type-filter">Transaction type</label>
                <select
                  id="transaction-type-filter"
                  value={filters.transactionType}
                  onChange={(e) => setFilters((f) => ({ ...f, transactionType: e.target.value }))}
                >
                  <option value="">All transactions</option>
                  <option value="money-in">Money in only</option>
                  <option value="spending">Spending only</option>
                </select>
              </div>
              <div className="filter-item">
                <button id="reset-filters" className="btn-reset" onClick={resetFilters}>
                  Reset filters
                </button>
              </div>
            </div>
          </section>

          {/* Charts */}
          <section className="charts">
            {view === 'money-in' ? (
              <>
                <div className="surface chart-container rise" style={{ '--i': 7 }}>
                  <h3>Money in by section</h3>
                  <ChartCanvas type="doughnut" data={moneyInBySectionChart.data} options={moneyInBySectionChart.options} />
                </div>
                <div className="surface chart-container rise" style={{ '--i': 8 }}>
                  <h3>Money in by method</h3>
                  <ChartCanvas type="bar" data={moneyInByMethodChart.data} options={moneyInByMethodChart.options} />
                </div>
              </>
            ) : view === 'payment-method' ? (
              <>
                <div className="surface chart-container rise" style={{ '--i': 7 }}>
                  <h3>Spending by payment method</h3>
                  <ChartCanvas
                    type="bar"
                    data={spendingByPaymentMethodChart.data}
                    options={spendingByPaymentMethodChart.options}
                  />
                </div>
                <div className="surface chart-container rise" style={{ '--i': 8 }}>
                  <h3>Spending by cost type</h3>
                  <ChartCanvas type="bar" data={costTypeChart.data} options={costTypeChart.options} />
                </div>
              </>
            ) : (
              <>
                <div className="surface chart-container rise" style={{ '--i': 7 }}>
                  <h3>Spending by section</h3>
                  <ChartCanvas type="doughnut" data={sectionChart.data} options={sectionChart.options} />
                </div>
                <div className="surface chart-container rise" style={{ '--i': 8 }}>
                  <h3>Spending by cost type</h3>
                  <ChartCanvas type="bar" data={costTypeChart.data} options={costTypeChart.options} />
                </div>
              </>
            )}

            <div className="surface chart-container rise" style={{ '--i': 9 }}>
              <h3>Monthly cash flow</h3>
              <ChartCanvas type="bar" data={monthlyCashflowChart.data} options={monthlyCashflowChart.options} />
            </div>

            <div className="surface chart-container rise" style={{ '--i': 10 }}>
              <h3>Largest expenses</h3>
              <div className="expense-list">
                {topExpenses.length === 0 ? (
                  <p className="loading">No spending in the selected range.</p>
                ) : (
                  topExpenses.map((t, rank) => (
                    <div className="expense-row" key={`${t.originalIndex}-${rank}`}>
                      <span className="expense-rank">{String(rank + 1).padStart(2, '0')}</span>
                      <span className="expense-desc">
                        {t.taskDescription || 'No description'}
                        <span className="expense-context">
                          {t.section}
                          {t.date ? ` · ${formatDateFull(t.date)}` : ''}
                        </span>
                      </span>
                      <span className="expense-amount money">{formatCurrency(t.spending)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="surface chart-container full-width rise" style={{ '--i': 11 }}>
              <h3>Cash position over time</h3>
              <ChartCanvas type="line" data={cashPositionChart.data} options={cashPositionChart.options} />
            </div>
          </section>

          {/* Transaction Table */}
          <section className="surface transactions rise" style={{ '--i': 12 }}>
            <h2 className="section-heading">Transaction details</h2>
            <div className="table-container">
              <table id="transaction-table">
                <thead>
                  <tr>
                    <th onClick={() => onHeaderClick('date')}>Date</th>
                    <th onClick={() => onHeaderClick('section')}>Section</th>
                    <th onClick={() => onHeaderClick('taskDescription')}>Task / Description</th>
                    <th onClick={() => onHeaderClick('costType')}>Cost Type</th>
                    <th onClick={() => onHeaderClick('moneyIn')}>Money In</th>
                    <th onClick={() => onHeaderClick('moneyInMethod')}>Money In Method</th>
                    <th onClick={() => onHeaderClick('spending')}>Spending</th>
                    <th onClick={() => onHeaderClick('paymentMethod')}>Payment Method</th>
                    <th onClick={() => onHeaderClick('balance')}>Running Balance</th>
                  </tr>
                </thead>
                <tbody id="transaction-tbody">
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="loading">
                        {loading ? 'Loading data from Google Sheets...' : 'No transactions found matching the filters.'}
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((t, idx) => (
                      <tr key={`${t.originalIndex}-${idx}`}>
                        <td>{formatDateFull(t.date)}</td>
                        <td>{t.section}</td>
                        <td>{t.taskDescription || '-'}</td>
                        <td>{t.costType}</td>
                        <td className={`number ${t.moneyIn > 0 ? 'positive' : ''}`}>
                          {t.moneyIn > 0 ? formatCurrency(t.moneyIn) : '-'}
                        </td>
                        <td>{t.moneyInMethod || '-'}</td>
                        <td className={`number ${t.spending > 0 ? 'negative' : ''}`}>
                          {t.spending > 0 ? formatCurrency(t.spending) : '-'}
                        </td>
                        <td>{t.paymentMethod || '-'}</td>
                        <td className={`number ${t.balance >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(t.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Loading Overlay */}
          <div className={`loading-overlay ${loading ? '' : 'hidden'}`}>
            <div className="spinner"></div>
            <p>Loading data from Google Sheets...</p>
          </div>
        </div>
      </main>
    </div>
  );
}
