"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, ArrowDownRight, ArrowUpRight, Calendar, Building2, RefreshCw } from 'lucide-react';
import api from '@/lib/axios';
import { useBranch } from '@/components/common/BranchContext';
import { useAuth } from '@/components/common/AuthProvider';
import toast from 'react-hot-toast';

type DashboardRow = { category: string; total: string | number };

interface FinancialPayload {
  income_by_category: DashboardRow[];
  expense_by_category: DashboardRow[];
  totals: { total_income: string; total_expense: string; net: string };
}

function startEndOfMonth(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function formatInr(n: string | number) {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  if (Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v);
}

export default function FinancialReportsPage() {
  const { selectedBranch } = useBranch();
  const { user } = useAuth();
  const [{ startDate, endDate }, setRange] = useState(() => startEndOfMonth(new Date()));
  const [data, setData] = useState<FinancialPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { startDate, endDate };
      if (['SUPER_ADMIN', 'OWNER', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN'].includes(user?.role || '')) {
        if (selectedBranch && selectedBranch !== 'all') params.branch_id = selectedBranch;
      }
      const res = await api.get('reports/payments/financial-dashboard/', { params });
      const payload = res.data?.data ?? res.data;
      setData(payload);
    } catch {
      toast.error('Could not load financial summary.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedBranch, user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  const incomeRows = data?.income_by_category ?? [];
  const expenseRows = data?.expense_by_category ?? [];
  const totals = data?.totals;
  const netNum = totals ? parseFloat(totals.net) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <TrendingUp size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Cashbook income and expenses for the selected period (fees, other income, and approved spend).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
              <Calendar size={12} /> From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-500">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-black disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {['SUPER_ADMIN', 'OWNER', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN'].includes(user?.role || '') && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Building2 size={14} />
          Branch scope follows the header selector (or all branches if &quot;all&quot; is selected).
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">Total income</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
            {loading ? '…' : formatInr(totals?.total_income ?? 0)}
          </p>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <ArrowUpRight size={14} /> Cashbook credits in range
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">Total expenses</p>
          <p className="text-2xl font-bold text-rose-700 mt-1 tabular-nums">
            {loading ? '…' : formatInr(totals?.total_expense ?? 0)}
          </p>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <ArrowDownRight size={14} /> Approved operational spend
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">Net (income − expense)</p>
          <p
            className={`text-2xl font-bold mt-1 tabular-nums ${netNum >= 0 ? 'text-indigo-700' : 'text-amber-700'}`}
          >
            {loading ? '…' : formatInr(totals?.net ?? 0)}
          </p>
          <p className="text-xs text-slate-400 mt-2">Same basis as the transaction ledger</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-1 text-gray-900">Income by category</h3>
          <p className="text-gray-500 text-sm mb-4">All cashbook income lines (includes fee receipts and other income).</p>
          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold sticky top-0">
                <tr>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : incomeRows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                      No income in this period.
                    </td>
                  </tr>
                ) : (
                  incomeRows.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 text-slate-800">{row.category}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-700">
                        {formatInr(row.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-1 text-gray-900">Expense by category</h3>
          <p className="text-gray-500 text-sm mb-4">Posted when expenses are approved (or auto-approved under threshold).</p>
          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold sticky top-0">
                <tr>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : expenseRows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                      No expenses in this period.
                    </td>
                  </tr>
                ) : (
                  expenseRows.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 text-slate-800">{row.category}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-rose-700">
                        {formatInr(row.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
