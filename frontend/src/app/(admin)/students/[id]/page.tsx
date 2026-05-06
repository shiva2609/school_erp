"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { 
  User, Mail, Phone, MapPin, Calendar, BookOpen, 
  ChevronLeft, Edit2, LogOut, Shield, GraduationCap,
  Building2, Hash, CreditCard, Activity, FileText,
  AlertCircle, CheckCircle2, Clock, Trash2, Plus, ArrowRightLeft, History,
  UserMinus, UserPlus, Loader2, Download
} from 'lucide-react';
import StudentForm from '@/components/students/StudentForm';
import PaymentModal from '@/components/students/PaymentModal';
import Modal from '@/components/common/Modal';
import { useAuth } from '@/components/common/AuthProvider';
import { toast } from 'react-hot-toast';

export default function StudentProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { data: student, loading, error, refetch } = useApi<any>(`/students/${id}/`);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditForm, setShowEditForm] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawData, setWithdrawData] = useState({
    leaving_date: new Date().toISOString().split('T')[0],
    leaving_reason: ''
  });
  const [withdrawing, setWithdrawing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showDropoutModal, setShowDropoutModal] = useState(false);
  const [dropoutData, setDropoutData] = useState({ reason: '', stop_future_fees: true });
  const [droppingOut, setDroppingOut] = useState(false);
  const [reinstating, setReinstating] = useState(false);
  const { data: academicRecords, loading: recordsLoading } = useApi<any[]>(`/academic-records/?student_id=${id}`);

  const [promotedFeeStandard, setPromotedFeeStandard] = useState(0);
  const [promotedFeeOffered, setPromotedFeeOffered] = useState(0);
  const [promotedFeeReason, setPromotedFeeReason] = useState('');
  const [promotedFeeStructure, setPromotedFeeStructure] = useState<any>(null);
  const [promotedFeeLoading, setPromotedFeeLoading] = useState(false);
  const [promotedFeeSaving, setPromotedFeeSaving] = useState(false);

  const canConfirmPromotedFees = !!user && (
    ['OWNER', 'SUPER_ADMIN', 'ZONAL_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes(user.role)
  );

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
      const msg = typeof d?.detail === 'string' ? d.detail : d?.error || 'Could not save fees.';
      toast.error(msg);
    } finally {
      setPromotedFeeSaving(false);
    }
  };

  const completedPayments = (student?.payments || []).filter((p: any) => p.status === 'COMPLETED');
  const refundedPayments = (student?.payments || []).filter((p: any) => p.status === 'REFUNDED');
  const completedAmount = completedPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const refundedAmount = refundedPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const requiresInitialPayment = !!student?.requires_initial_payment && !student?.is_csv_imported;

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
      toast.error("Please provide a reason for withdrawal.");
      return;
    }
    setWithdrawing(true);
    try {
      await api.patch(`/students/${id}/status/`, {
        status: 'TRANSFERRED',
        ...withdrawData
      });
      setShowWithdrawModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error processing withdrawal');
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
      router.push(`/students/${id}/pay-admission`);
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
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Card */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-50 relative overflow-hidden">
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
                  <LogOut size={16} /> Mark Left
                </button>
              </>
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
              className={`w-full flex items-center gap-4 p-5 rounded-3xl transition-all duration-300 relative group ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-200 translate-x-2' 
                  : 'bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600 shadow-sm border border-slate-50'
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
        <div className="lg:col-span-3 bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-50 p-8 min-h-[500px]">
          {activeTab === 'overview' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
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
                <SectionHeader title="Current Enrollment" icon={GraduationCap} />
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
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight border ${style}`}>
                            {record.status}
                          </span>
                        </div>
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
                        Set fee for promoted class
                      </h4>
                      <p className="text-sm text-amber-800/90 mt-1">
                        This student moved up to <strong>{student.class_section_display || 'their new class'}</strong> for{' '}
                        <strong>{student.academic_year_name}</strong>. Confirm the annual academic fee the same way as a new admission
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
                        }))
                      ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item, i) => (
                        <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
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
                        </tr>
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
                  {student.invoices?.filter((i: any) => i.status !== 'PAID').length === 0 && (!student.transport_info?.opted || student.invoices?.some((i: any) => i.status !== 'PAID' && i.invoice_number?.startsWith('TRN-'))) && (
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
        title="Withdraw Student"
        maxWidth="lg"
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500">
              <LogOut size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Withdraw Student</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Process "Left" procedure</p>
            </div>
          </div>

          <div className="space-y-6 mb-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Withdrawal Date</label>
              <input 
                type="date"
                value={withdrawData.leaving_date}
                onChange={e => setWithdrawData({...withdrawData, leaving_date: e.target.value})}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Reason for Leaving</label>
              <textarea 
                placeholder="Mention the reason (e.g., Relocation, Financial...)"
                value={withdrawData.leaving_reason}
                onChange={e => setWithdrawData({...withdrawData, leaving_reason: e.target.value})}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none min-h-[120px] transition-all"
              />
            </div>

            <div className="bg-rose-50 p-4 rounded-2xl flex gap-3 text-rose-700">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-xs font-bold uppercase leading-relaxed tracking-tight">
                Warning: This will change student status to "TRANSFERRED". 
                The student will no longer appear in active class rolls.
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
              {withdrawing ? 'Processing...' : 'Confirm Withdrawal'}
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
    </div>
  );
}

// Helper icons missing or needed locally
const Camera = ({ size, className }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
);
