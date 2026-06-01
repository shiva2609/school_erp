"use client";

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { 
  Users, Calendar, Receipt, BookOpen, Clock, CheckCircle2, AlertCircle, 
  User, ChevronDown, FileText, PenTool, Bus, IndianRupee,
  CreditCard, Banknote, ChevronRight, Check, X, Download, Award
} from 'lucide-react';
import { toast } from 'react-hot-toast';

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
    toast.success('Receipt downloaded!');
  } catch {
    toast.error('Receipt not available. Template may not be configured.');
  }
};

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  class_section: string;
  photo_url?: string;
  branch_name?: string;
  enroll_no?: string;
  committed_fee?: number;
  transport_opted?: boolean;
  transport_fee?: number;
  transport_route?: string;
}

interface PaymentRecord {
  id: string;
  receipt_number: string;
  amount: number;
  payment_mode: string;
  payment_date: string;
  status: string;
  reference_number?: string;
  bank_name?: string;
  created_at: string;
}

interface InvoiceItem {
  category: string;
  original_amount: number;
  concession: number;
  final_amount: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  month: string;
  due_date?: string;
  issued_date?: string;
  gross_amount: number;
  concession_amount: number;
  late_fee_amount: number;
  net_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: string;
  payments: PaymentRecord[];
  items: InvoiceItem[];
}

interface AttendanceRecord {
  date: string;
  status: string;
}

interface HomeworkItem {
  id: string;
  title: string;
  description: string;
  subject: string;
  subject_name: string;
  due_date: string;
  activity_type: string;
  is_published: boolean;
  created_at: string;
  posted_by?: string;
  acknowledged: boolean;
}

interface ExamResultItem {
  subject: string;
  marks_obtained: number | null;
  is_absent: boolean;
  max_marks: number;
  percentage: number | null;
  grade: string | null;
  subject_rank: number | null;
  remarks: string | null;
}

interface ExamTermGroup {
  term_id: string;
  term_name: string;
  results: ExamResultItem[];
}

