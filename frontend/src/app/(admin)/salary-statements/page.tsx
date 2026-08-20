"use client";

import React, { useState, useCallback } from 'react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { RefreshCw, Download, Save, Calendar, AlertCircle, FileText } from 'lucide-react';

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

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Salary Statements</h1>
        <p className="text-gray-500 text-sm mt-1">Generate and manage monthly salary statements for all staff.</p>
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
                      <p className="font-semibold text-slate-900 text-sm">{row.staff_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{row.employee_id}{row.designation ? ` • ${row.designation}` : ''}</p>
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
    </div>
  );
}
