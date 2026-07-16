"use client";

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import {
  Users, Search, Plus, LayoutGrid, List,
  Briefcase, Mail, Phone, Calendar, Building2,
  ChevronDown, X, CheckCircle2, Clock,
  UserMinus, MoreVertical, Filter, Loader2,
  GraduationCap, IdCard, BadgeCheck, Trash2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfirm } from '@/components/common/ConfirmProvider';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface StaffMember {
  id: string;
  employee_id: string;
  status: 'ACTIVE' | 'INACTIVE' | 'RESIGNED';
  employment_type: 'PERMANENT' | 'CONTRACT';
  joining_date: string | null;
  mobile: string;
  category: string | null;
  category_name: string | null;
  department: string | null;
  department_name: string | null;
  designation: string | null;
  designation_name: string | null;
  is_teaching_role: boolean;
  is_active: boolean;
  user_details: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  assignments: any[];
}

interface FilterState {
  search: string;
  status: string;
  department: string;
  designation: string;
  category: string;
  employment_type: string;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:   'bg-emerald-50 text-emerald-700 border-emerald-100',
  INACTIVE: 'bg-amber-50 text-amber-700 border-amber-100',
  RESIGNED: 'bg-red-50 text-red-600 border-red-100',
};

const EMPLOYMENT_STYLES: Record<string, string> = {
  PERMANENT: 'bg-blue-50 text-blue-700 border-blue-100',
  CONTRACT:  'bg-purple-50 text-purple-700 border-purple-100',
};

