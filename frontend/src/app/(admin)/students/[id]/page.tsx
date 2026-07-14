"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { 
  User, Mail, Phone, MapPin, Calendar, BookOpen, 
  ChevronLeft, Edit2, LogOut, Shield, GraduationCap,
  Building2, Hash, CreditCard, Activity, FileText,
  AlertCircle, CheckCircle2, Clock, Trash2, Plus, ArrowRightLeft, History,
  UserMinus, UserPlus, Loader2, Download, RotateCcw
} from 'lucide-react';
import StudentForm from '@/components/students/StudentForm';
import PaymentModal from '@/components/students/PaymentModal';
import EditClassFeesModal from '@/components/students/EditClassFeesModal';
import Modal from '@/components/common/Modal';
import { useAuth } from '@/components/common/AuthProvider';
import { toast } from 'react-hot-toast';

export default function StudentProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const push = useResolvedPush();
  const { user } = useAuth();
  const { data: student, loading, error, refetch } = useApi<any>(`/students/${id}/`);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditForm, setShowEditForm] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawData, setWithdrawData] = useState({
    leaving_date: new Date().toISOString().split('T')[0],
    leaving_reason: '',
    target_branch_id: '',
  });
  const [tenantBranches, setTenantBranches] = useState<any[]>([]);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showDropoutModal, setShowDropoutModal] = useState(false);
  const [dropoutData, setDropoutData] = useState({ reason: '', stop_future_fees: true });
  const [droppingOut, setDroppingOut] = useState(false);
  const [reinstating, setReinstating] = useState(false);
  const [showInactiveReasonModal, setShowInactiveReasonModal] = useState(false);
  const [inactiveReason, setInactiveReason] = useState('');
  const [markingInactive, setMarkingInactive] = useState(false);
  const [showEditClassFees, setShowEditClassFees] = useState(false);
  const [markingInitialStatus, setMarkingInitialStatus] = useState<'ADMISSION_FEE' | 'FIXED_DEPOSIT' | null>(null);
  const [confirmInitialStatusChange, setConfirmInitialStatusChange] = useState<{
    target: 'ADMISSION_FEE' | 'FIXED_DEPOSIT';
    paidEarlier: boolean;
  } | null>(null);
  const { data: academicRecords, loading: recordsLoading } = useApi<any[]>(`/academic-records/?student_id=${id}`);

  const [promotedFeeStandard, setPromotedFeeStandard] = useState(0);
  const [promotedFeeOffered, setPromotedFeeOffered] = useState(0);
  const [promotedFeeReason, setPromotedFeeReason] = useState('');
  const [promotedFeeStructure, setPromotedFeeStructure] = useState<any>(null);
  const [promotedFeeLoading, setPromotedFeeLoading] = useState(false);
  const [promotedFeeSaving, setPromotedFeeSaving] = useState(false);

  // Reverse payment — Super Admin only
  const [reversePaymentTarget, setReversePaymentTarget] = useState<{ id: string; receipt: string; amount: number } | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversingPayment, setReversingPayment] = useState(false);

  const isSuperAdmin = !!user && ['OWNER', 'SUPER_ADMIN'].includes((user.role || '').toUpperCase());
  const isAccountantOrAbove = !!user && ['OWNER', 'SUPER_ADMIN', 'ZONAL_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes((user.role || '').toUpperCase());

  const canConfirmPromotedFees = !!user && (
    ['OWNER', 'SUPER_ADMIN', 'ZONAL_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes(user.role)
  );

  // Concession requests state
  const [concessionRequests, setConcessionRequests] = useState<any[]>([]);
  const [showConcessionModal, setShowConcessionModal] = useState(false);
  const [concessionOffered, setConcessionOffered] = useState('');
  const [concessionReason, setConcessionReason] = useState('');
  const [submittingConcession, setSubmittingConcession] = useState(false);

  const fetchConcessionRequests = async () => {
    try {
      const res: any = await api.get(`/fees/approvals/?student_id=${id}`);
      const raw = res.data?.results ?? res.data?.data ?? res.data;
      const list = Array.isArray(raw) ? raw : [];
      setConcessionRequests(list.filter((r: any) => r.request_type === 'CONCESSION'));
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!id || activeTab !== 'fees') return;
    fetchConcessionRequests();
  }, [id, activeTab]);

  const handleSubmitConcession = async () => {
    const offered = Number(concessionOffered);
    if (!offered || offered <= 0) {
      toast.error('Enter a valid proposed fee amount.');
      return;
    }
    setSubmittingConcession(true);
    try {
      await api.post(`/students/${id}/request-concession/`, {
        offered_total: offered,
        reason: concessionReason.trim(),
      });
      toast.success('Concession request submitted for approval.');
      setShowConcessionModal(false);
      setConcessionOffered('');
      setConcessionReason('');
      fetchConcessionRequests();
    } catch (err: any) {
      const d = err.response?.data;
      const msg = typeof d?.detail === 'string' ? d.detail :
        (Array.isArray(d?.detail) ? d.detail[0] : 'Failed to submit concession request.');
      toast.error(String(msg));
    } finally {
      setSubmittingConcession(false);
    }
  };

  useEffect(() => {
    if (!student?.needs_promoted_class_fee_setup || !student.class_section || !student.branch || !student.academic_year) {
      setPromotedFeeStructure(null);
      setPromotedFeeStandard(0);
      setPromotedFeeOffered(0);
      return;
    }
    let cancelled = false;
    setPromotedFeeLoading(true);
    (async () => {
      try {
        const csRes = await api.get(`classes/${student.class_section}/`);
        const cs = csRes.data?.data ?? csRes.data;
        const grade = cs?.grade;
        if (!grade || cancelled) {
          setPromotedFeeLoading(false);
          return;
        }
        const fsRes = await api.get(
          `/fees/structures/?branch_id=${student.branch}&academic_year_id=${student.academic_year}&grade=${encodeURIComponent(grade)}`
        );
        const arr = fsRes.data?.data ?? fsRes.data?.results ?? fsRes.data;
        const list = Array.isArray(arr) ? arr : [];
        const structure = list[0];
        if (cancelled) return;
        setPromotedFeeStructure(structure || null);
        const total = (structure?.items || []).reduce((acc: number, item: any) => acc + Number(item.amount || 0), 0);
        setPromotedFeeStandard(total);
        setPromotedFeeOffered(total);
      } catch {
        if (!cancelled) {
          setPromotedFeeStructure(null);
          setPromotedFeeStandard(0);
          setPromotedFeeOffered(0);
          toast.error('Could not load fee structure for this class.');
        }
      } finally {
        if (!cancelled) setPromotedFeeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    student?.needs_promoted_class_fee_setup,
    student?.class_section,
    student?.branch,
    student?.academic_year,
  ]);

  useEffect(() => {
    if (!showWithdrawModal) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/tenants/branches/?for_transfer=true');
        const raw = res.data?.data ?? res.data?.results ?? res.data;
        const list = Array.isArray(raw) ? raw : [];
        if (!cancelled) setTenantBranches(list);
      } catch {
        if (!cancelled) setTenantBranches([]);
      }
    })();
    return () => { cancelled = true; };
  }, [showWithdrawModal]);


  const handleConfirmPromotedYearFees = async () => {
    if (!promotedFeeStructure) {
      toast.error('No fee structure for this class. Configure it under Setup first.');
      return;
    }
    const offered = Number(promotedFeeOffered);
    if (Number.isNaN(offered) || offered < 0) {
      toast.error('Enter a valid confirmed fee amount.');
      return;
    }
    setPromotedFeeSaving(true);
    try {
      await api.post(`/students/${id}/setup-promoted-year-fees/`, {
        offered_total: offered,
        standard_total: promotedFeeStandard > 0 ? promotedFeeStandard : undefined,
        reason: promotedFeeReason.trim() || 'Promoted class — confirmed academic fee',
      });
      toast.success(
        offered < promotedFeeStandard && promotedFeeStandard > 0
          ? 'Fee saved. A discount approval may be pending for zonal or super admin review.'
          : 'Academic fee confirmed for this year.'
      );
      refetch();
    } catch (err: any) {
      const d = err.response?.data;
      let msg = 'Could not save fees.';
      if (typeof d?.detail === 'string') {
        msg = d.detail;
      } else if (Array.isArray(d?.detail) && d.detail.length > 0) {
        msg = String(d.detail[0]);
      } else if (typeof d?.error === 'string') {
        msg = d.error;
      } else if (d && typeof d === 'object') {
        // Flatten all field-level errors from DRF
        const parts = Object.entries(d)
          .map(([, v]) => (Array.isArray(v) ? v.join(', ') : String(v)))
          .filter(Boolean);
        if (parts.length > 0) msg = parts.join(' | ');
      }
      toast.error(msg);
    } finally {
      setPromotedFeeSaving(false);
    }
  };

  const completedPayments = (student?.payments || []).filter((p: any) => p.status === 'COMPLETED');
  const refundedPayments = (student?.payments || []).filter((p: any) => p.status === 'REFUNDED');
  const completedAmount = completedPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const refundedAmount = refundedPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const admissionInvoices = (student?.invoices || []).filter((inv: any) => String(inv?.invoice_number || '').startsWith('ADM-'));
  const fixedDepositInvoices = (student?.invoices || []).filter((inv: any) => String(inv?.invoice_number || '').startsWith('FDP-'));
  const admissionPaidTotal = admissionInvoices.reduce((sum: number, inv: any) => sum + Number(inv.paid_amount || 0), 0);
  const fixedDepositPaidTotal = fixedDepositInvoices.reduce((sum: number, inv: any) => sum + Number(inv.paid_amount || 0), 0);
  const admissionOutstandingTotal = admissionInvoices.reduce((sum: number, inv: any) => sum + Number(inv.outstanding_amount || 0), 0);
  const fixedDepositOutstandingTotal = fixedDepositInvoices.reduce((sum: number, inv: any) => sum + Number(inv.outstanding_amount || 0), 0);
  const specialFeeInvoices = (student?.invoices || []).filter((inv: any) => String(inv?.invoice_number || '').startsWith('SPF-'));
  const specialFeePaidTotal = specialFeeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.paid_amount || 0), 0);
  const specialFeeOutstandingTotal = specialFeeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.outstanding_amount || 0), 0);
  const specialFeeNetTotal = specialFeeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.net_amount || 0), 0);
  const admissionPartiallyPaid = admissionPaidTotal > 0 && admissionOutstandingTotal > 0;
  const fixedDepositPartiallyPaid = fixedDepositPaidTotal > 0 && fixedDepositOutstandingTotal > 0;
  const specialFeePartiallyPaid = specialFeePaidTotal > 0 && specialFeeOutstandingTotal > 0;
  const specialFeeFullyPaid = specialFeeInvoices.length > 0 && specialFeeOutstandingTotal <= 0;
  const specialFeeStatusLabel = specialFeeFullyPaid ? 'Paid' : specialFeePartiallyPaid ? 'Partial' : 'Not Paid';
  const admissionMarkedEarlier = !!student?.admission_fee_marked_paid_earlier;
  const fixedDepositMarkedEarlier = !!student?.fixed_deposit_marked_paid_earlier;
  const admissionPaid = (admissionInvoices.length > 0 && admissionOutstandingTotal <= 0) || admissionMarkedEarlier;
  const fixedDepositPaid = (fixedDepositInvoices.length > 0 && fixedDepositOutstandingTotal <= 0) || fixedDepositMarkedEarlier;
  const transferNote = String(student?.leaving_reason || '');
  const hasTransferTrail = transferNote.toLowerCase().startsWith('transferred from ');
  const requiresInitialPayment = !!student?.requires_initial_payment && !student?.is_csv_imported;
  const canManageInitialPaymentStatus = user?.role === 'ACCOUNTANT' || user?.role === 'SUPER_ADMIN';
  const canManageStatus = ['ACCOUNTANT', 'BRANCH_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  const admInvoiceIds = admissionInvoices.map((i: any) => i.id);
  const cautionInvoiceIds = fixedDepositInvoices.map((i: any) => i.id);
  const specialInvoiceIds = specialFeeInvoices.map((i: any) => i.id);
  const transportInvoiceIds = (student?.invoices || []).filter((inv: any) => String(inv?.invoice_number || '').startsWith('TRN-')).map((i: any) => i.id);

  const admPaymentTarget = completedPayments.find((p: any) => admInvoiceIds.includes(p.invoice || p.invoice_id));
  const cautionPaymentTarget = completedPayments.find((p: any) => cautionInvoiceIds.includes(p.invoice || p.invoice_id));
  const specialPaymentTarget = completedPayments.find((p: any) => specialInvoiceIds.includes(p.invoice || p.invoice_id));
  const transportPaymentTarget = completedPayments.find((p: any) => transportInvoiceIds.includes(p.invoice || p.invoice_id));

  if (loading && !student) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-slate-400 font-medium animate-pulse uppercase tracking-widest text-xs">Loading Profile...</p>
    </div>
  );

  if (error) return (
    <div className="bg-red-50 p-8 rounded-3xl border border-red-100 max-w-2xl mx-auto mt-20 text-center space-y-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
        <AlertCircle size={32} />
      </div>
      <h3 className="text-xl font-black text-red-900">Failed to load student profile</h3>
      <p className="text-red-700 font-medium">{error || 'The student may have been deleted or you lack permission.'}</p>
      <button onClick={() => router.back()} className="bg-red-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-red-700 transition-all">
        Go Back
      </button>
    </div>
  );

  const handleUpdate = async (formData: any) => {
    try {
      // Clean up fields that shouldn't be sent back to the backend
      const cleanData = { ...formData };
      delete cleanData.class_section_display;
      delete cleanData.branch_name;
      delete cleanData.id;
      delete cleanData.created_at;
      delete cleanData.updated_at;
      delete cleanData.proposed_fee;

      await api.patch(`/students/${id}/`, cleanData);
      setShowEditForm(false);
      refetch();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const errors = err.response?.data;
      let msg = 'Error updating student';
      if (detail) msg = detail;
      else if (errors && typeof errors === 'object') {
        msg = Object.entries(errors).map(([f, m]) => `${f}: ${m}`).join('\n');
      }
      toast.error(msg);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawData.leaving_reason) {
      toast.error("Please provide transfer reason.");
      return;
    }
    if (!withdrawData.target_branch_id) {
      toast.error("Please select target branch.");
      return;
    }
    setWithdrawing(true);
    try {
      await api.patch(`/students/${id}/status/`, {
        status: 'TRANSFERRED',
        ...withdrawData
      });
      toast.success('Student transferred successfully.');
      setShowWithdrawModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error processing transfer');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDropout = async () => {
    if (!dropoutData.reason || dropoutData.reason.length < 5) {
      toast.error('Please provide a reason (at least 5 characters).');
      return;
    }
    setDroppingOut(true);
    try {
      await api.post(`/student-lifecycle/${id}/dropout/`, dropoutData);
      toast.success('Student marked as dropout.');
      setShowDropoutModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to mark dropout.');
    } finally { setDroppingOut(false); }
  };

  const handleOpenInvoicePayment = (inv: any) => {
    if (requiresInitialPayment) {
      toast.error('Initial admission + academic payment is pending. Please complete it first.');
      push(`/students/${id}/pay-admission`);
      return;
    }
    setSelectedInvoice({
      id: inv.id,
      invoice_number: inv.invoice_number,
      outstanding_amount: inv.outstanding_amount,
      student_name: `${student.first_name} ${student.last_name}`
    });
    setShowPaymentModal(true);
  };

  const handleOpenCarryForwardPayment = (cf: any) => {
    setSelectedInvoice({
      id: cf.id,
      invoice_number: `CF-${cf.source_year_name}`,
      outstanding_amount: Number(cf.remaining_amount),
      student_name: `${student.first_name} ${student.last_name}`,
      is_carry_forward: true,
      student_id: student.id,
    });
    setShowPaymentModal(true);
  };

  const handleReinstate = async () => {
    const reason = prompt('Reason for reinstating this student:');
    if (!reason) return;
    setReinstating(true);
    try {
      await api.post(`/student-lifecycle/${id}/reinstate/`, { reason });
      toast.success('Student reinstated successfully.');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reinstate.');
    } finally { setReinstating(false); }
  };

  const handleToggleActiveStatus = (newStatus: 'ACTIVE' | 'INACTIVE') => {
    if (newStatus === 'INACTIVE') {
      // Open the reason-capture modal instead of a bare confirm
      setInactiveReason('');
      setShowInactiveReasonModal(true);
    } else {
      // ACTIVE — just confirm and submit
      if (!confirm('Are you sure you want to re-activate this student?')) return;
      api.patch(`/students/${id}/status/`, { status: 'ACTIVE' })
        .then(() => { toast.success('Student re-activated successfully.'); refetch(); })
        .catch((err: any) => toast.error(err.response?.data?.detail || 'Failed to re-activate student.'));
    }
  };

  const handleConfirmInactive = async () => {
    if (!inactiveReason.trim()) {
      toast.error('Please enter a reason for marking the student inactive.');
      return;
    }
    setMarkingInactive(true);
    try {
      await api.patch(`/students/${id}/status/`, { status: 'INACTIVE', leaving_reason: inactiveReason.trim() });
      toast.success('Student marked as INACTIVE successfully.');
      setShowInactiveReasonModal(false);
      setInactiveReason('');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to mark student as INACTIVE.');
    } finally {
      setMarkingInactive(false);
    }
  };

  const updateInitialPaymentStatus = async (
    target: 'ADMISSION_FEE' | 'FIXED_DEPOSIT',
    paidEarlier: boolean
  ) => {
    if (!canManageInitialPaymentStatus) return;
    setMarkingInitialStatus(target);
    try {
      await api.post(`/students/${id}/mark-initial-payment-status/`, {
        target,
        paid_earlier: paidEarlier,
      });
      toast.success(
        paidEarlier
          ? `${target === 'ADMISSION_FEE' ? 'Admission fee' : 'Caution fee'} marked as collected earlier.`
          : `${target === 'ADMISSION_FEE' ? 'Admission fee' : 'Caution fee'} mark removed.`
      );
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update payment status.');
    } finally {
      setMarkingInitialStatus(null);
      setConfirmInitialStatusChange(null);
    }
  };

  const downloadReceipt = async (paymentId: string, receiptNumber: string) => {
    try {
      const response = await api.get(`/templates/generate/receipt/${paymentId}/`, {
        responseType: 'blob'
      });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt_${receiptNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      const text = await err.response?.data?.text?.();
      try {
        const json = JSON.parse(text || '{}');
        toast.error(json.error || 'Failed to download receipt');
      } catch {
        toast.error('No receipt template configured. Set a default FEE_RECEIPT template first.');
      }
    }
  };

  const generateTransportInvoice = async () => {
    try {
      await api.post('/fees/invoices/generate-transport/', {
        academic_year_id: student.academic_year,
        month: new Date().toISOString().slice(0, 7),
        student_id: student.id
      });
      refetch();
      toast.success('Transport invoice generated!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to generate transport invoice');
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'academic', label: 'Academic', icon: GraduationCap },
    { id: 'history', label: 'Year History', icon: History },
    { id: 'parents', label: 'Parents', icon: Shield },
    { id: 'address', label: 'Address & Contact', icon: MapPin },
    { id: 'fees', label: 'Fees & Finance', icon: CreditCard },
  ];

  const InfoTag = ({ label, value, icon: Icon }: any) => (
    <div className="flex items-center gap-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 shadow-sm border border-slate-50">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
        <p className="text-sm font-bold text-slate-900 truncate">{value || '-'}</p>
      </div>
    </div>
  );

  const SectionHeader = ({ title, icon: Icon }: any) => (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
        <Icon size={20} />
      </div>
      <h4 className="text-lg font-black text-slate-900 tracking-tight">{title}</h4>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Card */}
      <div className="esms-card p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8">
           <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest ${
             student.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100' :
             student.status === 'PENDING_APPROVAL' ? 'bg-blue-50 text-blue-700 shadow-sm shadow-blue-100' :
             student.status === 'DROPOUT' ? 'bg-red-50 text-red-600 shadow-sm shadow-red-100' :
             student.status === 'TRANSFERRED' ? 'bg-purple-50 text-purple-600 shadow-sm shadow-purple-100' :
             'bg-slate-100 text-slate-600 shadow-sm'
           }`}>
             <span className={`w-2 h-2 rounded-full animate-pulse ${
               student.status === 'ACTIVE' ? 'bg-emerald-500' :
               student.status === 'PENDING_APPROVAL' ? 'bg-blue-500' :
               student.status === 'DROPOUT' ? 'bg-red-500' :
               'bg-slate-400'
             }`} />
             {student.status.replace('_', ' ')}
           </span>
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
          <div className="w-32 h-32 bg-slate-100 rounded-[2rem] flex items-center justify-center border-4 border-white shadow-xl relative group">
            {student.photo_url ? (
              <img src={student.photo_url} className="w-full h-full object-cover rounded-[1.8rem]" alt="Student" />
            ) : (
              <User size={64} className="text-slate-300" />
            )}
            <div className="absolute -bottom-2 -right-2 bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200">
              <Camera size={14} />
            </div>
          </div>

          <div className="flex-1 space-y-2">
            <button onClick={() => router.back()} className="flex items-center gap-1 text-xs font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest mb-2">
              <ChevronLeft size={14} /> Back to List
            </button>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
              {student.first_name} {student.last_name}
            </h1>
            <div className="flex flex-wrap items-center gap-4">

            {student.status === 'PENDING_APPROVAL' && completedAmount > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <AlertCircle size={14} /> Payment collected: ₹{completedAmount.toLocaleString('en-IN')} — awaiting fee concession approval.
              </div>
            )}
            {student.status === 'INACTIVE' && refundedAmount > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                <AlertCircle size={14} /> Approval rejected: refund tagged ₹{refundedAmount.toLocaleString('en-IN')} (removed from collections).
              </div>
            )}

              <div className="flex items-center gap-2 text-sm font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">
                <Hash size={14} /> {student.admission_number}
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">
                <Building2 size={14} /> {student.branch_name}
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">
                <GraduationCap size={14} /> {student.class_section_display || 'Not Assigned'}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => setShowEditForm(true)}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl text-sm font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 uppercase tracking-widest"
            >
              <Edit2 size={16} /> Edit Profile
            </button>
            {student.status === 'ACTIVE' && (
              <>
                <button 
                  onClick={() => setShowDropoutModal(true)}
                  className="flex items-center gap-2 bg-white text-amber-600 px-5 py-3.5 rounded-2xl text-sm font-black border-2 border-amber-50 hover:bg-amber-50 transition-all shadow-lg shadow-amber-100 uppercase tracking-widest"
                >
                  <UserMinus size={16} /> Dropout
                </button>
                <button 
                  onClick={() => setShowWithdrawModal(true)}
                  className="flex items-center gap-2 bg-white text-rose-600 px-5 py-3.5 rounded-2xl text-sm font-black border-2 border-rose-50 hover:bg-rose-50 transition-all shadow-lg shadow-rose-100 uppercase tracking-widest"
                >
                  <LogOut size={16} /> Transferred
                </button>
                {canManageStatus && (
                  <button 
                    onClick={() => handleToggleActiveStatus('INACTIVE')}
                    className="flex items-center gap-2 bg-white text-slate-600 px-5 py-3.5 rounded-2xl text-sm font-black border-2 border-slate-200 hover:bg-slate-50 transition-all shadow-lg uppercase tracking-widest"
                  >
                    <UserMinus size={16} /> Mark Inactive
                  </button>
                )}
              </>
            )}
            {student.status === 'INACTIVE' && canManageStatus && (
              <button 
                onClick={() => handleToggleActiveStatus('ACTIVE')}
                className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 uppercase tracking-widest"
              >
                <UserPlus size={16} /> Mark Active
              </button>
            )}
            {student.status === 'DROPOUT' && (
              <button
                onClick={handleReinstate}
                disabled={reinstating}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3.5 rounded-2xl text-sm font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 uppercase tracking-widest"
              >
                {reinstating ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                Reinstate
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Tabs */}
        <div className="lg:col-span-1 space-y-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all duration-300 relative group ${
                activeTab === tab.id 
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-200 translate-x-2' 
                  : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200'
              }`}
            >
              <tab.icon size={22} className={activeTab === tab.id ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'} />
              <span className="font-black uppercase tracking-widest text-xs">{tab.label}</span>
              {activeTab === tab.id && (
                <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-600 rotate-45" />
              )}
            </button>
          ))}
        </div>

        {/* Content Pane */}
        <div className="lg:col-span-3 esms-card p-8 min-h-[500px]">
          {activeTab === 'overview' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
              {hasTransferTrail && (
                <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 flex gap-4">
                  <div className="text-indigo-500 mt-1"><ArrowRightLeft size={24} /></div>
                  <div>
                    <h5 className="font-black text-indigo-900 mb-1">Branch Transfer History</h5>
                    <p className="text-sm text-indigo-800 font-medium leading-relaxed">{transferNote}</p>
                    {student?.leaving_date && (
                      <p className="text-xs text-indigo-700 mt-2 font-bold uppercase tracking-widest">
                        Transfer date: {student.leaving_date}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <SectionHeader title="Personal Details" icon={User} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <InfoTag label="Date of Birth" value={student.date_of_birth} icon={Calendar} />
                  <InfoTag label="Gender" value={student.gender} icon={Activity} />
                  <InfoTag label="Blood Group" value={student.blood_group} icon={Activity} />
                  <InfoTag label="Nationality" value={student.nationality} icon={Shield} />
                  <InfoTag label="Religion" value={student.religion} icon={Shield} />
                  <InfoTag label="Caste Category" value={student.caste_category} icon={Shield} />
                  <InfoTag label="Aadhaar Number" value={student.aadhar_number} icon={Hash} />
                  <InfoTag label="Mother Tongue" value={student.mother_tongue} icon={BookOpen} />
                </div>
              </div>

              {student.health_status && (
                <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 flex gap-4">
                  <div className="text-rose-500 mt-1"><Activity size={24} /></div>
                  <div>
                    <h5 className="font-black text-rose-900 mb-1">Health & Medical Info</h5>
                    <p className="text-sm text-rose-700 font-medium leading-relaxed">{student.health_status}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'academic' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                      <GraduationCap size={20} />
                    </div>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight">Current Enrollment</h4>
                  </div>
                  {user?.role && ['SUPER_ADMIN', 'OWNER'].includes(user.role) && (
                    <button
                      type="button"
                      onClick={() => setShowEditClassFees(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100/60 rounded-2xl text-xs font-black transition-all hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest shadow-sm shadow-blue-100/50"
                    >
                      <Edit2 size={14} className="text-blue-600" />
                      Edit Class & Fees
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoTag label="Academic Year" value={student.academic_year_name} icon={Calendar} />
                  <InfoTag label="Class & Section" value={student.class_section_display} icon={GraduationCap} />
                  <InfoTag label="Roll Number" value={student.roll_number} icon={Hash} />
                  <InfoTag label="Enrollment Date" value={student.enrollment_date} icon={Clock} />
                </div>
              </div>

              <div>
                <SectionHeader title="Previous Education" icon={BookOpen} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoTag label="Previous School" value={student.previous_school_name} icon={Building2} />
                  <InfoTag label="Previous Class" value={student.previous_class} icon={GraduationCap} />
                  <InfoTag label="Previous Academic Year" value={student.previous_school_ay} icon={Calendar} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <SectionHeader title="Academic Year History" icon={History} />
              <p className="text-sm text-slate-400 -mt-4">Complete track record of this student's enrollment across academic years.</p>

              {hasTransferTrail && (
                <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 flex items-start gap-3">
                  <ArrowRightLeft className="text-indigo-500 mt-0.5" size={18} />
                  <div>
                    <p className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-1">Branch transfer trail</p>
                    <p className="text-sm font-semibold text-indigo-900">{transferNote}</p>
                  </div>
                </div>
              )}

              {recordsLoading ? (
                <div className="p-12 text-center">
                  <Loader2 className="mx-auto animate-spin text-blue-500" size={24} />
                </div>
              ) : !academicRecords?.length ? (
                <div className="p-12 bg-slate-50 rounded-3xl text-center border border-dashed border-slate-200">
                  <History className="mx-auto text-slate-300 mb-3" size={32} />
                  <p className="font-bold text-slate-900">No Records Yet</p>
                  <p className="text-slate-400 text-sm">Academic records will appear after promotion or year transition.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {academicRecords.map((record: any, index: number) => {
                    const statusStyles: Record<string, string> = {
                      ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      PROMOTED: 'bg-blue-50 text-blue-700 border-blue-200',
                      DETAINED: 'bg-amber-50 text-amber-700 border-amber-200',
                      GRADUATED: 'bg-purple-50 text-purple-700 border-purple-200',
                      DROPOUT: 'bg-red-50 text-red-600 border-red-200',
                      TRANSFERRED: 'bg-slate-50 text-slate-600 border-slate-200',
                    };
                    const style = statusStyles[record.status] || 'bg-slate-50 text-slate-600 border-slate-200';
                    const isLatest = index === 0;
                    
                    return (
                      <div key={record.id} className={`bg-white rounded-2xl border-2 p-6 shadow-sm transition-all hover:shadow-md ${isLatest ? 'border-blue-200 ring-2 ring-blue-50' : 'border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            {isLatest && (
                              <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black uppercase rounded-md tracking-wider">Current</span>
                            )}
                            <h4 className="font-black text-lg text-slate-900">{record.academic_year_name}</h4>
                          </div>
                          <span className="inline-flex items-center px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                            <CheckCircle2 size={12} className="mr-1" />
                            Paid
                          </span>
                        </div>
                        {transportPaymentTarget && isSuperAdmin && (
                          <div className="mt-2 flex items-center justify-end">
                            <button
                              onClick={() => {
                                setReverseReason('');
                                setReversePaymentTarget({ id: transportPaymentTarget.id, receipt: transportPaymentTarget.receipt_number, amount: Number(transportPaymentTarget.amount) });
                              }}
                              className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:text-rose-700 flex items-center gap-1"
                            >
                              <RotateCcw size={10} />
                              Reverse
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class & Section</p>
                            <p className="text-sm font-black text-slate-900 mt-0.5">{record.class_section_display || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Roll Number</p>
                            <p className="text-sm font-black text-slate-900 mt-0.5">{record.roll_number || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recorded On</p>
                            <p className="text-sm font-bold text-slate-500 mt-0.5">{new Date(record.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric'})}</p>
                          </div>
                          {record.status_reason && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reason</p>
                              <p className="text-sm text-slate-600 mt-0.5 italic">{record.status_reason}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'parents' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-right-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <h4 className="text-xs font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" /> Father's Information
                  </h4>
                  <div className="space-y-3">
                    <InfoTag label="Full Name" value={student.father_name} icon={User} />
                    <InfoTag label="Phone Number" value={student.father_phone} icon={Phone} />
                    <InfoTag label="Email" value={student.father_email} icon={Mail} />
                    <InfoTag label="Occupation" value={student.father_occupation} icon={Building2} />
                    <InfoTag label="Education" value={student.father_qualification} icon={GraduationCap} />
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-xs font-black text-pink-600 uppercase tracking-[0.2em] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-pink-600 rounded-full" /> Mother's Information
                  </h4>
                  <div className="space-y-3">
                    <InfoTag label="Full Name" value={student.mother_name} icon={User} />
                    <InfoTag label="Phone Number" value={student.mother_phone} icon={Phone} />
                    <InfoTag label="Email" value={student.mother_email} icon={Mail} />
                    <InfoTag label="Occupation" value={student.mother_occupation} icon={Building2} />
                    <InfoTag label="Education" value={student.mother_qualification} icon={GraduationCap} />
                  </div>
                </div>
              </div>

              {student.guardian_name && (
                <div className="pt-8 border-t border-slate-50">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Guardian Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <InfoTag label="Guardian Name" value={student.guardian_name} icon={User} />
                    <InfoTag label="Relation" value={student.guardian_relation} icon={Shield} />
                    <InfoTag label="Phone" value={student.guardian_phone} icon={Phone} />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'address' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
              <div>
                <SectionHeader title="Residential Address" icon={MapPin} />
                <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 relative group overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <MapPin size={120} />
                  </div>
                  <p className="text-xl font-bold text-slate-800 leading-relaxed mb-6">
                    {student.address_line1}, {student.apartment_name && `${student.apartment_name}, `}
                    {student.address_line2}, {student.landmark && `Near ${student.landmark}, `}
                    {student.city}, {student.mandal && `${student.mandal}, `}
                    {student.district}, {student.state} - {student.pincode}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/50 p-4 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Pincode</p>
                      <p className="text-sm font-black text-slate-900">{student.pincode}</p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">City</p>
                      <p className="text-sm font-black text-slate-900">{student.city}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader title="Emergency Contact" icon={Phone} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InfoTag label="Contact Person" value={student.emergency_contact_name} icon={User} />
                  <InfoTag label="Relation" value={student.emergency_contact_relation} icon={Shield} />
                  <InfoTag label="Phone Number" value={student.emergency_contact_phone} icon={Phone} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fees' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
              {student.needs_promoted_class_fee_setup && (
                <div className="rounded-[2rem] border-2 border-amber-200 bg-amber-50/80 p-6 md:p-8 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={22} />
                    <div>
                      <h4 className="text-sm font-black text-amber-900 uppercase tracking-wider">
                        Set fee for class
                      </h4>
                      <p className="text-sm text-amber-800/90 mt-1">
                        This student is enrolled in <strong>{student.class_section_display || 'their new class'}</strong> for{' '}
                        <strong>{student.academic_year_name}</strong> (either via promotion or import). Confirm the annual academic fee the same way as a new admission
                        (no admission fee). Outstanding carry-forwards and old dues are unchanged.
                      </p>
                      <p className="text-xs text-amber-700/80 mt-2">
                        If the confirmed fee is below the class structure total, an approval is routed: up to ₹2,000 discount to
                        zonal admin (when the branch has a zone), above that to tenant super admin.
                      </p>
                    </div>
                  </div>
                  {!canConfirmPromotedFees ? (
                    <p className="text-xs font-bold text-amber-800">Ask an accountant or branch admin to confirm fees.</p>
                  ) : promotedFeeLoading ? (
                    <div className="flex items-center gap-2 text-amber-800 text-sm">
                      <Loader2 size={18} className="animate-spin" /> Loading class fee structure…
                    </div>
                  ) : !promotedFeeStructure ? (
                    <p className="text-sm font-bold text-amber-900">
                      No active fee structure for this grade and year. Add it under School Setup → Class &amp; Fees.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="text-[10px] font-black text-amber-800/70 uppercase tracking-widest block mb-1">
                          Standard (from setup)
                        </label>
                        <input
                          type="number"
                          readOnly
                          className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800"
                          value={promotedFeeStandard || ''}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-amber-800/70 uppercase tracking-widest block mb-1">
                          Confirmed fee (annual)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 outline-none"
                          value={promotedFeeOffered}
                          onChange={e => setPromotedFeeOffered(Number(e.target.value))}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-amber-800/70 uppercase tracking-widest block mb-1">
                          Note / reason (optional)
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-amber-400 outline-none"
                          value={promotedFeeReason}
                          onChange={e => setPromotedFeeReason(e.target.value)}
                          placeholder="e.g. Sibling discount discussed with principal"
                        />
                      </div>
                      <div className="md:col-span-2 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={handleConfirmPromotedYearFees}
                          disabled={promotedFeeSaving}
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-600 text-white text-xs font-black uppercase tracking-widest hover:bg-amber-700 disabled:opacity-50 shadow-lg"
                        >
                          {promotedFeeSaving ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                          Confirm academic fee
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Fee Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                    <CreditCard size={80} />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Fee</p>
                  <h3 className="text-4xl font-black italic">₹{student.fee_stats?.total_fee?.toLocaleString('en-IN')}</h3>
                  <p className="text-[10px] font-bold text-slate-500 mt-4 flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-emerald-500" /> Locked for {student.academic_year_name}
                  </p>
                </div>

                <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-emerald-600">
                    <CheckCircle2 size={80} />
                  </div>
                  <p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-[0.2em] mb-2">Fees Paid</p>
                  <h3 className="text-4xl font-black text-emerald-700">₹{student.fee_stats?.total_paid?.toLocaleString('en-IN')}</h3>
                  <p className="text-[10px] font-bold text-emerald-600/60 mt-4 uppercase tracking-widest">Total Collected</p>
                </div>

                <div className="bg-amber-50 p-8 rounded-[2.5rem] border border-amber-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-amber-600">
                    <Clock size={80} />
                  </div>
                  <p className="text-[10px] font-black text-amber-600/50 uppercase tracking-[0.2em] mb-2">Balance Left</p>
                  <h3 className="text-4xl font-black text-amber-700">₹{student.fee_stats?.balance?.toLocaleString('en-IN')}</h3>
                  <p className="text-[10px] font-bold text-amber-600/60 mt-4 uppercase tracking-widest text-destructive">Outstanding Dues</p>
                </div>
              </div>

              <div className="bg-slate-50/60 border border-slate-100 rounded-[2rem] p-6 md:p-7">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-5">Initial Payment Status</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-100 p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Admission Fee</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        admissionPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {admissionPaid ? 'Paid' : 'Not Paid'}
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        ₹{admissionPaidTotal.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {admissionMarkedEarlier && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Marked as collected earlier</p>
                        {isSuperAdmin && (
                          <button
                            onClick={() => setConfirmInitialStatusChange({ target: 'ADMISSION_FEE', paidEarlier: false })}
                            disabled={markingInitialStatus === 'ADMISSION_FEE'}
                            className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:text-rose-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <RotateCcw size={10} />
                            Reverse
                          </button>
                        )}
                      </div>
                    )}
                    {!admissionMarkedEarlier && admPaymentTarget && isSuperAdmin && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receipt {admPaymentTarget.receipt_number}</p>
                        <button
                          onClick={() => {
                            setReverseReason('');
                            setReversePaymentTarget({ id: admPaymentTarget.id, receipt: admPaymentTarget.receipt_number, amount: Number(admPaymentTarget.amount) });
                          }}
                          className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:text-rose-700 flex items-center gap-1"
                        >
                          <RotateCcw size={10} />
                          Reverse
                        </button>
                      </div>
                    )}
                    {canManageInitialPaymentStatus && !admissionPaid && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => push(`/students/${id}/pay-admission`)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest"
                        >
                          {admissionPartiallyPaid ? 'Extra Payment' : 'Pay now'}
                        </button>
                        <button
                          onClick={() => setConfirmInitialStatusChange({ target: 'ADMISSION_FEE', paidEarlier: true })}
                          disabled={markingInitialStatus === 'ADMISSION_FEE'}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          {markingInitialStatus === 'ADMISSION_FEE' ? 'Saving...' : 'Mark old paid'}
                        </button>
                      </div>
                    )}
                    {confirmInitialStatusChange?.target === 'ADMISSION_FEE' && (
                      <div className="mt-3 p-2 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">
                          {confirmInitialStatusChange.paidEarlier ? 'Confirm mark old paid?' : 'Confirm remove old-paid mark?'}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setConfirmInitialStatusChange(null)}
                            className="px-2 py-1 rounded-lg bg-white text-slate-600 text-[10px] font-black uppercase tracking-widest border border-slate-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => updateInitialPaymentStatus('ADMISSION_FEE', confirmInitialStatusChange.paidEarlier)}
                            disabled={markingInitialStatus === 'ADMISSION_FEE'}
                            className="px-2 py-1 rounded-lg bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            {markingInitialStatus === 'ADMISSION_FEE' ? 'Saving...' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Caution Fee</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        fixedDepositPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {fixedDepositPaid ? 'Paid' : 'Not Paid'}
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        ₹{fixedDepositPaidTotal.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {fixedDepositMarkedEarlier && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Marked as collected earlier</p>
                        {isSuperAdmin && (
                          <button
                            onClick={() => setConfirmInitialStatusChange({ target: 'FIXED_DEPOSIT', paidEarlier: false })}
                            disabled={markingInitialStatus === 'FIXED_DEPOSIT'}
                            className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:text-rose-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <RotateCcw size={10} />
                            Reverse
                          </button>
                        )}
                      </div>
                    )}
                    {!fixedDepositMarkedEarlier && cautionPaymentTarget && isSuperAdmin && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receipt {cautionPaymentTarget.receipt_number}</p>
                        <button
                          onClick={() => {
                            setReverseReason('');
                            setReversePaymentTarget({ id: cautionPaymentTarget.id, receipt: cautionPaymentTarget.receipt_number, amount: Number(cautionPaymentTarget.amount) });
                          }}
                          className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:text-rose-700 flex items-center gap-1"
                        >
                          <RotateCcw size={10} />
                          Reverse
                        </button>
                      </div>
                    )}
                    {canManageInitialPaymentStatus && !fixedDepositPaid && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => push(`/students/${id}/pay-admission`)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest"
                        >
                          {fixedDepositPartiallyPaid ? 'Extra Payment' : 'Pay now'}
                        </button>
                        <button
                          onClick={() => setConfirmInitialStatusChange({ target: 'FIXED_DEPOSIT', paidEarlier: true })}
                          disabled={markingInitialStatus === 'FIXED_DEPOSIT'}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          {markingInitialStatus === 'FIXED_DEPOSIT' ? 'Saving...' : 'Mark old paid'}
                        </button>
                      </div>
                    )}
                    {confirmInitialStatusChange?.target === 'FIXED_DEPOSIT' && (
                      <div className="mt-3 p-2 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">
                          {confirmInitialStatusChange.paidEarlier ? 'Confirm mark old paid?' : 'Confirm remove old-paid mark?'}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setConfirmInitialStatusChange(null)}
                            className="px-2 py-1 rounded-lg bg-white text-slate-600 text-[10px] font-black uppercase tracking-widest border border-slate-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => updateInitialPaymentStatus('FIXED_DEPOSIT', confirmInitialStatusChange.paidEarlier)}
                            disabled={markingInitialStatus === 'FIXED_DEPOSIT'}
                            className="px-2 py-1 rounded-lg bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            {markingInitialStatus === 'FIXED_DEPOSIT' ? 'Saving...' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Special Fee</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        specialFeeFullyPaid
                          ? 'bg-emerald-50 text-emerald-700'
                          : specialFeePartiallyPaid
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {specialFeeStatusLabel}
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        ₹{specialFeePaidTotal.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {specialFeeNetTotal > 0 && (
                      <p className="mt-2 text-[10px] font-semibold text-slate-500">
                        Invoice total ₹{specialFeeNetTotal.toLocaleString('en-IN')}
                        {specialFeeOutstandingTotal > 0 ? (
                          <span className="text-amber-700">
                            {' '}· Balance ₹{specialFeeOutstandingTotal.toLocaleString('en-IN')}
                          </span>
                        ) : null}
                      </p>
                    )}
                    {specialPaymentTarget && isSuperAdmin && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receipt {specialPaymentTarget.receipt_number}</p>
                        <button
                          onClick={() => {
                            setReverseReason('');
                            setReversePaymentTarget({ id: specialPaymentTarget.id, receipt: specialPaymentTarget.receipt_number, amount: Number(specialPaymentTarget.amount) });
                          }}
                          className="text-[10px] font-black text-rose-600 uppercase tracking-widest hover:text-rose-700 flex items-center gap-1"
                        >
                          <RotateCcw size={10} />
                          Reverse
                        </button>
                      </div>
                    )}
                    {canManageInitialPaymentStatus && !specialFeeFullyPaid && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => push(`/students/${id}/pay-admission`)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest"
                        >
                          {specialFeePartiallyPaid ? 'Extra payment' : 'Pay now'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Concession Requests Section */}
              {(concessionRequests.length > 0 || isAccountantOrAbove) && student?.status === 'ACTIVE' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionHeader title="Concession Requests" icon={FileText} />
                    {isAccountantOrAbove && (
                      <button
                        type="button"
                        onClick={() => setShowConcessionModal(true)}
                        disabled={concessionRequests.some((r: any) => r.status === 'PENDING')}
                        title={concessionRequests.some((r: any) => r.status === 'PENDING') ? 'A pending request already exists. Wait for it to be resolved.' : 'Request a fee concession for this student'}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-100"
                      >
                        <Plus size={13} /> Request Concession
                      </button>
                    )}
                  </div>

                  {concessionRequests.length === 0 ? (
                    <div className="bg-slate-50/60 border border-dashed border-slate-200 rounded-[2rem] p-8 text-center">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No concession requests raised yet</p>
                      <p className="text-xs text-slate-400 mt-1">Click &ldquo;Request Concession&rdquo; above to raise a post-enrollment fee concession.</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Locked Fee</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proposed Fee</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Discount</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Routed To</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {concessionRequests.map((req: any) => (
                            <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-4">
                                <p className="text-xs font-bold text-slate-700">
                                  {new Date(req.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                                {req.reason && (
                                  <p className="text-[10px] text-slate-400 mt-0.5 max-w-[140px] truncate" title={req.reason}>{req.reason}</p>
                                )}
                              </td>
                              <td className="px-5 py-4">
                                <p className="text-xs font-black text-slate-800">₹{Number(req.standard_total).toLocaleString('en-IN')}</p>
                              </td>
                              <td className="px-5 py-4">
                                <p className="text-xs font-black text-violet-700">₹{Number(req.offered_total).toLocaleString('en-IN')}</p>
                              </td>
                              <td className="px-5 py-4">
                                <p className="text-xs font-black text-emerald-700">₹{Number(req.reduction_amount).toLocaleString('en-IN')}</p>
                              </td>
                              <td className="px-5 py-4">
                                <span className="text-[10px] font-bold text-slate-500">
                                  {req.routing === 'ZONAL' ? 'Zonal Admin' : 'Super Admin'}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                  req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                  req.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                  'bg-amber-50 text-amber-700 border border-amber-100'
                                }`}>
                                  {req.status === 'APPROVED' ? <CheckCircle2 size={10} /> :
                                   req.status === 'REJECTED' ? <AlertCircle size={10} /> :
                                   <Clock size={10} />}
                                  {req.status}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <p className="text-[10px] text-slate-500 max-w-[160px] truncate" title={req.admin_remarks || '—'}>
                                  {req.admin_remarks || '—'}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Concession Request Modal */}
              {showConcessionModal && (
                <Modal isOpen={showConcessionModal} onClose={() => { setShowConcessionModal(false); setConcessionOffered(''); setConcessionReason(''); }}>
                  <div className="p-8 space-y-6 max-w-md w-full">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">Request Fee Concession</h3>
                      <p className="text-xs text-slate-500 mt-1">Enter the new proposed fee. If it is below the locked fee, it will be sent for admin approval.</p>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Locked Fee</p>
                        <p className="text-2xl font-black text-slate-900">₹{Number(student?.fee_stats?.total_fee || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">New Proposed Fee (₹)</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none transition"
                          placeholder="Enter new fee amount"
                          value={concessionOffered}
                          onChange={(e) => setConcessionOffered(e.target.value)}
                        />
                        {concessionOffered && Number(concessionOffered) > 0 && Number(student?.fee_stats?.total_fee || 0) > 0 && (
                          <p className={`text-xs font-bold mt-1.5 ${Number(concessionOffered) < Number(student?.fee_stats?.total_fee || 0) ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {Number(concessionOffered) < Number(student?.fee_stats?.total_fee || 0)
                              ? `Discount: ₹${(Number(student?.fee_stats?.total_fee || 0) - Number(concessionOffered)).toLocaleString('en-IN')} — will be sent for approval`
                              : 'Proposed fee must be less than the locked fee to raise a concession.'}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Reason / Note (optional)</label>
                        <input
                          type="text"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none transition"
                          placeholder="e.g. Sibling discount, financial hardship"
                          value={concessionReason}
                          onChange={(e) => setConcessionReason(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => { setShowConcessionModal(false); setConcessionOffered(''); setConcessionReason(''); }}
                        className="flex-1 px-6 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitConcession}
                        disabled={submittingConcession || !concessionOffered || Number(concessionOffered) <= 0}
                        className="flex-1 px-6 py-3 rounded-2xl bg-violet-600 text-white text-sm font-black uppercase tracking-widest hover:bg-violet-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-100"
                      >
                        {submittingConcession ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Submit Request'}
                      </button>
                    </div>
                  </div>
                </Modal>
              )}

              {/* Transactions Ledger */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <SectionHeader title="Fee Ledger" icon={ArrowRightLeft} />
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    <button className="px-4 py-2 bg-white rounded-xl text-[10px] font-black uppercase text-slate-800 shadow-sm">All Activity</button>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Credit (₹)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Debit (₹)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Receipt</th>
                        {isSuperAdmin && (
                          <th className="px-6 py-4 text-[10px] font-black text-rose-400 uppercase tracking-widest text-center">Admin</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {/* Combine and sort for ledger */}
                      {[
                        ...(student.invoices || []).map((inv: any) => ({ 
                          date: inv.created_at, 
                          desc: `Invoice: ${inv.invoice_number}`, 
                          debit: inv.net_amount, 
                          type: 'INVOICE',
                          status: inv.status
                        })),
                        ...(student.payments || []).map((pay: any) => ({ 
                          date: pay.payment_date, 
                          desc: `Payment: ${pay.payment_mode} (${pay.receipt_number})`, 
                          credit: pay.amount, 
                          type: 'PAYMENT',
                          status: pay.status,
                          paymentId: pay.id,
                          receiptNumber: pay.receipt_number,
                          paymentAmount: Number(pay.amount),
                        })),
                        ...(student.carry_forwards || []).map((cf: any) => ({
                          date: cf.created_at,
                          desc: `Carry Forward: Dues from ${cf.source_year_name}`,
                          debit: Number(cf.carry_forward_amount),
                          type: 'CARRY_FORWARD',
                          status: cf.status,
                        }))
                      ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item, i) => (
                        <React.Fragment key={i}>
                        <tr className="group hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-slate-900">{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-black text-slate-700">{item.desc}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {item.credit ? <p className="text-xs font-black text-emerald-600">+₹{item.credit.toLocaleString('en-IN')}</p> : '-'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {item.debit ? <p className="text-xs font-black text-rose-600">₹{item.debit.toLocaleString('en-IN')}</p> : '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                              item.status === 'PAID' || item.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 
                              item.status === 'PARTIALLY_PAID' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {item.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {item.type === 'PAYMENT' ? (
                              <button
                                onClick={() => downloadReceipt(item.paymentId, item.receiptNumber)}
                                title="Download PDF Receipt"
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-black uppercase tracking-widest transition-colors"
                              >
                                <Download size={11} />
                                PDF
                              </button>
                            ) : '—'}
                          </td>
                          {isSuperAdmin && (
                            <td className="px-6 py-4 text-center">
                              {item.type === 'PAYMENT' && ['COMPLETED', 'PAID', 'SUCCESS'].includes((item.status || '').toUpperCase()) ? (
                                <button
                                  onClick={() => {
                                    setReverseReason('');
                                    setReversePaymentTarget({ id: item.paymentId, receipt: item.receiptNumber, amount: item.paymentAmount });
                                  }}
                                  title="Reverse this payment"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest transition-colors"
                                >
                                  <RotateCcw size={11} />
                                  Reverse
                                </button>
                              ) : '—'}
                            </td>
                          )}
                        </tr>
                        {/* Inline reverse confirmation row */}
                        {isSuperAdmin && item.type === 'PAYMENT' && reversePaymentTarget?.id === item.paymentId && (
                          <tr className="bg-rose-50/60 border-t border-rose-100">
                            <td colSpan={isSuperAdmin ? 7 : 6} className="px-6 py-4">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                <div className="flex items-center gap-2 text-xs font-black text-rose-700">
                                  <AlertCircle size={14} />
                                  Reverse ₹{reversePaymentTarget?.amount?.toLocaleString('en-IN')} — Receipt {reversePaymentTarget?.receipt}?
                                </div>
                                <input
                                  type="text"
                                  placeholder="Reason for reversal (required)"
                                  value={reverseReason}
                                  onChange={e => setReverseReason(e.target.value)}
                                  className="flex-1 min-w-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-300 outline-none"
                                />
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => setReversePaymentTarget(null)}
                                    className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!reverseReason.trim()) { toast.error('Please provide a reason.'); return; }
                                      setReversingPayment(true);
                                      try {
                                        await api.post(`/fees/payments/${reversePaymentTarget?.id}/reverse/`, { reason: reverseReason.trim() });
                                        toast.success(`Payment ${reversePaymentTarget?.receipt} reversed. Invoice outstanding restored.`);
                                        setReversePaymentTarget(null);
                                        setReverseReason('');
                                        refetch();
                                      } catch (err: any) {
                                        const d = err.response?.data;
                                        const msg = typeof d?.detail === 'string' ? d.detail : Array.isArray(d?.detail) ? d.detail[0] : 'Failed to reverse payment.';
                                        toast.error(msg);
                                      } finally {
                                        setReversingPayment(false);
                                      }
                                    }}
                                    disabled={reversingPayment}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-colors"
                                  >
                                    {reversingPayment ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                                    Confirm Reverse
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
 
              {/* Outstanding Invoices Section */}
              <div className="space-y-6 pt-4">
                <SectionHeader title="Outstanding Dues" icon={Plus} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {student.invoices?.filter((i: any) => i.status !== 'PAID').map((inv: any) => (
                    <div key={inv.id} className="bg-white p-6 rounded-3xl border-2 border-slate-50 shadow-sm hover:border-blue-100 transition-all group overflow-hidden relative">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{inv.invoice_number}</p>
                          <h4 className="text-lg font-black text-slate-900 line-clamp-1">{inv.invoice_number?.startsWith('TRN-') ? 'Transport Fee Invoice' : (inv.title || 'Academic Fee Invoice')}</h4>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          inv.status === 'PARTIALLY_PAID' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                          {inv.status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Due Amount</p>
                          <p className="text-2xl font-black text-slate-900 italic tracking-tighter">₹{inv.outstanding_amount.toLocaleString('en-IN')}</p>
                        </div>
                        <button 
                          onClick={() => handleOpenInvoicePayment(inv)}
                          className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:shadow-blue-200 transition-all flex items-center gap-2 group-hover:-translate-y-1"
                        >
                          <CreditCard size={14} /> Record Payment
                        </button>
                      </div>
                    </div>
                  ))}
                  {student.carry_forwards?.filter((cf: any) => cf.status !== 'PAID' && cf.status !== 'WRITTEN_OFF').map((cf: any) => (
                    <div key={cf.id} className="bg-white p-6 rounded-3xl border-2 border-slate-50 shadow-sm hover:border-blue-100 transition-all group overflow-hidden relative">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">CARRY FORWARD ({cf.source_year_name})</p>
                          <h4 className="text-lg font-black text-slate-900 line-clamp-1">Previous Year Dues / Arrears</h4>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          cf.status === 'PARTIALLY_PAID' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {cf.status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Due Amount</p>
                          <p className="text-2xl font-black text-slate-900 italic tracking-tighter">₹{Number(cf.remaining_amount).toLocaleString('en-IN')}</p>
                        </div>
                        <button 
                          onClick={() => handleOpenCarryForwardPayment(cf)}
                          className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:shadow-blue-200 transition-all flex items-center gap-2 group-hover:-translate-y-1"
                        >
                          <CreditCard size={14} /> Record Payment
                        </button>
                      </div>
                    </div>
                  ))}
                  {student.transport_info?.opted && !student.invoices?.some((i: any) => i.status !== 'PAID' && i.invoice_number?.startsWith('TRN-')) && (
                    <div className="bg-white p-6 rounded-3xl border-2 border-slate-50 shadow-sm hover:border-blue-100 transition-all group overflow-hidden relative">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">UNBILLED</p>
                          <h4 className="text-lg font-black text-slate-900 line-clamp-1">Transport Fee</h4>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500">
                          NOT INVOICED
                        </span>
                      </div>
                      
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Fee</p>
                          <p className="text-2xl font-black text-slate-900 italic tracking-tighter">₹{(student.transport_info.monthly_fee || 0).toLocaleString('en-IN')}</p>
                        </div>
                        <button 
                          onClick={generateTransportInvoice}
                          className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2 group-hover:-translate-y-1"
                        >
                          <Plus size={14} /> Generate Invoice
                        </button>
                      </div>
                    </div>
                  )}
                  {student.invoices?.filter((i: any) => i.status !== 'PAID').length === 0 && student.carry_forwards?.filter((cf: any) => cf.status !== 'PAID' && cf.status !== 'WRITTEN_OFF').length === 0 && (!student.transport_info?.opted || student.invoices?.some((i: any) => i.status !== 'PAID' && i.invoice_number?.startsWith('TRN-'))) && (
                    <div className="md:col-span-2 p-12 bg-emerald-50/50 rounded-[2.5rem] border border-dashed border-emerald-200 text-center space-y-4">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto text-emerald-500 shadow-sm border border-emerald-100">
                        <CheckCircle2 size={32} />
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-emerald-900">All Fees Cleared!</h4>
                        <p className="text-sm font-bold text-emerald-600/70 uppercase tracking-widest">No outstanding dues for this student.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Form Modal */}
      <Modal
        isOpen={showEditForm}
        onClose={() => setShowEditForm(false)}
        title={`Edit ${student.first_name}'s Profile`}
        maxWidth="5xl"
      >
        <StudentForm 
          initialData={student}
          submitLabel="Update Profile"
          onSubmit={handleUpdate}
          onCancel={() => setShowEditForm(false)}
          isEdit={true}
          requireParentEmails={false}
        />
      </Modal>

      {/* Withdrawal Modal */}
      <Modal
        isOpen={showWithdrawModal}
        onClose={() => !withdrawing && setShowWithdrawModal(false)}
        title="Transfer Student"
        maxWidth="lg"
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500">
              <LogOut size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Transfer Student</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Branch to branch transfer</p>
            </div>
          </div>

          <div className="space-y-6 mb-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Target Branch</label>
              <select
                value={withdrawData.target_branch_id}
                onChange={e => setWithdrawData({ ...withdrawData, target_branch_id: e.target.value })}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
              >
                <option value="">Select target branch</option>
                {tenantBranches
                  .filter((b: any) => b.id !== student.branch)
                  .map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Transfer Date</label>
              <input 
                type="date"
                value={withdrawData.leaving_date}
                onChange={e => setWithdrawData({...withdrawData, leaving_date: e.target.value})}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Reason for Transfer</label>
              <textarea 
                placeholder="Mention the reason (e.g., Relocation to new branch)"
                value={withdrawData.leaving_reason}
                onChange={e => setWithdrawData({...withdrawData, leaving_reason: e.target.value})}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none min-h-[120px] transition-all"
              />
            </div>

            <div className="bg-rose-50 p-4 rounded-2xl flex gap-3 text-rose-700">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-xs font-bold uppercase leading-relaxed tracking-tight">
                Student moves to selected branch with same admission number. Existing due fees and payment history are preserved.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => setShowWithdrawModal(false)}
              disabled={withdrawing}
              className="flex-1 px-8 py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-all uppercase tracking-widest"
            >
              Cancel
            </button>
            <button 
              onClick={handleWithdraw}
              disabled={withdrawing}
              className="flex-[2] bg-rose-600 text-white px-8 py-4 rounded-2xl text-sm font-black hover:bg-rose-700 shadow-xl shadow-rose-200 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {withdrawing ? 'Processing...' : 'Confirm Transfer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <PaymentModal 
          invoice={selectedInvoice}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoice(null);
          }}
          onSuccess={() => {
            refetch();
          }}
        />
      )}

      {/* Inactive Reason Modal */}
      <Modal
        isOpen={showInactiveReasonModal}
        onClose={() => !markingInactive && setShowInactiveReasonModal(false)}
        title="Mark Student as Inactive"
        maxWidth="md"
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
              <UserMinus size={28} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Mark as Inactive</h3>
              {student && (
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {student.first_name} {student.last_name} — {student.admission_number}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-700">
                Reason for Inactivation <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-red-400 text-sm transition-all resize-none outline-none"
                placeholder="e.g. Student has left the school, family relocated..."
                value={inactiveReason}
                onChange={e => setInactiveReason(e.target.value)}
                disabled={markingInactive}
              />
              <p className="text-xs text-slate-400">This reason will be recorded and visible in the fee balance report.</p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowInactiveReasonModal(false)}
              disabled={markingInactive}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmInactive}
              disabled={markingInactive || !inactiveReason.trim()}
              className="px-6 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {markingInactive ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={15} />}
              {markingInactive ? 'Marking...' : 'Mark Inactive'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Dropout Modal */}
      <Modal
        isOpen={showDropoutModal}
        onClose={() => !droppingOut && setShowDropoutModal(false)}
        title="Mark Student as Dropout"
        maxWidth="lg"
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
              <UserMinus size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Mark Dropout</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {student.first_name} {student.last_name} — {student.admission_number}
              </p>
            </div>
          </div>

          <div className="space-y-6 mb-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Reason for Dropout</label>
              <textarea 
                placeholder="Financial difficulties, family relocation, health issues..."
                value={dropoutData.reason}
                onChange={e => setDropoutData({...dropoutData, reason: e.target.value})}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none min-h-[120px] transition-all"
              />
            </div>

            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
              <input 
                type="checkbox"
                checked={dropoutData.stop_future_fees}
                onChange={e => setDropoutData({...dropoutData, stop_future_fees: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <div>
                <p className="text-sm font-bold text-slate-900">Cancel future fee invoices</p>
                <p className="text-xs text-slate-400">Stop generating new invoices for this student</p>
              </div>
            </label>

            <div className="bg-amber-50 p-4 rounded-2xl flex gap-3 text-amber-700">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-xs font-bold uppercase leading-relaxed tracking-tight">
                Warning: The student will be marked as "DROPOUT". Outstanding dues will be preserved as carry-forward records. 
                This action can be reversed by a School Admin using the "Reinstate" button.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => setShowDropoutModal(false)}
              disabled={droppingOut}
              className="flex-1 px-8 py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-all uppercase tracking-widest"
            >
              Cancel
            </button>
            <button 
              onClick={handleDropout}
              disabled={droppingOut || !dropoutData.reason}
              className="flex-[2] bg-amber-600 text-white px-8 py-4 rounded-2xl text-sm font-black hover:bg-amber-700 shadow-xl shadow-amber-200 transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {droppingOut ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : 'Confirm Dropout'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Class & Fees Modal */}
      {showEditClassFees && student && (
        <EditClassFeesModal
          student={student}
          isOpen={showEditClassFees}
          onClose={() => setShowEditClassFees(false)}
          onSuccess={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
}

// Helper icons missing or needed locally
const Camera = ({ size, className }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
);
