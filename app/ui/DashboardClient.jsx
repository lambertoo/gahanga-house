'use client';

import Papa from 'papaparse';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChartCanvas from './charts/ChartCanvas';

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

function getCostTypeColor(costType) {
  const colorMap = {
    Material: '#2563eb',
    Manpower: '#10b981',
    Other: '#f59e0b',
    'cash in': '#10b981',
    'cash out': '#ef4444',
    Repairing: '#8b5cf6',
    Unknown: '#64748b',
  };
  return colorMap[costType] || '#64748b';
}

function getStatusColor(status) {
  const statusMap = {
    Completed: '#10b981',
    'In Progress': '#2563eb',
    'Not Started': '#64748b',
    Delayed: '#ef4444',
  };
  return statusMap[status] || '#64748b';
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

    const costType = (row['Cost Type'] || 'Unknown').trim();
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
    return {
      totalMoneyIn,
      totalSpending,
      balance,
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
    const data = labels.map((l) => sectionData[l]);

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: [
              '#2563eb',
              '#10b981',
              '#f59e0b',
              '#ef4444',
              '#8b5cf6',
              '#ec4899',
              '#06b6d4',
              '#84cc16',
              '#f97316',
              '#6366f1',
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
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
  }, [filteredTransactions]);

  const moneyInBySectionChart = useMemo(() => {
    const sectionData = {};
    filteredTransactions.forEach((t) => {
      if (t.moneyIn > 0) {
        sectionData[t.section] = (sectionData[t.section] || 0) + t.moneyIn;
      }
    });
    const labels = Object.keys(sectionData).sort((a, b) => sectionData[b] - sectionData[a]);
    const data = labels.map((l) => sectionData[l]);

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: [
              '#2563eb',
              '#10b981',
              '#f59e0b',
              '#ef4444',
              '#8b5cf6',
              '#ec4899',
              '#06b6d4',
              '#84cc16',
              '#f97316',
              '#6366f1',
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
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
    const data = labels.map((l) => methodData[l]);

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Money In',
            data,
            backgroundColor: '#10b981',
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => formatCurrency(context.parsed.y),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatCurrency(value),
            },
          },
        },
      },
    };
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
    const data = labels.map((l) => methodData[l]);

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Spending',
            data,
            backgroundColor: '#ef4444',
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => formatCurrency(context.parsed.y),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatCurrency(value),
            },
          },
        },
      },
    };
  }, [filteredTransactions]);

  const costTypeChart = useMemo(() => {
    const costTypeData = {};
    filteredTransactions.forEach((t) => {
      if (t.spending > 0) costTypeData[t.costType] = (costTypeData[t.costType] || 0) + t.spending;
    });
    const labels = Object.keys(costTypeData).sort((a, b) => costTypeData[b] - costTypeData[a]);
    const data = labels.map((l) => costTypeData[l]);
    const colors = labels.map((l) => getCostTypeColor(l));

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Spending',
            data,
            backgroundColor: colors,
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => formatCurrency(context.parsed.y),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatCurrency(value),
            },
          },
        },
      },
    };
  }, [filteredTransactions]);

  const timelineChart = useMemo(() => {
    const dateData = {};
    filteredTransactions.forEach((t) => {
      if (!t.date) return;
      const dateKey = toYmd(t.date);
      if (!dateData[dateKey]) dateData[dateKey] = { moneyIn: 0, spending: 0 };
      dateData[dateKey].moneyIn += t.moneyIn;
      dateData[dateKey].spending += t.spending;
    });

    const dates = Object.keys(dateData).sort();
    const moneyInData = dates.map((d) => dateData[d].moneyIn);
    const spendingData = dates.map((d) => dateData[d].spending);

    return {
      data: {
        labels: dates.map(formatDateShort),
        datasets: [
          {
            label: 'Money In',
            data: moneyInData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true,
          },
          {
            label: 'Spending',
            data: spendingData,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => formatCurrency(value) },
          },
        },
      },
    };
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
            <div className="sidebar-title">GAHANGA Dashboard</div>
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

          <div className="nav-section">
            <div className="nav-section-title">Money In</div>
            <button
              className={`nav-item ${view === 'money-in' && !viewMoneyInMethod ? 'active' : ''}`}
              onClick={() => navTo({ view: 'money-in', moneyInMethod: '', section: '', paymentMethod: '' })}
              type="button"
            >
              All Money In
            </button>
            {moneyInMethods.map((m) => (
              <button
                key={m}
                className={`nav-item ${view === 'money-in' && viewMoneyInMethod === m ? 'active' : ''}`}
                onClick={() => navTo({ view: 'money-in', moneyInMethod: m, section: '', paymentMethod: '' })}
                type="button"
              >
                {m}
              </button>
            ))}
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Spending</div>
            <button
              className={`nav-item ${view === 'payment-method' && !viewPaymentMethod ? 'active' : ''}`}
              onClick={() => navTo({ view: 'payment-method', paymentMethod: '', section: '', moneyInMethod: '' })}
              type="button"
            >
              All Spending
            </button>
            {paymentMethods.map((m) => (
              <button
                key={m}
                className={`nav-item ${view === 'payment-method' && viewPaymentMethod === m ? 'active' : ''}`}
                onClick={() => navTo({ view: 'payment-method', paymentMethod: m, section: '', moneyInMethod: '' })}
                type="button"
              >
                {m}
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
        <section className="filters" style={{ border: '1px solid #ef4444' }}>
          <h2 style={{ color: '#ef4444' }}>Error loading data</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>{error}</p>
          <div style={{ background: '#f0f9ff', border: '1px solid #0ea5e9', borderRadius: 8, padding: 15 }}>
            <p style={{ color: '#0c4a6e', fontWeight: 600, marginBottom: 10 }}>How to fix</p>
            <ol style={{ color: '#075985', fontSize: '0.9rem', marginLeft: 20, lineHeight: 1.8 }}>
              <li>Confirm your Vercel environment variables are set (GOOGLE_SHEET_ID + GCP_* for WIF)</li>
              <li>Confirm the sheet is shared with the service account email</li>
              <li>Redeploy and retry</li>
            </ol>
          </div>
          <button
            onClick={loadData}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Retry
          </button>
        </section>
      ) : null}

      {/* Summary Cards */}
      <section className="summary-cards">
        <div className="card">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <h3>Total Money Given</h3>
            <p className="card-value">{formatCurrency(totals.totalMoneyIn)}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-icon">💸</div>
          <div className="card-content">
            <h3>Total Spending</h3>
            <p className="card-value">{formatCurrency(totals.totalSpending)}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-icon">📊</div>
          <div className="card-content">
            <h3>Balance</h3>
            <p className={`card-value ${totals.balance >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(totals.balance)}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-icon">📝</div>
          <div className="card-content">
            <h3>Transactions</h3>
            <p className="card-value">{totals.transactionCount.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* Section Summary Cards (Overview only) */}
      {view === 'overview' ? (
        <section className="section-cards">
          <h2>Spending by Section</h2>
          <div className="section-cards-grid">
            {sectionCards.length === 0 ? (
              <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>No spending data by section found.</p>
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
                        <span className="cost-type-amount">
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
                        <span className="payment-method-amount">
                          {formatCurrency(amount)} ({percentage}%)
                        </span>
                      </div>
                    );
                  });

                return (
                  <div
                    className="section-card clickable"
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
                          <p className="section-card-money-in">Received: {formatCurrency(data.moneyIn)}</p>
                        ) : null}
                        <p className="section-card-total">Spent: {formatCurrency(data.total)}</p>
                      </div>
                      {sectionInfo.status ? (
                        <p
                          className="section-status"
                          style={{ color: getStatusColor(sectionInfo.status), fontSize: '0.85rem', marginTop: 8 }}
                        >
                          Status: {sectionInfo.status}
                        </p>
                      ) : null}
                    </div>

                    <div className="section-card-body">
                      {paymentMethodItems.length ? (
                        <div className="breakdown-section">
                          <h4
                            style={{
                              fontSize: '0.9rem',
                              color: 'var(--text-secondary)',
                              marginBottom: 8,
                              fontWeight: 600,
                            }}
                          >
                            Top payment methods
                          </h4>
                          {paymentMethodItems}
                        </div>
                      ) : null}

                      {costTypeItems.length ? (
                        <div className="breakdown-section">
                          <h4
                            style={{
                              fontSize: '0.9rem',
                              color: 'var(--text-secondary)',
                              marginBottom: 8,
                              fontWeight: 600,
                              marginTop: 12,
                            }}
                          >
                            Top cost types
                          </h4>
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
      <section className="filters">
        <h2>Filters</h2>
        <div className="filter-group">
          <div className="filter-item">
            <label htmlFor="date-from">From Date:</label>
            <input
              type="date"
              id="date-from"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </div>
          <div className="filter-item">
            <label htmlFor="date-to">To Date:</label>
            <input
              type="date"
              id="date-to"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </div>
          <div className="filter-item">
            <label htmlFor="section-filter">Section:</label>
            <select
              id="section-filter"
              value={filters.section}
              onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value }))}
            >
              <option value="">All Sections</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="cost-type-filter">Cost Type:</label>
            <select
              id="cost-type-filter"
              value={filters.costType}
              onChange={(e) => setFilters((f) => ({ ...f, costType: e.target.value }))}
            >
              <option value="">All Cost Types</option>
              {costTypes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="transaction-type-filter">Transaction Type:</label>
            <select
              id="transaction-type-filter"
              value={filters.transactionType}
              onChange={(e) => setFilters((f) => ({ ...f, transactionType: e.target.value }))}
            >
              <option value="">All Transactions</option>
              <option value="money-in">Money In Only</option>
              <option value="spending">Spending Only</option>
            </select>
          </div>
          <div className="filter-item">
            <button id="reset-filters" className="btn-reset" onClick={resetFilters}>
              Reset Filters
            </button>
          </div>
        </div>
      </section>

      {/* Charts */}
      <section className="charts">
        {view === 'money-in' ? (
          <>
            <div className="chart-container">
              <h3>Money In by Section</h3>
              <ChartCanvas type="pie" data={moneyInBySectionChart.data} options={moneyInBySectionChart.options} />
            </div>
            <div className="chart-container">
              <h3>Money In by Method</h3>
              <ChartCanvas type="bar" data={moneyInByMethodChart.data} options={moneyInByMethodChart.options} />
            </div>
          </>
        ) : view === 'payment-method' ? (
          <>
            <div className="chart-container">
              <h3>Spending by Payment Method</h3>
              <ChartCanvas type="bar" data={spendingByPaymentMethodChart.data} options={spendingByPaymentMethodChart.options} />
            </div>
            <div className="chart-container">
              <h3>Spending by Cost Type</h3>
              <ChartCanvas type="bar" data={costTypeChart.data} options={costTypeChart.options} />
            </div>
          </>
        ) : (
          <>
            <div className="chart-container">
              <h3>Spending by Section</h3>
              <ChartCanvas type="pie" data={sectionChart.data} options={sectionChart.options} />
            </div>
            <div className="chart-container">
              <h3>Spending by Cost Type</h3>
              <ChartCanvas type="bar" data={costTypeChart.data} options={costTypeChart.options} />
            </div>
          </>
        )}
        <div className="chart-container">
          <h3>Timeline: Money In vs Spending</h3>
          <ChartCanvas type="line" data={timelineChart.data} options={timelineChart.options} />
        </div>
      </section>

      {/* Transaction Table */}
      <section className="transactions">
        <h2>Transaction Details</h2>
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
                    <td className={`number ${t.balance >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(t.balance)}</td>
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

