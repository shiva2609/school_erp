"use client";

import React, { useState, useCallback, use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle, AlertTriangle, XCircle, Filter, Clock, FileDown } from 'lucide-react';
import ReportFilters from '@/components/reports/ReportFilters';
import ReportTable from '@/components/reports/ReportTable';
import ReportSummaryStrip from '@/components/reports/ReportSummaryStrip';
import ExportButton from '@/components/reports/ExportButton';
import api from '@/lib/axios';
import { getReportConfig, reportsRegistry } from '@/lib/reportsRegistry';
import { getSummaryCardsForExportKey } from '@/lib/reportSummaryCards';

type FetchStatus = 
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; message: string; count: number; durationMs: number }
  | { state: 'error'; message: string; statusCode?: number; endpoint: string };

function normalizeSummary(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) out[k] = '';
    else out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

export default function DynamicReportPage({ params }: { params: Promise<{ category: string; reportId: string }> }) {
  const unwrappedParams = use(params);
  const { category, reportId } = unwrappedParams;
  
  const config = getReportConfig(category, reportId);
  if (!config) return notFound();

  const [filters, setFilters] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>({ state: 'idle' });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    pageSize: 50,
    totalCount: 0
  });
  const [summary, setSummary] = useState<Record<string, string> | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const summaryCards = getSummaryCardsForExportKey(config.exportKey);

  const fetchReport = useCallback(async (page = 1, overrideFilters?: any) => {
    const activeFilters = overrideFilters ?? filters ?? {};
    setFetchStatus({ state: 'loading' });
    setSummary(null);
    const startTime = Date.now();

    try {
      const res = await api.get(config.apiEndpoint, {
        params: { ...activeFilters, page }
      });

      const durationMs = Date.now() - startTime;

      // Backend returns: { success: true, data: { count, total_pages, current_page, page_size, results: [...] } }
      const d = res.data?.data ?? res.data;
      if (d) {
        const results = Array.isArray(d) ? d : (d.results ?? []);
        setData(results);
        setSummary(normalizeSummary(d.summary));

        if (d.current_page) {
          setPagination({
            currentPage: d.current_page || 1,
            totalPages: d.total_pages || 1,
            pageSize: d.page_size || 50,
            totalCount: d.count || 0
          });
        } else {
          setPagination({
            currentPage: 1,
            totalPages: 1,
            pageSize: results.length,
            totalCount: results.length
          });
        }

        const totalCount = d.count ?? results.length;
        setFetchStatus({
          state: 'success',
          message: totalCount > 0
            ? `Loaded ${totalCount.toLocaleString('en-IN')} record${totalCount !== 1 ? 's' : ''} successfully`
            : 'Query executed successfully — no matching records found',
          count: totalCount,
          durationMs
        });
      } else {
        setData([]);
        setSummary(null);
        setFetchStatus({
          state: 'success',
          message: 'Query executed successfully — no data returned',
          count: 0,
          durationMs
        });
      }
    } catch (e: any) {
      console.error('Report fetch error:', e);
      setData([]);
      setSummary(null);

      const status = e?.response?.status;
      const serverMessage = e?.response?.data?.detail 
        || e?.response?.data?.error 
        || e?.response?.data?.message;
      
      let userMessage: string;

      if (!e?.response) {
        // Network error — no response at all
        userMessage = 'Network error — could not reach the server. Check your internet connection or verify the backend is running.';
      } else if (status === 401) {
        userMessage = 'Authentication expired — please log in again.';
      } else if (status === 403) {
        userMessage = 'Permission denied — you do not have access to this report. Contact your administrator.';
      } else if (status === 404) {
        userMessage = `Report endpoint not found (404). The backend may not have this report implemented yet. Endpoint: ${config.apiEndpoint}`;
      } else if (status === 500) {
        userMessage = `Server error (500) — ${serverMessage || 'An internal error occurred on the server. Check backend logs for details.'}`;
      } else if (status === 502 || status === 503) {
        userMessage = `Service unavailable (${status}) — the server is down or restarting. Try again in a few moments.`;
      } else {
        userMessage = serverMessage || `Unexpected error (HTTP ${status || 'unknown'}) — ${e?.message || 'please try again.'}`;
      }

      setFetchStatus({
        state: 'error',
        message: userMessage,
        statusCode: status,
        endpoint: config.apiEndpoint
      });
    }
  }, [filters, config.apiEndpoint]);

  const handleFilterSubmit = useCallback((newFilters: any) => {
    setFilters(newFilters);
    fetchReport(1, newFilters);
  }, [fetchReport]);

  const handlePdfDownload = useCallback(async () => {
    const activeFilters = filters || {};
    const needsExam = Boolean(config.filters?.showExam);
    if (needsExam && !activeFilters.exam_id) {
      alert('Select an exam term, click Generate Report, then download the PDF.');
      return;
    }
    setPdfLoading(true);
    try {
      const res = await api.get(config.apiEndpoint, {
        params: { ...activeFilters, file: 'pdf' },
        responseType: 'blob',
        headers: { Accept: 'application/pdf' },
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e: any) {
      let message = 'Could not download PDF.';
      const data = e?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const json = JSON.parse(text);
          message = json.error || json.detail || message;
        } catch {
          message = 'Server returned an invalid PDF. Check that a document template exists for this type.';
        }
      } else if (e?.response?.data?.error) {
        message = e.response.data.error;
      }
      alert(message);
    } finally {
      setPdfLoading(false);
    }
  }, [config.apiEndpoint, config.filters?.showExam, filters]);

  const categoryTitle = reportsRegistry.find(c => c.id === category)?.title || category;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
        <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Home</Link>
        <span>//</span>
        <Link href="/reports" className="hover:text-blue-600 transition-colors">Reports</Link>
        <span>//</span>
        <Link href={`/reports/${category}`} className="hover:text-blue-600 transition-colors">{categoryTitle}</Link>
        <span>//</span>
        <span className="text-slate-800">{config.title}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-sans tracking-tight text-slate-800">{config.title}</h1>
          <p className="text-sm text-slate-400 mt-1">{config.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config.offerPdfDownload && (
            <button
              type="button"
              onClick={handlePdfDownload}
              disabled={pdfLoading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <FileDown size={18} className="text-indigo-600" />
              {pdfLoading ? 'Preparing PDF…' : 'Download PDF'}
            </button>
          )}
          <ExportButton reportType={config.exportKey} filters={filters || {}} />
        </div>
      </div>

      <div className="mt-8">
        <ReportFilters
          key={`${category}-${reportId}`}
          onFilterChange={handleFilterSubmit}
          {...config.filters}
        />
      </div>

      {/* ── Status Banner ── */}
      {fetchStatus.state === 'loading' && (
        <div className="flex items-center gap-3 px-5 py-3 bg-blue-50 border border-blue-100 rounded-xl animate-pulse">
          <Clock size={18} className="text-blue-500 animate-spin" />
          <span className="text-sm font-medium text-blue-700">Fetching report data…</span>
        </div>
      )}

      {fetchStatus.state === 'success' && (
        <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${
          fetchStatus.count > 0 
            ? 'bg-emerald-50 border-emerald-100' 
            : 'bg-amber-50 border-amber-100'
        }`}>
          {fetchStatus.count > 0 
            ? <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
            : <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          }
          <span className={`text-sm font-medium ${fetchStatus.count > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {fetchStatus.message}
          </span>
          <span className="text-xs text-slate-400 ml-auto">
            {fetchStatus.durationMs < 1000 
              ? `${fetchStatus.durationMs}ms` 
              : `${(fetchStatus.durationMs / 1000).toFixed(1)}s`
            }
          </span>
        </div>
      )}

      {fetchStatus.state === 'success' && summaryCards.length > 0 && summary && (
        <ReportSummaryStrip cards={summaryCards} summary={summary} />
      )}

      {fetchStatus.state === 'error' && (
        <div className="flex items-start gap-3 px-5 py-4 bg-red-50 border border-red-100 rounded-xl">
          <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">Failed to load report</p>
            <p className="text-sm text-red-600 mt-1">{fetchStatus.message}</p>
            {fetchStatus.statusCode && (
              <p className="text-xs text-red-400 mt-2 font-mono">
                HTTP {fetchStatus.statusCode} · {fetchStatus.endpoint}
              </p>
            )}
          </div>
          <button
            onClick={() => fetchReport(1)}
            className="text-xs font-bold text-red-600 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}
      
      {/* ── Results Area ── */}
      <div className="border-t border-slate-100 pt-6">
        {fetchStatus.state === 'idle' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500">
                <Filter size={32} strokeWidth={1.5} />
              </div>
              <p className="text-lg font-semibold text-slate-700">Select filters and click Generate Report</p>
              <p className="text-sm text-slate-400">Use the filters above to narrow your search, then click the blue button to load results.</p>
            </div>
          </div>
        ) : (
          <ReportTable 
            columns={config.columns} 
            data={data} 
            loading={fetchStatus.state === 'loading'}
            pagination={pagination}
            onPageChange={(page: number) => fetchReport(page)}
          />
        )}
      </div>
    </div>
  );
}
