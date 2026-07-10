"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import { useBranch } from '@/components/common/BranchContext';
import { useAuth } from '@/components/common/AuthProvider';
import { ClipboardList, Plus, Eye, Pencil, Trash2, CalendarDays, BookOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { GRADE_DISPLAY, GRADE_ORDER } from '@/lib/grades';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AcademicYear {
  id: string;
  name: string;
  is_active: boolean;
}

interface ClassSection {
  id: string;
  grade: string;
  display_name: string;
  academic_year: string;
}

interface Assessment {
  id: string;
  name: string;
  academic_year: string;
  grade: string;
  grade_display: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  subject_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(d: string) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AssessmentsPage() {
  const { selectedBranch } = useBranch();
  const { user } = useAuth();

  // Fetch academic years
  const { data: years } = useApi<AcademicYear[]>('tenants/academic-years/');
  const activeYear = years?.find(y => y.is_active);
  const [selectedYear, setSelectedYear] = useState('');

  // Set default year once loaded
  useEffect(() => {
    if (activeYear && !selectedYear) setSelectedYear(activeYear.id);
  }, [activeYear]);

  // Fetch class sections for selected year + branch
  const csUrl = selectedYear && selectedBranch
    ? `classes/?academic_year_id=${selectedYear}&branch_id=${selectedBranch}`
    : null;
  const { data: classes } = useApi<ClassSection[]>(csUrl, [selectedYear, selectedBranch]);

  const uniqueGrades = useMemo(() => {
    if (!classes) return [];
    const gradeSet = new Set(classes.map(c => c.grade));
    return GRADE_ORDER.filter(g => gradeSet.has(g));
  }, [classes]);

  const [selectedGrade, setSelectedGrade] = useState('');

  // Fetch assessments when grade is selected
  const assessUrl = selectedGrade
    ? `academics/assessments/?grade=${selectedGrade}&academic_year_id=${selectedYear}`
    : null;
  const { data: assessments, loading: aLoading, refetch } = useApi<Assessment[]>(
    assessUrl, [selectedGrade, selectedYear]
  );

  // Reset grade when branch/year changes
  useEffect(() => { setSelectedGrade(''); }, [selectedBranch, selectedYear]);

  const handleDelete = useCallback(async (a: Assessment) => {
    if (!window.confirm(`Delete assessment "${a.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`academics/assessments/${a.id}/`);
      toast.success('Assessment deleted');
      refetch();
    } catch {
      toast.error('Error deleting assessment');
    }
  }, [refetch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList size={22} className="text-brand-600" />
            Assessments
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage class exams and subject configurations</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Academic Year</label>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white min-w-[160px] focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select Year</option>
            {(years ?? []).map(y => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Grade</label>
          <select
            value={selectedGrade}
            onChange={e => setSelectedGrade(e.target.value)}
            disabled={!selectedYear}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white min-w-[200px] focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
          >
            <option value="">Select Grade</option>
            {uniqueGrades.map(g => (
              <option key={g} value={g}>{GRADE_DISPLAY[g] || g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grade panel */}
      {!selectedGrade ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
          <ClipboardList size={44} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-500 font-medium">Select an Academic Year and Grade to view assessments</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-base font-bold text-slate-800">
              {GRADE_DISPLAY[selectedGrade] || 'Grade'}
            </h2>
            <Link
              href={`/academics/assessments/new?grade=${selectedGrade}&academic_year_id=${selectedYear}`}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              <Plus size={16} /> Add Exam
            </Link>
          </div>

          {/* Assessment list */}
          <div className="divide-y divide-slate-50">
            {aLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="px-6 py-5 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              ))
            ) : !assessments || assessments.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <BookOpen size={36} className="mx-auto text-slate-200 mb-3" />
                <p className="text-slate-500 font-medium text-sm">No exams yet</p>
                <Link
                  href={`/academics/assessments/new?class_section_id=${selectedClass}&academic_year_id=${selectedYear}`}
                  className="inline-flex items-center gap-1 text-brand-600 text-sm font-semibold mt-2 hover:underline"
                >
                  Click here to add your first exam →
                </Link>
              </div>
            ) : (
              assessments.map(a => (
                <div key={a.id} className="px-6 py-4 flex items-center justify-between flex-wrap gap-3 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0 mt-0.5">
                      <ClipboardList size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{a.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <CalendarDays size={11} />
                          {fmt(a.start_date)} → {fmt(a.end_date)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          {a.subject_count} subject{a.subject_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/academics/assessments/${a.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Eye size={13} /> View
                    </Link>
                    <Link
                      href={`/academics/assessments/${a.id}/edit`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Pencil size={13} /> Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(a)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
