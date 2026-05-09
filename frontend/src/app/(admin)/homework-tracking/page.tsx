"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/axios';
import { useAuth } from '@/components/common/AuthProvider';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import { 
  BookOpen, CheckCircle2, Clock, AlertCircle, Users, ChevronDown,
  ChevronRight, Search, Filter, Calendar, PenTool, Eye, XCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ClassSection {
  id: string;
  display_name: string;
}

interface StudentInfo {
  id: string;
  name: string;
  admission_number: string;
}

interface StudentStatus {
  student_id: string;
  acknowledged: boolean;
}

interface HomeworkTracking {
  id: string;
  title: string;
  description: string;
  subject_name: string;
  due_date: string;
  activity_type: string;
  posted_by: string | null;
  created_at: string;
  acked_count: number;
  total_students: number;
  ack_percentage: number;
  student_statuses: StudentStatus[];
}

export default function HomeworkTrackingPage() {
  const { user } = useAuth();
  const push = useResolvedPush();

  // Enforce teacher-only access
  useEffect(() => {
    if (user && user.role !== 'TEACHER') {
      push('/dashboard');
    }
  }, [user, push]);

  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [homework, setHomework] = useState<HomeworkTracking[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [expandedHw, setExpandedHw] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'complete'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  // Load classes
  useEffect(() => {
    api.get('/classes/').then(res => {
      const arr = res.data?.data ?? res.data?.results ?? res.data;
      setClasses(Array.isArray(arr) ? arr : []);
    }).catch(() => setClasses([]))
    .finally(() => setLoadingClasses(false));
  }, []);

  // Load tracking data when class is selected
  useEffect(() => {
    if (!selectedClass) {
      setHomework([]);
      setStudents([]);
      return;
    }
    setLoading(true);
    api.get(`/homework/tracking/?class_section_id=${selectedClass}`)
      .then(res => {
        const data = res.data?.data;
        setStudents(data?.students || []);
        setHomework(data?.homework || []);
      })
      .catch(() => {
        toast.error('Failed to load tracking data');
        setHomework([]);
        setStudents([]);
      })
      .finally(() => setLoading(false));
  }, [selectedClass]);

  // Filter and search homework
  const filteredHomework = homework.filter(hw => {
    if (filterStatus === 'complete' && hw.ack_percentage < 100) return false;
    if (filterStatus === 'pending' && hw.ack_percentage >= 100) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!hw.title.toLowerCase().includes(q) && !hw.subject_name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats
  const totalHw = homework.length;
  const fullyAcked = homework.filter(h => h.ack_percentage === 100).length;
  const partiallyAcked = homework.filter(h => h.ack_percentage > 0 && h.ack_percentage < 100).length;
  const notAcked = homework.filter(h => h.ack_percentage === 0).length;

  // Get student name by id
  const getStudentName = (id: string) => students.find(s => s.id === id)?.name || id;

  // Per-student homework summary
  const studentSummary = students.map(s => {
    const total = homework.length;
    const acked = homework.filter(hw => 
      hw.student_statuses.find(ss => ss.student_id === s.id)?.acknowledged
    ).length;
    return { ...s, total, acked, percentage: total > 0 ? Math.round(acked / total * 100) : 0 };
  }).sort((a, b) => a.percentage - b.percentage);

  const getPercentageColor = (pct: number) => {
    if (pct === 100) return 'text-emerald-600';
    if (pct >= 50) return 'text-amber-600';
    return 'text-rose-600';
  };

  const getPercentageBg = (pct: number) => {
    if (pct === 100) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen size={24} className="text-indigo-500" />
            Homework Diary Tracking
          </h1>
          <p className="text-gray-500 text-sm mt-1">Track parent acknowledgments for homework assignments class-by-class</p>
        </div>
      </div>

      {/* Class Selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Select Class</label>
            <select
              value={selectedClass}
              onChange={e => { setSelectedClass(e.target.value); setExpandedHw(null); setSelectedStudent(null); }}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium bg-white"
            >
              <option value="">— Choose a class section —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </div>

          {selectedClass && homework.length > 0 && (
            <>
              <div className="flex-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Search</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search homework or subject..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Filter</label>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'pending', label: 'Pending' },
                    { id: 'complete', label: 'Complete' },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFilterStatus(f.id as any)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        filterStatus === f.id 
                          ? 'bg-white text-slate-900 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {/* No class selected */}
      {!selectedClass && !loading && (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center">
          <BookOpen className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-bold">Select a class to view homework tracking</p>
          <p className="text-gray-400 text-sm mt-1">You&apos;ll see which parents have acknowledged each homework</p>
        </div>
      )}

      {/* Content */}
      {selectedClass && !loading && (
        <>
          {/* Stats Cards */}
          {homework.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <PenTool size={14} className="text-indigo-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</span>
                </div>
                <p className="text-2xl font-black text-slate-900">{totalHw}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fully Done</span>
                </div>
                <p className="text-2xl font-black text-emerald-600">{fullyAcked}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-amber-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Partial</span>
                </div>
                <p className="text-2xl font-black text-amber-600">{partiallyAcked}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle size={14} className="text-rose-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No Response</span>
                </div>
                <p className="text-2xl font-black text-rose-600">{notAcked}</p>
              </div>
            </div>
          )}

          {/* Two-column layout: Homework list + Student summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Homework List */}
            <div className="lg:col-span-2 space-y-3">
              <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Calendar size={14} className="text-blue-500" />
                Homework Assignments ({filteredHomework.length})
              </h2>
              
              {filteredHomework.length > 0 ? (
                filteredHomework.map(hw => {
                  const isExpanded = expandedHw === hw.id;
                  const isOverdue = new Date(hw.due_date) < new Date(new Date().toDateString());
                  
                  return (
                    <div key={hw.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      {/* Homework Header */}
                      <button
                        onClick={() => setExpandedHw(isExpanded ? null : hw.id)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            hw.ack_percentage === 100 ? 'bg-emerald-50' :
                            hw.ack_percentage > 0 ? 'bg-amber-50' : 'bg-rose-50'
                          }`}>
                            {hw.ack_percentage === 100 ? (
                              <CheckCircle2 size={18} className="text-emerald-600" />
                            ) : hw.ack_percentage > 0 ? (
                              <Clock size={18} className="text-amber-600" />
                            ) : (
                              <AlertCircle size={18} className="text-rose-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-lg">
                                {hw.subject_name}
                              </span>
                              {isOverdue && (
                                <span className="text-[10px] font-black text-rose-500 uppercase">Overdue</span>
                              )}
                            </div>
                            <p className="font-bold text-sm text-slate-900 mt-1 truncate">{hw.title}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Due: {new Date(hw.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {hw.posted_by ? ` • By: ${hw.posted_by}` : ''}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 shrink-0">
                          {/* Progress Ring */}
                          <div className="text-center">
                            <p className={`text-lg font-black ${getPercentageColor(hw.ack_percentage)}`}>{hw.ack_percentage}%</p>
                            <p className="text-[10px] text-slate-400 font-bold">{hw.acked_count}/{hw.total_students}</p>
                          </div>
                          <ChevronRight size={16} className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </button>

                      {/* Progress Bar */}
                      <div className="px-5 pb-3 -mt-1">
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full transition-all ${getPercentageBg(hw.ack_percentage)}`}
                            style={{ width: `${hw.ack_percentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Expanded: Student List */}
                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          {hw.description && (
                            <div className="px-5 py-3 bg-slate-50/50 border-b border-gray-100">
                              <p className="text-xs text-slate-500">{hw.description}</p>
                            </div>
                          )}
                          <div className="divide-y divide-gray-50">
                            {hw.student_statuses.map(ss => {
                              const student = students.find(s => s.id === ss.student_id);
                              return (
                                <div key={ss.student_id} className={`flex items-center justify-between px-5 py-3 ${
                                  ss.acknowledged ? 'bg-emerald-50/30' : ''
                                }`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                                      ss.acknowledged ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                    }`}>
                                      {student?.name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-slate-900">{student?.name}</p>
                                      <p className="text-[10px] text-slate-400">{student?.admission_number}</p>
                                    </div>
                                  </div>
                                  {ss.acknowledged ? (
                                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                                      <CheckCircle2 size={10} /> Done
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                                      <Clock size={10} /> Pending
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
                  <PenTool className="mx-auto text-gray-300 mb-3" size={32} />
                  <p className="text-gray-500 font-medium">{homework.length === 0 ? 'No homework assigned to this class' : 'No homework matches your filter'}</p>
                </div>
              )}
            </div>

            {/* Student Summary Sidebar */}
            <div className="space-y-3">
              <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Users size={14} className="text-violet-500" />
                Student Summary ({students.length})
              </h2>
              
              {students.length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {studentSummary.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStudent(selectedStudent === s.id ? null : s.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors text-left ${
                          selectedStudent === s.id ? 'bg-indigo-50/50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                            s.percentage === 100 ? 'bg-emerald-100 text-emerald-700' :
                            s.percentage >= 50 ? 'bg-amber-100 text-amber-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {s.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{s.name}</p>
                            <p className="text-[10px] text-slate-400">{s.admission_number}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className={`text-sm font-black ${getPercentageColor(s.percentage)}`}>{s.percentage}%</p>
                          <p className="text-[10px] text-slate-400">{s.acked}/{s.total}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
                  <Users className="mx-auto text-slate-200 mb-2" size={24} />
                  <p className="text-slate-400 text-xs font-medium">No students in this class</p>
                </div>
              )}

              {/* Selected Student Detail */}
              {selectedStudent && (
                <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                    <p className="font-bold text-sm text-indigo-900">{getStudentName(selectedStudent)}</p>
                    <p className="text-[10px] text-indigo-600 font-bold uppercase mt-0.5">Homework Status Detail</p>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                    {homework.map(hw => {
                      const ss = hw.student_statuses.find(s => s.student_id === selectedStudent);
                      return (
                        <div key={hw.id} className="flex items-center justify-between px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{hw.title}</p>
                            <p className="text-[10px] text-slate-400">{hw.subject_name} • {hw.due_date}</p>
                          </div>
                          {ss?.acknowledged ? (
                            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle size={16} className="text-slate-300 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
