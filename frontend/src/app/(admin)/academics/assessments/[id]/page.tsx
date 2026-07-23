"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { ClipboardList, CalendarDays, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

interface AssessmentSubject {
  id: string;
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
  is_active: boolean;
  subject_count: number;
  status: 'DRAFT' | 'ACTIVE' | 'LOCKED';
}

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderStatusBadge(status: string | undefined) {
  const s = status || 'DRAFT';
  if (s === 'ACTIVE') {
    return (
      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
        Active
      </span>
    );
  }
  if (s === 'LOCKED') {
    return (
      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
        Locked
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
      Draft
    </span>
  );
}

function fmtTime(t: string | null) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: assessment, loading: aLoading } = useApi<Assessment>(`academics/assessments/${id}/`);
  const { data: subjects, loading: sLoading } = useApi<AssessmentSubject[]>(
    `academics/assessments/${id}/subjects/`
  );

  // The /subjects/ endpoint returns { success: true, data: [...] } but useApi unwraps .data
  const subjectList: AssessmentSubject[] = Array.isArray(subjects) ? subjects : [];

  const handleDelete = async () => {
    if (!window.confirm(`Delete assessment "${assessment?.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`academics/assessments/${id}/`);
      toast.success('Assessment deleted');
      router.push('/academics/assessments');
    } catch {
      toast.error('Error deleting assessment');
    }
  };

  if (aLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-4xl">
        <div className="h-8 bg-slate-100 rounded w-48" />
        <div className="h-4 bg-slate-100 rounded w-72" />
        <div className="h-64 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p>Assessment not found.</p>
        <Link href="/academics/assessments" className="text-brand-600 underline text-sm mt-2 inline-block">← Back to Assessments</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 flex items-center gap-1.5">
        <Link href="/" className="hover:text-slate-700">Home</Link>
        <span>/</span>
        <Link href="/academics/assessments" className="hover:text-slate-700">Assessments</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{assessment.name}</span>
      </nav>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList size={22} className="text-brand-600" />
              {assessment.name}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-500 flex-wrap">
              <span>{assessment.grade_display}</span>
              <span className="text-slate-300">|</span>
              <span>{assessment.academic_year_name}</span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1.5">
                <CalendarDays size={13} />
                {fmt(assessment.start_date)} – {fmt(assessment.end_date)}
              </span>
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                {assessment.subject_count} subject{assessment.subject_count !== 1 ? 's' : ''}
              </span>
              {renderStatusBadge(assessment.status)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/academics/assessments/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              <Pencil size={14} /> Edit Exam
            </Link>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 size={14} /> Delete Exam
            </button>
          </div>
        </div>
      </div>

      {/* Subjects table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <h2 className="text-sm font-bold text-slate-700">Subject Configuration</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/40">
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Max Marks</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Min Marks</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Exam Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : subjectList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No subjects configured yet.
                    <Link href={`/academics/assessments/${id}/edit`} className="text-brand-600 underline ml-1">
                      Edit exam to add subjects.
                    </Link>
                  </td>
                </tr>
              ) : (
                subjectList.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-slate-800">{s.subject_name}</td>
                    <td className="px-4 py-3.5 text-slate-700">{s.max_marks}</td>
                    <td className="px-4 py-3.5 text-slate-700">{s.min_marks}</td>
                    <td className="px-4 py-3.5 text-slate-500">{fmt(s.exam_date)}</td>
                    <td className="px-4 py-3.5 text-slate-500">{fmtTime(s.exam_time)}</td>
                    <td className="px-4 py-3.5">
                      {s.subject_is_optional ? (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">Optional</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">Core</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Back link */}
      <Link
        href="/academics/assessments"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Assessments
      </Link>
    </div>
  );
}
