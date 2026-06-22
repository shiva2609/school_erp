import React, { useState, useEffect } from 'react';
import { Download, Loader2, FileSpreadsheet, FileText } from 'lucide-react';
import api from '@/lib/axios';

interface ExportButtonProps {
  reportType: string;
  filters: any;
}

const triggerDownload = (url: string) => {
  let baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (baseUrl.endsWith('/api/v1/')) {
    baseUrl = baseUrl.replace('/api/v1/', '');
  } else if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  const fullUrl = `${baseUrl}${cleanUrl}`;
  
  const a = document.createElement('a');
  a.href = fullUrl;
  a.target = '_blank';
  a.download = url.split('/').pop() || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export default function ExportButton({ reportType, filters }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const checkStatus = async () => {
      if (!jobId) return;
      try {
        const res = await api.get(`reports/export/${jobId}/status/`);
        const { status, file_url } = res.data;
        
        if (status === 'COMPLETED') {
          setLoading(false);
          setJobId(null);
          // Trigger download
          if (file_url) {
            triggerDownload(file_url);
          }
        } else if (status === 'FAILED') {
          setLoading(false);
          setJobId(null);
          alert('Export failed. Please try again.');
        }
      } catch (e) {
        console.error(e);
        setLoading(false);
        setJobId(null);
      }
    };

    if (jobId) {
      interval = setInterval(checkStatus, 2000);
    }
    
    return () => clearInterval(interval);
  }, [jobId]);

  const handleExport = async (format: 'EXCEL' | 'PDF') => {
    setIsOpen(false);
    setLoading(true);
    try {
      const res = await api.post('reports/export/generate/', {
        report_type: reportType,
        filters,
        format
      });
      
      // If it completed synchronously
      if (res.data.status === 'COMPLETED' && res.data.file_url) {
        setLoading(false);
        triggerDownload(res.data.file_url);
      } else {
        // Fallback to polling if it's still pending
        setJobId(res.data.id);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
      alert('Failed to start export');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => !loading && setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center gap-2 bg-gradient-to-br from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-all disabled:opacity-75 disabled:cursor-wait"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        {loading ? 'Generating...' : 'Export'}
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
