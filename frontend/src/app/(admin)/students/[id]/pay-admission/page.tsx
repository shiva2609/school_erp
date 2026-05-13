"use client";

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import { Receipt, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const PAYMENT_MODES = ['CASH', 'UPI', 'CHEQUE', 'NEFT', 'RTGS', 'DD', 'ONLINE'] as const;

export default function PayAdmissionPage() {
  const params = useParams();
  const push = useResolvedPush();
  const studentId = params.id as string;

  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amountPayingAdmission, setAmountPayingAdmission] = useState<number>(0);
  const [fixedDeposit, setFixedDeposit] = useState<number>(0);
  const [tuitionPayment, setTuitionPayment] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');

  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [admissionPrefilled, setAdmissionPrefilled] = useState(false);

  const admissionUrl =
    student?.branch && student?.academic_year
      ? `tenants/branches/${student.branch}/admission-fee/?academic_year_id=${student.academic_year}`
      : null;
  const { data: admissionConfig } = useApi<{ amount: string }>(admissionUrl);
  const configuredAdmission = Number(admissionConfig?.amount ?? 0);

  useEffect(() => {
    if (!studentId) return;
    api
      .get(`/students/${studentId}/`)
      .then((res) => {
        setStudent(res.data?.data ?? res.data);
        setLoading(false);
      })
      .catch(() => {
        toast.error('Failed to load student details');
        setLoading(false);
      });
  }, [studentId]);

  useEffect(() => {
    if (!admissionPrefilled && configuredAdmission > 0) {
      setAmountPayingAdmission(configuredAdmission);
      setAdmissionPrefilled(true);
    }
  }, [configuredAdmission, admissionPrefilled]);

  const totalAmount = Number(amountPayingAdmission) + Number(fixedDeposit) + Number(tuitionPayment);

  const handleSubmit = async () => {
    if (totalAmount <= 0) {
      toast.error('Enter at least one payment amount (admission and/or academic fee).');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('fees/payments/initial-payment/', {
        student_id: studentId,
        admission_fee: amountPayingAdmission,
        fixed_deposit: fixedDeposit,
        tuition_payment: tuitionPayment,
        payment_mode: paymentMode,
        reference_number: referenceNumber || undefined,
        payment_date: new Date().toISOString().split('T')[0],
      });

      setResult(res.data.data);
      setSuccess(true);
    } catch (err: any) {
      const status = err?.response?.status;
      const payload = err?.response?.data;
      const detail = payload?.detail;

      const flattenError = (value: unknown): string => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(flattenError).filter(Boolean).join(', ');
        if (value && typeof value === 'object') {
          return Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => {
              const child = flattenError(v);
              return child ? `${k}: ${child}` : '';
            })
            .filter(Boolean)
            .join(' | ');
        }
        return '';
      };

      const detailText = flattenError(detail);
      const payloadText = flattenError(payload);
      const genericByStatus =
        status === 400
          ? 'Invalid payment input. Please review the amounts and try again.'
          : status === 404
            ? 'Payment service endpoint not found. Please refresh and try again.'
            : status === 500
              ? 'Server error while recording payment. Please try again in a moment.'
              : 'Error processing payment';

      const msg =
        detailText ||
        payload?.error ||
        payloadText ||
        genericByStatus;
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Loading student details...</div>;
  if (!student) return <div className="p-8 text-center text-red-500">Student not found.</div>;

  if (success) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-12 bg-white rounded-[3rem] border border-gray-100 shadow-2xl text-center space-y-8 animate-in zoom-in-95">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 size={48} />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Payment recorded</h1>
          <p className="text-gray-500 font-medium">
            Receipts generated for {student.first_name} {student.last_name}.
          </p>
        </div>

        <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 text-left space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Total applied</span>
            <span className="font-black text-gray-900 text-lg">
              ₹{Number(result?.total_paid ?? 0).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Receipts</span>
            <div className="text-right">
              {(result?.receipt_codes ?? []).map((code: string) => (
                <div key={code} className="font-mono font-bold text-blue-600">
                  {code}
                </div>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => push('/students')}
          className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl"
        >
          Go to Student List
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4">
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl space-y-8">
        <div className="flex items-center justify-between border-b border-gray-50 pb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Receipt size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Admission & enrollment payment</h1>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                Student: {student.first_name} {student.last_name}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">
              Finalized academic fee (structure)
            </p>
            <p className="text-2xl font-black text-slate-900 tracking-tighter">
              ₹{Number(student.fee_stats?.total_fee || student.proposed_fee || 0).toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Admission fee is separate and not included above.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Payments</h3>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    School admission fee (reference: ₹{configuredAdmission.toLocaleString('en-IN')})
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={amountPayingAdmission || ''}
                      onChange={(e) => setAmountPayingAdmission(Number(e.target.value))}
                      className="w-full pl-10 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl text-lg font-black outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    Fixed deposit
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={fixedDeposit || ''}
                      onChange={(e) => setFixedDeposit(Number(e.target.value))}
                      className="w-full pl-10 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl text-lg font-black outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    Optional: pay towards academic fee now
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={tuitionPayment || ''}
                      onChange={(e) => setTuitionPayment(Number(e.target.value))}
                      className="w-full pl-10 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl text-lg font-black outline-none transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium italic">
                    Applied only to the annual academic invoice — never mixed with admission fee.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Payment method</h3>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              {['UPI', 'NEFT', 'RTGS', 'CHEQUE', 'DD', 'ONLINE'].includes(paymentMode) && (
                <input
                  placeholder="Reference / transaction ID"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none focus:border-blue-600 transition-all"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex-1 bg-slate-900 rounded-[2rem] p-10 text-white space-y-10 shadow-2xl shadow-slate-900/20">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Total to record</p>
                <p className="text-6xl font-black tracking-tighter">₹{totalAmount.toLocaleString('en-IN')}</p>
              </div>

              <div className="space-y-6 pt-10 border-t border-slate-800">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Admission</span>
                  <span className="font-black">₹{Number(amountPayingAdmission).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Academic</span>
                  <span className="font-black">₹{Number(tuitionPayment).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Fixed Deposit</span>
                  <span className="font-black">₹{Number(fixedDeposit).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={saving || totalAmount <= 0}
                className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-600/20 hover:bg-blue-500 hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 transition-all flex items-center justify-center gap-3"
              >
                {saving ? 'Processing...' : (
                  <>
                    Confirm &amp; record <ArrowRight size={20} />
                  </>
                )}
              </button>
            </div>

            <div className="mt-6 flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <AlertCircle size={18} className="text-amber-500 shrink-0" />
              <p className="text-[10px] text-amber-800 font-semibold leading-relaxed">
                Admission fee is posted to an ADM invoice and fixed deposit to an FDP invoice. Academic fee payments
                reduce only the annual school fee invoice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
