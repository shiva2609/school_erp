"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { useAuth } from '@/components/common/AuthProvider';
import { useBranch } from '@/components/common/BranchContext';
import { toast } from 'react-hot-toast';
import {
  Calendar, ArrowRight, CheckCircle2, AlertTriangle, Clock,
  Users, Receipt, FileX2, ArrowUpRight,
  Lock, Unlock, RotateCcw, Loader2, Pause,
  UserMinus, UserPlus, Ban, GraduationCap, ShieldAlert,
  ArrowLeftRight, Check
} from 'lucide-react';

/* ═══════════════ TYPES ═══════════════ */

interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  status: string;
}

interface ClosingLog {
  id: string;
  academic_year_name: string;
  target_year_name: string;
  status: string;
  total_students: number;
  promoted_count: number;
  detained_count: number;
  dropout_count: number;
  graduated_count: number;
  carry_forwards_created: number;
  total_carry_forward_amount: string;
  initiated_by_name: string;
  initiated_at: string;
  completed_at: string;
}

interface CarryForward {
  id: string;
  student_name: string;
  admission_number: string;
  source_year_name: string;
  target_year_name: string;
  carry_forward_amount: string;
  paid_amount: string;
  written_off_amount: string;
  remaining_amount: string;
  status: string;
}

interface WriteOff {
  id: string;
  student_name: string;
  admission_number: string;
  amount: string;
  reason: string;
  status: string;
  requested_by_name: string;
  requested_at: string;
  approved_by_name: string;
  admin_remarks: string;
}

interface ClassSectionRow {
  id: string;
  branch: string;
  academic_year: string;
  grade: string;
  section: string;
  display_name: string;
}

interface PromoteStudentRow {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  roll_number: number | null;
  class_section_display: string | null;
}

interface InvoiceDebtOption {
  id: string;
  invoice_number: string;
  outstanding_amount: string;
  status: string;
}

interface CFDebtOption {
  id: string;
  source_year_name: string;
  remaining_amount: string;
  status: string;
}

interface WriteOffStudentDebts {
  studentId: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  invoices: InvoiceDebtOption[];
  carryForwards: CFDebtOption[];
}

interface WriteOffAlloc {
  target_type: 'INVOICE' | 'CARRY_FORWARD';
  target_id: string;
  amount: string;
}

function defaultWriteOffAllocForStudent(b: WriteOffStudentDebts): WriteOffAlloc | null {
  const invs = b.invoices;
  const cfs = b.carryForwards;
  if (!invs.length && !cfs.length) return null;
  let bestInv = invs[0];
  for (const inv of invs) {
    if (Number(inv.outstanding_amount) > Number(bestInv.outstanding_amount)) bestInv = inv;
  }
  let bestCf = cfs[0];
  for (const cf of cfs) {
    if (Number(cf.remaining_amount) > Number(bestCf.remaining_amount)) bestCf = cf;
  }
  if (bestInv && (!bestCf || Number(bestInv.outstanding_amount) >= Number(bestCf.remaining_amount))) {
    return {
      target_type: 'INVOICE',
      target_id: bestInv.id,
      amount: String(bestInv.outstanding_amount),
    };
  }
  if (bestCf) {
    return {
      target_type: 'CARRY_FORWARD',
      target_id: bestCf.id,
      amount: String(bestCf.remaining_amount),
    };
  }
  return null;
}

function maxAmountForWriteOffTarget(b: WriteOffStudentDebts, alloc: WriteOffAlloc | undefined): number {
  if (!alloc) return 0;
  if (alloc.target_type === 'INVOICE') {
    const inv = b.invoices.find(i => i.id === alloc.target_id);
    return inv ? Number(inv.outstanding_amount) : 0;
  }
  const cf = b.carryForwards.find(c => c.id === alloc.target_id);
  return cf ? Number(cf.remaining_amount) : 0;
}

/* ═══════════════ STATUS CHIPS ═══════════════ */

const yearStatusStyles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  PLANNING: { bg: 'bg-slate-100', text: 'text-slate-600', icon: <Clock size={12} /> },
  ACTIVE: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <Unlock size={12} /> },
  CLOSING: { bg: 'bg-amber-50', text: 'text-amber-700', icon: <Pause size={12} /> },
  CLOSED: { bg: 'bg-red-50', text: 'text-red-600', icon: <Lock size={12} /> },
};

const cfStatusStyles: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  PARTIALLY_PAID: 'bg-blue-50 text-blue-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  WRITTEN_OFF: 'bg-slate-100 text-slate-500',
};

const woStatusStyles: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-blue-50 text-blue-700',
  REJECTED: 'bg-red-50 text-red-600',
  EXECUTED: 'bg-emerald-50 text-emerald-700',
};

const closingLogStatusStyles: Record<string, string> = {
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-600',
  ROLLED_BACK: 'bg-amber-50 text-amber-700',
};

/* ═══════════════ MAIN PAGE ═══════════════ */

