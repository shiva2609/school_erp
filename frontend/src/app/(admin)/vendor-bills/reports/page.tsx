"use client";

import React, { useState, useMemo } from 'react';
import { useApi } from '@/lib/hooks';
import { Download, Filter, FileText, CheckCircle, Clock, XCircle, Search, FileSpreadsheet } from 'lucide-react';
import { useBranch } from '@/components/common/BranchContext';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';

interface VendorBill {
  id: string;
  bill_id: string;
  voucher_number: string;
  vendor_display: string;
  vendor: string;
  total_amount: string;
  tds_amount: string;
  net_amount: string;
  payment_mode: string;
  bill_date: string;
  status: string;
  description: string;
}

const statusStyles: Record<string, any> = {
  SUBMITTED: { className: 'bg-blue-50 text-blue-700', icon: Clock, label: 'Pending Approval' },
  APPROVED: { className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle, label: 'Approved (Paid)' },
  REJECTED: { className: 'bg-rose-50 text-rose-700', icon: XCircle, label: 'Rejected' },
  DRAFT: { className: 'bg-slate-50 text-slate-700', icon: FileText, label: 'Draft' },
};

export default function VendorBillReportsPage() {
  const { selectedBranch } = useBranch();
  const push = useResolvedPush();
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  
  const branchParam = selectedBranch ? `branch_id=${selectedBranch}` : '';
  const dateParams = `${startDate ? `&start_date=${startDate}` : ''}${endDate ? `&end_date=${endDate}` : ''}`;
  const vendorParam = selectedVendor ? `&vendor=${selectedVendor}` : '';
  const statusParam = selectedStatus ? `&status=${selectedStatus}` : '';

  const queryParams = `?${branchParam}${dateParams}${vendorParam}${statusParam}`;
  
  const { data: bills, loading } = useApi<VendorBill[]>(`/vendor-bills/${queryParams}`);
  const { data: vendorsData } = useApi<any[]>(`/vendors/?${branchParam}`);
  const vendors = Array.isArray(vendorsData) ? vendorsData : [];

  const handleExportCSV = () => {
    if (!bills || bills.length === 0) return;
    
    const headers = [
      'Bill ID', 'Voucher Number', 'Date', 'Vendor', 'Status', 'Payment Mode',
      'Gross Amount', 'TDS Amount', 'Net Amount', 'Description'
    ];
    
    const rows = bills.map(b => [
      b.bill_id,
      b.voucher_number,
      b.bill_date,
      `"${b.vendor_display}"`,
      b.status,
      b.payment_mode,
      b.total_amount,
      b.tds_amount,
      b.net_amount,
      `"${(b.description || '').replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Vendor_Bill_Report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Vendor Bill Reports</h1>
          <p className="text-slate-500 mt-1">Generate and export financial reports for vendor payments.</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={!bills || bills.length === 0}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet size={18} />
          Export to CSV
        </button>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Start Date</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">End Date</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Vendor</label>
            <select 
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-blue-500 text-sm font-medium"
            >
              <option value="">All Vendors</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Status</label>
            <select 
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-blue-500 text-sm font-medium"
            >
              <option value="">All Statuses</option>
              <option value="SUBMITTED">Pending Approval</option>
              <option value="APPROVED">Approved (Paid)</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h2 className="font-bold text-slate-700 flex items-center gap-2">
            <Filter size={16} />
            Report Results
          </h2>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{bills?.length || 0} Bills Found</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="p-4 pl-6">Date</th>
                <th className="p-4">Bill Details</th>
                <th className="p-4">Vendor</th>
                <th className="p-4">Amount Details</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading reports...</td></tr>}
              {!loading && (!bills || bills.length === 0) && (
                <tr><td colSpan={5} className="p-12 text-center text-slate-500">No bills match the selected filters.</td></tr>
              )}
              {!loading && bills?.map(bill => {
                const statusStyle = statusStyles[bill.status] || statusStyles.DRAFT;
                const StatusIcon = statusStyle.icon;
                
                return (
                  <tr key={bill.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 text-slate-600 font-medium whitespace-nowrap">
                      {bill.bill_date}
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-800">{bill.bill_id}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{bill.voucher_number}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-700">{bill.vendor_display}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{bill.description}</p>
                    </td>
                    <td className="p-4">
                      <div className="space-y-0.5">
                        <p className="text-xs text-slate-500">Gross: ₹{bill.total_amount}</p>
                        {parseFloat(bill.tds_amount) > 0 && (
                          <p className="text-xs text-rose-500">- TDS: ₹{bill.tds_amount}</p>
                        )}
                        <p className="text-sm font-black text-emerald-600">Net: ₹{bill.net_amount}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${statusStyle.className}`}>
                        <StatusIcon size={12} />
                        {bill.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
