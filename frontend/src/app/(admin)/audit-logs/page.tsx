"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/axios';
import { useAuth } from '@/components/common/AuthProvider';
import { ClipboardCheck, Search, Activity, CalendarDays, ShieldAlert, FileJson } from 'lucide-react';

interface AuditLog {
  id: string;
  tenant_name: string;
  user_email: string;
  action: string;
  model_name: string;
  record_id: string;
  details: any;
  ip_address: string;
  created_at: string;
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const isPlatformOwner = user?.role === 'OWNER' || (user?.role === 'SUPER_ADMIN' && !user?.tenant);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await api.get('super-admin/audit-logs/', {
        params: { page_size: 500 },
      });
      const body = response.data;
      const list = Array.isArray(body?.results) ? body.results : Array.isArray(body) ? body : [];
      setLogs(list);
    } catch (err: any) {
      setError('Failed to load system ledger. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => 
    (log.tenant_name || '').toLowerCase().includes(search.toLowerCase()) || 
    (log.user_email || '').toLowerCase().includes(search.toLowerCase()) ||
    (log.model_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (log.action || '').toLowerCase().includes(search.toLowerCase())
  );

  const getActionColor = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'UPDATE': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'DELETE': return 'bg-red-100 text-red-800 border-red-200';
      case 'APPROVE': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'IMPERSONATE':
      case 'ADMIN_PASSWORD_RESET':
        return 'bg-amber-100 text-amber-900 border-amber-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 animate-fade-in max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 border-l-4 border-slate-800 pl-4">System Ledger</h1>
          <p className="text-sm text-gray-500 mt-1 pl-5">
            {isPlatformOwner
              ? 'Platform-wide audit trail (all schools).'
              : 'Audit trail for your school (fees, expenses, admin password resets, impersonation, and other logged actions).'}
          </p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search email, action, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-80 pl-9 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500 shadow-sm text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100 shadow-sm">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="overflow-x-auto min-h-[500px]">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actor & Tenant</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Resource Target</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Loading audit trail...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-16 text-center text-gray-400">
                  <Activity className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                  <p>No audit logs captured or matching search.</p>
                </td></tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-gray-400" />
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {new Date(log.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-slate-800">{log.user_email || 'System'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{log.tenant_name || 'Global Environment'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide uppercase border ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{log.model_name}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5 truncate w-32" title={log.record_id}>
                        {log.record_id ? log.record_id.split('-')[0] + '...' : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setSelectedLog(log)}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="View JSON Payload"
                      >
                        <FileJson className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-4 md:p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileJson className="w-5 h-5 text-slate-400" />
                Raw Audit Signature
              </h3>
              <button 
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-4 md:p-6 overflow-y-auto bg-slate-900 w-full text-left">
              <pre className="text-xs md:text-sm text-emerald-400 font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(selectedLog.details, null, 2) || "No payload recorded"}
              </pre>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
              <span>Event ID: {selectedLog.id}</span>
              <span>IP: {selectedLog.ip_address || 'Internal'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
