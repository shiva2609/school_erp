"use client";

import React, { useState } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import { Plus, Search, FileText, Download, CheckCircle, Clock, XCircle, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';
import Modal from '@/components/common/Modal';

interface VendorBill {
  id: string;
  bill_id: string;
  voucher_number: string;
  vendor_display: string;
  total_amount: string;
  tds_amount: string;
  net_amount: string;
  payment_mode: string;
  bill_date: string;
  status: string;
}

const statusStyles: Record<string, any> = {
  SUBMITTED: { className: 'bg-blue-50 text-blue-700', icon: Clock, label: 'Pending Approval' },
  APPROVED: { className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle, label: 'Approved (Paid)' },
  REJECTED: { className: 'bg-rose-50 text-rose-700', icon: XCircle, label: 'Rejected' },
  DRAFT: { className: 'bg-slate-50 text-slate-700', icon: FileText, label: 'Draft' },
};

export default function VendorBillsPage() {
  const { selectedBranch } = useBranch();
  const push = useResolvedPush();
  const branchParam = selectedBranch ? `branch_id=${selectedBranch}` : '';
  const [search, setSearch] = useState('');
  
  const [rejectingBill, setRejectingBill] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: bills, loading, refetch } = useApi<VendorBill[]>(
    `/vendor-bills/?${branchParam}&search=${search}`
  );

  const handleUpdateStatus = async (id: string, status: string, reason: string = '') => {
    try {
      await api.patch(`/vendor-bills/${id}/status/`, { status, reason });
      toast.success(`Bill ${status.toLowerCase()} successfully`);
      setRejectingBill(null);
      setRejectReason('');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || `Failed to update bill status`);
    }
  };

  const downloadReceipt = async (billId: string) => {
    try {
      const response = await api.get(`/vendor-bills/${billId}/receipt/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Receipt_${billId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error('Failed to download receipt');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Vendor Bills</h1>
          <p className="text-slate-500 mt-1">Manage vendor invoices, apply TDS, and generate receipts.</p>
        </div>
        <button
          onClick={() => push('/vendor-bills/create')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm shadow-blue-200"
        >
          <Plus size={18} />
          Create Vendor Bill
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Bill ID, Voucher, or Vendor Name..." 
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="p-4 pl-6">Bill / Voucher ID</th>
                <th className="p-4">Vendor</th>
                <th className="p-4">Amount Details</th>
                <th className="p-4">Payment</th>
                <th className="p-4">Status</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Loading bills...</td></tr>}
              {!loading && bills?.length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-slate-500 bg-slate-50/50">No vendor bills found.</td></tr>
              )}
              {!loading && bills?.map(bill => {
                const statusStyle = statusStyles[bill.status] || statusStyles.DRAFT;
                const StatusIcon = statusStyle.icon;
                
                return (
                  <tr key={bill.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6">
                      <p className="font-bold text-slate-800">{bill.bill_id}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{bill.voucher_number}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-700">{bill.vendor_display}</p>
                      <p className="text-xs text-slate-500">{bill.bill_date}</p>
                    </td>
                    <td className="p-4">
                      <div className="space-y-0.5">
                        <p className="text-xs text-slate-500">Gross: <span className="font-medium text-slate-700">₹{bill.total_amount}</span></p>
                        {parseFloat(bill.tds_amount) > 0 && (
                          <p className="text-xs text-rose-500">- TDS: ₹{bill.tds_amount}</p>
                        )}
                        <p className="text-sm font-black text-emerald-600">Net: ₹{bill.net_amount}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold tracking-wider">
                        {bill.payment_mode}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusStyle.className}`}>
                        <StatusIcon size={12} />
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right space-x-2">
                      {bill.status === 'SUBMITTED' && (
                        <>
                          <button 
                            onClick={() => handleUpdateStatus(bill.id, 'APPROVED')}
                            className="p-2 text-emerald-500 hover:text-white hover:bg-emerald-500 rounded-lg transition-colors"
                            title="Approve Bill"
                          >
                            <Check size={16} />
                          </button>
                          <button 
                            onClick={() => setRejectingBill(bill.id)}
                            className="p-2 text-rose-500 hover:text-white hover:bg-rose-500 rounded-lg transition-colors"
                            title="Reject Bill"
                          >
                            <X size={16} />
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => downloadReceipt(bill.id)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Download Receipt PDF"
                      >
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={!!rejectingBill} onClose={() => setRejectingBill(null)} title="Reject Vendor Bill">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rejection Reason *</label>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-rose-500 outline-none transition-all"
              placeholder="Why is this bill being rejected?"
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button onClick={() => setRejectingBill(null)} className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors">
              Cancel
            </button>
            <button 
              onClick={() => rejectingBill && handleUpdateStatus(rejectingBill, 'REJECTED', rejectReason)}
              disabled={!rejectReason.trim()}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
