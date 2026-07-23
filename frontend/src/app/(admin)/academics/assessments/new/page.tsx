"use client";

import React, { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import { useBranch } from '@/components/common/BranchContext';
import { ClipboardList, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { GRADE_ORDER, GRADE_DISPLAY } from '@/lib/grades';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClassSection { id: string; display_name: string; academic_year: string; grade: string; }
interface AcademicYear { id: string; name: string; is_active: boolean; }
interface SubjectRow {
  id: string;
  name: string;
  is_optional: boolean;
  checked: boolean;
  max_marks: string;
  min_marks: string;
  exam_date: string;
  exam_time: string;
}

// Inner component that uses useSearchParams (must be inside Suspense)
function NewAssessmentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { selectedBranch } = useBranch();

  // Pre-fill from query params (passed from list page)
  const preGrade = params.get('grade') || '';
  const preYear = params.get('academic_year_id') || '';

  // Header fields
  const [grade, setGrade] = useState(preGrade);
  const [examName, setExamName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusVal, setStatusVal] = useState<'DRAFT' | 'ACTIVE' | 'LOCKED'>('DRAFT');
  const [saving, setSaving] = useState(false);
  const [saveAndNew, setSaveAndNew] = useState(false);

  // Radio toggle
  const [activeTab, setActiveTab] = useState<'subjects' | 'optional'>('subjects');

  // Subject rows loaded from API
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // Fetch academic years for context display
  const { data: years } = useApi<AcademicYear[]>('tenants/academic-years/');
  const activeYear = years?.find(y => y.id === preYear) || years?.find(y => y.is_active);

  // Fetch class sections
  const csUrl = selectedBranch
    ? `classes/?branch_id=${selectedBranch}${preYear ? `&academic_year_id=${preYear}` : ''}`
    : null;
  const { data: classes } = useApi<ClassSection[]>(csUrl, [selectedBranch]);

  const uniqueGrades = useMemo(() => {
    if (!classes) return [];
    const gradeSet = new Set(classes.map(c => c.grade));
    return GRADE_ORDER.filter(g => gradeSet.has(g));
  }, [classes]);

  // Load subjects whenever branch changes
  const loadSubjects = useCallback(async (branchId: string) => {
    if (!branchId) return;
    setSubjectsLoading(true);
    try {
      const res = await api.get(`academics/subjects-for-class/?branch_id=${branchId}`);
      const data = res.data?.data;
      const all: SubjectRow[] = [
        ...(data?.subjects || []).map((s: any) => ({
          id: s.id, name: s.name, is_optional: false,
          checked: false, max_marks: '', min_marks: '', exam_date: '', exam_time: '',
        })),
        ...(data?.optional_subjects || []).map((s: any) => ({
          id: s.id, name: s.name, is_optional: true,
          checked: false, max_marks: '', min_marks: '', exam_date: '', exam_time: '',
        })),
      ];
      setSubjects(all);
    } catch {
      toast.error('Failed to load subjects');
    } finally {
      setSubjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBranch) loadSubjects(selectedBranch);
  }, [selectedBranch, loadSubjects]);

  // Update a subject row field
  const updateSubject = (id: string, field: keyof SubjectRow, value: string | boolean) => {
    setSubjects(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const visibleSubjects = subjects.filter(s =>
    activeTab === 'subjects' ? !s.is_optional : s.is_optional
  );
  const checkedSubjects = subjects.filter(s => s.checked);

  const validate = () => {
    if (!grade) { toast.error('Please select a grade'); return false; }
    if (!examName.trim()) { toast.error('Exam name is required'); return false; }
    if (!startDate || !endDate) { toast.error('Start and end dates are required'); return false; }
    if (endDate < startDate) { toast.error('End date must be on or after start date'); return false; }
    if (checkedSubjects.length === 0) { toast.error('Please select at least one subject'); return false; }
    for (const s of checkedSubjects) {
      if (!s.max_marks || isNaN(+s.max_marks) || +s.max_marks <= 0) {
        toast.error(`Max marks required for ${s.name}`); return false;
      }
      if (s.min_marks === '' || isNaN(+s.min_marks) || +s.min_marks < 0) {
        toast.error(`Min marks required for ${s.name}`); return false;
      }
      if (+s.min_marks > +s.max_marks) {
        toast.error(`Min marks cannot exceed max marks for ${s.name}`); return false;
      }
    }
    return true;
  };

  const handleSubmit = async (createNew: boolean) => {
    if (!validate()) return;
    setSaving(true);
    setSaveAndNew(createNew);
    try {
      // Step 1: Create assessment header
      const res = await api.post('academics/assessments/', {
        grade: grade,
        branch_id: selectedBranch,
        academic_year: activeYear?.id,
        name: examName.trim(),
        start_date: startDate,
        end_date: endDate,
        status: statusVal,
      });
      // DRF ModelViewSet.create() returns the serializer data directly (not wrapped)
      const assessmentId = res.data?.id;
      if (!assessmentId) {
        throw new Error('Assessment created but ID was not returned. Please refresh and try again.');
      }

      // Step 2: Save subjects
      if (checkedSubjects.length > 0) {
        await api.post(`academics/assessments/${assessmentId}/subjects/`, {
          subjects: checkedSubjects.map(s => ({
            subject: s.id,
            max_marks: s.max_marks,
            min_marks: s.min_marks,
            exam_date: s.exam_date || null,
            exam_time: s.exam_time || null,
          })),
        });
      }

      toast.success('Assessment created successfully');

      if (createNew) {
        // Reset form keeping same class
        setExamName('');
        setStartDate('');
        setEndDate('');
        setSubjects(prev => prev.map(s => ({
          ...s, checked: false, max_marks: '', min_marks: '', exam_date: '', exam_time: ''
        })));
      } else {
        router.push('/academics/assessments');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error ||
        err.response?.data?.detail ||
        Object.values(err.response?.data || {})?.[0] ||
        'Error creating assessment';
      toast.error(String(msg));
    } finally {
      setSaving(false);
      setSaveAndNew(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 flex items-center gap-1.5">
        <Link href="/" className="hover:text-slate-700">Home</Link>
        <span>/</span>
        <Link href="/academics/assessments" className="hover:text-slate-700">Assessments</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Add Exam</span>
      </nav>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardList size={22} className="text-brand-600" />
          Add Exam
        </h1>
        {activeYear && (
          <p className="text-xs text-slate-500 mt-1">Academic Year: <strong>{activeYear.name}</strong></p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
        {/* Row 1: Grade + Exam Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              Grade <span className="text-red-500">*</span>
            </label>
            <select
              value={grade}
              onChange={e => setGrade(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select Grade</option>
              {uniqueGrades.map(g => (
                <option key={g} value={g}>{GRADE_DISPLAY[g] || g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              Exam Name <span className="text-red-500">*</span>
            </label>
            <input
              value={examName}
              onChange={e => setExamName(e.target.value)}
              placeholder="e.g. Mid Term, Annual Exam"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Row 2: Dates & Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              End Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              value={statusVal}
              onChange={e => setStatusVal(e.target.value as any)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="DRAFT">Draft (Configuring)</option>
              <option value="ACTIVE">Active (Open for Marks Entry)</option>
              <option value="LOCKED">Locked (Results Published / Immutable)</option>
            </select>
          </div>
        </div>

        {/* Info note */}
        <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          ℹ️ Start &amp; end dates are used for attendance calculation in report card.
        </p>

        {/* Radio toggle */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="subTab"
              checked={activeTab === 'subjects'}
              onChange={() => setActiveTab('subjects')}
              className="accent-brand-600"
            />
            <span className="text-sm font-medium text-slate-700">Subjects</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="subTab"
              checked={activeTab === 'optional'}
              onChange={() => setActiveTab('optional')}
              className="accent-brand-600"
            />
            <span className="text-sm font-medium text-slate-700">Optional Subjects</span>
          </label>
        </div>

        {/* Subject table */}
        <div>
          <p className="text-xs text-slate-400 uppercase font-bold mb-2">All Sections</p>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Table header bar */}
            <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">
              {activeTab === 'subjects' ? 'Subjects' : 'Optional Subjects'}
            </div>

            {subjectsLoading ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Loading subjects…</div>
            ) : visibleSubjects.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No subjects available</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleSubjects.map(subject => (
                  <div
                    key={subject.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      subject.checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={subject.checked}
                      onChange={e => updateSubject(subject.id, 'checked', e.target.checked)}
                      className="w-4 h-4 accent-brand-600 shrink-0 cursor-pointer"
                    />

                    {/* Subject name */}
                    <span className={`w-36 shrink-0 text-sm font-semibold ${
                      subject.checked ? 'text-slate-800' : 'text-slate-600'
                    }`}>
                      {subject.name}
                    </span>

                    {/* Mark + date fields — greyed when unchecked */}
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <input
                        type="number"
                        min="0"
                        placeholder="Maximum mark.."
                        value={subject.max_marks}
                        disabled={!subject.checked}
                        onChange={e => updateSubject(subject.id, 'max_marks', e.target.value)}
                        className="w-32 border border-slate-200 rounded-lg px-3 py-1.5 text-xs placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="Minimum mark.."
                        value={subject.min_marks}
                        disabled={!subject.checked}
                        onChange={e => updateSubject(subject.id, 'min_marks', e.target.value)}
                        className="w-32 border border-slate-200 rounded-lg px-3 py-1.5 text-xs placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <div className="relative">
                        <input
                          type="date"
                          value={subject.exam_date}
                          disabled={!subject.checked}
                          onChange={e => updateSubject(subject.id, 'exam_date', e.target.value)}
                          className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <input
                        type="time"
                        value={subject.exam_time}
                        disabled={!subject.checked}
                        onChange={e => updateSubject(subject.id, 'exam_time', e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected summary */}
        {checkedSubjects.length > 0 && (
          <p className="text-xs text-slate-500">
            <strong className="text-slate-700">{checkedSubjects.length}</strong> subject{checkedSubjects.length !== 1 ? 's' : ''} selected
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving && !saveAndNew ? 'Saving…' : 'SAVE'}
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving && saveAndNew ? 'Saving…' : 'SAVE & CREATE NEW'}
          </button>
          <Link
            href="/academics/assessments"
            className="px-6 py-2.5 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors"
          >
            CANCEL
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Exported page (Suspense required for useSearchParams in App Router) ─────
export default function NewAssessmentPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    }>
      <NewAssessmentInner />
    </Suspense>
  );
}