function getInitials(member: StaffMember) {
  const fn = member.user_details?.first_name || '';
  const ln = member.user_details?.last_name || '';
  if (fn || ln) return `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();
  return member.employee_id.charAt(0).toUpperCase();
}

function getDisplayName(member: StaffMember) {
  const ud = member.user_details;
  if (ud?.first_name || ud?.last_name) {
    return `${ud.first_name ?? ''} ${ud.last_name ?? ''}`.trim();
  }
  return member.employee_id;
}

const AVATAR_PALETTES = [
  'from-blue-500 to-indigo-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

function avatarGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[hash];
}

// ─────────────────────────────────────────
// Filter Bar
// ─────────────────────────────────────────

interface FilterBarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  departments: any[];
  designations: any[];
  categories: any[];
  total: number;
  filtered: number;
}

function FilterBar({ filters, onChange, departments, designations, categories, total, filtered }: FilterBarProps) {
  const set = (key: keyof FilterState) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    onChange({ ...filters, [key]: e.target.value });

  const hasActiveFilters = filters.status || filters.department || filters.designation || filters.category || filters.employment_type;

  const clearAll = () => onChange({ search: filters.search, status: '', department: '', designation: '', category: '', employment_type: '' });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Search by name, ID, email…"
            value={filters.search}
            onChange={set('search')}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
          />
          {filters.search && (
            <button onClick={() => onChange({ ...filters, search: '' })} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status */}
        <div className="relative">
          <select
            value={filters.status}
            onChange={set('status')}
            className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="RESIGNED">Resigned</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Category */}
        {categories.length > 0 && (
          <div className="relative">
            <select
              value={filters.category}
              onChange={set('category')}
              className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Department */}
        {departments.length > 0 && (
          <div className="relative">
            <select
              value={filters.department}
              onChange={set('department')}
              className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 cursor-pointer"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Designation */}
        {designations.length > 0 && (
          <div className="relative">
            <select
              value={filters.designation}
              onChange={set('designation')}
              className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 cursor-pointer"
            >
              <option value="">All Designations</option>
              {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Employment Type */}
        <div className="relative">
          <select
            value={filters.employment_type}
            onChange={set('employment_type')}
            className="appearance-none pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 cursor-pointer"
          >
            <option value="">All Types</option>
            <option value="PERMANENT">Permanent</option>
            <option value="CONTRACT">Contract</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl transition-colors"
          >
            <X size={13} /> Clear Filters
          </button>
        )}
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
        <Filter size={12} />
        Showing <span className="font-bold text-slate-600">{filtered}</span> of <span className="font-bold text-slate-600">{total}</span> staff members
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Staff Card (Card View)
// ─────────────────────────────────────────

interface StaffCardProps {
  member: StaffMember;
  onDeactivate: (id: string, name: string) => void;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
}

function StaffCard({ member, onDeactivate, menuOpen, setMenuOpen }: StaffCardProps) {
  const name = getDisplayName(member);
  const initials = getInitials(member);
  const gradient = avatarGradient(member.id);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all group overflow-hidden"
    >
      {/* Card Header stripe */}
      <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-5">
        {/* Top Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm`}>
              {initials}
            </div>
            {/* Name + ID */}
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-800 text-sm leading-tight truncate">{name}</h3>
              <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mt-0.5">{member.employee_id}</p>
            </div>
          </div>

          {/* 3-dot menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <MoreVertical size={16} />
            </button>
            <AnimatePresence>
              {menuOpen === member.id && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-9 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-20"
                >
                  <Link
                    href={`/staff/${member.id}`}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <IdCard size={14} className="text-slate-400" /> View Profile
                  </Link>
                  {member.status === 'ACTIVE' && (
                    <button
                      onClick={() => { setMenuOpen(null); onDeactivate(member.id, name); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <UserMinus size={14} /> Deactivate
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${STATUS_STYLES[member.status] ?? STATUS_STYLES.INACTIVE}`}>
            {member.status === 'ACTIVE' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
            {member.status}
          </span>
          <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold border ${EMPLOYMENT_STYLES[member.employment_type] ?? EMPLOYMENT_STYLES.PERMANENT}`}>
            {member.employment_type}
          </span>
          {member.is_teaching_role && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-100">
              <GraduationCap size={10} /> Teaching
            </span>
          )}
        </div>

        {/* Meta rows */}
        <div className="mt-4 space-y-2">
          {member.designation_name && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <BadgeCheck size={13} className="text-slate-300 shrink-0" />
              <span className="truncate">{member.designation_name}</span>
            </div>
          )}
          {member.department_name && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Building2 size={13} className="text-slate-300 shrink-0" />
              <span className="truncate">{member.department_name}</span>
            </div>
          )}
          {member.user_details?.email && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Mail size={13} className="text-slate-300 shrink-0" />
              <span className="truncate">{member.user_details.email}</span>
            </div>
          )}
          {member.mobile && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Phone size={13} className="text-slate-300 shrink-0" />
              <span>{member.mobile}</span>
            </div>
          )}
          {member.joining_date && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar size={13} className="text-slate-300 shrink-0" />
              <span>Joined {new Date(member.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-slate-50">
          <Link
            href={`/staff/${member.id}`}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-50 hover:bg-blue-600 text-slate-600 hover:text-white rounded-xl text-xs font-semibold transition-all"
          >
            <IdCard size={13} /> View Full Profile
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────
// Staff Table (Table View)
// ─────────────────────────────────────────

interface StaffTableProps {
  members: StaffMember[];
  onDeactivate: (id: string, name: string) => void;
}

function StaffTable({ members, onDeactivate }: StaffTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Staff Member</th>
              <th className="text-left px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Employee ID</th>
              <th className="text-left px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Category / Dept</th>
              <th className="text-left px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Designation</th>
              <th className="text-left px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
              <th className="text-left px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Joined</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {members.map((m, idx) => {
              const name = getDisplayName(m);
              const initials = getInitials(m);
              const gradient = avatarGradient(m.id);
              return (
                <motion.tr
                  key={m.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="hover:bg-slate-50/70 transition-colors group"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                        {initials}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm leading-tight">{name}</p>
                        {m.user_details?.email && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{m.user_details.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">{m.employee_id}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm text-slate-700 font-medium">{m.category_name ?? <span className="text-slate-300">—</span>}</p>
                    {m.department_name && <p className="text-[11px] text-slate-400 mt-0.5">{m.department_name}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600">
                    {m.designation_name ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${STATUS_STYLES[m.status] ?? STATUS_STYLES.INACTIVE}`}>
                      {m.status === 'ACTIVE' ? <CheckCircle2 size={9} /> : <Clock size={9} />}
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold border ${EMPLOYMENT_STYLES[m.employment_type] ?? EMPLOYMENT_STYLES.PERMANENT}`}>
                      {m.employment_type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-slate-400">
                    {m.joining_date
                      ? new Date(m.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/staff/${m.id}`}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 rounded-lg text-[11px] font-semibold transition-all"
                      >
                        Profile
                      </Link>
                      {m.status === 'ACTIVE' && (
                        <button
                          onClick={() => onDeactivate(m.id, name)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <UserMinus size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Summary Stats Strip
// ─────────────────────────────────────────

function StatsStrip({ members }: { members: StaffMember[] }) {
  const active   = members.filter(m => m.status === 'ACTIVE').length;
  const teaching = members.filter(m => m.is_teaching_role).length;
  const contract = members.filter(m => m.employment_type === 'CONTRACT').length;
  const noPortal = members.filter(m => !m.user_details).length;

  const stats = [
    { label: 'Total Staff',      value: members.length, color: 'text-slate-700',   bg: 'bg-slate-50  border-slate-100' },
    { label: 'Active',           value: active,          color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
    { label: 'Teaching',         value: teaching,        color: 'text-violet-600',  bg: 'bg-violet-50  border-violet-100' },
    { label: 'Contract',         value: contract,        color: 'text-purple-600',  bg: 'bg-purple-50  border-purple-100' },
    { label: 'No Portal Access', value: noPortal,        color: 'text-amber-600',   bg: 'bg-amber-50   border-amber-100' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map(s => (
        <div key={s.label} className={`${s.bg} border rounded-xl px-4 py-3`}>
          <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5 uppercase tracking-wider">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────

export default function StaffManagementPage() {
  const { data: staffRaw, loading, error, refetch } = useApi<StaffMember[]>('staff/');
  const { data: departments }  = useApi<any[]>('staff-departments/');
  const { data: designations } = useApi<any[]>('staff-designations/');
  const { data: categories }   = useApi<any[]>('staff-categories/');

  const [view, setView]         = useState<'card' | 'table'>('card');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [filters, setFilters]   = useState<FilterState>({
    search: '', status: '', department: '', designation: '', category: '', employment_type: '',
  });
  const { confirm } = useConfirm();

  const staff = staffRaw ?? [];

  // Client-side filtering (backend also supports query params; this avoids re-fetching on each keystroke)
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase();
    return staff.filter(m => {
      if (q) {
        const name = getDisplayName(m).toLowerCase();
        const email = (m.user_details?.email ?? '').toLowerCase();
        const empId = m.employee_id.toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !empId.includes(q)) return false;
      }
      if (filters.status       && m.status          !== filters.status)         return false;
      if (filters.department   && m.department       !== filters.department)     return false;
      if (filters.designation  && m.designation      !== filters.designation)    return false;
      if (filters.category     && m.category         !== filters.category)       return false;
      if (filters.employment_type && m.employment_type !== filters.employment_type) return false;
      return true;
    });
  }, [staff, filters]);

  const handleDeactivate = useCallback(async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Deactivate Staff Member',
      message: `Are you sure you want to deactivate ${name}? Their portal access will also be revoked.`,
      isDestructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`staff/${id}/`);
      toast.success(`${name} deactivated successfully`);
      refetch();
    } catch {
      toast.error('Failed to deactivate. Please try again.');
    }
  }, [confirm, refetch]);

  // Close dropdown on outside click
  const handleBackdropClick = useCallback(() => setMenuOpen(null), []);

  return (
    <div className="space-y-6 pb-20" onClick={handleBackdropClick}>
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Users size={18} className="text-white" />
            </div>
            Staff Management
          </h1>
          <p className="text-slate-400 text-sm mt-1 ml-11">All employees across every department and function</p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            <button
              onClick={e => { e.stopPropagation(); setView('card'); }}
              className={`p-2 rounded-lg transition-all ${view === 'card' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="Card view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setView('table'); }}
              className={`p-2 rounded-lg transition-all ${view === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="Table view"
            >
              <List size={16} />
            </button>
          </div>

          {/* Add Staff Button */}
          <Link
            href="/staff/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-blue-200 hover:shadow-lg transition-all active:scale-95"
          >
            <Plus size={16} /> Add Staff
          </Link>
        </div>
      </div>

      {/* ── Stats Strip ── */}
      {!loading && staff.length > 0 && <StatsStrip members={staff} />}

      {/* ── Filter Bar ── */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        departments={departments ?? []}
        designations={designations ?? []}
        categories={categories ?? []}
        total={staff.length}
        filtered={filtered.length}
      />

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="text-blue-600 animate-spin" size={36} />
          <p className="text-slate-400 text-sm font-medium">Loading staff…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-8 text-center">
          <p className="font-bold text-red-600 text-lg">Failed to load staff</p>
          <p className="text-red-400 text-sm mt-1">{error}</p>
          <button
            onClick={refetch}
            className="mt-4 px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-100 rounded-2xl bg-white text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <Users size={28} className="text-slate-300" />
          </div>
          {staff.length === 0 ? (
            <>
              <p className="font-bold text-slate-500 text-lg">No staff members yet</p>
              <p className="text-slate-400 text-sm mt-1">Start by adding your first employee</p>
              <Link
                href="/staff/new"
                className="mt-6 flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                <Plus size={15} /> Add First Staff Member
              </Link>
            </>
          ) : (
            <>
              <p className="font-bold text-slate-500 text-lg">No results match your filters</p>
              <p className="text-slate-400 text-sm mt-1">Try adjusting the search or filter criteria</p>
              <button
                onClick={() => setFilters({ search: '', status: '', department: '', designation: '', category: '', employment_type: '' })}
                className="mt-4 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                Clear All Filters
              </button>
            </>
          )}
        </div>
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map(m => (
              <StaffCard
                key={m.id}
                member={m}
                onDeactivate={handleDeactivate}
                menuOpen={menuOpen}
                setMenuOpen={id => { (event as any)?.stopPropagation?.(); setMenuOpen(id); }}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <StaffTable members={filtered} onDeactivate={handleDeactivate} />
      )}
    </div>
  );
}
