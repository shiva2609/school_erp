"use client";

import React, { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';
import { RotateCcw, Wallet, Landmark, CreditCard, FileText, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/components/common/AuthProvider';
import { formatLocalISODate } from '@/lib/dateUtils';

const DEFAULT_OTHER_INCOME_PRESETS = [
  'Uniforms',
  'Trips & excursions',
  'Events & fests',
  'Books & stationery',
  'Sports & equipment',
  'Lab & materials',
  'Transport (non-fee)',
  'Donations',
  'Hall & facility rent',
  'ID cards & certificates',
  'Miscellaneous',
] as const;

export default function OtherIncomePage() {
  const { selectedBranch } = useBranch();
  const { user } = useAuth();
  const branchParam = selectedBranch && selectedBranch !== 'all' ? `branch_id=${selectedBranch}` : '';

  const canRecordMiscIncome = user && ['ACCOUNTANT', 'BRANCH_ADMIN', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'OWNER'].includes(user.role);

  const manualIncomeLedgerUrl = canRecordMiscIncome
      ? `accounting/cashbook/?reference_model=MANUAL_OTHER_INCOME${branchParam ? `&${branchParam}` : ''}`
      : null;

  const { data: manualIncomeRaw, refetch: refetchManualIncome, loading: oiLoading } = useApi<any[]>(manualIncomeLedgerUrl);

  const manualIncomeRows = Array.isArray(manualIncomeRaw)
    ? manualIncomeRaw.filter((r: any) => Number(r.amount) > 0)
    : [];

  const [otherIncomePresets, setOtherIncomePresets] = useState<string[]>([...DEFAULT_OTHER_INCOME_PRESETS]);
  const [oiCategorySelect, setOiCategorySelect] = useState('');
  const [oiCategoryOther, setOiCategoryOther] = useState('');
  const [oiAmount, setOiAmount] = useState('');
  const [oiDescription, setOiDescription] = useState('');
  const [oiDate, setOiDate] = useState(formatLocalISODate());
  const [oiSaving, setOiSaving] = useState(false);

  useEffect(() => {
    if (!canRecordMiscIncome) return;
    api
      .get('accounting/cashbook/other-income-presets/')
      .then((res) => {
        const raw = res.data?.data?.presets ?? res.data?.presets;
        if (Array.isArray(raw) && raw.length) setOtherIncomePresets(raw);
      })
      .catch(() => {});
  }, [canRecordMiscIncome]);

  const submitOtherIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const category =
      oiCategorySelect === '__other__'
        ? oiCategoryOther.trim()
        : oiCategorySelect.trim();
    if (!category) {
      toast.error('Choose a category or enter a custom one');
      return;
    }
    if (!oiAmount || Number(oiAmount) <= 0) { toast.error('Enter a positive amount'); return; }
    if (['SUPER_ADMIN', 'OWNER', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN'].includes(user?.role || '') && (!selectedBranch || selectedBranch === 'all')) {
      toast.error('Select a specific branch in the header before recording other income.');
      return;
    }
    setOiSaving(true);
    try {
      const payload: Record<string, string> = {
        category,
        amount: String(oiAmount),
        description: (oiDescription || category).trim(),
        transaction_date: oiDate,
      };
      if (selectedBranch && selectedBranch !== 'all') payload.branch_id = selectedBranch;
      await api.post('accounting/cashbook/record-other-income/', payload);
      toast.success('Other income recorded in the cashbook.');
      setOiCategorySelect('');
      setOiCategoryOther('');
      setOiAmount('');
      setOiDescription('');
      setOiDate(formatLocalISODate());
      refetchManualIncome();
    } catch (err: any) {
      const d = err.response?.data;
      toast.error(d?.error || d?.detail || 'Failed to record other income');
    } finally {
      setOiSaving(false);
    }
  };

  const reverseOtherIncome = async (logId: string) => {
    const reason = window.prompt('Reason for reversal (optional):') ?? '';
    if (reason === null) return;
    const partialRaw = window.prompt(
      'Amount to reverse (leave empty to reverse the full remaining balance):'
    );
    if (partialRaw === null) return;
    const partial = partialRaw.trim();
    try {
      const body: Record<string, string> = {
        log_id: logId,
        reason: reason.trim() || 'Reversal',
      };
      if (partial) body.amount = partial;
      await api.post('accounting/cashbook/reverse-other-income/', body);
      toast.success('Reversal posted. It appears under Reports → Deleted Other Income.');
      refetchManualIncome();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.detail || 'Reversal failed');
    }
  };

  if (!canRecordMiscIncome) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-black text-slate-800 mb-2">Other Income</h1>
        <p className="text-slate-500">You don't have permission to log other income.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Other Income</h1>
          <p className="text-slate-500 mt-1">
            Log ad-hoc school income directly to the cashbook (e.g. uniforms, trips).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden sticky top-6">
            <div className="p-5 border-b border-emerald-50 bg-emerald-50/30">
              <h2 className="font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500" />
                Log New Income
              </h2>
            </div>
            <form onSubmit={submitOtherIncome} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Category</label>
                <select
                  required
                  value={oiCategorySelect}
                  onChange={(e) => setOiCategorySelect(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="" disabled>Select category...</option>
                  {otherIncomePresets.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  <option value="__other__">Other (Type custom)</option>
                </select>
                {oiCategorySelect === '__other__' && (
                  <input
                    type="text"
                    required
                    value={oiCategoryOther}
                    onChange={(e) => setOiCategoryOther(e.target.value)}
                    placeholder="Enter custom category"
                    className="w-full mt-2 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Amount (₹)</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="1"
                  value={oiAmount}
                  onChange={(e) => setOiAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 tabular-nums font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Description (Optional)</label>
                <input
                  type="text"
                  value={oiDescription}
                  onChange={(e) => setOiDescription(e.target.value)}
                  placeholder="e.g. Student XYZ ID card"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase">Date</label>
                <input
                  type="date"
                  required
                  value={oiDate}
                  onChange={(e) => setOiDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={oiSaving}
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {oiSaving ? 'Recording...' : 'Record Income'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Recent Other Income</h2>
            </div>
            <div className="overflow-x-auto">
              {oiLoading ? (
                <div className="p-8 text-center text-slate-500">Loading records...</div>
              ) : manualIncomeRows.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <p className="font-semibold text-slate-500">No other income recorded yet.</p>
                  <p className="text-sm mt-1">Income logged here will bypass routing and post directly to the cashbook.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-100">
                      <th className="p-4 pl-6">Date</th>
                      <th className="p-4">Category & Desc</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4 pr-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manualIncomeRows.map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 pl-6 whitespace-nowrap text-slate-600 font-medium">
                          {new Date(r.transaction_date + 'T12:00:00').toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-slate-800">{r.category || 'Other'}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                        </td>
                        <td className="p-4">
                          <span className="font-black text-emerald-600">₹{parseFloat(r.amount).toLocaleString('en-IN')}</span>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          {['SUPER_ADMIN', 'OWNER'].includes(user?.role || '') && (
                            <button
                              onClick={() => reverseOtherIncome(r.id)}
                              className="text-xs font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ml-auto"
                              title="Reverse this entry from cashbook"
                            >
                              <RotateCcw size={14} />
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
