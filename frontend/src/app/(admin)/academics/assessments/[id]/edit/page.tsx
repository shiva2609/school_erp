"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import { useBranch } from '@/components/common/BranchContext';
import { ClipboardList } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

interface ClassSection { id: string; display_name: string; academic_year: string; }
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
interface ExistingSubject {
  id: string;
  subject: string;
  subject_name: string;
  subject_is_optional: boolean;
  max_marks: string;
  min_marks: string;
  exam_date: string | null;
  exam_time: string | null;
}
interface Assessment {
  id: string;
  name: string;
  academic_year: string;
  academic_year_name: string;
  grade: string;
  grade_display: string;
  start_date: string;
  end_date: string;
}

export default function EditAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { selectedBranch } = useBranch();

  const { data: assessment, loading: aLoading } = useApi<Assessment>(`academics/assessments/${id}/`);
  const { data: existingSubjects } = useApi<ExistingSubject[]>(`academics/assessments/${id}/subjects/`);

  const csUrl = selectedBranch
    ? `classes/?branch_id=${selectedBranch}`
    : null;
  const { data: classes } = useApi<ClassSection[]>(csUrl, [selectedBranch]);

  // Form state
  const [examName, setExamName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'subjects' | 'optional'>('subjects');
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Pre-fill when assessment loads
  useEffect(() => {
    if (assessment) {
      setExamName(assessment.name);
      setStartDate(assessment.start_date);
      setEndDate(assessment.end_date);
    }
  }, [assessment]);

  // Load subjects from branch + merge with existing assessment subjects
  const loadSubjects = useCallback(async (branchId: string) => {
    if (!branchId) return;
    try {
      const res = await api.get(`academics/subjects-for-class/?branch_id=${branchId}`);
      const data = res.data?.data;
      const all: SubjectRow[] = [
        ...(data?.subjects || []).map((s: any) => ({ id: s.id, name: s.name, is_optional: false, checked: false, max_marks: '', min_marks: '', exam_date: '', exam_time: '' })),
        ...(data?.optional_subjects || []).map((s: any) => ({ id: s.id, name: s.name, is_optional: true, checked: false, max_marks: '', min_marks: '', exam_date: '', exam_time: '' })),
      ];
      setSubjects(all);
    } catch {
      toast.error('Failed to load subjects');
    }
  }, []);

  useEffect(() => {
    if (selectedBranch) loadSubjects(selectedBranch);
  }, [selectedBranch]);

  // Merge existing subject data once both are loaded
  useEffect(() => {
    if (!existingSubjects || subjects.length === 0) return;
    const existing = Array.isArray(existingSubjects) ? existingSubjects : [];
    setSubjects(prev => prev.map(s => {
      const match = existing.find(e => e.subject === s.id);
      if (match) {
        return {
          ...s,
          checked: true,
          max_marks: match.max_marks,
          min_marks: match.min_marks,
          exam_date: match.exam_date || '',
          exam_time: match.exam_time || '',
        };
      }
      return s;
    }));
  }, [existingSubjects, subjects.length]);

  const updateSubject = (id: string, field: keyof SubjectRow, value: string | boolean) => {
    setSubjects(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const visibleSubjects = subjects.filter(s => activeTab === 'subjects' ? !s.is_optional : s.is_optional);
  const checkedSubjects = subjects.filter(s => s.checked);

  const handleSave = async () => {
    if (!examName.trim()) { toast.error('Exam name is required'); return; }
    if (!startDate || !endDate) { toast.error('Dates are required'); return; }
    if (endDate < startDate) { toast.error('End date must be on or after start date'); return; }
    if (checkedSubjects.length === 0) { toast.error('Select at least one subject'); return; }

    for (const s of checkedSubjects) {
      if (!s.max_marks || +s.max_marks <= 0) { toast.error(`Max marks required for ${s.name}`); return; }
      if (s.min_marks === '' || +s.min_marks < 0) { toast.error(`Min marks required for ${s.name}`); return; }
      if (+s.min_marks > +s.max_marks) { toast.error(`Min marks cannot exceed max marks for ${s.name}`); return; }
    }

    setSaving(true);
    try {
      await api.patch(`academics/assessments/${id}/`, {
        name: examName.trim(),
        start_date: startDate,
        end_date: endDate,
      });

      await api.post(`academics/assessments/${id}/subjects/`, {
        subjects: checkedSubjects.map(s => ({
          subject: s.id,
          max_marks: s.max_marks,
          min_marks: s.min_marks,
          exam_date: s.exam_date || null,
          exam_time: s.exam_time || null,
        })),
      });

      toast.success('Assessment updated');
      router.push(`/academics/assessments/${id}`);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error updating assessment';
      toast.error(String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (aLoading) {
    return <div className="animate-pulse space-y-4 max-w-4xl"><div className="h-8 bg-slate-100 rounded w-48" /><div className="h-64 bg-slate-100 rounded-2xl" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <nav className="text-xs text-slate-500 flex items-center gap-1.5">
        <Link href="/" className="hover:text-slate-700">Home</Link>
        <span>/</span>
        <Link href="/academics/assessments" className="hover:text-slate-700">Assessments</Link>
        <span>/</span>
        <Link href={`/academics/assessments/${id}`} className="hover:text-slate-700">{assessment?.name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Edit</span>
      </nav>

      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <ClipboardList size={22} className="text-brand-600" />
        Edit Exam
      </h1>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
        {/* Grade (read-only) + Exam Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Grade</label>
            <div className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 text-slate-600">
              {assessment?.grade_display || '—'}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              Exam Name <span className="text-red-500">*</span>
            </label>
            <input
              value={examName}
              onChange={e => setExamName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Start Date <span className="text-red-500">*</span></label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">End Date <span className="text-red-500">*</span></label>
            <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>

        {/* Radio + Subject table (same as add page) */}
        <div className="flex items-center gap-6">
          {(['subjects', 'optional'] as const).map(tab => (
            <label key={tab} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="editTab" checked={activeTab === tab} onChange={() => setActiveTab(tab)} className="accent-brand-600" />
              <span className="text-sm font-medium text-slate-700">
                {tab === 'subjects' ? 'Subjects' : 'Optional Subjects'}
              </span>
            </label>
          ))}
        </div>

        <div>
          <p className="text-xs text-slate-400 uppercase font-bold mb-2">All Sections</p>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">
              {activeTab === 'subjects' ? 'Subjects' : 'Optional Subjects'}
            </div>
            <div className="divide-y divide-slate-100">
              {visibleSubjects.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">No subjects available</div>
              ) : visibleSubjects.map(subject => (
                <div key={subject.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${subject.checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={subject.checked} onChange={e => updateSubject(subject.id, 'checked', e.target.checked)} className="w-4 h-4 accent-brand-600 shrink-0 cursor-pointer" />
                  <span className={`w-36 shrink-0 text-sm font-semibold ${subject.checked ? 'text-slate-800' : 'text-slate-600'}`}>{subject.name}</span>
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <input type="number" min="0" placeholder="Maximum mark.." value={subject.max_marks} disabled={!subject.checked}
                      onChange={e => updateSubject(subject.id, 'max_marks', e.target.value)}
                      className="w-32 border border-slate-200 rounded-lg px-3 py-1.5 text-xs placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                    <input type="number" min="0" placeholder="Minimum mark.." value={subject.min_marks} disabled={!subject.checked}
                      onChange={e => updateSubject(subject.id, 'min_marks', e.target.value)}
                      className="w-32 border border-slate-200 rounded-lg px-3 py-1.5 text-xs placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                    <input type="date" value={subject.exam_date} disabled={!subject.checked}
                      onChange={e => updateSubject(subject.id, 'exam_date', e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                    <input type="time" value={subject.exam_time} disabled={!subject.checked}
                      onChange={e => updateSubject(subject.id, 'exam_time', e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'SAVE'}
          </button>
          <Link href={`/academics/assessments/${id}`}
            className="px-6 py-2.5 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors">
            CANCEL
          </Link>
        </div>
      </div>
    </div>
  );
}
