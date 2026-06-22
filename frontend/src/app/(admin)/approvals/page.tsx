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
  request_type?: 'ADMISSION' | 'CONCESSION';
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

interface PendingVendorBill {
  id: string;
  bill_id: string;
  vendor_display: string;
  net_amount: string;
  total_amount: string;
  bill_date: string;
  payment_mode: string;
  status: string;
  items?: { id: string; expense_type_name: string; }[];
  branch_name?: string;
  submitted_by_name?: string | null;
  description?: string | null;
}

const FEE_APPROVAL_API_ROLES = new Set(["SUPER_ADMIN", "ZONAL_ADMIN"]);
const VENDOR_BILL_QUEUE_ROLES = new Set(["SUPER_ADMIN", "CHIEF_ACCOUNTANT", "ZONAL_ADMIN", "ACCOUNTANT", "BRANCH_ADMIN"]);

const AUTO_APPROVE_MAX = 3000;
const ZONAL_MAX = 5000;

function canUserApproveBill(role: string | undefined, amount: number): boolean {
  if (!role) return false;
  const amt = Number(amount) || 0;
  if (["OWNER", "SUPER_ADMIN"].includes(role)) return true;
  if (["ZONAL_ADMIN", "CHIEF_ACCOUNTANT"].includes(role)) return amt <= ZONAL_MAX;
  if (["ACCOUNTANT", "BRANCH_ADMIN"].includes(role)) return amt <= AUTO_APPROVE_MAX;
  return false;
}

function getApprovalTierLabel(amount: number): { label: string; badge: string; who: string } {
  const amt = Number(amount) || 0;
  if (amt > ZONAL_MAX)
    return { label: "Super Admin Only", badge: "bg-violet-100 text-violet-800", who: "Only school super admin can approve above ₹5,000" };
  if (amt > AUTO_APPROVE_MAX)
    return { label: "Zonal / Chief Acct.", badge: "bg-amber-100 text-amber-900", who: "Zonal admin or chief accountant can approve ₹3,001–₹5,000" };
  return { label: "Auto-Approved", badge: "bg-slate-100 text-slate-600", who: "Under ₹3,000 — auto-posted" };
}

function routingBadge(amount: number) {
  const tier = getApprovalTierLabel(amount);
  return { label: tier.label, className: tier.badge };
}

