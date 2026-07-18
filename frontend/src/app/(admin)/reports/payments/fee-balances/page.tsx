"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/common/AuthProvider';
import { useBranch } from '@/components/common/BranchContext';
import api from '@/lib/axios';
import {
  CheckCircle, AlertTriangle, XCircle, Clock, ChevronLeft, ChevronRight,
  FileText, FileSpreadsheet, RefreshCw, Play, ChevronDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = 'class' | 'section' | 'student';
type FetchState = 'idle' | 'loading' | 'success' | 'error';

interface FeeCategory {
  id: string;
  name: string;
  code: string;
}

interface SummaryData {
  total_net: string;
  total_paid: string;
  total_outstanding: string;
  outstanding_pct: string;
  student_count: string;
  report_type: string;
  categories: FeeCategory[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '0.00';
  const n = parseFloat(String(v));
  if (!isFinite(n)) return String(v);
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRupee(v: string | number | null | undefined) {
  return '\u20b9' + fmt(v);
}

function pctStr(paid: string | number, net: string | number): string {
  const p = parseFloat(String(paid));
  const n = parseFloat(String(net));
  if (!n) return '0.00';
  return ((p / n) * 100).toFixed(2);
}

// ─── MultiSelect Dropdown ──────────────────────────────────────────────────────

interface MultiSelectProps {
  options: FeeCategory[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

function MultiSelectDropdown({ options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id));
    else onChange([...selected, id]);
  };

  const label = selected.length === 0
    ? 'All Fee Fields'
    : selected.length === options.length
      ? 'All Fee Fields'
      : options.filter(o => selected.includes(o.id)).map(o => o.name).join(', ');

  return (
    <div ref={ref} className="relative min-w-[260px]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-left truncate focus:ring-2 focus:ring-blue-500 outline-none"
      >
        <span className="truncate text-slate-600">{label}</span>
        <ChevronDown size={14} className="flex-shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No fee categories found</p>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                <button className="text-xs text-blue-600 hover:underline" onClick={() => onChange(options.map(o => o.id))}>All</button>
                <span className="text-slate-300">|</span>
                <button className="text-xs text-slate-500 hover:underline" onClick={() => onChange([])}>None</button>
              </div>
              {options.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={selected.includes(opt.id)} onChange={() => toggle(opt.id)} className="accent-blue-600" />
                  <span>{opt.name}</span>
                  {opt.code && <span className="text-xs text-slate-400">({opt.code})</span>}
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */

export default function FeeBalancesReportPage() {
  const { selectedBranch } = useBranch();

  const [reportType, setReportType] = useState<ReportType>('class');
  const [academicYearId, setAcademicYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [studentStatus, setStudentStatus] = useState('ACTIVE');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [byPercentage, setByPercentage] = useState(false);

  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [classSections, setClassSections] = useState<any[]>([]);
  const [feeCategories, setFeeCategories] = useState<FeeCategory[]>([]);

  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [footerTotals, setFooterTotals] = useState<Record<string, string> | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [durationMs, setDurationMs] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, total: 1, size: 50, count: 0 });
  const [activeFilters, setActiveFilters] = useState<Record<string, any> | null>(null);
  const [resolvedCategories, setResolvedCategories] = useState<FeeCategory[]>([]);

  const effectiveBranchId = selectedBranch && selectedBranch !== 'all' ? selectedBranch : '';

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [ayRes, catRes] = await Promise.all([
          api.get('tenants/academic-years/'),
          api.get('fees/categories/'),
        ]);
        const ay = ayRes.data?.data ?? ayRes.data?.results ?? ayRes.data;
        setAcademicYears(Array.isArray(ay) ? ay : []);
        const cats = catRes.data?.data ?? catRes.data?.results ?? catRes.data;
        const catList: FeeCategory[] = (Array.isArray(cats) ? cats : []).filter(c => 
          !c.name.toUpperCase().includes('TRANSPORT') && !c.name.toUpperCase().includes('ADMISSION')
        );
        setFeeCategories(catList);
        setSelectedCategoryIds(catList.map((c: FeeCategory) => c.id));
      } catch {
        setAcademicYears([]);
        setFeeCategories([]);
      }
    };
    loadAll();
  }, []);

  useEffect(() => {
    const loadClasses = async () => {
      try {
        const params: Record<string, string> = {};
        if (effectiveBranchId) params.branch_id = effectiveBranchId;
        if (academicYearId) params.academic_year_id = academicYearId;
        const res = await api.get('classes/', { params });
        const raw = res.data?.data ?? res.data?.results ?? res.data;
        setClassSections(Array.isArray(raw) ? raw : []);
      } catch { setClassSections([]); }
    };
    loadClasses();
  }, [effectiveBranchId, academicYearId]);

  const uniqueGrades = [...new Set(classSections.map((cs: any) => cs.grade))].sort();

  type ColDef = { key: string; label: string; numeric?: boolean };

  const buildColumns = useCallback((rt: ReportType, cats: FeeCategory[]): ColDef[] => {
    const cols: ColDef[] = [];
    if (rt === 'class') {
      cols.push({ key: 'class', label: 'Class' });
      cols.push({ key: 'total_students', label: 'Total Students' });
    } else if (rt === 'section') {
      cols.push({ key: 'class', label: 'Class' });
      cols.push({ key: 'section', label: 'Section' });
      cols.push({ key: 'total_students', label: 'Total Students' });
    } else {
      cols.push({ key: 'admission_number', label: 'Admission No.' });
      cols.push({ key: 'student_name', label: 'Student Name' });
      cols.push({ key: 'class', label: 'Class' });
      cols.push({ key: 'section', label: 'Section' });
      cols.push({ key: 'category', label: 'Category' });
      cols.push({ key: 'parent_name', label: 'Parent Name' });
      cols.push({ key: 'parent_mobile', label: 'Parent Mobile' });
    }
    for (const cat of cats) {
      cols.push({ key: `cat_${cat.id.replace(/-/g, '_')}`, label: cat.name, numeric: true });
    }
    cols.push({ key: 'old_dues', label: 'Old Dues', numeric: true });
    cols.push({ key: 'concession_amount', label: 'Concession', numeric: true });
    cols.push({ key: 'net_amount', label: 'Total Amount', numeric: true });
    cols.push({ key: 'paid_amount', label: 'Amount Paid', numeric: true });
    cols.push({ key: 'outstanding_amount', label: 'Balance', numeric: true });
    if (rt === 'student') {
      cols.push({ key: 'student_status', label: 'Status' });
      cols.push({ key: 'inactive_reason', label: 'Inactive Reason' });
    }
    return cols;
  }, []);

  const fetchReport = useCallback(async (page = 1, overrideFilters?: Record<string, any>) => {
    const params: Record<string, any> = overrideFilters ?? activeFilters ?? {};
    setFetchState('loading');
    setErrorMsg('');
    const t0 = Date.now();
    try {
      const res = await api.get('reports/payments/fee-balances/', { params: { ...params, page } });
      const d = res.data?.data ?? res.data;
      setDurationMs(Date.now() - t0);
      const results = Array.isArray(d) ? d : (d.results ?? []);
      setData(results);
      const s: SummaryData | null = d.summary ?? null;
      setSummary(s);
      setFooterTotals(d.footer_totals ?? null);
      if (s?.categories) setResolvedCategories(s.categories);
      if (d.current_page) {
        setPagination({ current: d.current_page, total: d.total_pages, size: d.page_size, count: d.count });
      } else {
        setPagination({ current: 1, total: 1, size: results.length, count: results.length });
      }
      setFetchState('success');
    } catch (e: any) {
      setDurationMs(Date.now() - t0);
      setData([]);
      setSummary(null);
      setFooterTotals(null);
      const st = e?.response?.status;
      const msg = e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Unknown error';
      setErrorMsg(`HTTP ${st ?? '?'} \u2014 ${msg}`);
      setFetchState('error');
    }
  }, [activeFilters]);

  const buildParams = () => ({
    report_type: reportType,
    fee_categories: selectedCategoryIds.join(','),
    ...(academicYearId ? { academic_year_id: academicYearId } : {}),
    ...(classId ? { class_id: classId } : {}),
    ...(sectionId ? { section_id: sectionId } : {}),
    ...(statusFilter !== 'ALL' ? { status_filter: statusFilter } : {}),
    ...(studentStatus !== 'ALL' ? { student_status: studentStatus } : {}),
    ...(minAmount ? { min_amount: minAmount } : {}),
    ...(maxAmount ? { max_amount: maxAmount } : {}),
    ...(byPercentage ? { by_percentage: 'true' } : {}),
  });

  const handleShowReport = () => {
    const params = buildParams();
    setActiveFilters(params);
    fetchReport(1, params);
  };

  const handleReset = () => {
    setReportType('class');
    setAcademicYearId('');
    setClassId('');
    setSectionId('');
    setStatusFilter('ALL');
    setStudentStatus('ACTIVE');
    setSelectedCategoryIds(feeCategories.map(c => c.id));
    setMinAmount('');
    setMaxAmount('');
    setByPercentage(false);
    setData([]);
    setSummary(null);
    setFooterTotals(null);
    setFetchState('idle');
    setActiveFilters(null);
    setResolvedCategories([]);
  };

  const handleDownloadCsv = async () => {
    try {
      const params = activeFilters ?? buildParams();
      const res = await api.get('reports/payments/fee-balances/', {
        params: { ...params, file: 'csv' },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `fee_balances_${reportType}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 150);
    } catch { toast.error('CSV download failed.'); }
  };

  const handleDownloadPdf = async () => {
    try {
      const params = activeFilters ?? buildParams();
      const res = await api.get('reports/payments/fee-balances/', {
        params: { ...params, file: 'pdf' },
        responseType: 'blob',
        headers: { Accept: 'application/pdf, application/json' },
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch { toast.error('PDF download failed.'); }
  };

  const displayCats: FeeCategory[] = resolvedCategories.length > 0
    ? resolvedCategories
    : feeCategories.filter(c => selectedCategoryIds.includes(c.id));

  const columns = buildColumns(reportType, displayCats);

  const sc = "px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
        <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Home</Link>
        <span>/</span>
        <Link href="/reports" className="hover:text-blue-600 transition-colors">Reports</Link>
        <span>/</span>
        <Link href="/reports/payments" className="hover:text-blue-600 transition-colors">Financial</Link>
        <span>/</span>
        <span className="text-slate-800">Fee Balances</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold font-sans tracking-tight text-slate-800">Fee Balances</h1>
        <p className="text-sm text-slate-400 mt-1">Outstanding fee balances by class, section, or student</p>
      </div>

      {/* Criteria */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="text-base font-semibold text-slate-700 mb-4">Select The Criteria</h2>
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Academic Year <span className="text-red-400">*</span></label>
            <select className={sc} value={academicYearId} onChange={e => setAcademicYearId(e.target.value)}>
              <option value="">Current Year</option>
              {academicYears.map((ay: any) => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Report Type <span className="text-red-400">*</span></label>
            <select className={sc} value={reportType} onChange={e => { setReportType(e.target.value as ReportType); setSectionId(''); }}>
              <option value="class">Class</option>
              <option value="section">Section</option>
              <option value="student">Student</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase">Select Fee Fields</label>
            <MultiSelectDropdown options={feeCategories} selected={selectedCategoryIds} onChange={setSelectedCategoryIds} />
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mb-5">
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Class</label>
            <select className={sc} value={classId} onChange={e => { setClassId(e.target.value); setSectionId(''); }}>
              <option value="">All</option>
              {uniqueGrades.map((g: any) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {classId && (
            <div className="flex flex-col gap-1.5 min-w-[150px]">
              <label className="text-xs font-semibold text-slate-500 uppercase">Section</label>
              <select className={sc} value={sectionId} onChange={e => setSectionId(e.target.value)}>
                <option value="">All</option>
                {classSections
                  .filter((cs: any) => cs.grade === classId)
                  .sort((a: any, b: any) => String(a.section || '').localeCompare(String(b.section || '')))
                  .map((cs: any) => <option key={cs.id} value={cs.id}>{cs.display_name || `${cs.grade} - ${cs.section}`}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Fee Status</label>
            <select className={sc} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="PAID">Paid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="SENT">Sent (Unpaid)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Student Status</label>
            <select className={sc} value={studentStatus} onChange={e => setStudentStatus(e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ALL">All</option>
            </select>
          </div>
        </div>

        {/* Fee Filters */}
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-3">Fee Filters</h3>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Min Amount Paid</label>
              <input type="number" className={sc + " w-40"} placeholder={byPercentage ? 'e.g. 0 %' : 'e.g. 0'} value={minAmount} onChange={e => setMinAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Max Amount Paid</label>
              <input type="number" className={sc + " w-40"} placeholder={byPercentage ? 'e.g. 100 %' : 'e.g. 100000'} value={maxAmount} onChange={e => setMaxAmount(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 mb-0.5 cursor-pointer">
              <input type="checkbox" checked={byPercentage} onChange={e => setByPercentage(e.target.checked)} className="accent-blue-600 w-4 h-4" />
              By Percentage
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-3 mt-5">
          <button id="btn-show-report" onClick={handleShowReport} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-all">
            <Play size={15} />
            Show Report
          </button>
          <button id="btn-reset-filters" onClick={handleReset} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
            <RefreshCw size={14} />
            Reset Filters
          </button>
          <button id="btn-download-pdf" onClick={handleDownloadPdf} disabled={fetchState !== 'success'} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
            <FileText size={14} className="text-red-500" />
            Download as PDF
          </button>
          <button id="btn-download-csv" onClick={handleDownloadCsv} disabled={fetchState !== 'success'} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
            <FileSpreadsheet size={14} className="text-emerald-500" />
            Download as CSV
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {fetchState === 'loading' && (
        <div className="flex items-center gap-3 px-5 py-3 bg-blue-50 border border-blue-100 rounded-xl animate-pulse">
          <Clock size={18} className="text-blue-500 animate-spin" />
          <span className="text-sm font-medium text-blue-700">Fetching report data...</span>
        </div>
      )}
      {fetchState === 'success' && (
        <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${data.length > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
          {data.length > 0 ? <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />}
          <span className={`text-sm font-medium ${data.length > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {data.length > 0 ? `Loaded ${pagination.count.toLocaleString('en-IN')} record${pagination.count !== 1 ? 's' : ''} successfully` : 'No matching records found'}
          </span>
          <span className="text-xs text-slate-400 ml-auto">
            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        </div>
      )}
      {fetchState === 'error' && (
        <div className="flex items-start gap-3 px-5 py-4 bg-red-50 border border-red-100 rounded-xl">
          <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Failed to load report</p>
            <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
          </div>
          <button onClick={() => fetchReport(1)} className="text-xs font-bold text-red-600 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">Retry</button>
        </div>
      )}

      {/* Summary */}
      {fetchState === 'success' && summary && data.length > 0 && (
        <div className="text-sm font-medium text-slate-600">
          Total Fee Balances to Date:{' '}
          <span className="font-bold text-slate-800">&#8377;{fmt(summary.total_outstanding)} ({summary.outstanding_pct}%)</span>
          {' '}(Students Count: <span className="font-bold">{summary.student_count}</span>)
        </div>
      )}

      {/* Table */}
      <div className="border-t border-slate-100 pt-6">
        {fetchState === 'idle' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-400">
                <FileSpreadsheet size={32} strokeWidth={1.5} />
              </div>
              <p className="text-lg font-semibold text-slate-700">Select criteria and click Show Report</p>
              <p className="text-sm text-slate-400">Use the filters above to choose report type and fee fields, then click the blue button.</p>
            </div>
          </div>
        ) : (
          <FeeBalanceTable
            columns={columns}
            data={data}
            loading={fetchState === 'loading'}
            footerTotals={footerTotals}
            pagination={pagination}
            onPageChange={(p) => fetchReport(p)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Table Component ──────────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  numeric?: boolean;
}

interface FeeBalanceTableProps {
  columns: ColDef[];
  data: any[];
  loading: boolean;
  footerTotals: Record<string, string> | null;
  pagination: { current: number; total: number; size: number; count: number };
  onPageChange: (p: number) => void;
}

function FeeBalanceTable({ columns, data, loading, footerTotals, pagination, onPageChange }: FeeBalanceTableProps) {
  const showFooter = !loading && data.length > 0 && footerTotals && Object.keys(footerTotals).length > 0;

  const statusColors: Record<string, string> = {
    PAID: 'bg-emerald-100 text-emerald-700',
    PARTIALLY_PAID: 'bg-yellow-100 text-yellow-700',
    OVERDUE: 'bg-red-100 text-red-700',
    SENT: 'bg-blue-100 text-blue-700',
    DRAFT: 'bg-slate-100 text-slate-600',
  };

  const renderCell = (col: ColDef, row: any) => {
    const v = row[col.key];
    if (col.numeric) {
      const pctSuffix = col.key === 'net_amount' ? '(100%)'
        : col.key === 'paid_amount' ? `(${pctStr(row.paid_amount, row.net_amount)}%)`
        : col.key === 'outstanding_amount' ? `(${pctStr(row.outstanding_amount, row.net_amount)}%)`
        : null;
      return (
        <span>
          {fmtRupee(v)}
          {pctSuffix && <span className="text-slate-400 text-xs ml-1">{pctSuffix}</span>}
        </span>
      );
    }
    if (col.key === 'status') {
      const cls = statusColors[v] || 'bg-slate-100 text-slate-600';
      return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{(v || '').replace(/_/g, ' ')}</span>;
    }
    if (col.key === 'inactive_reason') return v ? <span className="text-xs text-slate-500 italic">{v}</span> : <span className="text-slate-300">—</span>;
    return v || '—';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
            <tr>
              {columns.map(col => (
                <th key={col.key} className={`px-4 py-3 whitespace-nowrap ${col.numeric ? 'text-right' : ''}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map(col => (
                    <td key={col.key + i} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-lg font-medium">No results found</span>
                    <span className="text-xs">Try adjusting your filters or report type</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className={`hover:bg-slate-50 transition-colors ${row.student_status === 'INACTIVE' ? 'bg-red-50/30' : ''}`}>
                  {columns.map(col => (
                    <td key={col.key} className={`px-4 py-3 whitespace-nowrap ${col.numeric ? 'text-right font-medium' : ''}`}>
                      {renderCell(col, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {showFooter && footerTotals && (
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-200 font-bold text-slate-700">
                {columns.map((col, idx) => {
                  if (idx === 0) return <td key={col.key} className="px-4 py-3 whitespace-nowrap font-bold">Total</td>;
                  const v = footerTotals[col.key];
                  const hasVal = v !== undefined && v !== null && String(v).trim() !== '';
                  return (
                    <td key={col.key} className={`px-4 py-3 whitespace-nowrap ${col.numeric ? 'text-right font-bold' : ''}`}>
                      {col.numeric && hasVal ? fmtRupee(v) : hasVal ? v : '—'}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pagination.total > 1 && (
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="text-xs text-slate-500 font-medium">
            Showing {((pagination.current - 1) * pagination.size) + 1} to {Math.min(pagination.current * pagination.size, pagination.count)} of {pagination.count} results
          </div>
          <div className="flex gap-2">
            <button onClick={() => onPageChange(pagination.current - 1)} disabled={pagination.current === 1} className="p-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-50 hover:bg-slate-50">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 text-sm font-semibold text-slate-700">Page {pagination.current} of {pagination.total}</span>
            <button onClick={() => onPageChange(pagination.current + 1)} disabled={pagination.current === pagination.total} className="p-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-50 hover:bg-slate-50">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
