"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/axios';
import { useAuth } from '@/components/common/AuthProvider';
import Link from 'next/link';
import { 
  Calendar, CheckSquare, Clock, BookOpen, Users, AlertCircle,
  CheckCircle2, XCircle, PenTool, ArrowRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AssignedClass {
  id: string;
  display_name: string;
  student_count: number;
  is_class_teacher: boolean;
}

interface ScheduleSlot {
  period: string;
  start_time: string;
  end_time: string;
  subject: string;
  class_name: string;
}

interface AttendanceStatus {
  class_id: string;
  class_name: string;
  marked_today: boolean;
  present_count?: number;
  absent_count?: number;
}

interface DashboardData {
  assigned_classes: AssignedClass[];
  today_schedule: ScheduleSlot[];
  attendance_status: AttendanceStatus[];
  pending_homework: number;
  today_absentees: number;
}

const SLOT_COLORS = [
  'border-indigo-500', 'border-emerald-500', 'border-amber-500',
  'border-rose-500', 'border-violet-500', 'border-cyan-500',
  'border-orange-500', 'border-teal-500',
];

export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('teacher/dashboard/')
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening';
  const todayStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const pendingAttendance = data?.attendance_status?.filter(a => !a.marked_today) || [];
  const firstClass = data?.today_schedule?.[0];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-10 w-64 bg-gray-100 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {user?.first_name || 'Teacher'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Here is your daily pulse for {todayStr}.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* First Class */}
        <div className="bg-indigo-600 p-5 rounded-2xl text-white shadow-lg shadow-indigo-200">
          <div className="flex justify-between items-start">
            <span className="text-indigo-200 text-xs font-bold uppercase tracking-widest">
              {firstClass ? 'First Class' : 'Schedule'}
            </span>
            <Clock size={18} className="text-indigo-300" />
          </div>
          {firstClass ? (
            <div className="mt-3">
              <h3 className="text-2xl font-black">{firstClass.start_time}</h3>
              <p className="text-indigo-200 text-sm mt-0.5">{firstClass.subject} • {firstClass.class_name}</p>
            </div>
          ) : (
            <div className="mt-3">
              <h3 className="text-lg font-bold">No classes today</h3>
              <p className="text-indigo-200 text-sm mt-0.5">Enjoy your free day</p>
            </div>
          )}
        </div>

        {/* Attendance Pending */}
        <Link 
          href="/attendance" 
          className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-amber-200 hover:shadow-md transition-all group"
        >
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Attendance</span>
            <CheckSquare size={18} className={pendingAttendance.length > 0 ? 'text-amber-400' : 'text-emerald-400'} />
          </div>
          <div className="mt-3">
            {pendingAttendance.length > 0 ? (
              <>
                <h3 className="text-2xl font-black text-slate-900">{pendingAttendance.length} pending</h3>
                <p className="text-amber-600 text-sm font-bold mt-0.5 group-hover:underline">Mark Now →</p>
              </>
            ) : (
              <>
                <h3 className="text-2xl font-black text-emerald-600">All Done</h3>
                <p className="text-emerald-500 text-sm font-medium mt-0.5">Attendance marked ✓</p>
              </>
            )}
          </div>
        </Link>

        {/* Pending Homework */}
        <Link 
          href="/homework"
          className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all group"
        >
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Active Homework</span>
            <PenTool size={18} className="text-blue-400" />
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900">{data?.pending_homework || 0}</h3>
            <p className="text-blue-600 text-sm font-bold mt-0.5 group-hover:underline">Manage →</p>
          </div>
        </Link>

        {/* Today's Absentees */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Absentees Today</span>
            <AlertCircle size={18} className={data?.today_absentees ? 'text-rose-400' : 'text-slate-300'} />
          </div>
          <div className="mt-3">
            <h3 className={`text-2xl font-black ${data?.today_absentees ? 'text-rose-600' : 'text-slate-900'}`}>
              {data?.today_absentees || 0}
            </h3>
            <p className="text-slate-400 text-sm font-medium mt-0.5">across your classes</p>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Timetable */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-indigo-500" />
            Today&apos;s Timetable
          </h2>
          
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {data?.today_schedule && data.today_schedule.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {data.today_schedule.map((slot, i) => {
                  const isFree = slot.subject === 'Free' || !slot.subject;
                  const isBreak = slot.period?.toLowerCase().includes('break') || 
                                  slot.period?.toLowerCase().includes('recess') ||
                                  slot.period?.toLowerCase().includes('lunch');
                  
                  if (isBreak) {
                    return (
                      <div key={i} className="flex items-center px-5 py-3 bg-slate-50/50">
                        <div className="w-20 shrink-0 text-xs font-bold text-slate-400">{slot.start_time}</div>
                        <div className="pl-4 text-sm text-slate-400 font-medium italic">{slot.period}</div>
                      </div>
                    );
                  }

                  return (
                    <div key={i} className="flex items-center px-5 py-4 hover:bg-slate-50/50 transition-colors">
                      <div className="w-20 shrink-0">
                        <p className="text-xs font-bold text-slate-500">{slot.start_time}</p>
                        {slot.end_time && <p className="text-[10px] text-slate-300">{slot.end_time}</p>}
                      </div>
                      <div className={`border-l-4 ${SLOT_COLORS[i % SLOT_COLORS.length]} pl-4`}>
                        <h4 className={`font-bold text-sm ${isFree ? 'text-slate-400' : 'text-slate-900'}`}>
                          {isFree ? 'Free Period' : slot.subject}
                        </h4>
                        {!isFree && slot.class_name && (
                          <p className="text-xs text-slate-400 mt-0.5">{slot.class_name}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center">
                <Calendar className="mx-auto text-slate-200 mb-3" size={32} />
                <p className="text-slate-400 font-bold text-sm">No timetable set for today</p>
                <p className="text-slate-300 text-xs mt-1">Timetable slots will appear here once configured</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* My Classes */}
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Users size={14} className="text-violet-500" />
              My Classes ({data?.assigned_classes?.length || 0})
            </h2>
            
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              {data?.assigned_classes && data.assigned_classes.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {data.assigned_classes.map(cls => (
                    <div key={cls.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          cls.is_class_teacher ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {cls.display_name?.charAt(0) || 'C'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{cls.display_name}</p>
                          <p className="text-[10px] text-slate-400">
                            {cls.student_count} students
                            {cls.is_class_teacher && <span className="text-indigo-500 ml-1">• Class Teacher</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Users className="mx-auto text-slate-200 mb-2" size={24} />
                  <p className="text-slate-400 text-xs font-medium">No classes assigned</p>
                </div>
              )}
            </div>
          </div>

          {/* Attendance Status */}
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <CheckSquare size={14} className="text-amber-500" />
              Attendance Status
            </h2>
            
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              {data?.attendance_status && data.attendance_status.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {data.attendance_status.map(att => (
                    <div key={att.class_id} className="flex items-center justify-between px-4 py-3">
                      <p className="text-sm font-bold text-slate-900">{att.class_name}</p>
                      {att.marked_today ? (
                        <div className="flex items-center gap-3">
                          {att.present_count !== undefined && att.absent_count !== undefined && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              P: <span className="text-emerald-600 font-bold">{att.present_count}</span> | A: <span className="text-rose-600 font-bold">{att.absent_count}</span>
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                            <CheckCircle2 size={10} /> Done
                          </span>
                        </div>
                      ) : (
                        <Link 
                          href="/attendance"
                          className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-[10px] font-black uppercase px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
                        >
                          <Clock size={10} /> Pending
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <CheckSquare className="mx-auto text-slate-200 mb-2" size={24} />
                  <p className="text-slate-400 text-xs font-medium">No classes to mark</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
