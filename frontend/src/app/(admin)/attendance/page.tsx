"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import DateInput from '@/components/DateInput';
import { CheckCircle, XCircle, Clock, Users, Zap, Check, ShieldCheck, AlertCircle, Calendar } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';

interface Student { id: string; first_name: string; last_name: string; admission_no: string; }
interface ClassSection { id: string; display_name: string; }

export default function AttendancePage() {
  const { selectedBranch } = useBranch();
  const searchParams = useSearchParams();
  const preClassId = searchParams.get('class_id');
  const { data: classes } = useApi<ClassSection[]>(`/classes/?teacher_only=true&branch_id=${selectedBranch}`);
  const [selectedClass, setSelectedClass] = useState('');
  // Get local date string YYYY-MM-DD without UTC shift
  const getLocalDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [date, setDate] = useState(getLocalDate());
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ saved: number } | null>(null);
  const [hasExistingRecords, setHasExistingRecords] = useState(false);

  // 4A: Pre-select class from ?class_id URL param (set by the dashboard "Pending" link).
  // Also auto-select if only one class returned (typical for class teachers).
  useEffect(() => {
    if (!classes) return;
    if (preClassId && classes.find(c => c.id === preClassId) && !selectedClass) {
      fetchData(preClassId, date);
    } else if (classes.length === 1 && !selectedClass) {
      fetchData(classes[0].id, date);
    }
  }, [classes, preClassId]);

  // Refetch when date changes (if a class is already selected)
  useEffect(() => {
    if (selectedClass) {
      fetchData(selectedClass, date);
    }
  }, [date]);

  const fetchData = async (csId: string, targetDate: string) => {
    setSelectedClass(csId);
    if (!csId) {
        setStudents([]);
        return;
    }
    setLoadingStudents(true);
    setResult(null);
    setHasExistingRecords(false);
    
    try {
      const res = await api.get(`/classes/${csId}/students/`);
      const s = res.data.data || res.data;
      setStudents(s);
      
      // Fetch existing records
      const attRes = await api.get(`/attendance/?class_section_id=${csId}&date=${targetDate}`);
      const existing = attRes.data?.data ?? attRes.data?.results ?? attRes.data ?? [];
      
      const newRecords: Record<string, string> = {};
      if (existing.length > 0) {
          setHasExistingRecords(true);
          existing.forEach((r: any) => {
              newRecords[r.student] = r.status;
          });
      }
      
      s.forEach((st: Student) => { 
        if (!newRecords[st.id]) newRecords[st.id] = 'PRESENT'; 
      });
      setRecords(newRecords);
    } catch { setStudents([]); }
    finally { setLoadingStudents(false); }
  };

  const markAll = (status: string) => {
    const newRecords: Record<string, string> = {};
    students.forEach(st => { newRecords[st.id] = status; });
    setRecords(newRecords);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        class_section_id: selectedClass,
        date,
        records: Object.entries(records).map(([student_id, status]) => ({ student_id, status })),
      };
      const res = await api.post('attendance/bulk/', payload);
      setResult(res.data.data);
      setHasExistingRecords(true);
      // Success animation/feedback would go here
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error submitting attendance');
    } finally { setSubmitting(false); }
  };

  const statusColors: Record<string, string> = {
    PRESENT: 'bg-emerald-500',
    ABSENT: 'bg-rose-500',
    // LATE and HALF_DAY removed — no longer used in this UI (4D fix).
  };

  const attendanceStats = {
    total: students.length,
    present: Object.values(records).filter(r => r === 'PRESENT').length,
    absent: Object.values(records).filter(r => r === 'ABSENT').length,
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 mb-1">
             <Calendar size={18} />
             <span className="text-[10px] font-black uppercase tracking-widest">Morning Register</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Daily Attendance</h1>
          <p className="text-gray-500 text-sm">Efficient classroom management and record-keeping.</p>
        </div>

        <div className="flex gap-4 items-end esms-card p-4">
          <div className="flex-1 min-w-[160px]">
            <label className="esms-label">Select Class</label>
            <select value={selectedClass} onChange={e => fetchData(e.target.value, date)}
              className="esms-input">
              <option value="">Select class...</option>
              {classes?.map((c: ClassSection) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </div>
          <div className="w-[140px]">
            <label className="esms-label">Session Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="esms-input" />
          </div>
        </div>
      </div>

      {students.length > 0 && !loadingStudents && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="esms-card p-4 flex items-center justify-between">
               <div>
                  <p className="esms-label !mb-0">Total Students</p>
                  <p className="text-xl font-bold text-slate-900">{attendanceStats.total}</p>
               </div>
               <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
                  <Users size={18} />
               </div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
               <div>
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-0.5">Marked Present</p>
                  <p className="text-xl font-bold text-emerald-800">{attendanceStats.present}</p>
               </div>
               <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                  <Check size={18} />
               </div>
            </div>
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 shadow-sm flex items-center justify-between">
               <div>
                  <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider mb-0.5">Marked Absent</p>
                  <p className="text-xl font-bold text-rose-800">{attendanceStats.absent}</p>
               </div>
               <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center text-rose-600">
                  <AlertCircle size={18} />
               </div>
            </div>
        </div>
      )}

      {loadingStudents ? (
        <div className="space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-white border rounded-2xl animate-pulse" />)}</div>
      ) : students.length > 0 ? (
        <div className="space-y-4">
          {/* 4B: Warn teacher when they are editing already-submitted attendance */}
          {hasExistingRecords && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-amber-700 text-xs font-medium">
              <AlertCircle size={14} className="shrink-0 text-amber-500" />
              <span>
                Attendance already submitted for this date. Any changes you save will <strong>overwrite</strong> the existing records.
              </span>
            </div>
          )}

          <div className="flex justify-between items-center bg-slate-900 text-white p-4 rounded-2xl shadow-xl shadow-slate-200">
              <div className="flex items-center gap-2">
                 <Zap size={14} className="text-amber-400" />
                 <span className="text-xs font-semibold">Quick Actions</span>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => markAll('PRESENT')} className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-[10px] font-bold uppercase tracking-wider rounded text-white transition-all">Mark All Present</button>
                 <button onClick={() => markAll('ABSENT')} className="px-3 py-1 bg-rose-500 hover:bg-rose-600 text-[10px] font-bold uppercase tracking-wider rounded text-white transition-all">Mark All Absent</button>
              </div>
          </div>

          <div className="esms-card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {students.map((s: Student) => (
                <div key={s.id} className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900 group-hover:text-brand-600 transition-colors">{s.first_name} {s.last_name}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">adm: {s.admission_no}</span>
                  </div>
                  <div className="flex gap-1 mt-2 md:mt-0">
                    {['PRESENT', 'ABSENT'].map(st => (
                      <button 
                        key={st} 
                        onClick={() => setRecords({...records, [s.id]: st})}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-all ${
                          records[s.id] === st
                            ? `${statusColors[st]} text-white shadow-sm ring-1 ring-offset-1 ring-${statusColors[st].replace('bg-', '')}`
                            : 'bg-white border border-gray-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={handleSubmit} 
                disabled={submitting}
                className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm transition-all text-white ${hasExistingRecords ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50`}
              >
                {submitting ? 'Authenticating & Saving...' : (hasExistingRecords ? `Update Attendance (${students.length})` : `Finalize & Submit (${students.length})`)}
              </button>
            </div>
          </div>
        </div>
      ) : selectedClass ? (
        <div className="esms-card p-16 text-center">
          <Zap className="mx-auto text-slate-200 mb-4 animate-bounce" size={48} />
          <p className="text-slate-900 font-semibold">Class directory not synced.</p>
          <p className="text-slate-500 text-sm mt-1">Check class assignments or try another group.</p>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-100 rounded-3xl p-16 text-center flex flex-col items-center">
           <Zap className="text-blue-500 mb-4" size={32} />
           <p className="text-blue-900 font-bold uppercase tracking-widest text-xs">Ready for Morning Register</p>
           <p className="text-blue-600/70 text-sm mt-1 max-w-xs">Select your class section above to begin marking the daily attendance.</p>
        </div>
      )}

      {result && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-500 z-50">
          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
             <Check size={16} />
          </div>
          <div>
             <p className="text-sm font-black uppercase tracking-widest">Attendance Synchronized</p>
             <p className="text-xs text-slate-400 font-bold">Successfully logged {result.saved} student records.</p>
          </div>
          <button onClick={() => setResult(null)} className="ml-4 p-2 hover:bg-slate-800 rounded-xl">
             <XCircle size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
