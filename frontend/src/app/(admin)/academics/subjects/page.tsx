"use client";

import React, { useState, useCallback, useRef } from 'react';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import { useBranch } from '@/components/common/BranchContext';
import { Plus, BookMarked, Check, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AcademicSubject {
  id: string;
  name: string;
  is_optional: boolean;
  is_first_language: boolean;
  is_second_language: boolean;
  is_third_language: boolean;
  display_order: number;
  is_active: boolean;
}

interface InlineRowState {
  name: string;
  is_optional: string;        // 'false' | 'true'
  is_first_language: string;
  is_second_language: string;
  is_third_language: string;
  display_order: string;
  is_active: string;          // 'Active' | 'Inactive'
}

const EMPTY_ROW: InlineRowState = {
  name: '',
  is_optional: 'false',
  is_first_language: 'false',
  is_second_language: 'false',
  is_third_language: 'false',
  display_order: '0',
  is_active: 'Active',
};

function toPayload(row: InlineRowState) {
  return {
    name: row.name.trim(),
    is_optional: row.is_optional === 'true',
    is_first_language: row.is_first_language === 'true',
    is_second_language: row.is_second_language === 'true',
    is_third_language: row.is_third_language === 'true',
    display_order: parseInt(row.display_order) || 0,
    is_active: row.is_active === 'Active',
  };
}

// ─── Inline editable row ──────────────────────────────────────────────────────
function InlineEditRow({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: InlineRowState;
  onSave: (row: InlineRowState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [row, setRow] = useState<InlineRowState>(initial);
  const set = (k: keyof InlineRowState, v: string) => setRow(r => ({ ...r, [k]: v }));

  const boolSelect = (key: keyof InlineRowState) => (
    <select
      value={row[key] as string}
      onChange={e => set(key, e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <option value="false">False</option>
      <option value="true">True</option>
    </select>
  );

  return (
    <tr className="bg-blue-50/60 border-b border-blue-100">
      <td className="px-4 py-2">
        <input
          autoFocus
          value={row.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Enter Subject name"
          className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </td>
      <td className="px-3 py-2">{boolSelect('is_optional')}</td>
      <td className="px-3 py-2">{boolSelect('is_first_language')}</td>
      <td className="px-3 py-2">{boolSelect('is_second_language')}</td>
      <td className="px-3 py-2">{boolSelect('is_third_language')}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          min="0"
          value={row.display_order}
          onChange={e => set('display_order', e.target.value)}
          className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={row.is_active}
          onChange={e => set('is_active', e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option>Active</option>
          <option>Inactive</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSave(row)}
            disabled={saving || !row.name.trim()}
            className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'SAVE'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-bold bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
          >
            CANCEL
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Three-dot action menu ────────────────────────────────────────────────────
function ActionMenu({
  subject,
  onEdit,
  onDelete,
  onToggle,
}: {
  subject: AcademicSubject;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <button
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => { setOpen(false); onEdit(); }}
          >
            Edit
          </button>
          <button
            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => { setOpen(false); onToggle(); }}
          >
            {subject.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => { setOpen(false); onDelete(); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

export default function AcademicSubjectsPage() {
  const { selectedBranch } = useBranch();

  const branchParam = selectedBranch ? `?branch_id=${selectedBranch}` : '';
  const { data, loading, error, refetch } = useApi<AcademicSubject[]>(
    `academics/subjects/${branchParam}`
  );

  // Inline add row state
  const [addingNew, setAddingNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);

  // Inline edit row state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters & pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);

  // Derived filtered list
  const filtered = (data ?? []).filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'all' ? true :
      statusFilter === 'active' ? s.is_active :
      !s.is_active;
    return matchSearch && matchStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Handlers
  const handleAddSave = useCallback(async (row: InlineRowState) => {
    setSavingNew(true);
    try {
      const params = selectedBranch ? `?branch_id=${selectedBranch}` : '';
      await api.post(`academics/subjects/${params}`, toPayload(row));
      toast.success('Subject created');
      setAddingNew(false);
      refetch();
    } catch (err: any) {
      const msg = err.response?.data?.name?.[0] || err.response?.data?.error || 'Error creating subject';
      toast.error(msg);
    } finally {
      setSavingNew(false);
    }
  }, [selectedBranch, refetch]);

  const handleEditSave = useCallback(async (id: string, row: InlineRowState) => {
    setSavingEdit(true);
    try {
      await api.patch(`academics/subjects/${id}/`, toPayload(row));
      toast.success('Subject updated');
      setEditingId(null);
      refetch();
    } catch (err: any) {
      const msg = err.response?.data?.name?.[0] || err.response?.data?.error || 'Error updating subject';
      toast.error(msg);
    } finally {
      setSavingEdit(false);
    }
  }, [refetch]);

  const handleDelete = useCallback(async (subject: AcademicSubject) => {
    if (!window.confirm(`Delete subject "${subject.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`academics/subjects/${subject.id}/`);
      toast.success('Subject deleted');
      refetch();
    } catch (err: any) {
      const msg = err.response?.data?.error ||
        (err.response?.status === 409
          ? `"${subject.name}" is used in existing assessments. Deactivate it instead.`
          : 'Error deleting subject');
      toast.error(msg);
    }
  }, [refetch]);

  const handleToggle = useCallback(async (subject: AcademicSubject) => {
    try {
      await api.post(`academics/subjects/${subject.id}/toggle_status/`);
      toast.success(subject.is_active ? 'Subject deactivated' : 'Subject activated');
      refetch();
    } catch {
      toast.error('Failed to update status');
    }
  }, [refetch]);

  const subjectToRow = (s: AcademicSubject): InlineRowState => ({
    name: s.name,
    is_optional: s.is_optional ? 'true' : 'false',
    is_first_language: s.is_first_language ? 'true' : 'false',
    is_second_language: s.is_second_language ? 'true' : 'false',
    is_third_language: s.is_third_language ? 'true' : 'false',
    display_order: String(s.display_order),
    is_active: s.is_active ? 'Active' : 'Inactive',
  });

  const CheckOrEmpty = ({ val }: { val: boolean }) =>
    val ? <Check size={15} className="text-emerald-600 mx-auto" /> : <span className="text-slate-300">—</span>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookMarked size={22} className="text-brand-600" />
            Subject Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage branch subjects used in assessments</p>
        </div>
        <button
          onClick={() => { if (!addingNew) { setEditingId(null); setAddingNew(true); } }}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          <Plus size={16} /> ADD SUBJECT
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search subjects…"
          className="border border-slate-200 rounded-xl px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject Name</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Optional Subject</th>
                <th className="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Is First Language</th>
                <th className="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Is Second Language</th>
                <th className="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Is Third Language</th>
                <th className="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Display Order</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {/* Inline add row */}
              {addingNew && (
                <InlineEditRow
                  initial={EMPTY_ROW}
                  onSave={handleAddSave}
                  onCancel={() => setAddingNew(false)}
                  saving={savingNew}
                />
              )}

              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-red-500">{error}</td>
                </tr>
              ) : paginated.length === 0 && !addingNew ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <BookMarked size={40} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-slate-500 font-medium">No subjects yet</p>
                    <p className="text-slate-400 text-xs mt-1">Click "+ ADD SUBJECT" to create your first subject</p>
                  </td>
                </tr>
              ) : (
                paginated.map(subject => {
                  if (editingId === subject.id) {
                    return (
                      <InlineEditRow
                        key={subject.id}
                        initial={subjectToRow(subject)}
                        onSave={row => handleEditSave(subject.id, row)}
                        onCancel={() => setEditingId(null)}
                        saving={savingEdit}
                      />
                    );
                  }
                  return (
                    <tr key={subject.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{subject.name}</td>
                      <td className="px-3 py-3 text-slate-500 text-xs">{subject.is_optional ? 'true' : 'false'}</td>
                      <td className="px-3 py-3 text-center"><CheckOrEmpty val={subject.is_first_language} /></td>
                      <td className="px-3 py-3 text-center"><CheckOrEmpty val={subject.is_second_language} /></td>
                      <td className="px-3 py-3 text-center"><CheckOrEmpty val={subject.is_third_language} /></td>
                      <td className="px-3 py-3 text-center text-slate-600">{subject.display_order}</td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                          subject.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {subject.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <ActionMenu
                          subject={subject}
                          onEdit={() => { setAddingNew(false); setEditingId(subject.id); }}
                          onDelete={() => handleDelete(subject)}
                          onToggle={() => handleToggle(subject)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/40">
            <p className="text-xs text-slate-500">
              {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 text-xs font-bold transition-colors"
              >
                «
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                    safePage === i + 1
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 text-xs font-bold transition-colors"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
