import React, { useState } from 'react';
import { Download, Loader2, FileSpreadsheet, FileText } from 'lucide-react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';

interface ExportButtonProps {
  reportType: string;
  filters: Record<string, unknown>;
}

/**
 * Triggers a browser download from raw file bytes received via axios blob response.
 * Works with the streamed Django response — no /media/ URL required.
 */
function downloadBlob(data: Blob, filename: string) {
  const url = window.URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Small delay ensures the click processes before cleanup
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 150);
}

/**
 * Parse the filename from the Content-Disposition response header.
 * Falls back to a generated name if the header is absent.
 */
function parseFilename(
  contentDisposition: string | undefined,
  format: 'EXCEL' | 'PDF',
  reportType: string
): string {
  if (contentDisposition) {
    // Handles both:  filename="foo.xlsx"  and  filename*=UTF-8''foo.xlsx
    const match =
      contentDisposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1].replace(/"/g, ''));
  }
  const ext = format === 'PDF' ? 'pdf' : 'xlsx';
  return `${reportType}_export.${ext}`;
}

export default function ExportButton({ reportType, filters }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleExport = async (format: 'EXCEL' | 'PDF') => {
    setIsOpen(false);
    setLoading(true);

    try {
      const res = await api.post(
        'reports/export/generate/',
        { report_type: reportType, filters, format },
        {
          // Critical: tell axios to receive binary data, not JSON text
          responseType: 'blob',
        }
      );

      // Check if the server returned an error disguised as a blob
      if (res.data instanceof Blob && res.data.type === 'application/json') {
        const text = await res.data.text();
        const json = JSON.parse(text);
        toast.error(json.error || 'Export failed');
        return;
      }

      const filename = parseFilename(
        res.headers['content-disposition'],
        format,
        reportType
      );

      downloadBlob(res.data as Blob, filename);
      toast.success(`${format === 'PDF' ? 'PDF' : 'Excel'} downloaded`);
    } catch (err: unknown) {
      console.error('Export error:', err);
      // If axios received a blob error response, try to read the error text
      const errAny = err as { response?: { data?: Blob } };
      if (errAny?.response?.data instanceof Blob) {
        try {
          const text = await errAny.response.data.text();
          const json = JSON.parse(text);
          toast.error(json.error || 'Export failed');
          return;
        } catch {
          // fall through
        }
      }
      toast.error('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => !loading && setIsOpen((o) => !o)}
        disabled={loading}
        className="flex items-center gap-2 bg-gradient-to-br from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-all disabled:opacity-75 disabled:cursor-wait"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        {loading ? 'Generating…' : 'Export'}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-10 animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => handleExport('EXCEL')}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
          >
            <FileSpreadsheet size={16} className="text-emerald-500" />
            Excel Workbook
          </button>
          <button
            onClick={() => handleExport('PDF')}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100"
          >
            <FileText size={16} className="text-red-500" />
            PDF Document
          </button>
        </div>
      )}
    </div>
  );
}