export default function AdminApprovalsQueue() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBranch } = useBranch();
  const [activeTab, setActiveTab] = useState<ApprovalStatus>("PENDING");
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorBills, setVendorBills] = useState<PendingVendorBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [processingBill, setProcessingBill] = useState<string | null>(null);
  const { confirm } = useConfirm();

  const canReviewFees = Boolean(user?.tenant && user?.role && FEE_APPROVAL_API_ROLES.has(user.role));
  const canReviewBills = Boolean(user?.tenant && user?.role && VENDOR_BILL_QUEUE_ROLES.has(user.role));
  const canAccess = canReviewFees || canReviewBills;

  const branchQuery = useMemo(() => {
    if (!["SUPER_ADMIN", "CHIEF_ACCOUNTANT", "ZONAL_ADMIN"].includes(user?.role || "")) return "";
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

  const fetchVendorBills = useCallback(() => {
    if (!canReviewBills) {
      setVendorBills([]);
      return;
    }
    setBillsLoading(true);
    api
      .get(`vendor-bills/?status=SUBMITTED&page_size=100${branchQuery}`)
      .then((res) => {
        const raw = res.data?.results ?? res.data?.data?.results ?? res.data?.data ?? res.data;
        setVendorBills(Array.isArray(raw) ? raw : []);
      })
      .catch(() => toast.error("Failed to load submitted vendor bills"))
      .finally(() => setBillsLoading(false));
  }, [branchQuery, canReviewBills]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  useEffect(() => {
    fetchVendorBills();
  }, [fetchVendorBills]);

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

  const handleBillApprove = async (b: PendingVendorBill) => {
    if (!canUserApproveBill(user?.role, Number(b.total_amount))) {
      toast.error(getApprovalTierLabel(Number(b.total_amount)).who);
      return;
    }
    const ok = await confirm({
      title: "Approve vendor bill",
      message: `Approve ₹${Number(b.net_amount).toLocaleString("en-IN")} — ${b.vendor_display}? This posts to the cashbook.`,
      confirmText: "Approve",
      isDestructive: false,
    });
    if (!ok) return;
    setProcessingBill(b.id);
    try {
      await api.patch(`vendor-bills/${b.id}/status/`, { status: "APPROVED" });
      toast.success("Vendor bill approved");
      fetchVendorBills();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Approval failed");
    } finally {
      setProcessingBill(null);
    }
  };

  const handleBillReject = async (b: PendingVendorBill) => {
    if (!canUserApproveBill(user?.role, Number(b.total_amount))) {
      toast.error("You are not allowed to reject this bill due to routing rules.");
      return;
    }
    const ok = await confirm({
      title: "Reject vendor bill",
      message: `Reject submitted bill for ${b.vendor_display}?`,
      confirmText: "Reject",
      isDestructive: true,
    });
    if (!ok) return;
    const reason = typeof window !== "undefined" ? window.prompt("Reason (optional):") : "";
    if (reason === null) return;
    setProcessingBill(b.id);
    try {
      await api.patch(`vendor-bills/${b.id}/status/`, { status: "REJECTED", reason: reason || "" });
      toast.success("Vendor bill rejected");
      fetchVendorBills();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Rejection failed");
    } finally {
      setProcessingBill(null);
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
            Fee concessions &amp; submitted expenses. Routing tiers:
            <span className="ml-1 inline-flex items-center gap-1">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">≤ ₹3,000</span>
              <span className="text-xs text-gray-500">Auto-posted</span>
            </span>
            <span className="mx-1 text-gray-300">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">₹3,001–₹5,000</span>
              <span className="text-xs text-gray-500">Zonal / Chief Accountant</span>
            </span>
            <span className="mx-1 text-gray-300">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">&gt; ₹5,000</span>
              <span className="text-xs text-gray-500">Super Admin only</span>
            </span>
          </p>
        </div>
      </div>

      {canReviewBills && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Vendor Bill approvals
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {billsLoading ? (
              <div className="p-10 space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-24 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : vendorBills.length === 0 ? (
              <div className="py-14 flex flex-col items-center text-gray-400">
                <Inbox size={40} strokeWidth={1.5} />
                <p className="mt-3 font-semibold text-gray-500">No submitted vendor bills</p>
                <p className="text-sm text-center max-w-md">
                  Accountant-submitted bills over ₹3,000 appear here. Under ₹3,000 they auto-post on submit.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {vendorBills.map((b) => {
                  const badge = routingBadge(Number(b.total_amount));
                  const canAct = canUserApproveBill(user?.role, Number(b.total_amount));
                  return (
                    <li key={b.id} className="p-6 hover:bg-gray-50/50 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900">
                              VENDOR BILL
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                              {badge.label}
                            </span>
                            {b.branch_name ? (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                <Building2 size={12} />
                                {b.branch_name}
                              </span>
                            ) : null}
                          </div>
                          <p className="font-semibold text-gray-900">{b.vendor_display}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                            <span>
                              <span className="font-bold text-gray-500">Bill ID: </span>
                              {b.bill_id}
                            </span>
                            {b.items && b.items.length > 0 ? (
                              <span>
                                <span className="font-bold text-gray-500">Types: </span>
                                {b.items.map(i => i.expense_type_name).join(", ")}
                              </span>
                            ) : null}
                            <span>
                              <span className="font-bold text-gray-500">Date: </span>
                              {b.bill_date
                                ? new Date(b.bill_date + "T12:00:00").toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "N/A"}
                            </span>
                            <span>
                              <span className="font-bold text-gray-500">Mode: </span>
                              {b.payment_mode}
                            </span>
                          </div>
                          {b.description && (
                            <p className="text-sm text-gray-700 mt-1 italic">
                              "{b.description}"
                            </p>
                          )}
                          <p className="text-xs text-gray-400 pt-1">
                            Submitted by {b.submitted_by_name || "Unknown"}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 lg:w-64 lg:shrink-0 justify-between lg:justify-end">
                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                              Net Amount
                            </p>
                            <p className="text-lg font-black text-gray-900 flex items-center justify-end">
                              <IndianRupee size={16} className="mr-0.5 text-gray-400" />
                              {formatRupee(b.net_amount).replace("₹", "")}
                            </p>
                          </div>
                          {canAct ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleBillReject(b)}
                                disabled={processingBill === b.id}
                                className="px-4 py-2 text-rose-600 font-bold bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => handleBillApprove(b)}
                                disabled={processingBill === b.id}
                                className="px-4 py-2 text-white font-bold bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                              >
                                {processingBill === b.id ? "..." : "Approve"}
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 italic text-right max-w-[120px] leading-tight">
                              {getApprovalTierLabel(Number(b.total_amount)).who}
                            </div>
                          )}
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
                          {req.request_type === 'CONCESSION' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-800">
                              CONCESSION REQUEST
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                              ADMISSION DISCOUNT
                            </span>
                          )}
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
