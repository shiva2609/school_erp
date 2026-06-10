"use client";

import React, { useState } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { 
  Bus, IndianRupee, 
  Search, Users, Trash2, 
  CheckCircle, AlertTriangle, UserPlus, 
  Settings2, CreditCard, RefreshCw
} from 'lucide-react';
import { useBranch } from '@/components/common/BranchContext';
import EnrollStudentModal from '@/components/transport/EnrollStudentModal';
import PaymentModal from '@/components/students/PaymentModal';
import AcademicYearFilter from '@/components/dashboard/AcademicYearFilter';
import { toast } from 'react-hot-toast';

interface TransportEnrollment {
  id: string;
  student: string;
  student_name: string;
  admission_number: string;
  class_section: string;
  academic_year: string;
  academic_year_name: string;
  pickup_point: string;
  agreed_amount: string;
  paid_amount: string;
  balance_amount: string;
  invoice_id: string;
  invoice_number: string;
  invoice_status: string;
  is_active: boolean;
  enrolled_at: string;
}

interface RateSlab {
  id: string;
  min_km: string;
  max_km: string;
  monthly_rate: string;
}

interface PaymentInvoice {
  id: string;
  invoice_number: string;
  outstanding_amount: number;
  student_name: string;
}

interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

export default function TransportPage() {
  const { selectedBranch } = useBranch();
  const [activeTab, setActiveTab] = useState<'students' | 'rates'>('students');
  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<PaymentInvoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TransportEnrollment | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Data fetching
  const { data: enrollments, loading: enrollmentsLoading, refetch: refetchEnrollments } = useApi<TransportEnrollment[]>(
    selectedBranch 
      ? `/transport/enrollments/?branch_id=${selectedBranch}&search=${search}&academic_year=${selectedYear}` 
      : null
  );
  
  const { data: rates, loading: ratesLoading } = useApi<RateSlab[]>(
    selectedBranch ? `/transport/rate-slabs/?branch_id=${selectedBranch}` : null
  );

  // Derive stats dynamically from current enrollments list
  const totalAgreed = enrollments?.reduce((acc, curr) => acc + (parseFloat(curr.agreed_amount) || 0), 0) || 0;
  const totalPaid = enrollments?.reduce((acc, curr) => acc + (parseFloat(curr.paid_amount) || 0), 0) || 0;
  const totalBalance = enrollments?.reduce((acc, curr) => acc + (parseFloat(curr.balance_amount) || 0), 0) || 0;

  const handleDeleteEnrollment = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/transport/enrollments/${deleteTarget.id}/`);
      toast.success("Transport enrollment cancelled successfully.");
      setDeleteTarget(null);
      refetchEnrollments();
    } catch (err) {
      const apiErr = err as ApiError;
      toast.error(apiErr.response?.data?.detail || "Failed to cancel transport enrollment.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
             <Bus className="text-blue-600 animate-bounce" />
             Transport Management
           </h1>
           <p className="text-gray-500 text-sm mt-1">Manage student transport allocation, agreed annual fees, and payments.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AcademicYearFilter 
            value={selectedYear} 
            onChange={(id) => setSelectedYear(id)} 
          />
          <button 
            onClick={() => setShowEnrollModal(true)}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center gap-2 group"
          >
            <UserPlus size={18} />
            Register Student
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Fees Agreed</p>
            <p className="text-3xl font-black text-slate-800">
              ₹{totalAgreed.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">Total committed transport fees for current filters.</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={22} />
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Fees Paid</p>
            <p className="text-3xl font-black text-emerald-600">
              ₹{totalPaid.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">Transport revenue collected so far.</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle size={22} />
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Outstanding Balance</p>
            <p className="text-3xl font-black text-amber-600">
              ₹{totalBalance.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">Pending fees to be collected.</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <IndianRupee size={22} />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm w-fit gap-2">
        {[
          { id: 'students', label: 'Enrolled Students', icon: Users },
          { id: 'rates', label: 'Rate Slabs (Reference)', icon: IndianRupee },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'students' | 'rates')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === tab.id 
                ? 'bg-slate-900 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
        {activeTab === 'students' && (
          <div className="animate-in fade-in duration-300">
            <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row gap-4 items-center justify-between">
               <div className="relative flex-1 max-w-md w-full">
                 <Search size={16} className="absolute left-3.5 top-3.5 text-gray-400" />
                 <input 
                   placeholder="Search student or admission number..." 
                   className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 ring-blue-500 transition-all font-medium"
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                 />
               </div>
               <button 
                 onClick={() => refetchEnrollments()} 
                 className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors self-end md:self-auto"
                 title="Refresh list"
               >
                 <RefreshCw size={18} className="animate-spin-hover" />
               </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                 <thead className="bg-slate-50/50 border-b border-gray-100 uppercase text-[10px] font-black text-slate-500 tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Student</th>
                      <th className="px-6 py-4">Pickup Point</th>
                      <th className="px-6 py-4 text-right">Agreed Fee</th>
                      <th className="px-6 py-4 text-right font-black text-emerald-600">Paid</th>
                      <th className="px-6 py-4 text-right font-black text-amber-600">Balance</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                    {enrollmentsLoading ? (
                      <tr><td colSpan={7} className="p-20 text-center text-slate-400 animate-pulse uppercase tracking-widest text-xs font-bold">Fetching Enrollment Data...</td></tr>
                    ) : enrollments?.length === 0 ? (
                      <tr><td colSpan={7} className="p-20 text-center text-slate-400">No students registered for transport in this academic year.</td></tr>
                    ) : enrollments?.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                             <span className="font-bold text-slate-900">{s.student_name}</span>
                             <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{s.admission_number} • {s.class_section}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500 truncate max-w-[200px]">
                          {s.pickup_point || 'Not specified'}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900">
                          ₹{parseFloat(s.agreed_amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-600">
                          ₹{parseFloat(s.paid_amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-amber-600">
                          ₹{parseFloat(s.balance_amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            s.invoice_status === 'PAID' 
                              ? 'bg-emerald-50 text-emerald-600' 
                              : s.invoice_status === 'PARTIALLY_PAID' 
                                ? 'bg-blue-50 text-blue-600' 
                                : 'bg-red-50 text-red-600'
                          }`}>
                            {s.invoice_status === 'PAID' ? 'Fully Paid' : s.invoice_status === 'PARTIALLY_PAID' ? 'Partially Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end items-center gap-2">
                             {parseFloat(s.balance_amount) > 0 && (
                               <button 
                                 onClick={() => setPaymentInvoice({
                                   id: s.invoice_id,
                                   invoice_number: s.invoice_number,
                                   outstanding_amount: parseFloat(s.balance_amount),
                                   student_name: s.student_name
                                 })}
                                 className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm"
                               >
                                 <CreditCard size={12} />
                                 Pay
                               </button>
                             )}
                             <button 
                               onClick={() => setDeleteTarget(s)}
                               className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                               title="Cancel registration"
                             >
                               <Trash2 size={16} />
                             </button>
                           </div>
                        </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'rates' && (
          <div className="p-8 animate-in fade-in duration-300">
             <div className="flex items-center justify-between mb-8">
               <h3 className="font-bold text-slate-900">Distance-Based Rates (Legacy Reference)</h3>
             </div>
             
             <div className="max-w-2xl mx-auto space-y-4">
                {ratesLoading ? (
                  <div className="p-10 text-center text-slate-400 animate-pulse font-bold text-xs uppercase tracking-widest">Loading reference rates...</div>
                ) : rates?.length === 0 ? (
                  <div className="p-10 text-center text-slate-400">No reference rate slabs configured.</div>
                ) : rates?.map(slab => (
                  <div key={slab.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-transparent hover:border-blue-100 hover:bg-white transition-all group">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all text-slate-400">
                           <Settings2 size={18} />
                        </div>
                        <div>
                           <p className="font-black text-slate-900 text-lg italic tracking-tighter">
                             {slab.min_km} - {slab.max_km} <span className="text-xs font-bold text-slate-400 not-italic uppercase ml-1 tracking-widest">Kilometers</span>
                           </p>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Monthly recurring slab</p>
                        </div>
                     </div>
                     <div className="text-2xl font-black text-blue-600 tracking-tight">
                        ₹{parseFloat(slab.monthly_rate).toLocaleString('en-IN')}
                     </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <EnrollStudentModal 
        isOpen={showEnrollModal} 
        onClose={() => setShowEnrollModal(false)}
        onSuccess={() => {
          setShowEnrollModal(false);
          refetchEnrollments();
        }}
      />

      {paymentInvoice && (
        <PaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={() => {
            setPaymentInvoice(null);
            refetchEnrollments();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 animate-in zoom-in-95 duration-200 border border-slate-100 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-950">Cancel Transport Enrollment?</h3>
            <p className="text-slate-500 text-sm mt-3 leading-relaxed">
              Are you sure you want to unregister <span className="font-bold text-slate-800">{deleteTarget.student_name}</span> from transport? This will delete the enrollment and the corresponding invoice ({deleteTarget.invoice_number}).
            </p>
            <div className="flex gap-4 mt-8">
              <button 
                type="button" 
                onClick={() => setDeleteTarget(null)} 
                disabled={deleting}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors text-sm"
              >
                Go Back
              </button>
              <button 
                type="button" 
                onClick={handleDeleteEnrollment} 
                disabled={deleting}
                className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-red-500/20 text-sm flex items-center justify-center"
              >
                {deleting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Yes, Cancel"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
