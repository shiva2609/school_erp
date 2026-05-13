"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import api from "@/lib/axios";
import { CheckCircle, XCircle, Clock, ShieldCheck, AlertTriangle, Inbox, IndianRupee, Building2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "@/components/common/ConfirmProvider";
import { useAuth } from "@/components/common/AuthProvider";
import { useBranch } from "@/components/common/BranchContext";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

interface ApprovalRequest {
  id: string;
  student: string;
  student_name: string;
  branch_name: string;
  academic_year_name?: string;
  class_section_display?: string;
  standard_total: number;
  offered_total: number;
  reduction_amount: number;
  reason: string;
  status: ApprovalStatus;
  requested_by_name: string;
  reviewed_by_name: string | null;
  admin_remarks: string;
  created_at: string;
  reviewed_at: string | null;
}

interface PendingExpense {
  id: string;
  title: string;
  description?: string | null;
  amount: string;
  expense_date: string;
  payment_mode: string;
  status: string;
  category_name?: string;
  vendor_display?: string | null;
  branch_name?: string;
  submitted_by_name?: string | null;
  approval_routing?: "AUTO" | "ZONAL_ADMIN" | "SUPER_ADMIN" | null;
}

const FEE_APPROVAL_API_ROLES = new Set(["SUPER_ADMIN", "ZONAL_ADMIN"]);
const EXPENSE_QUEUE_ROLES = new Set(["SUPER_ADMIN", "CHIEF_ACCOUNTANT", "ZONAL_ADMIN"]);

const AUTO_APPROVE_MAX = 3000;
const ZONAL_MAX = 5000;

function canUserApproveExpense(role: string | undefined, amount: number): boolean {
  if (!role) return false;
  const amt = Number(amount) || 0;
  if (amt <= AUTO_APPROVE_MAX) return false;
  if (role === "OWNER" || role === "SUPER_ADMIN") return true;
  if (amt > ZONAL_MAX) return false;
  return role === "ZONAL_ADMIN" || role === "CHIEF_ACCOUNTANT";
}

function routingBadge(routing: PendingExpense["approval_routing"], amount: number) {
  const amt = Number(amount) || 0;
  if (amt > ZONAL_MAX) return { label: "Super admin", className: "bg-violet-100 text-violet-800" };
  if (amt > AUTO_APPROVE_MAX) return { label: "Zonal / Chief", className: "bg-amber-100 text-amber-900" };
  return { label: routing === "AUTO" ? "Auto" : "—", className: "bg-slate-100 text-slate-600" };
}

export default function AdminApprovalsQueue() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBranch } = useBranch();
  const [activeTab, setActiveTab] = useState<ApprovalStatus>("PENDING");
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<PendingExpense[]>([]);
  const [expLoading, setExpLoading] = useState(false);
  const [processingExpense, setProcessingExpense] = useState<string | null>(null);
  const { confirm } = useConfirm();

  const canReviewFees = Boolean(user?.tenant && user?.role && FEE_APPROVAL_API_ROLES.has(user.role));
  const canReviewExpenses = Boolean(user?.tenant && user?.role && EXPENSE_QUEUE_ROLES.has(user.role));
  const canAccess = canReviewFees || canReviewExpenses;

  const branchQuery = useMemo(() => {
    if (!["SUPER_ADMIN", "OWNER", "CHIEF_ACCOUNTANT", "ZONAL_ADMIN"].includes(user?.role || "")) return "";
    if (selectedBranch && selectedBranch !== "all") return `&branch_id=${selectedBranch}`;
    return "";
  }, [selectedBranch, user?.role]);

  const fetchApprovals = useCallback(() => {
    if (!canReviewFees) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get(`fees/approvals/?status=${activeTab}`)
      .then((res) => {
        const data = res.data?.results ?? res.data?.data ?? res.data;
        setRequests(Array.isArray(data) ? data : []);
      })
      .catch(() => toast.error("Failed to load fee approval requests"))
      .finally(() => setLoading(false));
  }, [activeTab, canReviewFees]);

  const fetchExpenses = useCallback(() => {
    if (!canReviewExpenses) {
      setExpenses([]);
      return;
    }
    setExpLoading(true);
    api
      .get(`expenses/?status=SUBMITTED&page_size=100${branchQuery}`)
      .then((res) => {
        const raw = res.data?.results ?? res.data?.data?.results ?? res.data?.data ?? res.data;
        setExpenses(Array.isArray(raw) ? raw : []);
      })
      .catch(() => toast.error("Failed to load submitted expenses"))
      .finally(() => setExpLoading(false));
  }, [branchQuery, canReviewExpenses]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleApprove = async (id: string, studentName: string) => {
    const ok = await confirm({
      title: "Approve fee reduction",
      message: `Approve the fee reduction for ${studentName}? This will activate the student's enrollment fee terms.`,
      confirmText: "Approve",
      isDestructive: false,
    });
    if (!ok) return;

    try {
      await api.post(`fees/approvals/${id}/approve/`, { remarks: "" });
      toast.success(`Fee reduction for ${studentName} approved`);
      fetchApprovals();
    } catch {
      toast.error("Failed to approve request");
    }
  };

  const handleReject = async (id: string, studentName: string) => {
    const ok = await confirm({
      title: "Reject fee reduction",
      message: `Reject the fee reduction request for ${studentName}?`,
      confirmText: "Reject",
      isDestructive: true,
    });
    if (!ok) return;

    try {
      const res = await api.post(`fees/approvals/${id}/reject/`, { remarks: "" });
      toast.success(res.data?.message || `Fee reduction for ${studentName} rejected`);
      fetchApprovals();
    } catch {
      toast.error("Failed to reject request");
    }
  };

  const handleExpenseApprove = async (e: PendingExpense) => {
    if (!canUserApproveExpense(user?.role, Number(e.amount))) {
      toast.error(
        Number(e.amount) > ZONAL_MAX
          ? "Only school super admin can approve expenses above ₹5,000."
          : "You are not allowed to approve this expense tier.",
      );
      return;
    }
    const ok = await confirm({
      title: "Approve expense",
      message: `Approve ₹${Number(e.amount).toLocaleString("en-IN")} — ${e.title}? This posts to the cashbook.`,
      confirmText: "Approve",
      isDestructive: false,
    });
    if (!ok) return;
    setProcessingExpense(e.id);
    try {
      await api.patch(`expenses/${e.id}/status/`, { status: "APPROVED" });
      toast.success("Expense approved");
      fetchExpenses();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Approval failed");
    } finally {
      setProcessingExpense(null);
    }
  };

  const handleExpenseReject = async (e: PendingExpense) => {
    if (!canUserApproveExpense(user?.role, Number(e.amount))) {
      toast.error("You are not allowed to reject this expense for the same routing rules.");
      return;
    }
    const ok = await confirm({
      title: "Reject expense",
      message: `Reject submitted expense: ${e.title}?`,
      confirmText: "Reject",
      isDestructive: true,
    });
    if (!ok) return;
    const reason = typeof window !== "undefined" ? window.prompt("Reason (optional):") : "";
    if (reason === null) return;
    setProcessingExpense(e.id);
    try {
      await api.patch(`expenses/${e.id}/status/`, { status: "REJECTED", reason: reason || "" });
      toast.success("Expense rejected");
      fetchExpenses();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Rejection failed");
    } finally {
      setProcessingExpense(null);
    }
  };

  const tabs: { key: ApprovalStatus; label: string; icon: React.ReactNode }[] = [
    { key: "PENDING", label: "Pending", icon: <Clock size={14} /> },
    { key: "APPROVED", label: "Approved", icon: <CheckCircle size={14} /> },
    { key: "REJECTED", label: "Rejected", icon: <XCircle size={14} /> },
  ];

  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Loading…</div>;
  }

  if (!canAccess) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-3">
        <AlertTriangle className="mx-auto text-amber-500" size={40} />
        <h1 className="text-xl font-bold text-gray-900">Access restricted</h1>
        <p className="text-gray-600 text-sm">
          Approvals are available to zonal admin, chief accountant, or tenant super admin (fee concessions), and the
          same finance roles for expense queues by amount tier.
        </p>
      </div>
    );
  }

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatRupee = (n: number | string | undefined) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-10">
      <div className="flex items-center gap-4">
        <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
          <p className="text-gray-500 text-sm">
            Fee concessions and submitted operational expenses. Expenses above ₹3,000 up to ₹5,000: zonal admin or chief
            accountant; above ₹5,000: school super admin only.
          </p>
        </div>
      </div>

      {canReviewExpenses && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Expense approvals
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {expLoading ? (
              <div className="p-10 space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-24 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : expenses.length === 0 ? (
              <div className="py-14 flex flex-col items-center text-gray-400">
                <Inbox size={40} strokeWidth={1.5} />
                <p className="mt-3 font-semibold text-gray-500">No submitted expenses</p>
                <p className="text-sm text-center max-w-md">
                  Accountant-submitted expenses over ₹3,000 appear here. Under ₹3,000 they auto-post on submit.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {expenses.map((ex) => {
                  const badge = routingBadge(ex.approval_routing, Number(ex.amount));
                  const canAct = canUserApproveExpense(user?.role, Number(ex.amount));
                  return (
                    <li key={ex.id} className="p-6 hover:bg-gray-50/50 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900">
                              EXPENSE
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                              {badge.label}
                            </span>
                            {ex.branch_name ? (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                <Building2 size={12} />
                                {ex.branch_name}
                              </span>
                            ) : null}
                          </div>
                          <p className="font-semibold text-gray-900">{ex.title}</p>
                          {ex.description ? <p className="text-sm text-gray-600">{ex.description}</p> : null}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                            {ex.category_name ? (
                              <span>
                                <span className="font-bold text-gray-500">Type: </span>
                                {ex.category_name}
                              </span>
                            ) : null}
                            {ex.vendor_display ? (
                              <span>
                                <span className="font-bold text-gray-500">Vendor: </span>
                                {ex.vendor_display}
                              </span>
                            ) : null}
                            <span>
                              <span className="font-bold text-gray-500">Date: </span>
                              {ex.expense_date
                                ? new Date(ex.expense_date + "T12:00:00").toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </span>
                            <span>
                              <span className="font-bold text-gray-500">Mode: </span>
                              {ex.payment_mode || "—"}
                            </span>
                          </div>
                          {ex.submitted_by_name ? (
                            <p className="text-xs text-gray-500">Submitted by {ex.submitted_by_name}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <IndianRupee size={18} className="text-slate-500" />
                            <div>
                              <p className="text-[10px] font-bold uppercase text-slate-500">Amount</p>
                              <p className="text-lg font-black text-slate-900 tabular-nums">
                                {formatRupee(ex.amount)}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleExpenseReject(ex)}
                              disabled={!canAct || processingExpense === ex.id}
                              className="text-red-600 border border-red-200 px-3 py-2 rounded-lg bg-white hover:bg-red-50 text-sm font-medium disabled:opacity-40"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExpenseApprove(ex)}
                              disabled={!canAct || processingExpense === ex.id}
                              className="text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm disabled:opacity-40"
                            >
                              {processingExpense === ex.id ? "…" : "Approve"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {canReviewFees && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Fee concession approvals
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="border-b border-gray-200">
              <nav className="flex space-x-1 px-4 pt-2" aria-label="Fee approval tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? "border-indigo-500 text-indigo-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.key === "PENDING" && !loading && (
                      <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {requests.length}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {loading ? (
              <div className="p-10 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-gray-400">
                <Inbox size={48} strokeWidth={1.5} />
                <p className="mt-4 font-semibold text-gray-500">No {activeTab.toLowerCase()} fee requests</p>
                <p className="text-sm">
                  {activeTab === "PENDING"
                    ? "All fee concession requests in your routing scope have been reviewed."
                    : `No fee requests have been ${activeTab.toLowerCase()} yet.`}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {requests.map((req) => (
                  <li key={req.id} className="p-6 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                            FEE CONCESSION
                          </span>
                          <span className="text-sm font-semibold text-gray-900">{req.student_name}</span>
                          {req.branch_name && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {req.branch_name}
                            </span>
                          )}
                          <span className="text-sm text-gray-500">— Requested by {req.requested_by_name}</span>
                        </div>
                        {(req.academic_year_name || req.class_section_display) ? (
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                            {req.academic_year_name ? (
                              <span>
                                <span className="font-bold text-gray-500 uppercase tracking-wide">Academic year: </span>
                                {req.academic_year_name}
                              </span>
                            ) : null}
                            {req.class_section_display ? (
                              <span>
                                <span className="font-bold text-gray-500 uppercase tracking-wide">Class: </span>
                                {req.class_section_display}
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-3 text-sm">
                          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Locked fee
                            </span>
                            <span className="font-bold tabular-nums text-slate-900">{formatRupee(req.standard_total)}</span>
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                              Agreed fee
                            </span>
                            <span className="font-bold tabular-nums text-indigo-900">{formatRupee(req.offered_total)}</span>
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                              Discount
                            </span>
                            <span className="font-bold tabular-nums text-amber-900">{formatRupee(req.reduction_amount)}</span>
                          </div>
                        </div>
                        {req.reason?.trim() ? (
                          <p className="mt-2 text-sm text-gray-600">
                            <span className="font-semibold text-gray-700">Reason: </span>
                            {req.reason}
                          </p>
                        ) : null}

                        <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            Submitted {formatTimeAgo(req.created_at)}
                          </span>
                          {req.reviewed_by_name && (
                            <span>
                              Reviewed by <span className="font-medium text-gray-500">{req.reviewed_by_name}</span>
                            </span>
                          )}
                          {req.admin_remarks ? <span className="italic">&quot;{req.admin_remarks}&quot;</span> : null}
                        </div>
                      </div>

                      {activeTab === "PENDING" && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleReject(req.id, req.student_name)}
                            className="text-red-600 hover:text-red-800 border border-red-200 px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 flex items-center text-sm font-medium transition-colors"
                          >
                            <XCircle size={16} className="mr-1.5" /> Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprove(req.id, req.student_name)}
                            className="text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg flex items-center text-sm font-medium shadow-sm transition-colors"
                          >
                            <CheckCircle size={16} className="mr-1.5" /> Approve
                          </button>
                        </div>
                      )}

                      {activeTab === "APPROVED" && (
                        <span className="flex items-center gap-1 text-green-600 text-sm font-medium bg-green-50 px-3 py-1.5 rounded-lg">
                          <CheckCircle size={16} /> Approved
                        </span>
                      )}

                      {activeTab === "REJECTED" && (
                        <span className="flex items-center gap-1 text-red-600 text-sm font-medium bg-red-50 px-3 py-1.5 rounded-lg">
                          <XCircle size={16} /> Rejected
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
