"use client";

import React, { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { Receipt, AlertTriangle, Plus, DollarSign, CheckCircle2, Search, Filter } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';
import FloatingActionBar from '@/components/common/FloatingActionBar';
import { useAuth } from '@/components/common/AuthProvider';

const FEE_APPROVAL_REVIEW_ROLES = new Set(['SUPER_ADMIN', 'ZONAL_ADMIN']);

interface Invoice {
  id: string;
  invoice_number: string;
  student: string;
  student_name: string;
  month: string;
  net_amount: string;
  paid_amount: string;
  outstanding_amount: string;
  due_date: string;
  status: string;
}

interface FeeApprovalRequest {
  id: string;
  student_name: string;
  admission_number: string;
  academic_year_name?: string;
  class_section_display?: string;
  standard_total: string;
  offered_total: string;
  reason: string;
  status: string;
  requested_by_name: string;
  created_at: string;
}

const statusStyles: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-50 text-blue-700',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  OVERDUE: 'bg-rose-50 text-rose-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  WAIVED: 'bg-purple-50 text-purple-700',
};

export default function FeesPage() {
  const { user } = useAuth();
  const { selectedBranch } = useBranch();
  const [activeTab, setActiveTab] = useState<'ACTION_ITEMS' | 'ALL_INVOICES'>('ACTION_ITEMS');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const canReviewFeeApprovals = user?.role ? FEE_APPROVAL_REVIEW_ROLES.has(user.role) : false;

  // Data fetching
  const { data: invoices, loading: invLoading, error: invError, refetch: refetchInvoices } = useApi<Invoice[]>(
    `/fees/invoices/?status=${statusFilter}&branch_id=${selectedBranch}`
  );

  const approvalsUrl = canReviewFeeApprovals
    ? `/fees/approvals/?status=PENDING&branch_id=${selectedBranch}`
    : null;
  const { data: approvals, loading: appLoading, refetch: refetchApprovals } = useApi<FeeApprovalRequest[]>(
    approvalsUrl
  );

  const [showPayForm, setShowPayForm] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('CASH');
  const [paying, setPaying] = useState(false);
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setProcessingApproval(id);
    try {
      await api.post(`/fees/approvals/${id}/approve/`);
      refetchApprovals();
      refetchInvoices();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Approval failed');
    } finally { setProcessingApproval(null); }
  };

  const handleReject = async (id: string) => {
    const remarks = prompt("Reason for rejection:");
    if (remarks === null) return;
    setProcessingApproval(id);
    try {
      await api.post(`/fees/approvals/${id}/reject/`, { remarks });
      refetchApprovals();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Rejection failed');
    } finally { setProcessingApproval(null); }
  };

  const handlePay = async (invoiceId: string) => {
    setPaying(true);
    try {
      await api.post('fees/payments/offline/', {
        invoice_id: invoiceId,
        amount: payAmount,
        payment_mode: payMode,
        payment_date: new Date().toISOString().split('T')[0],
      });
      setShowPayForm(null);
      setPayAmount('');
      refetchInvoices();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Payment failed');
    } finally { setPaying(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkRemind = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await api.post('/fees/invoices/bulk-remind/', { invoice_ids: selectedIds });
      const reminded = res.data?.data?.reminded || 0;
      toast.success(`${reminded} reminder(s) sent successfully.`);
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send reminders.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Financial Desk</h1>
          <p className="text-gray-500 text-sm mt-1">Real-time control over branch collection and approvals.</p>
        </div>
      </div>

      {/* Action-First Tabs */}
      <div className="flex gap-1 border-b border-gray-100 pb-px">
        <button
          onClick={() => setActiveTab('ACTION_ITEMS')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'ACTION_ITEMS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Priority Actions
          {canReviewFeeApprovals && (approvals?.length || 0) > 0 && (
            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] animate-pulse">
              {approvals?.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('ALL_INVOICES')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'ALL_INVOICES' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          All Invoices
        </button>
      </div>

      {activeTab === 'ACTION_ITEMS' ? (
        <div className="space-y-8">
           {/* Section 1: Pending Approvals — tenant super admin & zonal admin only */}
           {canReviewFeeApprovals && (
           <div>
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Fee Concessions Awaiting Review
              </h3>
             {appLoading ? (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {[1,2].map(i => <div key={i} className="h-40 bg-white rounded-2xl border animate-pulse" />)}
               </div>
             ) : approvals?.length === 0 ? (
               <div className="bg-white border border-gray-100 rounded-3xl p-12 text-center shadow-sm">
                 <CheckCircle2 className="mx-auto text-emerald-300 mb-3" size={32} />
                 <p className="text-slate-900 font-bold">Clear queue!</p>
                 <p className="text-slate-400 text-sm">No pending approval requests.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {approvals?.map((req) => (
                   <div key={req.id} className="bg-white p-6 rounded-2xl border border-blue-50 shadow-sm hover:shadow-md transition-all">
                     <div className="flex justify-between items-start mb-4">
                        <div>
                           <h4 className="font-bold text-slate-900">{req.student_name}</h4>
                           <p className="text-[10px] font-mono text-slate-400 uppercase">{req.admission_number}</p>
                           {(req.academic_year_name || req.class_section_display) ? (
                             <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                               {req.academic_year_name ? (
                                 <><span className="font-bold text-slate-600">AY: </span>{req.academic_year_name}</>
                               ) : null}
                               {req.academic_year_name && req.class_section_display ? ' · ' : null}
                               {req.class_section_display ? (
                                 <><span className="font-bold text-slate-600">Class: </span>{req.class_section_display}</>
                               ) : null}
                             </p>
                           ) : null}
                        </div>
                        <div className="text-right space-y-0.5">
                           <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Agreed fee</p>
                           <p className="text-sm font-black text-emerald-600 tabular-nums">₹{Number(req.offered_total).toLocaleString('en-IN')}</p>
                           <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 pt-1">Locked fee</p>
                           <p className="text-xs text-slate-500 tabular-nums line-through">₹{Number(req.standard_total).toLocaleString('en-IN')}</p>
                        </div>
                     </div>
                     <div className="bg-slate-50 p-2 rounded-lg text-xs italic text-slate-600 mb-4 border-l-2 border-blue-400">
                        &quot;{req.reason || 'No reason specified'}&quot;
                     </div>
                     <div className="flex gap-2">
                        <button 
                          onClick={() => handleApprove(req.id)}
                          disabled={processingApproval === req.id}
                          className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
                        >
                          {processingApproval === req.id ? '...' : 'Approve'}
                        </button>
                        <button 
                          onClick={() => handleReject(req.id)}
                          disabled={processingApproval === req.id}
                          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          Reject
                        </button>
                     </div>
                   </div>
                 ))}
               </div>
             )}
           </div>
           )}

           {/* Section 2: Overdue items (Shortcut) */}
           <div>
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                High Priority Collections
              </h3>
             <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center">
                <AlertTriangle className="mx-auto text-rose-300 mb-2" />
                <p className="text-slate-400 text-sm">Switch to the &quot;All Invoices&quot; tab and filter by &quot;OVERDUE&quot; to view collections.</p>
             </div>
           </div>
        </div>
      ) : (
        /* Data-Heavy Tab: All Invoices with Filtering and Selection */
        <>
          <div className="flex flex-wrap items-center gap-4">
             <div className="relative flex-1 min-w-[300px]">
                <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                <input placeholder="Search invoice or student name..." className="w-full pl-11 pr-4 py-2.5 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 ring-blue-500" />
             </div>
             <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {['', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                    statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50'
                  }`}>
                  {s || 'All Status'}
                </button>
              ))}
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-4">
            <table className="w-full text-sm text-left">
               <thead className="bg-slate-50/50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 w-10">
                       <input type="checkbox" onChange={(e) => {
                          if (e.target.checked) setSelectedIds(invoices?.map(i => i.id) || []);
                          else setSelectedIds([]);
                       }} />
                    </th>
                    <th className="px-6 py-4 font-bold text-slate-600">Invoice</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Student</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Due Date</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Amount</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {invoices?.map((inv) => (
                    <tr key={inv.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.includes(inv.id) ? 'bg-blue-50/30' : ''}`}>
                       <td className="px-6 py-4">
                          <input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelect(inv.id)} />
                       </td>
                       <td className="px-6 py-4 font-mono text-xs">{inv.invoice_number}</td>
                       <td className="px-6 py-4 font-bold text-slate-900">{inv.student_name}</td>
                       <td className="px-6 py-4 text-slate-500">{inv.due_date}</td>
                       <td className="px-6 py-4">
                          <p className="font-bold">₹{Number(inv.net_amount).toLocaleString('en-IN')}</p>
                          {Number(inv.outstanding_amount) > 0 && <p className="text-[10px] text-rose-500 font-bold">₹{Number(inv.outstanding_amount).toLocaleString('en-IN')} left</p>}
                       </td>
                       <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${statusStyles[inv.status]}`}>
                             {inv.status.replace('_', ' ')}
                          </span>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
          </div>
        </>
      )}

      {/* Global Bulk Actions — connected to real API */}
      <FloatingActionBar 
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        actions={[
          { label: 'Send Reminders', icon: DollarSign, onClick: handleBulkRemind },
        ]}
      />
    </div>
  );
}