export default function ParentDashboard({ user }: { user: any }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [exams, setExams] = useState<ExamTermGroup[]>([]);
  const [transportInfo, setTransportInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [childDropdownOpen, setChildDropdownOpen] = useState(false);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState<string | null>(null);

  // Load children list
  useEffect(() => {
    api.get('parent/children/')
      .then(res => {
        const data = res.data.data || res.data.results || res.data;
        const list = Array.isArray(data) ? data : [];
        setChildren(list);
        if (list.length > 0) setSelectedChild(list[0].id);
      })
      .catch(err => {
        toast.error('Failed to load your children\'s data');
      })
      .finally(() => setLoading(false));
  }, []);

  // Load child-specific data when child or tab changes
  useEffect(() => {
    if (!selectedChild) return;
    
    if (activeTab === 'overview' || activeTab === 'fees') {
      api.get(`parent/children/${selectedChild}/fees/invoices/`)
        .then(res => {
          const data = res.data.data || res.data.results || res.data;
          setInvoices(Array.isArray(data) ? data : []);
        })
        .catch(() => setInvoices([]));
    }
    if (activeTab === 'overview' || activeTab === 'attendance') {
      api.get(`parent/children/${selectedChild}/attendance/`)
        .then(res => {
          const data = res.data.data || res.data.results || res.data;
          setAttendance(Array.isArray(data) ? data : []);
        })
        .catch(() => setAttendance([]));
    }
    if (activeTab === 'overview' || activeTab === 'homework') {
      api.get(`parent/children/${selectedChild}/homework/`)
        .then(res => {
          const data = res.data.data || res.data.results || res.data;
          setHomework(Array.isArray(data) ? data : []);
        })
        .catch(() => setHomework([]));
    }
    if (activeTab === 'overview' || activeTab === 'exams') {
      api.get(`parent/children/${selectedChild}/marks/`)
        .then(res => {
          const data = res.data?.data || res.data;
          setExams(Array.isArray(data) ? data : []);
        })
        .catch(() => setExams([]));
    }
    if (activeTab === 'transport' || activeTab === 'overview') {
      api.get(`parent/children/${selectedChild}/transport/`)
        .then(res => {
          setTransportInfo(res.data?.data || null);
        })
        .catch(() => setTransportInfo(null));
    }
  }, [selectedChild, activeTab]);

  const currentChild = children.find(c => c.id === selectedChild);
  const totalDue = invoices.reduce((sum, inv) => sum + (Number(inv.outstanding_amount) || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
  
  // Transport Fee specific calculations
  let transportTotalDue = 0;
  let transportTotalPaid = 0;
  
  invoices.forEach(inv => {
    const isTransport = inv.invoice_number?.startsWith('TRN-');
    if (isTransport) {
      const tAmount = Number(inv.net_amount) || 0;
      transportTotalPaid += Number(inv.paid_amount) || 0;
      transportTotalDue += Number(inv.outstanding_amount) || 0;
    } else {
      // Legacy bundled invoice fallback
      const transportItem = inv.items?.find((i: any) => i.category_name?.toUpperCase().includes('TRANSPORT'));
      if (transportItem) {
        const tAmount = Number(transportItem.final_amount);
        if (inv.status === 'PAID') {
          transportTotalPaid += tAmount;
        } else if (inv.status === 'PARTIALLY_PAID' || inv.status === 'PARTIAL') {
          const ratio = Number(inv.paid_amount) / (Number(inv.net_amount) || 1);
          transportTotalPaid += tAmount * ratio;
          transportTotalDue += tAmount * (1 - ratio);
        } else {
          transportTotalDue += tAmount;
        }
      }
    }
  });

  const attendanceRate = attendance.length > 0 
    ? Math.round((attendance.filter(a => ['PRESENT', 'LATE', 'HALF_DAY'].includes(a.status?.toUpperCase())).length / attendance.length) * 100) 
    : 0;
  const pendingHw = homework.filter(h => new Date(h.due_date) >= new Date()).length;

  const baseTabs = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'fees', label: 'Fees', icon: Receipt },
    { id: 'attendance', label: 'Attendance', icon: Calendar },
    { id: 'homework', label: 'Homework', icon: PenTool },
    { id: 'exams', label: 'Exams', icon: Award },
  ];

  const tabs = currentChild?.transport_opted 
    ? [...baseTabs, { id: 'transport', label: 'Transport', icon: Bus }]
    : baseTabs;

  const paymentModeIcon = (mode: string) => {
    switch (mode) {
      case 'CASH': return <Banknote size={14} className="text-emerald-600" />;
      case 'UPI': return <CreditCard size={14} className="text-violet-600" />;
      default: return <CreditCard size={14} className="text-blue-600" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'PAID': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'PARTIALLY_PAID': case 'PARTIAL': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'OVERDUE': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  // Acknowledge homework
  const handleAcknowledge = async (hwId: string) => {
    if (!selectedChild) return;
    setAckLoading(hwId);
    try {
      const res = await api.post(`parent/children/${selectedChild}/homework/${hwId}/acknowledge/`);
      setHomework(prev => prev.map(h => h.id === hwId ? { ...h, acknowledged: res.data.acknowledged } : h));
    } catch {
      toast.error('Failed to update acknowledgment');
    } finally {
      setAckLoading(null);
    }
  };

  // Group homework by date for diary view
  const homeworkByDate = homework.reduce((acc, hw) => {
    const date = hw.due_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(hw);
    return acc;
  }, {} as Record<string, HomeworkItem[]>);

  const sortedDates = Object.keys(homeworkByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.getTime() === today.getTime()) return 'Today';
    if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
    if (d.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const isOverdue = (dateStr: string) => {
    return new Date(dateStr) < new Date(new Date().toDateString());
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-10">
        <div className="h-10 w-64 bg-gray-100 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-28 bg-white rounded-2xl border animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <Users className="mx-auto text-slate-200 mb-4" size={48} />
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Children Linked</h2>
          <p className="text-gray-500 text-sm">Your account doesn&apos;t have any children linked yet. Please contact the school administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header with child selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Welcome, {user?.first_name}
          </h1>
          <p className="text-gray-500 mt-1">View your children&apos;s academic progress and fee details.</p>
        </div>

        {/* Child Selector Dropdown — always visible so parent knows which child is active */}
        <div className="relative">
          <button
            onClick={() => setChildDropdownOpen(!childDropdownOpen)}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2.5 hover:border-blue-300 transition-all shadow-sm"
          >
            <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {currentChild?.first_name?.charAt(0)}
            </div>
            <span className="font-bold text-slate-900 text-sm">{[currentChild?.first_name, currentChild?.last_name].filter(Boolean).join(' ')}</span>
            {children.length > 1 && <ChevronDown size={14} className="text-slate-400" />}
          </button>
          {childDropdownOpen && children.length > 1 && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-100 rounded-xl shadow-xl z-50">
              {children.map(child => (
                <button
                  key={child.id}
                  onClick={() => { setSelectedChild(child.id); setChildDropdownOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                    child.id === selectedChild ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                    {child.first_name?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-900">{[child.first_name, child.last_name].filter(Boolean).join(' ')}</p>
                    <p className="text-xs text-slate-400">{child.class_section} • {child.branch_name || 'Main'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Child Info Card */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
              <User className="text-white" size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight">{[currentChild?.first_name, currentChild?.last_name].filter(Boolean).join(' ')}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-blue-100 text-sm font-medium">
                <span>{currentChild?.class_section}</span>
                <span className="w-1 h-1 bg-blue-300 rounded-full" />
                <span>{currentChild?.branch_name}</span>
                <span className="w-1 h-1 bg-blue-300 rounded-full" />
                <span className="text-blue-200 font-mono">#{currentChild?.enroll_no || currentChild?.admission_number}</span>
                {currentChild?.transport_opted && (
                  <span className="inline-flex items-center gap-1 bg-emerald-500/30 text-emerald-100 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ml-1">
                    <Bus size={10} /> Transport
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Fee Summary */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 min-w-[140px]">
                <p className="text-blue-200 text-[10px] font-black uppercase tracking-widest mb-1">Total Fee</p>
                <p className="text-2xl font-black tracking-tighter">₹{currentChild?.committed_fee?.toLocaleString('en-IN') || '0'}</p>
              </div>
              <div className="bg-emerald-500/20 backdrop-blur-md rounded-2xl p-4 border border-emerald-400/20 min-w-[140px]">
                <p className="text-emerald-200 text-[10px] font-black uppercase tracking-widest mb-1">Paid</p>
                <p className="text-2xl font-black tracking-tighter">₹{totalPaid.toLocaleString('en-IN')}</p>
              </div>
              {totalDue > 0 && (
                <div className="bg-rose-500/20 backdrop-blur-md rounded-2xl p-4 border border-rose-400/20 min-w-[140px]">
                  <p className="text-rose-200 text-[10px] font-black uppercase tracking-widest mb-1">Due</p>
                  <p className="text-2xl font-black tracking-tighter">₹{totalDue.toLocaleString('en-IN')}</p>
                </div>
              )}
            </div>

            {/* Transport Fee Breakdown (If applicable) */}
            {currentChild?.transport_opted && (transportTotalPaid > 0 || transportTotalDue > 0) && (
              <div className="flex gap-3 mt-2 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2 mr-2">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <Bus size={14} className="text-white" />
                  </div>
                  <span className="text-xs font-bold text-blue-100 uppercase tracking-widest">Transport</span>
                </div>
                <div className="bg-white/5 rounded-xl px-4 py-2 border border-white/10 flex items-center gap-2">
                  <p className="text-emerald-200 text-[10px] font-black uppercase tracking-widest">Paid:</p>
                  <p className="text-sm font-black text-white">₹{Math.round(transportTotalPaid).toLocaleString('en-IN')}</p>
                </div>
                {transportTotalDue > 0 && (
                  <div className="bg-rose-500/10 rounded-xl px-4 py-2 border border-rose-400/20 flex items-center gap-2">
                    <p className="text-rose-200 text-[10px] font-black uppercase tracking-widest">Pending:</p>
                    <p className="text-sm font-black text-rose-100">₹{Math.round(transportTotalDue).toLocaleString('en-IN')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 flex-1 justify-center py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={14} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center">
                  <Receipt size={16} className="text-rose-600" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outstanding</span>
              </div>
              <p className="text-2xl font-black text-slate-900">₹{totalDue.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Attendance</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{attendanceRate}%</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                  <PenTool size={16} className="text-amber-600" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending HW</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{pendingHw}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
                  <Award size={16} className="text-purple-600" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Exams</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{exams.length}</p>
            </div>
          </div>

          {/* Recent Payments */}
          {(() => {
            const allPayments = invoices.flatMap(inv => 
              (inv.payments || []).map(p => ({ ...p, invoice_number: inv.invoice_number }))
            ).sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
            
            if (allPayments.length === 0) return null;
            
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                  <IndianRupee size={16} className="text-emerald-500" />
                  <h3 className="font-bold text-gray-900">Recent Payments</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {allPayments.slice(0, 5).map(p => (
                    <div key={p.id} className="flex items-center justify-between px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        {paymentModeIcon(p.payment_mode)}
                        <div>
                          <p className="font-bold text-sm text-slate-900">{p.receipt_number || 'Payment'}</p>
                          <p className="text-xs text-slate-400">{p.payment_mode} • {new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                      </div>
                      <p className="font-black text-emerald-600">₹{p.amount.toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── FEES TAB ─── */}
      {activeTab === 'fees' && (
        <div className="space-y-6">
          {/* All Payments Summary */}
          {(() => {
            const allPayments = invoices.flatMap(inv => 
              (inv.payments || []).map(p => ({ ...p, invoice_number: inv.invoice_number }))
            ).sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
            
            if (allPayments.length === 0) return null;
            
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IndianRupee size={16} className="text-emerald-500" />
                    <h3 className="font-bold text-gray-900">All Payments Made</h3>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">{allPayments.length} payment{allPayments.length > 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {allPayments.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                          {paymentModeIcon(p.payment_mode)}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-900">{p.receipt_number}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {p.payment_mode}
                            {p.reference_number ? ` • Ref: ${p.reference_number}` : ''}
                            {p.bank_name ? ` • ${p.bank_name}` : ''}
                            {' • For: '}{p.invoice_number}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-black text-emerald-600 text-lg">₹{p.amount.toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <button
                          onClick={() => downloadReceipt(p.id, p.receipt_number)}
                          title="Download Receipt"
                          className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Invoices */}
          <div>
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Receipt size={16} className="text-blue-500" />
              Invoice Details
            </h3>
          </div>
          {invoices.length > 0 ? (
            invoices.map(inv => (
              <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Invoice Header */}
                <button
                  onClick={() => setExpandedInvoice(expandedInvoice === inv.id ? null : inv.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      inv.status === 'PAID' ? 'bg-emerald-50' : inv.status === 'OVERDUE' ? 'bg-rose-50' : 'bg-amber-50'
                    }`}>
                      <Receipt size={18} className={
                        inv.status === 'PAID' ? 'text-emerald-600' : inv.status === 'OVERDUE' ? 'text-rose-600' : 'text-amber-600'
                      } />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{inv.invoice_number}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {inv.month ? `Period: ${inv.month}` : ''}
                        {inv.due_date ? ` • Due: ${new Date(inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-black text-slate-900">₹{Number(inv.net_amount).toLocaleString('en-IN')}</p>
                      {Number(inv.outstanding_amount) > 0 && (
                        <p className="text-xs text-rose-500 font-bold">Balance: ₹{Number(inv.outstanding_amount).toLocaleString('en-IN')}</p>
                      )}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${statusColor(inv.status)}`}>
                      {inv.status?.replace('_', ' ')}
                    </span>
                    <ChevronRight size={16} className={`text-slate-300 transition-transform ${expandedInvoice === inv.id ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {/* Expanded Details */}
                {expandedInvoice === inv.id && (
                  <div className="border-t border-gray-100">
                    {/* Fee Breakdown */}
                    {inv.items && inv.items.length > 0 && (
                      <div className="px-6 py-4 bg-slate-50/50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Fee Breakdown</p>
                        <div className="space-y-2">
                          {inv.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">{item.category}</span>
                              <div className="flex items-center gap-3">
                                {item.concession > 0 && (
                                  <span className="text-xs text-emerald-600 font-medium">-₹{item.concession.toLocaleString('en-IN')} concession</span>
                                )}
                                <span className="font-bold text-slate-900">₹{item.final_amount.toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          ))}
                          {inv.late_fee_amount > 0 && (
                            <div className="flex items-center justify-between text-sm pt-2 border-t border-dashed border-slate-200">
                              <span className="text-rose-500">Late Fee</span>
                              <span className="font-bold text-rose-600">+₹{inv.late_fee_amount.toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-200 font-black">
                            <span className="text-slate-900">Net Amount</span>
                            <span className="text-slate-900">₹{Number(inv.net_amount).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payment History */}
                    {inv.payments && inv.payments.length > 0 && (
                      <div className="px-6 py-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Payment History</p>
                        <div className="space-y-2">
                          {inv.payments.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-emerald-50/50 rounded-xl px-4 py-3">
                              <div className="flex items-center gap-3">
                                {paymentModeIcon(p.payment_mode)}
                                <div>
                                  <p className="font-bold text-sm text-slate-900">{p.receipt_number}</p>
                                  <p className="text-xs text-slate-400">
                                    {p.payment_mode}
                                    {p.reference_number ? ` • Ref: ${p.reference_number}` : ''}
                                    {p.bank_name ? ` • ${p.bank_name}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <p className="font-black text-emerald-600">₹{p.amount.toLocaleString('en-IN')}</p>
                                  <p className="text-[10px] text-slate-400">
                                    {new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </p>
                                </div>
                                <button
                                  onClick={() => downloadReceipt(p.id, p.receipt_number)}
                                  title="Download Receipt"
                                  className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                                >
                                  <Download size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Summary Row */}
                    <div className="px-6 py-3 bg-slate-50 flex items-center justify-between text-sm border-t border-gray-100">
                      <span className="text-slate-500">Total Paid: <span className="font-bold text-emerald-600">₹{Number(inv.paid_amount).toLocaleString('en-IN')}</span></span>
                      {Number(inv.outstanding_amount) > 0 && (
                        <span className="text-slate-500">Remaining: <span className="font-bold text-rose-600">₹{Number(inv.outstanding_amount).toLocaleString('en-IN')}</span></span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <FileText className="mx-auto text-slate-200 mb-3" size={32} />
              <p className="text-slate-400 text-sm font-medium">No invoices found</p>
            </div>
          )}
        </div>
      )}

      {/* ─── ATTENDANCE TAB ─── */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Attendance History</h3>
            <span className="text-sm font-bold text-emerald-600">{attendanceRate}% present</span>
          </div>
          {attendance.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {attendance.slice(0, 30).map((record, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 transition-colors">
                  <span className="text-sm text-slate-700">
                    {new Date(record.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                    record.status === 'PRESENT' ? 'bg-emerald-50 text-emerald-700' :
                    record.status === 'ABSENT' ? 'bg-rose-50 text-rose-700' :
                    record.status === 'LATE' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-50 text-slate-600'
                  }`}>
                    {record.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Calendar className="mx-auto text-slate-200 mb-3" size={32} />
              <p className="text-slate-400 text-sm font-medium">No attendance records found</p>
            </div>
          )}
        </div>
      )}

      {/* ─── HOMEWORK TAB (DIARY STYLE) ─── */}
      {activeTab === 'homework' && (
        <div className="space-y-5">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-emerald-100 border border-emerald-300 rounded-sm" />
              Acknowledged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-slate-100 border border-slate-200 rounded-sm" />
              Pending
            </span>
          </div>

          {sortedDates.length > 0 ? (
            sortedDates.map(date => (
              <div key={date}>
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isOverdue(date) ? 'bg-rose-50' : 'bg-blue-50'
                  }`}>
                    <Calendar size={18} className={isOverdue(date) ? 'text-rose-500' : 'text-blue-500'} />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">{formatDate(date)}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {homeworkByDate[date].length} assignment{homeworkByDate[date].length > 1 ? 's' : ''} due
                      {isOverdue(date) && <span className="text-rose-500 ml-2">• OVERDUE</span>}
                    </p>
                  </div>
                </div>

                {/* Homework Cards */}
                <div className="space-y-2 ml-[52px]">
                  {homeworkByDate[date].map(hw => (
                    <div key={hw.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                      hw.acknowledged ? 'border-emerald-200 bg-emerald-50/30' : isOverdue(date) ? 'border-rose-100' : 'border-gray-100'
                    }`}>
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Subject Badge */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wide">
                                <BookOpen size={10} />
                                {hw.subject_name || hw.subject}
                              </span>
                              {hw.activity_type && hw.activity_type !== 'HOMEWORK' && (
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{hw.activity_type}</span>
                              )}
                              {hw.posted_by && (
                                <span className="text-[10px] text-slate-300">by {hw.posted_by}</span>
                              )}
                            </div>
                            {/* Title */}
                            <h4 className={`font-bold text-sm ${
                              hw.acknowledged ? 'text-slate-500 line-through' : 'text-slate-900'
                            }`}>{hw.title}</h4>
                            {/* Description */}
                            {hw.description && (
                              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{hw.description}</p>
                            )}
                          </div>
                          
                          {/* Acknowledge Toggle */}
                          <button
                            onClick={() => handleAcknowledge(hw.id)}
                            disabled={ackLoading === hw.id}
                            className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                              hw.acknowledged
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
                            }`}
                          >
                            {ackLoading === hw.id ? (
                              <span className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                            ) : hw.acknowledged ? (
                              <>
                                <Check size={14} />
                                Done
                              </>
                            ) : (
                              <>
                                <Clock size={14} />
                                Mark Done
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <PenTool className="mx-auto text-slate-200 mb-3" size={32} />
              <p className="text-slate-400 font-bold text-sm">No homework assigned yet</p>
              <p className="text-slate-300 text-xs mt-1">Homework from teachers will appear here</p>
            </div>
          )}
        </div>
      )}

      {/* ─── TRANSPORT TAB ─── */}
      {activeTab === 'transport' && currentChild?.transport_opted && (
        <div className="space-y-6">
          {/* Transport Configuration Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
              <Bus size={16} className="text-blue-500" />
              <h3 className="font-bold text-gray-900">Current Transport Configuration</h3>
            </div>
            {transportInfo ? (
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Route Model</p>
                  <p className="font-bold text-slate-900">{transportInfo.route_name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Distance</p>
                  <p className="font-bold text-slate-900">{transportInfo.distance_km} KM</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Pickup Point</p>
                  <p className="font-bold text-slate-900">{transportInfo.pickup_point || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Monthly Fee</p>
                  <p className="font-black text-blue-600">₹{transportInfo.monthly_fee?.toLocaleString('en-IN')}</p>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-sm">
                Fetching transport details...
              </div>
            )}
          </div>

          {/* Transport Invoices / Transactions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-emerald-500" />
                <h3 className="font-bold text-gray-900">Transport Transactions</h3>
              </div>
            </div>
            
            <div className="divide-y divide-gray-50">
              {(() => {
                const transportInvoices = invoices.filter(inv => 
                  inv.invoice_number?.startsWith('TRN-') || inv.items?.some((i: any) => i.category_name?.toUpperCase().includes('TRANSPORT'))
                );

                if (transportInvoices.length === 0) {
                  return (
                    <div className="p-12 text-center">
                      <Bus className="mx-auto text-slate-200 mb-3" size={32} />
                      <p className="text-slate-400 font-bold text-sm">No transport invoices generated yet.</p>
                    </div>
                  );
                }

                return transportInvoices.map(inv => {
                  const isLegacy = !inv.invoice_number?.startsWith('TRN-');
                  const transportItem = isLegacy ? inv.items?.find((i: any) => i.category_name?.toUpperCase().includes('TRANSPORT')) : null;
                  const tAmount = isLegacy ? Number(transportItem?.final_amount || 0) : Number(inv.net_amount);
                  
                  let tPaid = 0;
                  let tDue = tAmount;
                  if (inv.status === 'PAID') {
                    tPaid = tAmount;
                    tDue = 0;
                  } else if (inv.status === 'PARTIALLY_PAID' || inv.status === 'PARTIAL') {
                    if (isLegacy) {
                      const ratio = Number(inv.paid_amount) / (Number(inv.net_amount) || 1);
                      tPaid = tAmount * ratio;
                      tDue = tAmount * (1 - ratio);
                    } else {
                      tPaid = Number(inv.paid_amount);
                      tDue = Number(inv.outstanding_amount);
                    }
                  } else if (inv.status === 'OVERDUE') {
                      tPaid = Number(inv.paid_amount) || 0;
                      tDue = Number(inv.outstanding_amount) || tAmount;
                  }

                  // Find payments that applied to this invoice
                  const hasPayments = inv.payments && inv.payments.length > 0;

                  return (
                    <div key={inv.id} className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-slate-900">{inv.month || 'Current Period'}</h4>
                            <span className="text-[10px] text-slate-400 font-mono">Invoice #{inv.invoice_number}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">Transport Fee: ₹{tAmount.toLocaleString('en-IN')}</p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            {tPaid > 0 && (
                              <p className="text-sm font-black text-emerald-600">Paid: ₹{Math.round(tPaid).toLocaleString('en-IN')}</p>
                            )}
                            {tDue > 0 && (
                              <p className="text-sm font-black text-rose-500">Due: ₹{Math.round(tDue).toLocaleString('en-IN')}</p>
                            )}
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                            tDue === 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 
                            tPaid > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-rose-50 text-rose-600 border-rose-200'
                          }`}>
                            {tDue === 0 ? 'PAID' : tPaid > 0 ? 'PARTIAL' : 'PENDING'}
                          </span>
                        </div>
                      </div>

                      {/* Display relevant payment transactions for this invoice if any */}
                      {hasPayments && tPaid > 0 && (
                        <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payments Applied to this Invoice</p>
                          <div className="space-y-2">
                            {inv.payments.map(p => (
                              <div key={p.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-slate-600 font-medium">
                                  <CheckCircle2 size={12} className="text-emerald-500" />
                                  {new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} • {p.payment_mode}
                                </div>
                                <span className="font-bold text-emerald-600">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
      {/* ─── EXAMS TAB ─── */}
      {activeTab === 'exams' && (
        <div className="space-y-6">
          {exams.length > 0 ? (
            exams.map(group => (
              <div key={group.term_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                  <Award size={16} className="text-purple-500" />
                  <h3 className="font-bold text-gray-900">{group.term_name} Results</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                      <tr>
                        <th className="px-6 py-3">Subject</th>
                        <th className="px-6 py-3">Marks</th>
                        <th className="px-6 py-3">Grade</th>
                        <th className="px-6 py-3">Rank</th>
                        <th className="px-6 py-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.results.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 font-medium text-slate-900">{r.subject}</td>
                          <td className="px-6 py-4">
                            {r.is_absent ? (
                              <span className="text-rose-500 font-bold">AB</span>
                            ) : (
                              <span className="font-bold text-slate-900">{r.marks_obtained} <span className="text-slate-400 font-normal">/ {r.max_marks}</span></span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-slate-900">{r.grade || '—'}</span>
                          </td>
                          <td className="px-6 py-4">
                            {r.subject_rank ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-600 font-bold text-xs">
                                {r.subject_rank}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-6 py-4 text-slate-500">{r.remarks || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <Award className="mx-auto text-slate-200 mb-3" size={32} />
              <p className="text-slate-400 font-bold text-sm">No exam results published yet</p>
              <p className="text-slate-300 text-xs mt-1">Once teachers publish the marks, they will appear here</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
