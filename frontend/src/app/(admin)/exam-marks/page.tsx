"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/axios";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/common/AuthProvider";
import { useResolvedReplace } from "@/hooks/useResolvedNavigation";
import { Award, Loader2, Save, BookOpen } from "lucide-react";

type Assignment = {
  class_section_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  branch_id: string;
  academic_year_id: string;
};

type ExamTerm = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  branch_id: string;
  academic_year_id: string;
};

type GridStudent = {
  student_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  roll_number: number | null;
  marks_obtained: string;
  max_marks: string;
  remarks: string;
};

type GridPayload = {
  exam_term: { id: string; name: string; academic_year_id: string };
  class_section: { id: string; display_name: string; grade: string; section: string };
  subject: { id: string; name: string; code: string };
  default_max_marks: string;
  students: GridStudent[];
};

const ACADEMIC_MARKS_ROLES = new Set([
  "TEACHER",
  "PRINCIPAL",
  "BRANCH_ADMIN",
  "SUPER_ADMIN",
  "OWNER",
  "ZONAL_ADMIN",
]);

function unwrapList(res: any): any[] {
  const raw = res.data?.data ?? res.data?.results ?? res.data;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

export default function ExamMarksPage() {
  const { user, loading: authLoading } = useAuth();
  const replace = useResolvedReplace();

  const [contextLoading, setContextLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [examTerms, setExamTerms] = useState<ExamTerm[]>([]);

  const [examTermId, setExamTermId] = useState("");
  const [assignmentKey, setAssignmentKey] = useState("");
  const [classSectionId, setClassSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [gridLoading, setGridLoading] = useState(false);
  const [grid, setGrid] = useState<GridPayload | null>(null);
  const [draft, setDraft] = useState<
    Record<string, { marks: string; max: string; remarks: string }>
  >({});
  const [saving, setSaving] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c: any) => c.id === classSectionId),
    [classes, classSectionId]
  );

  useEffect(() => {
    if (authLoading || !user) return;
    if (!ACADEMIC_MARKS_ROLES.has(user.role)) {
      toast.error("You do not have access to exam marks entry.");
      replace("/dashboard");
    }
  }, [authLoading, user, replace]);

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    try {
      const res = await api.get("academics/marks/context/");
      const d = res.data?.data ?? res.data;
      setAssignments(d?.assignments ?? []);
      setExamTerms(d?.exam_terms ?? []);
    } catch {
      toast.error("Could not load marks context.");
      setAssignments([]);
      setExamTerms([]);
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !ACADEMIC_MARKS_ROLES.has(user.role)) return;
    loadContext();
  }, [user, loadContext]);

  const loadClasses = useCallback(async () => {
    try {
      const res = await api.get("classes/");
      setClasses(unwrapList(res));
    } catch {
      toast.error("Could not load classes.");
      setClasses([]);
    }
  }, []);

  useEffect(() => {
    if (!user || assignments.length > 0) return;
    if (!ACADEMIC_MARKS_ROLES.has(user.role)) return;
    loadClasses();
  }, [user, assignments.length, loadClasses]);

  useEffect(() => {
    const bid = selectedClass?.branch;
    if (!bid) {
      setSubjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("subjects/", { params: { branch_id: bid } });
        if (!cancelled) setSubjects(unwrapList(res));
      } catch {
        if (!cancelled) {
          setSubjects([]);
          toast.error("Could not load subjects.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.branch]);

  useEffect(() => {
    if (!examTermId || !classSectionId || !subjectId) {
      setGrid(null);
      setDraft({});
      return;
    }
    let cancelled = false;
    setGridLoading(true);
    (async () => {
      try {
        const res = await api.get("academics/marks/grid/", {
          params: {
            exam_term_id: examTermId,
            class_section_id: classSectionId,
            subject_id: subjectId,
          },
        });
        if (cancelled) return;
        const d = res.data?.data as GridPayload;
        setGrid(d);
        const next: Record<string, { marks: string; max: string; remarks: string }> = {};
        for (const s of d.students) {
          next[s.student_id] = {
            marks: s.marks_obtained || "",
            max: s.max_marks || d.default_max_marks,
            remarks: s.remarks || "",
          };
        }
        setDraft(next);
      } catch (e: any) {
        if (!cancelled) {
          setGrid(null);
          setDraft({});
          const msg =
            e?.response?.data?.error ||
            e?.response?.data?.detail ||
            "Could not load marks grid.";
          toast.error(typeof msg === "string" ? msg : "Could not load marks grid.");
        }
      } finally {
        if (!cancelled) setGridLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examTermId, classSectionId, subjectId]);

  const onAssignmentPick = (key: string) => {
    setAssignmentKey(key);
    if (!key) {
      setClassSectionId("");
      setSubjectId("");
      return;
    }
    const [cs, sub] = key.split("::");
    setClassSectionId(cs);
    setSubjectId(sub);
  };

  const updateDraft = (
    studentId: string,
    field: "marks" | "max" | "remarks",
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      [studentId]: {
        marks: prev[studentId]?.marks ?? "",
        max: prev[studentId]?.max ?? grid?.default_max_marks ?? "100",
        remarks: prev[studentId]?.remarks ?? "",
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!examTermId || !classSectionId || !subjectId || !grid) {
      toast.error("Select exam, class, and subject first.");
      return;
    }
    const defaultMax = grid.default_max_marks;
    const rows = Object.entries(draft)
      .filter(([, v]) => v.marks.trim() !== "")
      .map(([student_id, v]) => ({
        student_id,
        marks_obtained: v.marks.trim(),
        max_marks: v.max?.trim() || defaultMax,
        remarks: v.remarks?.trim() || "",
      }));
    if (!rows.length) {
      toast.error("Enter at least one mark to save.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("academics/marks/bulk/", {
        exam_term_id: examTermId,
        class_section_id: classSectionId,
        subject_id: subjectId,
        default_max_marks: defaultMax,
        rows,
      });
      const errs = res.data?.data?.errors ?? [];
      const saved = res.data?.data?.saved ?? 0;
      if (errs.length) {
        toast.error(`Saved ${saved}; ${errs.length} row(s) had errors.`);
      } else {
        toast.success(`Saved marks for ${saved} student(s).`);
      }
      const gr = await api.get("academics/marks/grid/", {
        params: {
          exam_term_id: examTermId,
          class_section_id: classSectionId,
          subject_id: subjectId,
        },
      });
      const d = gr.data?.data as GridPayload;
      setGrid(d);
      const next: Record<string, { marks: string; max: string; remarks: string }> = {};
      for (const s of d.students) {
        next[s.student_id] = {
          marks: s.marks_obtained || "",
          max: s.max_marks || d.default_max_marks,
          remarks: s.remarks || "",
        };
      }
      setDraft(next);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.detail ||
        "Save failed.";
      toast.error(typeof msg === "string" ? msg : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user || !ACADEMIC_MARKS_ROLES.has(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-500">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Award className="w-6 h-6" />
            <span className="text-xs font-bold uppercase tracking-wider">Academics</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Exam marks entry</h1>
          <p className="text-slate-500 mt-1 text-sm max-w-xl">
            Enter marks for your classes. Data feeds consolidated marks, ranks, and report cards in{" "}
            <span className="font-medium text-slate-700">Reports → Academics</span>.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        {contextLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your teaching context…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                  Exam term
                </label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  value={examTermId}
                  onChange={(e) => setExamTermId(e.target.value)}
                >
                  <option value="">Select exam…</option>
                  {examTerms.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </div>

              {assignments.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                    Class &amp; subject
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    value={assignmentKey}
                    onChange={(e) => onAssignmentPick(e.target.value)}
                  >
                    <option value="">Select class &amp; subject…</option>
                    {assignments.map((a) => {
                      const key = `${a.class_section_id}::${a.subject_id}`;
                      return (
                        <option key={key} value={key}>
                          {a.class_name} — {a.subject_name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                      Class section
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                      value={classSectionId}
                      onChange={(e) => {
                        setClassSectionId(e.target.value);
                        setSubjectId("");
                      }}
                    >
                      <option value="">Select class…</option>
                      {classes.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.display_name || `${c.grade}-${c.section}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                      Subject
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                      value={subjectId}
                      onChange={(e) => setSubjectId(e.target.value)}
                      disabled={!classSectionId}
                    >
                      <option value="">Select subject…</option>
                      {subjects.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.code ? `${s.code} — ${s.name}` : s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {assignments.length === 0 && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                No automatic teaching assignments found — pick class and subject manually (branch admins
                and principals can enter for any class in scope).
              </p>
            )}
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
          <h2 className="text-sm font-bold text-slate-800">Students</h2>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || gridLoading || !grid}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save marks
          </button>
        </div>

        {gridLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
            Loading roster…
          </div>
        ) : !grid ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Choose an exam and class/subject to load students.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-3">Roll</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Adm. no.</th>
                  <th className="px-4 py-3 w-24">Max</th>
                  <th className="px-4 py-3 w-28">Marks</th>
                  <th className="px-4 py-3 min-w-[140px]">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grid.students.map((s) => {
                  const drow = draft[s.student_id] || {
                    marks: "",
                    max: s.max_marks || grid.default_max_marks,
                    remarks: "",
                  };
                  return (
                    <tr key={s.student_id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2 text-slate-600">{s.roll_number ?? "—"}</td>
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {s.first_name} {s.last_name || ""}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{s.admission_number || "—"}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          value={drow.max}
                          onChange={(e) => updateDraft(s.student_id, "max", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          placeholder="—"
                          value={drow.marks}
                          onChange={(e) => updateDraft(s.student_id, "marks", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                          value={drow.remarks}
                          onChange={(e) => updateDraft(s.student_id, "remarks", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
