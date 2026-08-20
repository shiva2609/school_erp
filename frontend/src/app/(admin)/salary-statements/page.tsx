"use client";

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { RefreshCw, Download, Save, Calendar, AlertCircle, FileText, Clock, X, Eye } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface StatementRow {
  staff_id: string;
  statement_id: string | null;
  employee_id: string;
  staff_name: string;
  designation: string;
  total_working_days: number;
  present_days: number;
  absent_days: number;
  late_in_count: number;
  early_out_count: number;
  leave_days: number;
  half_days: number;
  basic_salary: string;
  manual_deduction: string;
  deduction_reason: string;
  net_salary: string;
  status: string;
}

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
  remarks: string;
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

function PhotoThumbnail({ id, type, s3Key, onView }: { id: string; type: 'check_in' | 'check_out'; s3Key: string | null; onView: (url: string, title: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!s3Key) return;
    let mounted = true;
    setLoading(true);
    setError(false);
    api.get(`/staff-attend/admin/photo/${id}/${type}/`)
      .then(res => {
        if (mounted && res.data?.url) setUrl(res.data.url);
      })
      .catch(() => {
        if (mounted) setError(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [id, type, s3Key]);

  if (!s3Key) return <span className="text-slate-400 text-[10px]">—</span>;
  if (loading) return <div className="w-8 h-8 bg-slate-100 rounded-md animate-pulse" />;
  if (error || !url) return <span className="text-rose-400 text-[10px]">Error</span>;

  return (
    <img
      src={url}
      alt={`${type === 'check_in' ? 'Check-in' : 'Check-out'} photo`}
      className="w-8 h-8 object-cover rounded-md cursor-pointer border border-slate-200 hover:border-blue-400 transition-colors shadow-sm"
      onClick={() => onView(url, type === 'check_in' ? 'Check-In Photo' : 'Check-Out Photo')}
    />
  );
}

export default function SalaryStatementsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Local edits for deduction
  const [deductions, setDeductions] = useState<Record<string, { amount: string; reason: string }>>({});

  // Employee detail attendance modal state
  const [selectedStaff, setSelectedStaff] = useState<StatementRow | null>(null);
  const [staffAttendanceRecords, setStaffAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loadingStaffAttendance, setLoadingStaffAttendance] = useState(false);
  const [photoModal, setPhotoModal] = useState<{ url: string; title: string } | null>(null);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/payroll/preview/?month=${month}&year=${year}`);
      const results: StatementRow[] = res.data.results || [];
      setRows(results);
      // Initialize deductions from existing saved data
      const initDeductions: Record<string, { amount: string; reason: string }> = {};
      results.forEach(r => {
        initDeductions[r.staff_id] = {
          amount: r.manual_deduction || '0',
          reason: r.deduction_reason || '',
        };
      });
      setDeductions(initDeductions);
      setHasLoaded(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load salary preview');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  const handleOpenAttendanceDetail = async (row: StatementRow) => {
    setSelectedStaff(row);
    setLoadingStaffAttendance(true);
    setStaffAttendanceRecords([]);

    try {
      const lastDay = new Date(year, month, 0).getDate();
      const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
      const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const res = await api.get(`/staff-attend/admin/list/?employee_id=${encodeURIComponent(row.employee_id)}&date_from=${dateFrom}&date_to=${dateTo}&page_size=100`);
      setStaffAttendanceRecords(res.data?.results || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to fetch employee attendance records');
    } finally {
      setLoadingStaffAttendance(false);
    }
  };

  const handleSaveAll = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const statements = rows.map(r => ({
        staff_id: r.staff_id,
        manual_deduction: deductions[r.staff_id]?.amount || '0',
        deduction_reason: deductions[r.staff_id]?.reason || '',
      }));
      await api.post('/payroll/generate/', { month, year, statements });
      toast.success('Salary statements saved successfully!');
      fetchPreview(); // Refresh
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save statements');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async (row: StatementRow) => {
    if (!row.statement_id) {
      toast.error('Save the statement first before downloading PDF.');
      return;
    }
    try {
      const res = await api.get(`/payroll/${row.statement_id}/pdf/`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Salary_Slip_${(row.staff_name || 'Staff').replace(/\s+/g, '_')}_${month}_${year}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error('Failed to download PDF.');
    }
  };

  const setDeduction = (staffId: string, field: 'amount' | 'reason', value: string) => {
    setDeductions(prev => ({
      ...prev,
      [staffId]: { ...(prev[staffId] || { amount: '0', reason: '' }), [field]: value },
    }));
  };

  const getNetSalary = (row: StatementRow) => {
    const gross = parseFloat(row.basic_salary || '0');
    const deduction = parseFloat(deductions[row.staff_id]?.amount || '0');
    return Math.max(0, gross - deduction).toFixed(2);
  };

  const totalGross = rows.reduce((sum, r) => sum + parseFloat(r.basic_salary || '0'), 0);
  const totalDeduction = rows.reduce((sum, r) => sum + parseFloat(deductions[r.staff_id]?.amount || '0'), 0);
  const totalNet = totalGross - totalDeduction;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'CHECKED_IN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">CHECKED IN</span>;
      case 'CHECKED_OUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">CHECKED OUT</span>;
      case 'ON_LEAVE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">ON LEAVE</span>;
      case 'ABSENT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">ABSENT</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-50 text-slate-700 border border-slate-200">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Salary Statements</h1>
        <p className="text-gray-500 text-sm mt-1">Generate and manage monthly salary statements for all staff. Click on an employee name to view full daily attendance.</p>
      </div>

      {/* Month/Year Selector */}
      <div className="esms-card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="esms-label">Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="esms-input min-w-[140px]"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="esms-label">Year</label>
            <input
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="esms-input w-28"
            />
          </div>
          <button
            onClick={fetchPreview}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Calendar size={16} />}
            Generate Monthly Statement
          </button>
          {hasLoaded && rows.length > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 ml-auto"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              Save All
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {hasLoaded && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="esms-card p-4 text-center">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Gross</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">₹{totalGross.toLocaleString('en-IN')}</p>
          </div>
          <div className="esms-card p-4 text-center">
            <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide">Total Deductions</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">₹{totalDeduction.toLocaleString('en-IN')}</p>
          </div>
          <div className="esms-card p-4 text-center">
            <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide">Net Payable</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">₹{totalNet.toLocaleString('en-IN')}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="esms-card overflow-hidden">
        {!hasLoaded ? (
          <div className="p-16 text-center flex flex-col items-center">
            <FileText className="mb-3 text-slate-300" size={32} />
            <p className="font-semibold text-slate-600 text-sm">Select a month and click "Generate Monthly Statement"</p>
          </div>
        ) : loading ? (
          <div className="p-16 text-center flex flex-col items-center">
            <RefreshCw className="animate-spin mb-3 text-blue-500" size={28} />
            <p className="font-semibold text-slate-600 text-sm">Loading...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <AlertCircle className="mb-3 text-slate-300" size={28} />
            <p className="font-semibold text-slate-600 text-sm">No active staff found for this branch.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="esms-table w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="text-center">Present</th>
                  <th className="text-center">Absent</th>
                  <th className="text-center">Leave</th>
                  <th className="text-center">Half Day</th>
                  <th className="text-center">Late-In</th>
                  <th className="text-center">Early-Out</th>
                  <th className="text-right">Gross Salary</th>
                  <th className="text-right">Deduction (₹)</th>
                  <th className="text-right">Net Salary</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.staff_id} className="hover:bg-slate-50/50 transition-colors">
                    <td>
                      <button
                        onClick={() => handleOpenAttendanceDetail(row)}
                        className="text-left group flex flex-col focus:outline-none"
                        title="Click to view full attendance breakdown"
                      >
                        <span className="font-semibold text-slate-900 text-sm group-hover:text-blue-600 group-hover:underline flex items-center gap-1.5 transition-colors">
                          {row.staff_name}
                          <Eye size={13} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{row.employee_id}{row.designation ? ` • ${row.designation}` : ''}</span>
                      </button>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold text-sm border border-emerald-200">{row.present_days}</span>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-50 text-rose-700 font-bold text-sm border border-rose-200">{row.absent_days}</span>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold text-sm border border-blue-200">{row.leave_days}</span>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-50 text-orange-700 font-bold text-sm border border-orange-200">{row.half_days}</span>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-50 text-amber-700 font-bold text-sm border border-amber-200">{row.late_in_count}</span>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-50 text-purple-700 font-bold text-sm border border-purple-200">{row.early_out_count}</span>
                    </td>
                    <td className="text-right font-semibold text-slate-800">₹{parseFloat(row.basic_salary || '0').toLocaleString('en-IN')}</td>
                    <td className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <input
                          type="number"
                          min={0}
                          value={deductions[row.staff_id]?.amount || '0'}
                          onChange={e => setDeduction(row.staff_id, 'amount', e.target.value)}
                          className="w-24 text-right px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none"
                        />
                        <input
                          type="text"
                          value={deductions[row.staff_id]?.reason || ''}
                          onChange={e => setDeduction(row.staff_id, 'reason', e.target.value)}
                          placeholder="Reason..."
                          className="w-32 px-2 py-1 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none text-slate-500"
                        />
                      </div>
                    </td>
                    <td className="text-right">
                      <span className="font-bold text-emerald-700 text-sm">₹{parseFloat(getNetSalary(row)).toLocaleString('en-IN')}</span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleDownloadPdf(row)}
                        disabled={!row.statement_id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-semibold transition-all border border-slate-200 hover:border-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={!row.statement_id ? 'Save first to enable PDF' : 'Download Salary Slip PDF'}
                      >
                        <Download size={12} /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Attendance Detail Modal */}
      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center font-bold text-base shadow-sm">
                  {selectedStaff.staff_name ? selectedStaff.staff_name.charAt(0).toUpperCase() : 'S'}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    {selectedStaff.staff_name}
                    <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                      {selectedStaff.employee_id}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedStaff.designation || 'Staff'} · Attendance for {MONTHS[month - 1]} {year}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Attendance Summary Cards */}
            <div className="grid grid-cols-6 gap-2 p-4 bg-white border-b border-slate-100 text-center">
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Present</p>
                <p className="text-lg font-black text-emerald-700">{selectedStaff.present_days}</p>
              </div>
              <div className="p-2 rounded-xl bg-rose-50 border border-rose-100">
                <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Absent</p>
                <p className="text-lg font-black text-rose-700">{selectedStaff.absent_days}</p>
              </div>
              <div className="p-2 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Leave</p>
                <p className="text-lg font-black text-blue-700">{selectedStaff.leave_days}</p>
              </div>
              <div className="p-2 rounded-xl bg-orange-50 border border-orange-100">
                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Half Day</p>
                <p className="text-lg font-black text-orange-700">{selectedStaff.half_days}</p>
              </div>
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-100">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Late In</p>
                <p className="text-lg font-black text-amber-700">{selectedStaff.late_in_count}</p>
              </div>
              <div className="p-2 rounded-xl bg-purple-50 border border-purple-100">
                <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Early Out</p>
                <p className="text-lg font-black text-purple-700">{selectedStaff.early_out_count}</p>
              </div>
            </div>

            {/* Modal Body / Table */}
            <div className="p-4 flex-1 overflow-y-auto">
              {loadingStaffAttendance ? (
                <div className="py-16 text-center flex flex-col items-center">
                  <RefreshCw className="animate-spin text-blue-600 mb-2" size={24} />
                  <p className="text-xs text-slate-500">Loading attendance records...</p>
                </div>
              ) : staffAttendanceRecords.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center">
                  <AlertCircle size={28} className="text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-600">No punch records found for this employee in {MONTHS[month - 1]} {year}.</p>
                  <p className="text-xs text-slate-400 mt-1">Attendance will be marked according to policy or absence.</p>
                </div>
              ) : (
                <table className="esms-table w-full whitespace-nowrap text-xs">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Check-In</th>
                      <th>Check-Out</th>
                      <th>Photos</th>
                      <th>Status</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffAttendanceRecords.map(rec => (
                      <tr key={rec.id} className="hover:bg-slate-50/50">
                        <td className="font-semibold text-slate-800">{rec.date}</td>
                        <td>
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Clock size={12} className="text-emerald-500" />
                            {formatDateTime(rec.check_in_at)}
                          </span>
                        </td>
                        <td>
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Clock size={12} className="text-rose-500" />
                            {formatDateTime(rec.check_out_at)}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <PhotoThumbnail id={rec.id} type="check_in" s3Key={rec.check_in_photo} onView={(url, title) => setPhotoModal({ url, title })} />
                            <PhotoThumbnail id={rec.id} type="check_out" s3Key={rec.check_out_photo} onView={(url, title) => setPhotoModal({ url, title })} />
                          </div>
                        </td>
                        <td>{statusBadge(rec.status)}</td>
                        <td className="text-slate-500 max-w-[200px] truncate">{rec.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setSelectedStaff(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Enlarge Modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">{photoModal.title}</h3>
              <button onClick={() => setPhotoModal(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-50 min-h-[300px]">
              <img src={photoModal.url} alt={photoModal.title} className="max-h-[60vh] rounded-xl object-contain shadow-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

