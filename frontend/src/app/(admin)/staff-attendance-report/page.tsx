"use client";

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/axios';
import { useBranch } from '@/components/common/BranchContext';
import { useAuth } from '@/components/common/AuthProvider';
import {
  Search, Filter, CheckCircle2, XCircle, Clock, X, RefreshCw,
  AlertCircle, Users, UserCheck, Palmtree, UserX,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AttendanceRecord {
  id: string;
  employee_id: string;
  staff_name: string;
  designation: string;
  branch_name: string;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_photo: string | null;
  check_out_photo: string | null;
  status: string;
  approval_status: string;
  approved_by_name: string;
  approved_at: string | null;
  remarks: string;
}

interface TodaySummary {
  date: string;
  total_staff: number;
  attended_today: number;
  on_leave_today: number;
  absent_today: number;
}

function formatDateTime(isoStr: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
  } catch {
    return '—';
  }
}

function PhotoThumbnail({
  id, type, s3Key, onView,
}: {
  id: string;
  type: 'check_in' | 'check_out';
  s3Key: string | null;
  onView: (url: string, title: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!s3Key) return;
    let mounted = true;
    setLoading(true);
    setError(false);
    api.get(`/staff-attend/admin/photo/${id}/${type}/`)
      .then(res => { if (mounted && res.data?.url) setUrl(res.data.url); })
      .catch(() => { if (mounted) setError(true); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id, type, s3Key]);

  if (!s3Key) return <span className="text-slate-400 text-[10px]">—</span>;
  if (loading) return <div className="w-9 h-9 bg-slate-100 rounded-md animate-pulse" />;
  if (error || !url) return <span className="text-rose-400 text-[10px]">Error</span>;

  return (
    <img
      src={url}
      alt={`${type === 'check_in' ? 'Check-in' : 'Check-out'} photo`}
      className="w-9 h-9 object-cover rounded-md cursor-pointer border border-slate-200 hover:border-blue-400 transition-colors shadow-sm"
      onClick={() => onView(url, type === 'check_in' ? 'Check-In Photo' : 'Check-Out Photo')}
    />
  );
}

function SummaryCard({
  title, value, icon: Icon, color, loading, onClick, active,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'amber' | 'rose';
  loading: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const colors = {
    blue:  { bg: 'bg-blue-50',  icon: 'text-blue-500',  val: 'text-blue-700', border: 'border-blue-200', activeRing: 'ring-2 ring-blue-500 shadow-md' },
    green: { bg: 'bg-emerald-50', icon: 'text-emerald-500', val: 'text-emerald-700', border: 'border-emerald-200', activeRing: 'ring-2 ring-emerald-500 shadow-md' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-500', val: 'text-amber-700', border: 'border-amber-200', activeRing: 'ring-2 ring-amber-500 shadow-md' },
    rose:  { bg: 'bg-rose-50',  icon: 'text-rose-500',  val: 'text-rose-700', border: 'border-rose-200', activeRing: 'ring-2 ring-rose-500 shadow-md' },
  };
  const c = colors[color];
  return (
    <div
      onClick={onClick}
      className={`esms-card p-5 flex items-center gap-4 ${c.bg} border ${c.border} ${active ? c.activeRing : ''} ${onClick ? 'cursor-pointer hover:shadow-md transition-all' : ''}`}
    >
      <div className="p-3 rounded-xl bg-white shadow-sm">
        <Icon size={22} className={c.icon} />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        {loading ? (
          <div className="h-8 w-12 bg-white/70 rounded animate-pulse mt-1" />
        ) : (
          <p className={`text-3xl font-black ${c.val} tabular-nums leading-tight`}>{value}</p>
        )}
      </div>
    </div>
  );
}

export default function StaffAttendanceReportPage() {
  const { selectedBranch } = useBranch();
  const { user } = useAuth();

  const getLocalDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [filters, setFilters] = useState({
    employee_id: '',
    staff_name: '',
    date_from: getLocalDate(),
    date_to: getLocalDate(),
    status: '',
    check_in_after: '',
    approval_status: '',
  });

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [photoModal, setPhotoModal] = useState<{ url: string; title: string } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Today's summary state
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch) params.append('branch_id', selectedBranch);
      const res = await api.get(`/staff-attend/admin/today-summary/?${params.toString()}`);
      setSummary(res.data);
    } catch {
      // summary is non-critical; fail silently
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedBranch]);

  const fetchRecords = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch) params.append('branch_id', selectedBranch);
      if (filters.employee_id) params.append('employee_id', filters.employee_id);
      if (filters.staff_name) params.append('staff_name', filters.staff_name);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      if (filters.status) params.append('status', filters.status);
      if (filters.check_in_after) params.append('check_in_after', filters.check_in_after);
      if (filters.approval_status) params.append('approval_status', filters.approval_status);
      params.append('page', pageNum.toString());
      params.append('page_size', '50');

      const res = await api.get(`/staff-attend/admin/list/?${params.toString()}`);
      const data = res.data;
      setRecords(data.results || []);
      setTotal(data.total || 0);
      setPage(data.page || pageNum);
      setTotalPages(data.total_pages || 1);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.detail || 'Failed to fetch records');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filters, selectedBranch]);

  // Re-fetch everything when branch changes
  useEffect(() => {
    fetchSummary();
    fetchRecords(1);
  }, [selectedBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    fetchSummary();
    fetchRecords();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchSummary();
    fetchRecords(1);
  };

  const handleClearFilters = () => {
    setFilters({
      employee_id: '',
      staff_name: '',
      date_from: getLocalDate(),
      date_to: getLocalDate(),
      status: '',
      check_in_after: '',
      approval_status: '',
    });
  };

  const handleAction = async (id: string, action: 'APPROVE' | 'REJECT') => {
    setProcessingId(id);
    try {
      await api.post(`/staff-attend/admin/${id}/action/`, { action });
      toast.success(`Record ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully`);
      fetchRecords(page);
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Failed to ${action.toLowerCase()} record`);
    } finally {
      setProcessingId(null);
    }
  };

  const approvalBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      APPROVED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: <CheckCircle2 size={12} /> },
      REJECTED: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', icon: <XCircle size={12} /> },
      PENDING: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: <Clock size={12} /> },
    };
    const s = map[status] || map.PENDING;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${s.bg} ${s.text}`}>
        {s.icon} {status}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const isIn = status === 'CHECKED_IN';
    const isOut = status === 'CHECKED_OUT';
    const isLeave = status === 'ON_LEAVE';
    const isAbsent = status === 'ABSENT';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
        isIn ? 'bg-blue-50 text-blue-700 border-blue-200' :
        isOut ? 'bg-slate-100 text-slate-600 border-slate-200' :
        isLeave ? 'bg-amber-50 text-amber-700 border-amber-200' :
        isAbsent ? 'bg-rose-50 text-rose-700 border-rose-200' :
        'bg-gray-50 text-gray-500 border-gray-200'
      }`}>
        {status?.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Staff Attendance Report</h1>
        <p className="text-gray-500 text-sm mt-1">Review, filter, and approve daily staff attendance records.</p>
      </div>

      {/* Today's Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Staff"
          value={summary?.total_staff ?? 0}
          icon={Users}
          color="blue"
          loading={summaryLoading}
          active={filters.status === ''}
          onClick={() => {
            setFilters(prev => ({ ...prev, status: '', date_from: getLocalDate(), date_to: getLocalDate() }));
          }}
        />
        <SummaryCard
          title="Attended Today"
          value={summary?.attended_today ?? 0}
          icon={UserCheck}
          color="green"
          loading={summaryLoading}
          active={filters.status === 'CHECKED_IN'}
          onClick={() => {
            setFilters(prev => ({ ...prev, status: 'CHECKED_IN', date_from: getLocalDate(), date_to: getLocalDate() }));
          }}
        />
        <SummaryCard
          title="On Leave Today"
          value={summary?.on_leave_today ?? 0}
          icon={Palmtree}
          color="amber"
          loading={summaryLoading}
          active={filters.status === 'ON_LEAVE'}
          onClick={() => {
            setFilters(prev => ({ ...prev, status: 'ON_LEAVE', date_from: getLocalDate(), date_to: getLocalDate() }));
          }}
        />
        <SummaryCard
          title="Absent Today"
          value={summary?.absent_today ?? 0}
          icon={UserX}
          color="rose"
          loading={summaryLoading}
          active={filters.status === 'ABSENT'}
          onClick={() => {
            setFilters(prev => ({ ...prev, status: 'ABSENT', date_from: getLocalDate(), date_to: getLocalDate() }));
          }}
        />
      </div>

      {/* Filters */}
      <div className="esms-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
          <Filter size={15} /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div>
            <label className="esms-label">Employee ID</label>
            <input type="text" value={filters.employee_id} onChange={e => setFilters({ ...filters, employee_id: e.target.value })} className="esms-input" placeholder="e.g. EMP001" />
          </div>
          <div>
            <label className="esms-label">Staff Name</label>
            <input type="text" value={filters.staff_name} onChange={e => setFilters({ ...filters, staff_name: e.target.value })} className="esms-input" placeholder="Search name..." />
          </div>
          <div>
            <label className="esms-label">Date From</label>
            <input type="date" value={filters.date_from} onChange={e => setFilters({ ...filters, date_from: e.target.value })} className="esms-input" />
          </div>
          <div>
            <label className="esms-label">Date To</label>
            <input type="date" value={filters.date_to} onChange={e => setFilters({ ...filters, date_to: e.target.value })} className="esms-input" />
          </div>
          <div>
            <label className="esms-label">Status</label>
            <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className="esms-input">
              <option value="">All Statuses</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="CHECKED_OUT">Checked Out</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="ABSENT">Absent</option>
            </select>
          </div>
          <div>
            <label className="esms-label">Check-in After</label>
            <input type="time" value={filters.check_in_after} onChange={e => setFilters({ ...filters, check_in_after: e.target.value })} className="esms-input" />
          </div>
          <div>
            <label className="esms-label">Approval</label>
            <select value={filters.approval_status} onChange={e => setFilters({ ...filters, approval_status: e.target.value })} className="esms-input">
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={handleClearFilters} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            Clear
          </button>
          <button onClick={handleSearch} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm flex items-center gap-2">
            <Search size={15} /> Search
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex items-center justify-between text-sm text-slate-500 px-1">
        <span>{total} record{total !== 1 ? 's' : ''} found</span>
        <button
          onClick={() => { fetchSummary(); fetchRecords(page); }}
          className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="esms-card overflow-hidden">
        {loading ? (
          <div className="p-16 text-center flex flex-col items-center">
            <RefreshCw className="animate-spin mb-3 text-blue-500" size={28} />
            <p className="font-semibold text-slate-600 text-sm">Loading records…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <AlertCircle className="mb-3 text-slate-300" size={28} />
            <p className="font-semibold text-slate-600 text-sm">No records found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or date range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="esms-table w-full text-left whitespace-nowrap">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Photos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => (
                  <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                    <td>
                      <p className="font-semibold text-slate-900 text-sm">{record.staff_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono tracking-wide">
                        {record.employee_id}{record.designation ? ` • ${record.designation}` : ''}
                      </p>
                    </td>
                    <td className="text-sm text-slate-600 font-medium">{record.date}</td>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        <Clock size={12} className="text-emerald-500" />
                        {formatDateTime(record.check_in_at)}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        <Clock size={12} className="text-rose-500" />
                        {formatDateTime(record.check_out_at)}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <PhotoThumbnail id={record.id} type="check_in" s3Key={record.check_in_photo} onView={(url, title) => setPhotoModal({ url, title })} />
                        <PhotoThumbnail id={record.id} type="check_out" s3Key={record.check_out_photo} onView={(url, title) => setPhotoModal({ url, title })} />
                      </div>
                    </td>
                    <td>{statusBadge(record.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
            <button
              disabled={page <= 1}
              onClick={() => fetchRecords(page - 1)}
              className="px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <span className="text-sm font-semibold text-slate-500">Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => fetchRecords(page + 1)}
              className="px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {photoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setPhotoModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-900">{photoModal.title}</h3>
              <button onClick={() => setPhotoModal(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex justify-center items-center bg-slate-100/50 min-h-[300px]">
              <img src={photoModal.url} alt={photoModal.title} className="max-h-[70vh] object-contain rounded-lg border border-slate-200 shadow-md" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
