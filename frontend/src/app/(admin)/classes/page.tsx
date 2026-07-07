"use client";

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/axios';
import {
  Pencil, Loader2, CalendarDays, ChevronDown,
  BookOpen, X, Plus, Minus,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/components/common/AuthProvider';
import { useBranch } from '@/components/common/BranchContext';

// ─── Constants ───────────────────────────────────────────────────────────────
const GRADE_ORDER = [
  'NURSERY','LKG','UKG',
  '1','2','3','4','5','6','7','8','9','10',
  '11_SCIENCE','11_COMMERCE','11_ARTS',
  '12_SCIENCE','12_COMMERCE','12_ARTS',
];

const GRADE_DISPLAY: Record<string, string> = {
  NURSERY:'Nursery', LKG:'LKG', UKG:'UKG',
  '1':'Grade 1','2':'Grade 2','3':'Grade 3','4':'Grade 4','5':'Grade 5',
  '6':'Grade 6','7':'Grade 7','8':'Grade 8','9':'Grade 9','10':'Grade 10',
  '11_SCIENCE':'Grade 11 Science','11_COMMERCE':'Grade 11 Commerce','11_ARTS':'Grade 11 Arts',
  '12_SCIENCE':'Grade 12 Science','12_COMMERCE':'Grade 12 Commerce','12_ARTS':'Grade 12 Arts',
};

const GLOBAL_ROLES = ['OWNER','SUPER_ADMIN','CHIEF_ACCOUNTANT','ZONAL_ADMIN'];

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClassSection {
  id: string;
  grade: string;
  section: string;
  display_name: string;
  class_teacher: string | null;
  max_capacity: number;
  display_order: number;
  is_active: boolean;
  student_count: number;
  is_over_capacity: boolean;
  capacity_percent: number;
}

interface AcademicYear {
  id: string;
  name: string;
  is_active: boolean;
}

interface GradeRow {
  grade: string;
  display: string;
  sections: ClassSection[];
}

interface SectionDraft {
  _key: string;
  id?: string;
  section: string;
  max_capacity: number;
  display_order: number;
  is_active: boolean;
  _isNew?: boolean;
  _deleted?: boolean;
}

// ─── Sections Modal ───────────────────────────────────────────────────────────
interface SectionsModalProps {
  gradeRow: GradeRow;
  academicYearId: string;
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
}

function SectionsModal({ gradeRow, academicYearId, branchId, onClose, onSaved }: SectionsModalProps) {
  const [drafts, setDrafts] = useState<SectionDraft[]>(() =>
    gradeRow.sections.map(s => ({
      _key: s.id,
      id: s.id,
      section: s.section,
      max_capacity: s.max_capacity,
      display_order: s.display_order ?? 0,
      is_active: s.is_active,
    }))
  );
  const [saving, setSaving] = useState(false);

  const visible = drafts.filter(d => !d._deleted);

  const addRow = () => {
    setDrafts(prev => [...prev, {
      _key: `new-${Date.now()}`,
      section: '',
      max_capacity: 40,
      display_order: prev.filter(d => !d._deleted).length + 1,
      is_active: true,
      _isNew: true,
    }]);
  };

  const removeRow = (key: string) => {
    setDrafts(prev =>
      prev
        .map(r => r._key === key
          ? r._isNew ? null : { ...r, _deleted: true }
          : r
        )
        .filter(Boolean) as SectionDraft[]
    );
  };

  const updateField = (key: string, field: keyof SectionDraft, value: unknown) => {
    setDrafts(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    for (const d of visible) {
      if (!d.section.trim()) { toast.error('Section name cannot be empty.'); return; }
      if (d.max_capacity < 1) { toast.error('Seating capacity must be at least 1.'); return; }
    }

    setSaving(true);
    try {
      const ops: Promise<unknown>[] = [];

      for (const d of drafts) {
        if (d._isNew && !d._deleted) {
          ops.push(api.post('classes/', {
            grade: gradeRow.grade,
            section: d.section.trim(),
            max_capacity: d.max_capacity,
            display_order: d.display_order,
            is_active: d.is_active,
            academic_year: academicYearId,
            branch: branchId,
          }));
        } else if (d.id && d._deleted) {
          ops.push(
            api.delete(`classes/${d.id}/`).catch((err: { response?: { data?: { detail?: string; error?: string } } }) => {
              const msg =
                err.response?.data?.detail ||
                err.response?.data?.error ||
                'Cannot delete a section that has students.';
              toast.error(msg);
            })
          );
        } else if (d.id && !d._deleted) {
          ops.push(api.patch(`classes/${d.id}/`, {
            section: d.section.trim(),
            max_capacity: d.max_capacity,
            display_order: d.display_order,
            is_active: d.is_active,
          }));
        }
      }

      await Promise.all(ops);
      
      const created = drafts.filter(d => d._isNew && !d._deleted).length;
      const updated = drafts.filter(d => d.id && !d._deleted).length;
      const deleted = drafts.filter(d => d.id && d._deleted).length;
      
      const parts = [];
      if (created > 0) parts.push(`created ${created}`);
      if (updated > 0) parts.push(`updated ${updated}`);
      if (deleted > 0) parts.push(`deleted ${deleted}`);
      
      toast.success(parts.length > 0 ? `Successfully ${parts.join(', ')} section(s).` : 'No changes made.');
      
      onSaved();
      onClose();
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: string } } };
      toast.error(anyErr?.response?.data?.detail || 'Error saving sections.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Sections for {gradeRow.display}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Table */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Section Name','Seating Capacity','Display Order','Status',''].map((h, i) => (
                  <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2.5 pr-3 last:pr-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 text-sm">
                    No sections yet. Click <strong>+</strong> to add one.
                  </td>
                </tr>
              )}
              {visible.map(d => (
                <tr key={d._key}>
                  <td className="py-2 pr-3">
                    <input
                      value={d.section}
                      onChange={e => updateField(d._key, 'section', e.target.value)}
                      placeholder="e.g. A"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number" min={1}
                      value={d.max_capacity}
                      onChange={e => updateField(d._key, 'max_capacity', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number" min={0}
                      value={d.display_order}
                      onChange={e => updateField(d._key, 'display_order', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={d.is_active ? 'active' : 'inactive'}
                      onChange={e => updateField(d._key, 'is_active', e.target.value === 'active')}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => removeRow(d._key)}
                      className="p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                    >
                      <Minus size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Add row */}
          <div className="flex justify-end mt-3">
            <button
              onClick={addRow}
              className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-md"
              title="Add section"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="text-blue-600 text-sm font-semibold hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Placeholder cell ─────────────────────────────────────────────────────────
function PlaceholderCell({ count }: { count?: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {count !== undefined && <span className="text-gray-400 text-sm">{count}</span>}
      <button
        disabled
        title="Coming soon"
        className="text-gray-300 cursor-not-allowed p-0.5 rounded"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClassesPage() {
  const { user, loading: userLoading } = useAuth();
  const { selectedBranch } = useBranch();

  const isGlobalRole = GLOBAL_ROLES.includes(user?.role || '');
  const effectiveBranch: string = isGlobalRole
    ? (selectedBranch || '')
    : (user?.branch_id || user?.branch || selectedBranch || '');

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedAY, setSelectedAY] = useState('');
  const [yearsLoading, setYearsLoading] = useState(true);

  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [activeModal, setActiveModal] = useState<GradeRow | null>(null);

  // ── Load academic years ──────────────────────────────────────────────────
  useEffect(() => {
    api.get('tenants/academic-years/')
      .then(res => {
        const data: AcademicYear[] = res.data?.data ?? res.data?.results ?? res.data ?? [];
        const sorted = [...data].sort((a, b) => {
          if (a.is_active && !b.is_active) return -1;
          if (!a.is_active && b.is_active) return 1;
          return b.name.localeCompare(a.name);
        });
        setYears(sorted);
        const active = sorted.find(y => y.is_active);
        if (active) setSelectedAY(active.id);
      })
      .catch(() => toast.error('Could not load academic years'))
      .finally(() => setYearsLoading(false));
  }, []);

  // ── Fetch classes ────────────────────────────────────────────────────────
  const fetchClasses = useCallback(async () => {
    if (!selectedAY) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (effectiveBranch) params.set('branch_id', effectiveBranch);
      params.set('academic_year_id', selectedAY);
      const res = await api.get(`classes/?${params.toString()}`);
      const data: ClassSection[] = res.data?.data ?? res.data?.results ?? res.data ?? [];
      setClasses(data);
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: string } } };
      setError(anyErr?.response?.data?.detail || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, [effectiveBranch, selectedAY]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  // ── Group by grade ───────────────────────────────────────────────────────
  const gradeRows: GradeRow[] = React.useMemo(() => {
    const map: Record<string, ClassSection[]> = {};
    for (const cs of classes) {
      if (!map[cs.grade]) map[cs.grade] = [];
      map[cs.grade].push(cs);
    }
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) || a.section.localeCompare(b.section)
      );
    }
    return GRADE_ORDER
      .filter(g => map[g])
      .map(g => ({
        grade: g,
        display: GRADE_DISPLAY[g] || g,
        sections: map[g],
      }));
  }, [classes]);

  if (userLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Classes &amp; Sections</h1>
          <p className="text-gray-500 text-sm mt-1">Manage class sections for the academic year</p>
        </div>

        {/* Academic Year Selector */}
        <div className="relative inline-flex items-center">
          <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none z-10" />
          <select
            value={selectedAY}
            onChange={e => setSelectedAY(e.target.value)}
            disabled={yearsLoading || years.length === 0}
            className="appearance-none pl-9 pr-8 py-2 bg-white border border-indigo-100 rounded-xl text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 min-w-[160px]"
          >
            {yearsLoading
              ? <option>Loading...</option>
              : years.map(y => (
                <option key={y.id} value={y.id}>
                  {y.name}{y.is_active ? ' ✦' : ''}
                </option>
              ))
            }
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-64 animate-pulse" />
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">{error}</div>
      ) : !selectedAY ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <CalendarDays className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">Select an academic year to view classes</p>
        </div>
      ) : gradeRows.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <BookOpen className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">No classes for this academic year</p>
          <p className="text-gray-400 text-sm mt-1">
            Click the ✏ icon on any row to add sections.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {[
                    { label: 'Class Name',        align: 'left'  },
                    { label: 'Sections',           align: 'center'},
                    { label: 'Subjects',           align: 'center'},
                    { label: 'Optional Subjects',  align: 'center'},
                    { label: 'Grades',             align: 'center'},
                    { label: 'Teachers',           align: 'center'},
                    { label: 'Time Table',         align: 'center'},
                    { label: '',                   align: 'right' },
                  ].map((h, i) => (
                    <th
                      key={i}
                      className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap text-${h.align}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {gradeRows.map(row => (
                  <tr key={row.grade} className="hover:bg-gray-50/60 transition-colors group">

                    {/* Class Name */}
                    <td className="px-5 py-3">
                      <span className="font-medium text-gray-800 border-b border-gray-300 pb-px">
                        {row.display}
                      </span>
                    </td>

                    {/* Sections — interactive */}
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-semibold text-gray-700">{row.sections.length}</span>
                        <button
                          onClick={() => setActiveModal(row)}
                          className="text-blue-500 hover:text-blue-700 p-0.5 rounded hover:bg-blue-50 transition-colors"
                          title="Manage sections"
                        >
                          <Pencil size={13} />
                        </button>
                      </div>
                    </td>

                    {/* Subjects — placeholder */}
                    <td className="px-5 py-3 text-center"><PlaceholderCell count={0} /></td>

                    {/* Optional Subjects — placeholder */}
                    <td className="px-5 py-3 text-center"><PlaceholderCell count={0} /></td>

                    {/* Grades — placeholder */}
                    <td className="px-5 py-3 text-center"><PlaceholderCell /></td>

                    {/* Teachers — placeholder */}
                    <td className="px-5 py-3 text-center"><PlaceholderCell count={0} /></td>

                    {/* Time Table — placeholder */}
                    <td className="px-5 py-3 text-center"><PlaceholderCell /></td>

                    {/* Deactivate — placeholder */}
                    <td className="px-4 py-3 text-right">
                      <button
                        disabled
                        title="Coming soon"
                        className="text-xs font-medium px-3 py-1 border border-gray-200 text-gray-400 rounded cursor-not-allowed"
                      >
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-xs text-gray-400">
            <span>
              1–{gradeRows.length} of {gradeRows.length} classes
            </span>
            <span className="text-gray-300">·</span>
            <span>{classes.length} total section{classes.length !== 1 ? 's' : ''}</span>
            <span className="text-gray-300">·</span>
            <span>{years.find(y => y.id === selectedAY)?.name}</span>
          </div>
        </div>
      )}

      {/* ── Sections Modal ──────────────────────────────────────────────── */}
      {activeModal && (
        <SectionsModal
          gradeRow={activeModal}
          academicYearId={selectedAY}
          branchId={effectiveBranch}
          onClose={() => setActiveModal(null)}
          onSaved={fetchClasses}
        />
      )}
    </div>
  );
}
