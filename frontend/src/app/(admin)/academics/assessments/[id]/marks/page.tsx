"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/axios";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { ArrowLeft, BarChart2, Loader2, Save, Info, ChevronDown } from "lucide-react";

interface AssessmentMeta {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "LOCKED";
  grade: string;
  start_date: string | null;
  end_date: string | null;
}

interface SectionItem {
  id: string;
  display_name: string;
  grade: string;
  section: string;
}

interface SubjectCol {
  id: string;
  name: string;
  is_optional: boolean;
  max_marks: string;
}

interface StudentMarkEntry {
  marks_obtained: number | null;
  is_absent: boolean;
  remarks: string;
  result_id: string | null;
}

interface StudentRow {
  student_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  roll_number: number | null;
  marks: Record<string, StudentMarkEntry>;
}

type Draft = Record<string, Record<string, { marks: string; is_absent: boolean }>>;

function StatusBadge({ s }: { s: "DRAFT" | "ACTIVE" | "LOCKED" }) {
  if (s === "ACTIVE")
    return <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Active</span>;
  if (s === "LOCKED")
    return <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Locked</span>;
  return <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Draft</span>;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ConsolidatedMarksPage() {
  const { id: assessmentId } = useParams<{ id: string }>();

  const [assessment, setAssessment] = useState<AssessmentMeta | null>(null);
  const [aLoading, setALoading] = useState(true);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [subjects, setSubjects] = useState<SubjectCol[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!assessmentId) return;
    setALoading(true);
    api.get(`academics/assessments/${assessmentId}/`)
      .then((res) => { const d = res.data?.data ?? res.data; setAssessment(d); })
      .catch(() => toast.error("Could not load assessment details."))
      .finally(() => setALoading(false));
  }, [assessmentId]);

  useEffect(() => {
    if (!assessment?.grade) return;
    setSectionsLoading(true);
    api.get("classes/", { params: { search: assessment.grade } })
      .then((res) => {
        const raw = res.data?.data ?? res.data?.results ?? res.data;
        const list: SectionItem[] = Array.isArray(raw) ? raw : [];
        setSections(list.filter((s) => s.grade === assessment.grade));
        setSelectedSectionId("");
      })
      .catch(() => toast.error("Could not load class sections."))
      .finally(() => setSectionsLoading(false));
  }, [assessment?.grade]);

  const loadGrid = useCallback(async (sectionId: string) => {
    if (!assessmentId || !sectionId) return;
    setGridLoading(true);
    setGridError(null);
    setSubjects([]);
    setStudents([]);
    setDraft({});
    try {
      const res = await api.get("academics/marks/consolidated/", {
        params: { assessment_id: assessmentId, class_section_id: sectionId },
      });
      const d = res.data?.data;
      const subjectsData: SubjectCol[] = d.subjects ?? [];
      const studentsData: StudentRow[] = d.students ?? [];
      setSubjects(subjectsData);
      setStudents(studentsData);
      const initDraft: Draft = {};
      for (const st of studentsData) {
        initDraft[st.student_id] = {};
        for (const sub of subjectsData) {
          const entry = st.marks?.[sub.id];
          initDraft[st.student_id][sub.id] = {
            marks: entry?.marks_obtained !== null && entry?.marks_obtained !== undefined ? String(entry.marks_obtained) : "",
            is_absent: entry?.is_absent ?? false,
          };
        }
      }
      setDraft(initDraft);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.detail || "Could not load marks grid.";
      setGridError(String(msg));
      toast.error(String(msg));
    } finally {
      setGridLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => { if (selectedSectionId) loadGrid(selectedSectionId); }, [selectedSectionId, loadGrid]);

  const setMark = (studentId: string, subjectId: string, value: string) => {
    setDraft((d) => ({ ...d, [studentId]: { ...d[studentId], [subjectId]: { ...d[studentId]?.[subjectId], marks: value } } }));
  };

  const setAbsent = (studentId: string, subjectId: string, absent: boolean) => {
    setDraft((d) => ({ ...d, [studentId]: { ...d[studentId], [subjectId]: { ...d[studentId]?.[subjectId], marks: absent ? "" : (d[studentId]?.[subjectId]?.marks ?? ""), is_absent: absent } } }));
  };

  const validateMark = (value: string, maxMarks: string): string | null => {
    if (value === "") return null;
    const num = parseFloat(value);
    if (isNaN(num)) return "Invalid";
    if (num < 0) return "< 0";
    if (num > parseFloat(maxMarks)) return `> ${maxMarks}`;
    return null;
  };

  const saveAll = async () => {
    if (!assessmentId || !selectedSectionId) return;
    const rows: object[] = [];
    for (const st of students) {
      for (const sub of subjects) {
        const cell = draft[st.student_id]?.[sub.id];
        if (!cell) continue;
        const rawMarks = cell.marks.trim();
        rows.push({
          student_id: st.student_id,
          subject_id: sub.id,
          marks_obtained: cell.is_absent ? null : rawMarks === "" ? null : parseFloat(rawMarks),
          is_absent: cell.is_absent,
          remarks: "",
        });
      }
    }
    setSaving(true);
    try {
      const res = await api.post("academics/marks/consolidated-bulk/", {
        assessment_id: assessmentId,
        class_section_id: selectedSectionId,
        rows,
      });
      const saved = res.data?.data?.saved ?? 0;
      const errors = res.data?.data?.errors ?? [];
      if (errors.length > 0) {
        toast.error(`Saved ${saved} rows, but ${errors.length} error(s) occurred.`);
      } else {
        toast.success(`Marks saved successfully! (${saved} records updated)`);
      }
      await loadGrid(selectedSectionId);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.detail || "Failed to save marks.";
      toast.error(String(msg));
    } finally {
      setSaving(false);
    }
  };

  const isLocked = assessment?.status === "LOCKED";
  const isDraft = assessment?.status === "DRAFT";
  const canEdit = !isLocked && !isDraft;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-700">Home</Link>
        <span>/</span>
        <Link href="/academics/assessments" className="hover:text-slate-700">Assessments</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{aLoading ? "…" : (assessment?.name ?? "Marks")}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/academics/assessments" className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <BarChart2 size={20} className="text-indigo-600" />
              <h1 className="text-xl font-bold text-slate-900">
                {aLoading ? "Loading…" : `${assessment?.name ?? ""} — Consolidated Marks`}
              </h1>
              {assessment && <StatusBadge s={assessment.status} />}
            </div>
            {assessment && (
              <p className="text-xs text-slate-500 mt-0.5">
                {assessment.grade} &bull; {fmt(assessment.start_date)} → {fmt(assessment.end_date)}
              </p>
            )}
          </div>
        </div>
      </div>

      {isDraft && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>This assessment is in <strong>Draft</strong> status. Marks entry is not yet open.</span>
        </div>
      )}
      {isLocked && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>This assessment is <strong>Locked</strong>. Results have been published and marks cannot be changed.</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-700 whitespace-nowrap">Class Section</label>
            <div className="relative">
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                disabled={sectionsLoading || aLoading}
                className="appearance-none border border-slate-200 rounded-xl px-4 py-2 pr-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 min-w-[220px]"
              >
                <option value="">{sectionsLoading ? "Loading sections…" : "Select a section…"}</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {selectedSectionId && students.length > 0 && canEdit && (
            <button
              onClick={saveAll}
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? "Saving…" : "Save All Marks"}
            </button>
          )}
        </div>
        {selectedSectionId && (
          <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
            <Info size={12} />
            Changes made here are immediately reflected on teachers&apos; individual subject views.
          </p>
        )}
      </div>

      {gridLoading && (
        <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Loading marks grid…</span>
        </div>
      )}

      {gridError && !gridLoading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-700 font-medium text-sm">{gridError}</p>
          <button onClick={() => loadGrid(selectedSectionId)} className="mt-3 text-xs text-red-600 underline hover:no-underline">Try again</button>
        </div>
      )}

      {!gridLoading && !gridError && selectedSectionId && students.length === 0 && subjects.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-slate-500 text-sm">No active students found in this section.</p>
        </div>
      )}

      {!gridLoading && !gridError && selectedSectionId && subjects.length === 0 && !aLoading && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-slate-500 text-sm">
            No subjects configured for this assessment yet.{" "}
            <Link href={`/academics/assessments/${assessmentId}/edit`} className="text-indigo-600 underline">Edit Assessment</Link> to add subjects.
          </p>
        </div>
      )}

      {!gridLoading && !gridError && students.length > 0 && subjects.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-100 min-w-[200px]">Student</th>
                  <th className="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-100 w-14">Roll</th>
                  {subjects.map((sub) => (
                    <th key={sub.id} className="px-3 py-3 text-center border-r border-slate-100 min-w-[130px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-bold text-slate-700">
                          {sub.name}
                          {sub.is_optional && <span className="ml-1 text-[9px] font-medium text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded-full">OPT</span>}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">Max: {sub.max_marks}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {students.map((st, idx) => (
                  <tr key={st.student_id} className={idx % 2 === 0 ? "bg-white hover:bg-slate-50/60" : "bg-slate-50/30 hover:bg-slate-50/70"}>
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 border-r border-slate-100">
                      <div>
                        <p className="font-semibold text-slate-800 text-xs">{st.first_name} {st.last_name}</p>
                        <p className="text-[10px] text-slate-400">{st.admission_number}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500 border-r border-slate-100">{st.roll_number ?? "—"}</td>
                    {subjects.map((sub) => {
                      const cell = draft[st.student_id]?.[sub.id] ?? { marks: "", is_absent: false };
                      const validationErr = validateMark(cell.marks, sub.max_marks);
                      const isAbsent = cell.is_absent;
                      return (
                        <td key={sub.id} className="px-2 py-2 border-r border-slate-100 align-middle">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={parseFloat(sub.max_marks)}
                              step="0.01"
                              disabled={isAbsent || isLocked || isDraft}
                              value={cell.marks}
                              onChange={(e) => setMark(st.student_id, sub.id, e.target.value)}
                              placeholder={isAbsent ? "Absent" : "—"}
                              className={[
                                "w-20 text-center text-sm border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors",
                                isAbsent ? "bg-orange-50 border-orange-200 text-orange-400 placeholder-orange-300 cursor-not-allowed" : validationErr ? "border-red-400 bg-red-50 text-red-700 focus:ring-red-400" : "border-slate-200 bg-white",
                                (isLocked || isDraft) ? "opacity-60 cursor-not-allowed" : "",
                              ].filter(Boolean).join(" ")}
                            />
                            {validationErr && !isAbsent && <span className="text-[9px] text-red-600 font-medium">{validationErr}</span>}
                            {canEdit && (
                              <label className="flex items-center gap-1 cursor-pointer select-none">
                                <input type="checkbox" checked={isAbsent} onChange={(e) => setAbsent(st.student_id, sub.id, e.target.checked)} className="w-3 h-3 accent-orange-500 cursor-pointer" />
                                <span className="text-[9px] text-slate-400 font-medium">Absent</span>
                              </label>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60">
              <p className="text-xs text-slate-400">{students.length} student{students.length !== 1 ? "s" : ""} &bull; {subjects.length} subject{subjects.length !== 1 ? "s" : ""}</p>
              <button
                onClick={saveAll}
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Saving…" : "Save All Marks"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