export default function AcademicTransitionPage() {
  const { user } = useAuth();
  const { selectedBranch } = useBranch();
  const [activeTab, setActiveTab] = useState<'overview' | 'promotion' | 'carryforwards' | 'writeoffs'>('overview');

  const tabs = [
    { key: 'overview' as const, label: 'Year Overview', icon: Calendar },
    { key: 'promotion' as const, label: 'Promotion Engine', icon: ArrowUpRight },
    { key: 'carryforwards' as const, label: 'Carry-Forwards', icon: Receipt },
    { key: 'writeoffs' as const, label: 'Write-Offs', icon: FileX2 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Academic Year Transition</h1>
        <p className="text-gray-500 text-sm mt-1">Manage year closings, student promotions, and financial carry-forwards.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-gray-100 pb-px overflow-x-auto scrollbar-hide">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <YearOverviewTab branch={selectedBranch} user={user} />}
      {activeTab === 'promotion' && <PromotionTab branch={selectedBranch} user={user} />}
      {activeTab === 'carryforwards' && <CarryForwardTab branch={selectedBranch} />}
      {activeTab === 'writeoffs' && <WriteOffTab branch={selectedBranch} user={user} />}
    </div>
  );
}


/* ═══════════════ TAB 1: YEAR OVERVIEW ═══════════════ */

function YearOverviewTab({ branch, user }: { branch: string; user: any }) {
  const { data: years, loading, error, refetch } = useApi<AcademicYear[]>(
    `tenants/academic-years/?branch_id=${branch}`
  );
  const { data: closingLogs, refetch: refetchLogs } = useApi<ClosingLog[]>(
    `/academic-year-closing/logs/`
  );
  const [targetYearId, setTargetYearId] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [closingResult, setClosingResult] = useState<any>(null);
  const [confirmingLogId, setConfirmingLogId] = useState<string | null>(null);

  const activeYear = years?.find(y => y.is_active);
  const otherYears = years?.filter(y => !y.is_active) || [];
  const planningYears = otherYears.filter(y => y.status === 'PLANNING');

  const handleInitiateClosing = async () => {
    if (!targetYearId) { toast.error('Select a target academic year first.'); return; }
    setIsClosing(true);
    try {
      const res = await api.post('/academic-year-closing/initiate/', {
        target_academic_year_id: targetYearId,
      });
      setClosingResult(res.data.data);
      toast.success('Year closing initiated. Review the preview below.');
      refetch();
      refetchLogs();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to initiate closing.');
    } finally { setIsClosing(false); }
  };

  const handleConfirmClosing = async (logId: string) => {
    setConfirmingLogId(logId);
    try {
      const res = await api.post('/academic-year-closing/confirm/', { closing_log_id: logId });
      toast.success('Academic year closed successfully!');
      setClosingResult(null);
      refetch();
      refetchLogs();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to confirm closing.');
    } finally { setConfirmingLogId(null); }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => <div key={i} className="h-48 bg-white rounded-2xl border animate-pulse" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-bold">Could not load academic years</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Active Year Card */}
      {activeYear && (
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl shadow-blue-200/50 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full" />
          <div className="absolute -right-5 -bottom-5 w-24 h-24 bg-white/5 rounded-full" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                Current Year
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                activeYear.status === 'ACTIVE' ? 'bg-emerald-400/20 text-emerald-100' :
                activeYear.status === 'CLOSING' ? 'bg-amber-400/20 text-amber-100' : 'bg-white/20'
              }`}>
                {activeYear.status}
              </div>
            </div>
            <h2 className="text-4xl font-black tracking-tight mt-3">{activeYear.name}</h2>
            <p className="text-blue-100 mt-2 text-sm">
              {activeYear.start_date} → {activeYear.end_date}
            </p>

            {/* Close Year Action */}
            {activeYear.status === 'ACTIVE' && user?.role && user.role === 'SUPER_ADMIN' && (
              <div className="mt-6 flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-1 block">Target Year</label>
                  <select
                    value={targetYearId}
                    onChange={e => setTargetYearId(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white backdrop-blur-sm focus:outline-none focus:ring-2 ring-white/30"
                  >
                    <option value="" className="text-gray-900">Select next year...</option>
                    {planningYears.map(y => (
                      <option key={y.id} value={y.id} className="text-gray-900">{y.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleInitiateClosing}
                  disabled={isClosing || !targetYearId}
                  className="px-6 py-2.5 bg-white text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-50 transition-all disabled:opacity-50 shadow-lg flex items-center gap-2"
                >
                  {isClosing ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  Initiate Year Closing
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Closing Preview */}
      {closingResult && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500" size={24} />
            <div>
              <h3 className="font-bold text-amber-800">Year Closing Preview</h3>
              <p className="text-amber-600 text-sm">Review the numbers below, then confirm to seal the year.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Students to Process" value={closingResult.students_to_process} />
            <Stat label="Students with Dues" value={closingResult.students_with_dues} />
            <Stat label="Est. Carry-Forward" value={`₹${Number(closingResult.estimated_carry_forward_amount).toLocaleString('en-IN')}`} />
            <Stat label="Status" value={closingResult.status} />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleConfirmClosing(closingResult.closing_log_id)}
              disabled={confirmingLogId !== null}
              className="px-6 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {confirmingLogId ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Confirm & Close Year
            </button>
            <button
              onClick={() => setClosingResult(null)}
              className="px-6 py-2.5 bg-white text-amber-700 rounded-xl font-bold text-sm hover:bg-amber-50 border border-amber-200 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* All Years Grid */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
          All Academic Years
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {years && years.length === 0 && (
            <p className="text-sm text-slate-500 col-span-full py-8 text-center border border-dashed rounded-2xl">
              No academic years found for this organization. Add years under Setup → Academic Years.
            </p>
          )}
          {years?.map(year => {
            const style = yearStatusStyles[year.status] || yearStatusStyles.PLANNING;
            return (
              <div key={year.id} className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all ${year.is_active ? 'ring-2 ring-blue-200' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-900">{year.name}</h4>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight flex items-center gap-1 ${style.bg} ${style.text}`}>
                    {style.icon}{year.status}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{year.start_date} → {year.end_date}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Closing History */}
      {closingLogs && closingLogs.length > 0 && (
        <div>
          <div className="mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
              Closing History
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 max-w-3xl">
              Promotion, detain, dropout, and graduated columns reflect live counts from student academic records for that closed year (all branches in your organization).
            </p>
          </div>
          <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="bg-slate-50/50 border-b">
                <tr>
                  <th className="px-4 py-4 font-bold text-slate-600">Year</th>
                  <th className="px-4 py-4 font-bold text-slate-600">Target</th>
                  <th className="px-4 py-4 font-bold text-slate-600 text-center" title="Student academic records for this year (current data)">Promo</th>
                  <th className="px-4 py-4 font-bold text-slate-600 text-center">Detain</th>
                  <th className="px-4 py-4 font-bold text-slate-600 text-center">Dropout</th>
                  <th className="px-4 py-4 font-bold text-slate-600 text-center">Grad</th>
                  <th className="px-4 py-4 font-bold text-slate-600">Carry-Fwd</th>
                  <th className="px-4 py-4 font-bold text-slate-600">Amount</th>
                  <th className="px-4 py-4 font-bold text-slate-600">Status</th>
                  <th className="px-4 py-4 font-bold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {closingLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4 font-bold text-slate-900">{log.academic_year_name}</td>
                    <td className="px-4 py-4 text-slate-500">{log.target_year_name}</td>
                    <td className="px-4 py-4 text-center tabular-nums">{log.promoted_count}</td>
                    <td className="px-4 py-4 text-center tabular-nums">{log.detained_count}</td>
                    <td className="px-4 py-4 text-center tabular-nums">{log.dropout_count}</td>
                    <td className="px-4 py-4 text-center tabular-nums">{log.graduated_count}</td>
                    <td className="px-4 py-4 tabular-nums">{log.carry_forwards_created}</td>
                    <td className="px-4 py-4 font-bold tabular-nums">₹{Number(log.total_carry_forward_amount).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${closingLogStatusStyles[log.status]}`}>
                        {log.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs whitespace-nowrap">{new Date(log.initiated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


/* ═══════════════ TAB 2: PROMOTION ENGINE ═══════════════ */

function PromotionTab({ branch, user }: { branch: string; user: any }) {
  void user;
  const { data: years, loading: yearsLoading, error: yearsError } = useApi<AcademicYear[]>(
    `tenants/academic-years/?branch_id=${branch}`
  );

  const activeYear = years?.find(y => y.is_active);

  const [fromYearId, setFromYearId] = useState('');
  const [toYearId, setToYearId] = useState('');
  const [fromSectionId, setFromSectionId] = useState('');
  const [toSectionId, setToSectionId] = useState('');
  const [sameGradeSection, setSameGradeSection] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    if (!activeYear?.id) return;
    setFromYearId(prev => prev || activeYear.id);
  }, [activeYear?.id]);

  useEffect(() => {
    setFromSectionId('');
  }, [fromYearId]);

  useEffect(() => {
    setToSectionId('');
  }, [toYearId]);

  const fromClassesUrl =
    branch && fromYearId ? `classes/?branch_id=${branch}&academic_year_id=${fromYearId}` : null;
  const { data: fromClasses, loading: fromClassesLoading } = useApi<ClassSectionRow[]>(fromClassesUrl);

  const toClassesUrl =
    branch && toYearId ? `classes/?branch_id=${branch}&academic_year_id=${toYearId}` : null;
  const { data: toClasses, loading: toClassesLoading } = useApi<ClassSectionRow[]>(toClassesUrl);

  const studentsUrl = fromSectionId ? `classes/${fromSectionId}/students/` : null;
  const { data: classStudents, loading: studentsLoading, refetch: refetchStudents } = useApi<
    PromoteStudentRow[]
  >(studentsUrl);

  const fromSection = useMemo(
    () => fromClasses?.find(c => c.id === fromSectionId),
    [fromClasses, fromSectionId]
  );
  const toSection = useMemo(() => toClasses?.find(c => c.id === toSectionId), [toClasses, toSectionId]);

  useEffect(() => {
    if (!sameGradeSection || !fromSection || !toClasses?.length) return;
    const match = toClasses.find(c => c.grade === fromSection.grade && c.section === fromSection.section);
    if (match) setToSectionId(match.id);
  }, [sameGradeSection, fromSection, toClasses]);

  useEffect(() => {
    if (!classStudents?.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(classStudents.map(s => s.id));
  }, [fromSectionId, classStudents]);

  const toggleRow = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const allSelected = !!classStudents?.length && selectedIds.length === classStudents.length;
  const toggleAll = () => {
    if (!classStudents?.length) return;
    setSelectedIds(allSelected ? [] : classStudents.map(s => s.id));
  };

  const handleQuickPromote = async () => {
    if (!branch || !toYearId || !toSectionId || selectedIds.length === 0) {
      toast.error('Choose target year, target class, and at least one student.');
      return;
    }
    if (fromYearId === toYearId && fromSectionId === toSectionId) {
      toast.error('Source and target class must be different.');
      return;
    }
    setPromoting(true);
    try {
      const res = await api.post('/students/promote/', {
        student_ids: selectedIds,
        target_academic_year_id: toYearId,
        target_class_section_id: toSectionId,
      });
      const msg =
        res.data?.message || `Promoted ${res.data?.promoted_count ?? selectedIds.length} student(s).`;
      toast.success(msg);
      await refetchStudents();
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.detail || 'Promotion failed.');
    } finally {
      setPromoting(false);
    }
  };

  if (yearsError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-bold">Could not load academic years</p>
        <p className="text-sm mt-1">{yearsError}</p>
        <p className="text-xs mt-2 text-red-700">Promotion needs academic years for this organization.</p>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 text-sm">
        Select a branch in the header to promote students.
      </div>
    );
  }

  const fromYearLabel = years?.find(y => y.id === fromYearId)?.name ?? '—';
  const sectionTitle = fromSection ? fromSection.display_name : 'this class';

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users size={18} className="text-blue-600" />
            Promote by class
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Pick the class you are moving students from, then the target year and class. Students load
            automatically; uncheck anyone who should stay put for now.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 rounded border-slate-300"
            checked={sameGradeSection}
            onChange={e => setSameGradeSection(e.target.checked)}
          />
          <span className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Same grade &amp; section in target year</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Only the academic year changes (e.g. UKG-A → UKG-A in the next session). Target class is filled
              automatically when it exists.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">From (current)</p>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Academic year</label>
              <select
                value={fromYearId}
                onChange={e => setFromYearId(e.target.value)}
                disabled={yearsLoading}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-blue-200 focus:outline-none disabled:opacity-60"
              >
                <option value="">{yearsLoading ? 'Loading…' : 'Select year…'}</option>
                {years?.map(y => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.is_active ? ' (active)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Class</label>
              <select
                value={fromSectionId}
                onChange={e => setFromSectionId(e.target.value)}
                disabled={!fromYearId || fromClassesLoading}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-blue-200 focus:outline-none disabled:opacity-60"
              >
                <option value="">
                  {!fromYearId ? 'Choose a year first…' : fromClassesLoading ? 'Loading classes…' : 'Select class…'}
                </option>
                {fromClasses?.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200/80 p-4 space-y-3 bg-emerald-50/30">
            <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">To (target)</p>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Academic year</label>
              <select
                value={toYearId}
                onChange={e => setToYearId(e.target.value)}
                disabled={yearsLoading}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-emerald-200 focus:outline-none disabled:opacity-60"
              >
                <option value="">{yearsLoading ? 'Loading…' : 'Select target year…'}</option>
                {years?.map(y => (
                  <option key={y.id} value={y.id}>
                    {y.name} ({y.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Class</label>
              <select
                value={toSectionId}
                onChange={e => setToSectionId(e.target.value)}
                disabled={!toYearId || toClassesLoading}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-emerald-200 focus:outline-none disabled:opacity-60"
              >
                <option value="">
                  {!toYearId ? 'Choose target year first…' : toClassesLoading ? 'Loading classes…' : 'Select class…'}
                </option>
                {toClasses?.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {fromSectionId && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-slate-800">
                Students in {sectionTitle}
                <span className="ml-2 text-xs font-normal text-slate-500">({fromYearLabel})</span>
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600">
                  {selectedIds.length} of {classStudents?.length ?? 0} selected
                </span>
                <button
                  type="button"
                  onClick={handleQuickPromote}
                  disabled={
                    promoting ||
                    !toYearId ||
                    !toSectionId ||
                    selectedIds.length === 0 ||
                    studentsLoading
                  }
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                >
                  {promoting ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeftRight size={16} />}
                  Promote selected
                </button>
              </div>
            </div>

            {studentsLoading ? (
              <div className="flex justify-center py-12 border rounded-xl">
                <Loader2 className="animate-spin text-blue-500" size={28} />
              </div>
            ) : !classStudents?.length ? (
              <p className="text-sm text-slate-500 py-8 text-center border border-dashed rounded-xl">
                No active students in this class for the selected year.
              </p>
            ) : (
              <div className="border rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Select all students"
                        />
                      </th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">#</th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">Admission</th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">Roll</th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">Name</th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">Target class</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classStudents.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={selectedIds.includes(s.id)}
                            onChange={() => toggleRow(s.id)}
                          />
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{s.admission_number}</td>
                        <td className="px-3 py-2 text-slate-600">{s.roll_number ?? '—'}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {s.first_name} {s.last_name}
                        </td>
                        <td className="px-3 py-2">
                          {toSection ? (
                            <span className="font-semibold text-emerald-700">{toSection.display_name}</span>
                          ) : (
                            <span className="text-slate-400">Choose target class</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
/* ═══════════════ TAB 3: CARRY-FORWARDS ═══════════════ */

function CarryForwardTab({ branch }: { branch: string }) {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: carryForwards, loading, refetch } = useApi<CarryForward[]>(
    branch
      ? `/fees/carry-forwards/?branch_id=${branch}${statusFilter ? `&status=${statusFilter}` : ''}`
      : null
  );
  const { data: years, loading: yearsLoading } = useApi<AcademicYear[]>(
    branch ? `tenants/academic-years/?branch_id=${branch}` : null
  );
  const [syncSourceId, setSyncSourceId] = useState('');
  const [syncTargetId, setSyncTargetId] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!years?.length) return;
    const active = years.find(y => y.is_active);
    setSyncTargetId(prev => prev || active?.id || '');
  }, [years]);

  const handleSyncCarryForwards = async () => {
    if (!branch || !syncSourceId || !syncTargetId) {
      toast.error('Select source and target academic years.');
      return;
    }
    if (syncSourceId === syncTargetId) {
      toast.error('Source and target years must be different.');
      return;
    }
    setSyncing(true);
    try {
      const res = await api.post('/academic-year-closing/sync-carry-forwards/', {
        source_academic_year_id: syncSourceId,
        target_academic_year_id: syncTargetId,
        branch_id: branch,
      });
      const d = res.data?.data;
      const created = d?.created ?? 0;
      const amt = Number(d?.total_amount ?? 0);
      toast.success(
        created > 0
          ? `Created ${created} carry-forward record(s) (₹${amt.toLocaleString('en-IN')} new liability).`
          : 'No new carry-forwards needed (existing rows or no unpaid invoices for that source year).'
      );
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not sync carry-forwards.');
    } finally {
      setSyncing(false);
    }
  };

  const totalPending = carryForwards
    ?.filter(cf => cf.status !== 'PAID' && cf.status !== 'WRITTEN_OFF')
    .reduce((sum, cf) => sum + Number(cf.remaining_amount), 0) || 0;

  if (!branch) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 text-sm">
        Select a branch in the header to view carry-forwards.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Create carry-forwards from unpaid invoices</h3>
          <p className="text-xs text-slate-500 mt-1">
            Outstanding fee invoices do not appear here until a carry-forward row links the old year to the new one.
            Use this after promotions or when you skipped formal year closing — pick the year where invoices are still
            open, then the year you are carrying balances into (usually the active year).
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Source year (unpaid invoices)</label>
            <select
              value={syncSourceId}
              onChange={e => setSyncSourceId(e.target.value)}
              disabled={yearsLoading}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-blue-200 focus:outline-none disabled:opacity-60"
            >
              <option value="">{yearsLoading ? 'Loading…' : 'Select year…'}</option>
              {years?.map(y => (
                <option key={y.id} value={y.id}>
                  {y.name} ({y.status})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Target year</label>
            <select
              value={syncTargetId}
              onChange={e => setSyncTargetId(e.target.value)}
              disabled={yearsLoading}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-emerald-200 focus:outline-none disabled:opacity-60"
            >
              <option value="">{yearsLoading ? 'Loading…' : 'Select year…'}</option>
              {years?.map(y => (
                <option key={y.id} value={y.id}>
                  {y.name} ({y.status}){y.is_active ? ' — active' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleSyncCarryForwards}
            disabled={syncing || yearsLoading || !syncSourceId || !syncTargetId}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
            Generate / refresh rows
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Records</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{carryForwards?.length || 0}</p>
        </div>
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Outstanding</p>
          <p className="text-3xl font-black text-rose-600 mt-1">₹{totalPending.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fully Cleared</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">
            {carryForwards?.filter(cf => cf.status === 'PAID').length || 0}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {['', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'WRITTEN_OFF'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
              statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
            }`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="mx-auto animate-spin text-blue-500" size={24} /></div>
        ) : !carryForwards?.length ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto text-emerald-300 mb-3" size={32} />
            <p className="font-bold text-slate-900">No carry-forward rows yet</p>
            <p className="text-slate-400 text-sm max-w-md mx-auto mt-1">
              If students still show unpaid invoices from a previous academic year, use &quot;Generate / refresh rows&quot;
              above with the correct source and target years.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/50 border-b">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-600">Student</th>
                <th className="px-6 py-4 font-bold text-slate-600">Source Year</th>
                <th className="px-6 py-4 font-bold text-slate-600">Carried</th>
                <th className="px-6 py-4 font-bold text-slate-600">Paid</th>
                <th className="px-6 py-4 font-bold text-slate-600">Remaining</th>
                <th className="px-6 py-4 font-bold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {carryForwards.map(cf => (
                <tr key={cf.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{cf.student_name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{cf.admission_number}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{cf.source_year_name}</td>
                  <td className="px-6 py-4 font-bold">₹{Number(cf.carry_forward_amount).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 text-emerald-600 font-bold">₹{Number(cf.paid_amount).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4">
                    <span className={`font-bold ${Number(cf.remaining_amount) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      ₹{Number(cf.remaining_amount).toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${cfStatusStyles[cf.status]}`}>
                      {cf.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


/* ═══════════════ TAB 4: WRITE-OFFS ═══════════════ */

function WriteOffTab({ branch, user }: { branch: string; user: any }) {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: writeOffs, loading, refetch } = useApi<WriteOff[]>(
    branch
      ? `/fees/write-offs/?branch_id=${branch}${statusFilter ? `&status=${statusFilter}` : ''}`
      : null
  );
  const [processing, setProcessing] = useState<string | null>(null);

  const { data: woYears, loading: woYearsLoading, error: woYearsError } = useApi<AcademicYear[]>(
    branch ? `tenants/academic-years/?branch_id=${branch}` : null
  );
  const woActiveYear = woYears?.find(y => y.is_active);
  const [woYearId, setWoYearId] = useState('');
  const [woSectionId, setWoSectionId] = useState('');
  const [woSelectedIds, setWoSelectedIds] = useState<string[]>([]);
  const [woDebtPanel, setWoDebtPanel] = useState(false);
  const [woDebtBundles, setWoDebtBundles] = useState<WriteOffStudentDebts[]>([]);
  const [woAlloc, setWoAlloc] = useState<Record<string, WriteOffAlloc>>({});
  const [woLoadingDebts, setWoLoadingDebts] = useState(false);
  const [woSubmitting, setWoSubmitting] = useState(false);
  const [woBulkReason, setWoBulkReason] = useState('');

  useEffect(() => {
    if (!woActiveYear?.id) return;
    setWoYearId(prev => prev || woActiveYear.id);
  }, [woActiveYear?.id]);

  useEffect(() => {
    setWoSectionId('');
  }, [woYearId]);

  useEffect(() => {
    setWoSelectedIds([]);
    setWoDebtPanel(false);
    setWoDebtBundles([]);
    setWoAlloc({});
  }, [woSectionId]);

  const woClassesUrl =
    branch && woYearId ? `classes/?branch_id=${branch}&academic_year_id=${woYearId}` : null;
  const { data: woClasses, loading: woClassesLoading } = useApi<ClassSectionRow[]>(woClassesUrl);

  const woStudentsUrl = woSectionId ? `classes/${woSectionId}/students/` : null;
  const { data: woClassStudents, loading: woStudentsLoading, refetch: refetchWoStudents } = useApi<
    PromoteStudentRow[]
  >(woStudentsUrl);

  const woSection = useMemo(
    () => woClasses?.find(c => c.id === woSectionId),
    [woClasses, woSectionId]
  );

  useEffect(() => {
    if (!woClassStudents?.length) {
      setWoSelectedIds([]);
      return;
    }
    setWoSelectedIds(woClassStudents.map(s => s.id));
  }, [woSectionId, woClassStudents]);

  const woToggleRow = (id: string) => {
    setWoSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const woAllSelected =
    !!woClassStudents?.length && woSelectedIds.length === woClassStudents.length;
  const woToggleAll = () => {
    if (!woClassStudents?.length) return;
    setWoSelectedIds(woAllSelected ? [] : woClassStudents.map(s => s.id));
  };

  const unwrapList = (res: { data?: any }) => {
    const d = res.data;
    if (Array.isArray(d?.data)) return d.data;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d)) return d;
    return [];
  };

  const handleLoadDebtsForWriteOffs = async () => {
    if (!branch || woSelectedIds.length === 0) {
      toast.error('Select at least one student.');
      return;
    }
    setWoLoadingDebts(true);
    try {
      const bundles: WriteOffStudentDebts[] = [];
      for (const sid of woSelectedIds) {
        const st = woClassStudents?.find(s => s.id === sid);
        const [invRes, cfRes] = await Promise.all([
          api.get('/fees/invoices/', { params: { branch_id: branch, student_id: sid } }),
          api.get('/fees/carry-forwards/', { params: { branch_id: branch, student_id: sid } }),
        ]);
        const rawInv = unwrapList(invRes) as InvoiceDebtOption[];
        const invoices = rawInv.filter(
          inv =>
            Number(inv.outstanding_amount) > 0 &&
            ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status)
        );
        const rawCf = unwrapList(cfRes) as CFDebtOption[];
        const carryForwards = rawCf.filter(
          cf =>
            Number(cf.remaining_amount) > 0 &&
            cf.status !== 'PAID' &&
            cf.status !== 'WRITTEN_OFF'
        );
        bundles.push({
          studentId: sid,
          admission_number: st?.admission_number ?? '',
          first_name: st?.first_name ?? '',
          last_name: st?.last_name ?? '',
          invoices,
          carryForwards,
        });
      }
      setWoDebtBundles(bundles);
      const nextAlloc: Record<string, WriteOffAlloc> = {};
      for (const b of bundles) {
        const def = defaultWriteOffAllocForStudent(b);
        if (def) nextAlloc[b.studentId] = def;
      }
      setWoAlloc(nextAlloc);
      setWoDebtPanel(true);
      const withDebts = bundles.filter(b => b.invoices.length || b.carryForwards.length).length;
      if (!withDebts) {
        toast.error('No unpaid invoices or open carry-forwards for the selected students.');
      } else {
        toast.success(`Loaded balances for ${bundles.length} student(s).`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Could not load fee balances.');
    } finally {
      setWoLoadingDebts(false);
    }
  };

  const handleSubmitWriteOffRequests = async () => {
    const reason = woBulkReason.trim();
    if (reason.length < 10) {
      toast.error('Reason must be at least 10 characters.');
      return;
    }
    const rows = woDebtBundles.filter(b => woAlloc[b.studentId]);
    if (!rows.length) {
      toast.error('Choose a write-off target for at least one student.');
      return;
    }
    setWoSubmitting(true);
    let ok = 0;
    let bad = 0;
    try {
      for (const b of rows) {
        const alloc = woAlloc[b.studentId];
        if (!alloc) {
          bad++;
          continue;
        }
        const max = maxAmountForWriteOffTarget(b, alloc);
        const amt = Number(alloc.amount);
        if (!max || amt < 0.01 || amt > max + 1e-6) {
          bad++;
          continue;
        }
        try {
          await api.post('/fees/write-offs/', {
            student_id: b.studentId,
            target_type: alloc.target_type,
            target_id: alloc.target_id,
            amount: alloc.amount,
            reason,
          });
          ok++;
        } catch {
          bad++;
        }
      }
      toast.success(
        ok ? `Submitted ${ok} request(s) for approval.` : 'No requests submitted.',
        bad ? { duration: 5000 } : undefined
      );
      if (bad) toast.error(`${bad} row(s) skipped (invalid amount or API error).`);
      refetch();
      setWoDebtPanel(false);
      setWoDebtBundles([]);
      setWoAlloc({});
      setWoBulkReason('');
      await refetchWoStudents();
    } finally {
      setWoSubmitting(false);
    }
  };

  const handleReview = async (id: string, action: 'APPROVE' | 'REJECT') => {
    let remarks = '';
    if (action === 'REJECT') {
      const input = prompt('Reason for rejection:');
      if (input === null) return;
      remarks = input;
    }
    setProcessing(id);
    try {
      await api.post(`/fees/write-offs/${id}/review/`, { action, remarks });
      toast.success(action === 'APPROVE' ? 'Write-off approved and executed.' : 'Write-off rejected.');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed.');
    } finally { setProcessing(null); }
  };

  const pendingCount = writeOffs?.filter(w => w.status === 'PENDING').length || 0;
  const totalWrittenOff = writeOffs
    ?.filter(w => w.status === 'EXECUTED')
    .reduce((sum, w) => sum + Number(w.amount), 0) || 0;

  const woYearLabel = woYears?.find(y => y.id === woYearId)?.name ?? '—';

  if (!branch) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 text-sm">
        Select a branch in the header to manage write-offs.
      </div>
    );
  }

  if (woYearsError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-bold">Could not load academic years</p>
        <p className="text-sm mt-1">{woYearsError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 flex gap-3 text-sm text-slate-700">
        <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
        <p>
          <span className="font-semibold text-slate-900">Write-offs are approval requests.</span>{' '}
          Submit requests below (or from a student profile); they stay pending until an admin approves. Outstanding
          fee invoices alone do not appear in the history table until a request exists.
        </p>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileX2 size={18} className="text-rose-600" />
            Request write-offs by class
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Same flow as promotion: pick the academic year and class, select students, then configure each line
            against an invoice or carry-forward balance.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50 max-w-xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Class</p>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Academic year</label>
            <select
              value={woYearId}
              onChange={e => setWoYearId(e.target.value)}
              disabled={woYearsLoading}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-blue-200 focus:outline-none disabled:opacity-60"
            >
              <option value="">{woYearsLoading ? 'Loading…' : 'Select year…'}</option>
              {woYears?.map(y => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.is_active ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Class</label>
            <select
              value={woSectionId}
              onChange={e => setWoSectionId(e.target.value)}
              disabled={!woYearId || woClassesLoading}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-blue-200 focus:outline-none disabled:opacity-60"
            >
              <option value="">
                {!woYearId ? 'Choose a year first…' : woClassesLoading ? 'Loading classes…' : 'Select class…'}
              </option>
              {woClasses?.map(c => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {woSectionId && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-slate-800">
                Students in {woSection ? woSection.display_name : 'this class'}
                <span className="ml-2 text-xs font-normal text-slate-500">({woYearLabel})</span>
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600">
                  {woSelectedIds.length} of {woClassStudents?.length ?? 0} selected
                </span>
                <button
                  type="button"
                  onClick={handleLoadDebtsForWriteOffs}
                  disabled={woLoadingDebts || woSelectedIds.length === 0 || woStudentsLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50 shadow-sm"
                >
                  {woLoadingDebts ? <Loader2 size={16} className="animate-spin" /> : <FileX2 size={16} />}
                  Configure write-offs
                </button>
              </div>
            </div>

            {woStudentsLoading ? (
              <div className="flex justify-center py-12 border rounded-xl">
                <Loader2 className="animate-spin text-blue-500" size={28} />
              </div>
            ) : !woClassStudents?.length ? (
              <p className="text-sm text-slate-500 py-8 text-center border border-dashed rounded-xl">
                No active students in this class for the selected year.
              </p>
            ) : (
              <div className="border rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={woAllSelected}
                          onChange={woToggleAll}
                          aria-label="Select all students"
                        />
                      </th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">#</th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">Admission</th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">Roll</th>
                      <th className="px-3 py-3 text-left font-bold text-slate-600">Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {woClassStudents.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={woSelectedIds.includes(s.id)}
                            onChange={() => woToggleRow(s.id)}
                          />
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{s.admission_number}</td>
                        <td className="px-3 py-2 text-slate-600">{s.roll_number ?? '—'}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {s.first_name} {s.last_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {woDebtPanel && woDebtBundles.length > 0 && (
          <div className="space-y-4 border-t border-slate-100 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900">Write-off details</h4>
              <button
                type="button"
                onClick={() => {
                  setWoDebtPanel(false);
                  setWoDebtBundles([]);
                  setWoAlloc({});
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Back to selection
              </button>
            </div>
            <p className="text-xs text-slate-500">
              One pending request per row. Amount cannot exceed the open balance on the chosen invoice or
              carry-forward.
            </p>
            <div className="border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-3 py-3 text-left font-bold text-slate-600">Student</th>
                    <th className="px-3 py-3 text-left font-bold text-slate-600">Write off against</th>
                    <th className="px-3 py-3 text-left font-bold text-slate-600 w-36">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {woDebtBundles.map(b => {
                    const alloc = woAlloc[b.studentId];
                    const max = maxAmountForWriteOffTarget(b, alloc);
                    const hasDebt = b.invoices.length > 0 || b.carryForwards.length > 0;
                    return (
                      <tr key={b.studentId} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">
                            {b.first_name} {b.last_name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">{b.admission_number}</p>
                          {!hasDebt && (
                            <p className="text-xs text-amber-700 mt-1">No eligible invoice or carry-forward</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={
                              alloc ? `${alloc.target_type}:${alloc.target_id}` : ''
                            }
                            disabled={!hasDebt}
                            onChange={e => {
                              const v = e.target.value;
                              if (!v) {
                                setWoAlloc(prev => {
                                  const n = { ...prev };
                                  delete n[b.studentId];
                                  return n;
                                });
                                return;
                              }
                              const [type, id] = v.split(':') as ['INVOICE' | 'CARRY_FORWARD', string];
                              let amount = '0';
                              if (type === 'INVOICE') {
                                const inv = b.invoices.find(i => i.id === id);
                                if (inv) amount = String(inv.outstanding_amount);
                              } else {
                                const cf = b.carryForwards.find(c => c.id === id);
                                if (cf) amount = String(cf.remaining_amount);
                              }
                              setWoAlloc(prev => ({
                                ...prev,
                                [b.studentId]: { target_type: type, target_id: id, amount },
                              }));
                            }}
                            className="w-full max-w-md border rounded-lg px-2 py-2 text-xs font-medium focus:ring-2 ring-blue-200 focus:outline-none disabled:opacity-50"
                          >
                            <option value="">Select target…</option>
                            {b.invoices.length > 0 && (
                              <optgroup label="Invoices">
                                {b.invoices.map(inv => (
                                  <option key={inv.id} value={`INVOICE:${inv.id}`}>
                                    {inv.invoice_number} — ₹{Number(inv.outstanding_amount).toLocaleString('en-IN')} (
                                    {inv.status})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {b.carryForwards.length > 0 && (
                              <optgroup label="Carry-forwards">
                                {b.carryForwards.map(cf => (
                                  <option key={cf.id} value={`CARRY_FORWARD:${cf.id}`}>
                                    CF {cf.source_year_name} — ₹{Number(cf.remaining_amount).toLocaleString('en-IN')}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={!alloc || !hasDebt}
                            value={alloc?.amount ?? ''}
                            onChange={e =>
                              setWoAlloc(prev => ({
                                ...prev,
                                [b.studentId]: {
                                  ...prev[b.studentId]!,
                                  amount: e.target.value,
                                },
                              }))
                            }
                            className="w-full border rounded-lg px-2 py-2 text-sm font-mono focus:ring-2 ring-blue-200 focus:outline-none disabled:opacity-50"
                          />
                          {max > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1">Max ₹{max.toLocaleString('en-IN')}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                Reason (shared, min. 10 characters)
              </label>
              <textarea
                value={woBulkReason}
                onChange={e => setWoBulkReason(e.target.value)}
                rows={3}
                placeholder="e.g. Management waiver for orphan students — batch 2026"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 ring-blue-200 focus:outline-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmitWriteOffRequests}
                disabled={woSubmitting}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                {woSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Submit requests for approval
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Approval</p>
          <p className={`text-3xl font-black mt-1 ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{pendingCount}</p>
        </div>
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Written Off</p>
          <p className="text-3xl font-black text-red-600 mt-1">₹{totalWrittenOff.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Requests</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{writeOffs?.length || 0}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {['', 'PENDING', 'APPROVED', 'EXECUTED', 'REJECTED'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
              statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
            }`}>
            {s || 'All'}
            {s === 'PENDING' && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="mx-auto animate-spin text-blue-500" size={24} /></div>
        ) : !writeOffs?.length ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto text-emerald-300 mb-3" size={32} />
            <p className="font-bold text-slate-900">No write-offs</p>
            <p className="text-slate-400 text-sm">Write-off requests will appear here.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/50 border-b">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-600">Student</th>
                <th className="px-6 py-4 font-bold text-slate-600">Amount</th>
                <th className="px-6 py-4 font-bold text-slate-600">Reason</th>
                <th className="px-6 py-4 font-bold text-slate-600">Requested By</th>
                <th className="px-6 py-4 font-bold text-slate-600">Status</th>
                <th className="px-6 py-4 font-bold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {writeOffs.map(wo => (
                <tr key={wo.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{wo.student_name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{wo.admission_number}</p>
                  </td>
                  <td className="px-6 py-4 font-black text-rose-600">₹{Number(wo.amount).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate" title={wo.reason}>{wo.reason}</td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{wo.requested_by_name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${woStatusStyles[wo.status]}`}>
                      {wo.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {wo.status === 'PENDING' && user?.role && user.role === 'SUPER_ADMIN' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReview(wo.id, 'APPROVE')}
                          disabled={processing === wo.id}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
                        >
                          {processing === wo.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReview(wo.id, 'REJECT')}
                          disabled={processing === wo.id}
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : wo.status === 'EXECUTED' ? (
                      <span className="text-xs text-slate-400">Completed</span>
                    ) : (
                      <span className="text-xs text-slate-400">{wo.admin_remarks || '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


/* ═══════════════ REUSABLE STAT ═══════════════ */

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border p-4 shadow-sm">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-black mt-1 ${highlight ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
