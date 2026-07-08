'use client';

import React, { useState } from 'react';
import { X, CreditCard, Calendar, Hash, Building, CheckCircle2, AlertCircle, Download, FileText, Printer } from 'lucide-react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';

interface PaymentModalProps {
  invoice: {
    id: string;
    invoice_number: string;
    outstanding_amount: number;
    student_name: string;
    is_carry_forward?: boolean;
    student_id?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentModal({ invoice, onClose, onSuccess }: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    amount: invoice.outstanding_amount.toString(),
    payment_mode: 'CASH',
    payment_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    bank_name: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let res;
      if (invoice.is_carry_forward) {
        res = await api.post('/allocated-payments/allocate/', {
          student_id: invoice.student_id,
          total_amount: parseFloat(formData.amount.toString()),
          payment_mode: formData.payment_mode,
          payment_date: formData.payment_date,
          reference_number: formData.reference_number || null,
          bank_name: formData.bank_name || null,
          auto_allocate: true
        });
      } else {
        res = await api.post('/fees/payments/offline/', {
          invoice_id: invoice.id,
          amount: parseFloat(formData.amount.toString()),
          payment_mode: formData.payment_mode,
          payment_date: formData.payment_date,
          reference_number: formData.reference_number || null,
          bank_name: formData.bank_name || null
        });
      }
      setPaymentResult(res.data);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const downloadReceipt = async () => {
    const paymentId = paymentResult?.data?.id || paymentResult?.data?.payment_id;
    const receiptNumber = paymentResult?.data?.receipt_number || 'receipt';
    if (!paymentId) return;
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
      toast.success('Receipt downloaded!');
    } catch {
      toast.error('Could not generate receipt. Template may not be configured.');
    }
  };

  const printReceipt = async () => {
    const paymentId = paymentResult?.data?.id || paymentResult?.data?.payment_id;
    if (!paymentId) return;
    try {
      const response = await api.get(`/templates/generate/receipt/${paymentId}/`, {
        responseType: 'blob'
      });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      // Revoking object URL immediately can sometimes break the new window PDF load in some browsers, 
      // so we let the browser garbage collect it eventually or revoke after a delay.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error('Could not generate receipt for printing.');
    }
  };

  // ─── Success Screen ───
  if (paymentResult) {
    const data = paymentResult.data || {};
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden border border-slate-100">
          <div className="p-10 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in-50 duration-300">
              <CheckCircle2 size={40} className="text-emerald-600" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Payment Recorded!</h3>
            <p className="text-slate-500 text-sm mb-6">
              ₹{Number(data.amount || data.total_amount).toLocaleString('en-IN')} paid for {invoice.invoice_number}
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 font-bold">Receipt #</span>
                <span className="font-black text-slate-700">{data.receipt_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 font-bold">Mode</span>
                <span className="font-black text-slate-700">{data.payment_mode || formData.payment_mode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 font-bold">Date</span>
                <span className="font-black text-slate-700">{data.payment_date || formData.payment_date}</span>
              </div>
            </div>

            <div className="flex gap-3 mb-3">
              <button
                onClick={printReceipt}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2"
              >
                <Printer size={18} />
                Print
              </button>
              <button
                onClick={downloadReceipt}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
              >
                <Download size={18} />
                Download
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full text-slate-500 hover:text-slate-700 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Payment Form ───
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="bg-slate-50 px-8 py-6 flex items-center justify-between border-b border-slate-100">
          <div>
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
              <span className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                <CreditCard size={20} />
              </span>
              Record Payment
            </h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 ml-11">
              {invoice.invoice_number} • {invoice.student_name}
            </p>
          </div>
          <button onClick={onClose} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-shake">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-red-600 font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Amount */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Amount (₹)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input 
                  required
                  type="number"
                  step="0.01"
                  max={invoice.outstanding_amount}
                  value={formData.amount}
                  onChange={e => setFormData(p => ({...p, amount: e.target.value}))}
                  className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-lg font-black text-slate-700 focus:bg-white focus:border-emerald-500 transition-all outline-none"
                />
              </div>
              <p className="text-[10px] font-bold text-amber-500 mt-1 ml-1">Pending: ₹{invoice.outstanding_amount.toLocaleString('en-IN')}</p>
            </div>

            {/* Mode */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mode</label>
              <select 
                value={formData.payment_mode}
                onChange={e => setFormData(p => ({...p, payment_mode: e.target.value}))}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:bg-white focus:border-emerald-500 transition-all outline-none"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="NEFT">NEFT / Bank</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  required
                  type="date"
                  value={formData.payment_date}
                  onChange={e => setFormData(p => ({...p, payment_date: e.target.value}))}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:bg-white focus:border-emerald-500 transition-all outline-none"
                />
              </div>
            </div>

            {/* Reference */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reference Number / Transaction ID</label>
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  placeholder="Optional"
                  value={formData.reference_number}
                  onChange={e => setFormData(p => ({...p, reference_number: e.target.value}))}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:bg-white focus:border-emerald-500 transition-all outline-none"
                />
              </div>
            </div>

            {/* Bank */}
            {formData.payment_mode === 'CHEQUE' && (
              <div className="space-y-1.5 md:col-span-2 animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bank Name</label>
                <div className="relative">
                  <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    placeholder="Enter bank name"
                    value={formData.bank_name}
                    onChange={e => setFormData(p => ({...p, bank_name: e.target.value}))}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:bg-white focus:border-emerald-500 transition-all outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-4">
            <button 
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Confirm Payment
                </>
              )}
            </button>
            <p className="text-[10px] text-center text-slate-400 font-bold mt-4 uppercase tracking-widest">
              A digital receipt will be generated automatically.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
