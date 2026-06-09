"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/axios';
import { Plus, BookOpen, Loader2, CalendarDays, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/components/common/AuthProvider';
import { useBranch } from '@/components/common/BranchContext';

interface ClassSection {
  id: string;
  grade: string;
  section: string;
  display_name: string;
  class_teacher: string | null;
  max_capacity: number;
  is_active: boolean;
  student_count: number;
}

interface AcademicYear {
  id: string;
  name: string;
  is_active: boolean;
  status: string;
}

/** Roles that use the global branch selector; all others use their own branch_id. */
const GLOBAL_ROLES = ['OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN'];

export default function ClassesPage() {
  const { user, loading: userLoading } = useAuth();
  const { selectedBranch } = useBranch();

  // Resolve effective branch — branch-scoped roles always use their own branch
  const isGlobalRole = GLOBAL_ROLES.includes(user?.role || '');
  const effectiveBranch = isGlobalRole
    ? selectedBranch
    : (user?.branch_id || user?.branch || selectedBranch || '');

  // Academic years
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedAY, setSelectedAY] = useState('');
  const [yearsLoading, setYearsLoading] = useState(true);

  // Classes data
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ grade: '1', section: 'A', max_capacity: 40 });
  const [saving, setSaving] = useState(false);

  // ── Load academic years once ──────────────────────────────────────────────
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
        // Auto-select the active year
        const active = sorted.find(y => y.is_active);
        if (active) setSelectedAY(active.id);
      })
      .catch(() => toast.error('Could not load academic years'))
      .finally(() => setYearsLoading(false));
  }, []);

  // ── Fetch classes whenever branch or AY changes ───────────────────────────
  useEffect(() => {
    if (!selectedAY) return;   // Wait until AY is resolved
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (effectiveBranch) params.set('branch_id', effectiveBranch);
    params.set('academic_year_id', selectedAY);

    api.get(`classes/?${params.toString()}`)
      .then(res => {
        const data: ClassSection[] = res.data?.data ?? res.data?.results ?? res.data ?? [];
        setClasses(data);
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'Failed to load classes');
      })
      .finally(() => setLoading(false));
  }, [effectiveBranch, selectedAY]);

  // ── Create class ──────────────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAY) { toast.error('Select an academic year first.'); return; }
    setSaving(true);
    try {
      await api.post('classes/', {
        ...formData,
        academic_year_id: selectedAY,
        ...(effectiveBranch ? { branch_id: effectiveBranch } : {}),
      });
      setShowForm(false);
      // Re-fetch
      const params = new URLSearchParams();
      if (effectiveBranch) params.set('branch_id', effectiveBranch);
      params.set('academic_year_id', selectedAY);
      const res = await api.get(`classes/?${params.toString()}`);
      setClasses(res.data?.data ?? res.data?.results ?? res.data ?? []);
      toast.success('Class created successfully.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error creating class');
    } finally {
      setSaving(false);
    }
  };

  const grades = [
    'NURSERY','LKG','UKG','1','2','3','4','5','6','7','8','9','10',
    '11_SCIENCE','11_COMMERCE','11_ARTS','12_SCIENCE','12_COMMERCE','12_ARTS'
  ];

  if (userLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Classes &amp; Sections</h1>
          <p className="text-gray-500 text-sm mt-1">Manage class sections for the academic year</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Academic Year Selector */}
          <div className="relative inline-flex items-center">
            <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none z-10" />
            <select
              value={selectedAY}
              onChange={e => setSelectedAY(e.target.value)}
              disabled={yearsLoading || years.length === 0}
              className="appearance-none pl-9 pr-8 py-2 bg-white border border-indigo-100 rounded-xl text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 min-w-[160px]"
            >
              {yearsLoading ? (
                <option>Loading...</option>
              ) : years.map(y => (
                <option key={y.id} value={y.id}>
                  {y.name}{y.is_active ? ' ✦' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <Plus size={16} /> Add Class
          </button>
        </div>
      </div>

      {/* Add Class Form */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select
              value={formData.grade}
              onChange={e => setFormData({...formData, grade: e.target.value})}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
            >
              {grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input
              placeholder="Section (A, B...)"
              value={formData.section}
              onChange={e => setFormData({...formData, section: e.target.value})}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
            <input
              type="number"
              placeholder="Max Capacity"
              value={formData.max_capacity}
              onChange={e => setFormData({...formData, max_capacity: Number(e.target.value)})}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Creating...' : 'Create Class'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-gray-100 text-gray-700 px-5 py-2 rounded-xl text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">{error}</div>
      ) : !selectedAY ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <CalendarDays className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">Select an academic year to view classes</p>
        </div>
      ) : classes.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <BookOpen className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">No classes for this academic year</p>
          <p className="text-gray-400 text-sm mt-1">
            Add a class above or clone sections from a previous year in Year Transition.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400 font-medium">
            {classes.length} section{classes.length !== 1 ? 's' : ''} ·{' '}
            {years.find(y => y.id === selectedAY)?.name}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {classes.map((c: ClassSection) => (
              <div
                key={c.id}
                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">{c.display_name}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    c.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{c.student_count} / {c.max_capacity} students</span>
                </div>
                <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((c.student_count / c.max_capacity) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
