"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { useRouter } from 'next/navigation';
import { Plus, Receipt, Check, X, FileText, Search, CreditCard, Wallet, Landmark, TrendingUp, RotateCcw, Tag } from 'lucide-react';
import { EXPENSE_TYPE_PRESETS } from '@/lib/expenseTypePresets';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';
import Modal from '@/components/common/Modal';
import FloatingActionBar from '@/components/common/FloatingActionBar';

interface Expense {
  id: string;
  voucher_number: number | null;
  title: string;
  amount: string;
  expense_date: string;
  status: string;
  category_name: string;
  vendor_display: string | null;
  payment_mode: string;
  submitted_by_name: string | null;
}

const statusStyles: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-100',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-100',
};

const modeIcons: Record<string, any> = {
  CASH: Wallet,
  BANK_TRANSFER: Landmark,
  UPI: CreditCard,
  CHEQUE: FileText,
};

/** Fallback if `other-income-presets` API fails; keep in sync with `expenses/other_income_presets.py`. */
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

export default function ExpensesPage() {
  const { selectedBranch } = useBranch();
  const [activeTab, setActiveTab] = useState<'APPROVALS' | 'HISTORY'>('HISTORY');
  const [statusFilter, setStatusFilter] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({ 
    title: '', 
    amount: '', 
    payment_mode: 'CASH',
    expense_date: new Date().toISOString().split('T')[0],
    category_name: '',
    vendor_name: '',
    voucher_number: '',
  });

  const branchParam = selectedBranch && selectedBranch !== 'all' ? `branch_id=${selectedBranch}` : '';

  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    api.get('auth/me/').then(res => {
      const u = res.data.data;
      setUser(u);
      if (u?.role === 'TEACHER') router.replace('/teacher-dashboard');
    });
  }, [router]);

  const manualIncomeLedgerUrl =
    user && ['ACCOUNTANT', 'BRANCH_ADMIN', 'SUPER_ADMIN', 'OWNER'].includes(user.role)
      ? `accounting/cashbook/?reference_model=MANUAL_OTHER_INCOME${branchParam ? `&${branchParam}` : ''}`
      : null;

  const { data: expenses, loading, error, refetch } = useApi<Expense[]>(
    `/expenses/?status=${activeTab === 'APPROVALS' ? 'SUBMITTED' : statusFilter}${branchParam ? `&${branchParam}` : ''}`
  );
  const { data: categoriesData } = useApi<any>(`/expenses/categories/${branchParam ? `?${branchParam}` : ''}`);
  const { data: vendorsData } = useApi<any>(`/vendors/${branchParam ? `?${branchParam}` : ''}`);
  const { data: manualIncomeRaw, refetch: refetchManualIncome } = useApi<any[]>(manualIncomeLedgerUrl);

  const categories = Array.isArray(categoriesData) ? categoriesData : [];
  const vendors = Array.isArray(vendorsData) ? vendorsData : [];

  const mergedExpenseTypes = useMemo(() => {
    const fromApi = categories
      .map((c: { name?: string }) => (typeof c?.name === 'string' ? c.name.trim() : ''))
      .filter(Boolean);
    const set = new Set<string>([...EXPENSE_TYPE_PRESETS, ...fromApi]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [categories]);

  const filteredExpenseTypes = useMemo(() => {
    const q = formData.category_name.trim().toLowerCase();
    if (!q) return mergedExpenseTypes;
    return mergedExpenseTypes.filter((t) => t.toLowerCase().includes(q));
  }, [mergedExpenseTypes, formData.category_name]);
  const manualIncomeRows = Array.isArray(manualIncomeRaw)
    ? manualIncomeRaw.filter((r: any) => Number(r.amount) > 0)
    : [];

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'OWNER';
  const canLogExpense = user?.role === 'ACCOUNTANT';
  const canRecordMiscIncome = user && ['ACCOUNTANT', 'BRANCH_ADMIN', 'SUPER_ADMIN'].includes(user.role);

  const [otherIncomePresets, setOtherIncomePresets] = useState<string[]>([...DEFAULT_OTHER_INCOME_PRESETS]);
  const [oiCategorySelect, setOiCategorySelect] = useState('');
  const [oiCategoryOther, setOiCategoryOther] = useState('');
  const [oiAmount, setOiAmount] = useState('');
  const [oiDescription, setOiDescription] = useState('');
  const [oiDate, setOiDate] = useState(new Date().toISOString().split('T')[0]);
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
    if (['SUPER_ADMIN', 'OWNER'].includes(user?.role || '') && (!selectedBranch || selectedBranch === 'all')) {
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
      setOiDate(new Date().toISOString().split('T')[0]);
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

  const handleUpdateStatus = async (id: string, s: string) => {
    let reason = '';
    if (s === 'REJECTED') {
      reason = prompt('Enter rejection reason:') || '';
      if (!reason) return;
    }
    try {
      await api.patch(`expenses/${id}/status/`, { status: s, reason });
      refetch();
    } catch { toast.error('Failed to update status'); }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await api.post('/expenses/bulk-approve/', { expense_ids: selectedIds });
      const approved = res.data?.data?.approved || 0;
      toast.success(`${approved} expense(s) approved successfully.`);
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to approve expenses.');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category_name.trim()) { toast.error('Expense type is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        voucher_number: formData.voucher_number.trim() || undefined,
      };
      await api.post('expenses/', payload);
      setShowDrawer(false);
      setFormData({ title: '', amount: '', payment_mode: 'CASH', expense_date: new Date().toISOString().split('T')[0], category_name: '', vendor_name: '', voucher_number: '' });
      refetch();
    } catch (err: any) { toast.error('Error: ' + (err.response?.data?.detail || JSON.stringify(err.response?.data))); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Expense Desk</h1>
          <p className="text-gray-500 text-sm mt-1">Operational spend tracking and reimbursement approvals.</p>
        </div>
        {canLogExpense && (
          <button onClick={() => setShowDrawer(true)}
            className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-black transition-all group">
            <Plus size={18} className="group-hover:scale-110 transition-transform" /> 
            Log Expense
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-100 pb-px">
        {isAdmin && (
          <button
            onClick={() => setActiveTab('APPROVALS')}
            className={`px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'APPROVALS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Review Requests
            {activeTab !== 'APPROVALS' && expenses?.filter(e => e.status === 'SUBMITTED').length ? (
              <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
            ) : null}
          </button>
        )}
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'HISTORY' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Expense Ledger
        </button>
      </div>

      {canRecordMiscIncome && (
        <div className="bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-sm">Record other income</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Non-tuition receipts—uniforms, trips, events, books, sports, donations, hall rent, etc.—post here and appear under Reports → Other Income. Tuition and scheduled fees use the Fees module.
              </p>
            </div>
          </div>
          <form onSubmit={submitOtherIncome} className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-[10px] font-bold uppercase text-slate-500">Category</label>
              <select
                value={oiCategorySelect}
                onChange={(e) => {
                  setOiCategorySelect(e.target.value);
                  if (e.target.value !== '__other__') setOiCategoryOther('');
                }}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">Select category…</option>
                {otherIncomePresets.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                <option value="__other__">Other (type below)</option>
              </select>
              {oiCategorySelect === '__other__' && (
                <input
                  value={oiCategoryOther}
                  onChange={(e) => setOiCategoryOther(e.target.value)}
                  placeholder="e.g. Workshop fees"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                />
              )}
            </div>
            <div className="flex flex-col gap-1 min-w-[100px]">
              <label className="text-[10px] font-bold uppercase text-slate-500">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={oiAmount}
                onChange={(e) => setOiAmount(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[180px] flex-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">Description</label>
              <input
                value={oiDescription}
                onChange={(e) => setOiDescription(e.target.value)}
                placeholder="Optional note"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[10px] font-bold uppercase text-slate-500">Date</label>
              <input
                type="date"
                value={oiDate}
                onChange={(e) => setOiDate(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={oiSaving}
              className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60"
            >
              {oiSaving ? 'Saving…' : 'Post income'}
            </button>
          </form>
          {manualIncomeRows.length > 0 && (
            <div className="mt-5 pt-4 border-t border-emerald-100">
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">Recent manual other income (reverse if posted by mistake)</p>
              <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white/80">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wide">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Note</th>
                      <th className="px-3 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manualIncomeRows.slice(0, 15).map((row: any) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.transaction_date}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{row.category}</td>
                        <td className="px-3 py-2 text-right tabular-nums">₹{Number(row.amount || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{row.description || '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm('Post a reversal for this line? You can enter a partial amount in the next step.')) return;
                              reverseOtherIncome(row.id);
                            }}
                            className="inline-flex items-center gap-1 text-rose-600 font-bold hover:underline"
                          >
                            <RotateCcw size={12} /> Reverse
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'HISTORY' && (
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-3 text-gray-400" />
            <input placeholder="Search title or vendor..." className="w-full pl-9 pr-4 py-2 border border-gray-100 rounded-xl text-xs focus:ring-2 ring-blue-500 outline-none" />
          </div>
          {['', 'APPROVED', 'REJECTED', 'DRAFT'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                statusFilter === s ? 'bg-slate-900 text-white shadow-md' : 'bg-white border text-slate-400 hover:bg-gray-50'
              }`}>{s || 'All History'}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border animate-pulse" />)}</div>
      ) : expenses && expenses.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-3xl p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-200 mb-4 transition-transform hover:rotate-12">
            <Receipt size={32} />
          </div>
          <p className="text-gray-900 font-bold">Queue is empty</p>
          <p className="text-gray-400 text-sm mt-1">No expenses found for the current selection.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-100 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  {activeTab === 'APPROVALS' && isAdmin && <th className="px-5 py-4 w-12"></th>}
                  <th className="px-5 py-4 whitespace-nowrap">Voucher No#</th>
                  <th className="px-5 py-4 whitespace-nowrap">Expense Type</th>
                  <th className="px-5 py-4 min-w-[200px]">Description</th>
                  <th className="px-5 py-4 whitespace-nowrap">Vendor Name</th>
                  <th className="px-5 py-4 whitespace-nowrap">Payment Date</th>
                  <th className="px-5 py-4 whitespace-nowrap">Payment Mode</th>
                  <th className="px-5 py-4 whitespace-nowrap text-right">Amount</th>
                  {isAdmin && activeTab === 'APPROVALS' && <th className="px-5 py-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses?.map((e: Expense) => (
                  <tr key={e.id} className="hover:bg-slate-50/50 transition-colors group">
                    {activeTab === 'APPROVALS' && isAdmin && (
                      <td className="px-5 py-4">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(e.id)} 
                          onChange={() => setSelectedIds(prev => prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id])} 
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      {e.voucher_number || '-'}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold">
                        {e.category_name}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-800 font-medium">
                      {e.title || '-'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {e.vendor_display || '-'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(e.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {e.payment_mode === 'CASH' ? 'Cash' : 'Online'}
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-black text-slate-900">
                      {Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    {isAdmin && e.status === 'SUBMITTED' && activeTab === 'APPROVALS' && (
                      <td className="px-5 py-4">
                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => handleUpdateStatus(e.id, 'APPROVED')}
                             className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg transition-all" title="Approve">
                             <Check size={16} />
                           </button>
                           <button onClick={() => handleUpdateStatus(e.id, 'REJECTED')}
                             className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white rounded-lg transition-all" title="Reject">
                             <X size={16} />
                           </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over Drawer for Log Expense */}
      <Modal 
        isOpen={showDrawer} 
        onClose={() => setShowDrawer(false)} 
        title="Log expense"
        maxWidth="xl"
      >
        <div className="max-h-[calc(90vh-5rem)] overflow-y-auto">
          <div className="px-6 pt-2 pb-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
            <p className="text-sm text-slate-300">
              Tap a type below or type any label — custom categories are saved for next time.
            </p>
          </div>
          <form onSubmit={handleAdd} className="p-6 space-y-5">
            <section className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Tag className="w-4 h-4 text-blue-600 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600">Expense type</h3>
              </div>
              <div className="relative">
                <label htmlFor="expense-category-input" className="sr-only">Expense type — select or type</label>
                <input
                  id="expense-category-input"
                  list="expense-category-datalist"
                  required
                  autoComplete="off"
                  value={formData.category_name}
                  onChange={(e) => setFormData({ ...formData, category_name: e.target.value })}
                  placeholder="Search or type (e.g. Electricity Bill, custom vendor repair…)"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
                <datalist id="expense-category-datalist">
                  {mergedExpenseTypes.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Quick pick {formData.category_name.trim() ? `(matching “${formData.category_name.trim()}”) ` : ''}
                  <span className="font-normal text-slate-400">— {filteredExpenseTypes.length} options</span>
                </p>
                <div className="max-h-[200px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 flex flex-wrap gap-2">
                  {filteredExpenseTypes.length === 0 ? (
                    <p className="text-xs text-slate-500 px-2 py-3 w-full text-center">No preset matches — your typed text will be used as the category.</p>
                  ) : (
                    filteredExpenseTypes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormData({ ...formData, category_name: t })}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          formData.category_name === t
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/80'
                        }`}
                      >
                        {t}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description / title</label>
                  <input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Short description for the ledger"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Voucher no. <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                  <input
                    type="number"
                    min={1}
                    value={formData.voucher_number || ''}
                    onChange={(e) => setFormData({ ...formData, voucher_number: e.target.value })}
                    placeholder="Leave blank to auto-assign"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expense date</label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Vendor <span className="font-normal normal-case text-slate-400">(optional)</span></h3>
              <input
                list="expense-vendor-datalist"
                value={formData.vendor_name}
                onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                placeholder="Saved vendors or type a new name"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              />
              <datalist id="expense-vendor-datalist">
                {vendors.map((v: { id: string; name?: string }) => (
                  <option key={v.id} value={v.name || ''} />
                ))}
              </datalist>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/90 p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Payment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Amount (₹)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white text-xl font-bold text-slate-900 tabular-nums focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mode</label>
                  <select
                    required
                    value={formData.payment_mode}
                    onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="UPI">UPI / Digital</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
              </div>
            </section>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-slate-900 hover:bg-black text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50"
            >
              {saving ? 'Submitting…' : 'Submit expense'}
            </button>
          </form>
        </div>
      </Modal>

      <FloatingActionBar 
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        actions={[
          { label: 'Approve Selected', icon: Check, onClick: handleBulkApprove },
        ]}
      />
    </div>
  );
}
