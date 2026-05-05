"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/axios';
import { Calendar, PenTool, Users, BookOpen, Clock, CheckCircle2, AlertCircle, ArrowRight, Zap, Award } from 'lucide-react';
import { toast } from 'react-hot-toast';
import StatCard from '@/components/dashboard/StatCard';

interface ScheduleSlot {
  period: string;
  start_time: string;
  end_time: string;
  subject: string;
  class_name: string;
}

interface ClassInfo {
  id: string;
  display_name: string;
  student_count: number;
  is_class_teacher: boolean;
}

interface AttendanceStatus {
  class_id: string;
  class_name: string;
  marked_today: boolean;
}

interface DashboardData {
  assigned_classes: ClassInfo[];
  today_schedule: ScheduleSlot[];
  attendance_status: AttendanceStatus[];
  pending_homework: number;
  today_absentees: number;
}

export default function TeacherDashboard({ user }: { user: any }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('teacher/dashboard/')
      .then(res => setData(res.data.data))
      .catch(err => {
        toast.error('Failed to load dashboard data');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 pb-10">
        <div className="h-10 w-64 bg-gray-100 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-28 bg-white rounded-2xl border animate-pulse" />)}
        </div>
        <div className="h-80 bg-white rounded-2xl border animate-pulse" />
      </div>
    );
  }

  const totalStudents = data?.assigned_classes.reduce((acc, c) => acc + c.student_count, 0) || 0;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome, {user?.first_name}</h1>
          <p className="text-gray-500 mt-1">Here&apos;s your schedule and tasks for today.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/attendance"
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98]">
            <Zap size={14} /> Mark Attendance
          </Link>
          <Link href="/homework"
            className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all active:scale-[0.98]">
            <PenTool size={14} /> Post Homework
          </Link>
          <Link href="/exam-marks"
            className="flex items-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-200/50 active:scale-[0.98]">
            <Award size={14} /> Exam marks
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="My Classes" value={`${data?.assigned_classes.length || 0}`} icon={BookOpen} color="blue" />
        <StatCard title="Total Students" value={`${totalStudents}`} icon={Users} color="green" />
        <StatCard title="Today's Absentees" value={`${data?.today_absentees || 0}`} icon={AlertCircle} color="red" />
        <StatCard title="Active Homework" value={`${data?.pending_homework || 0}`} icon={PenTool} color="amber" />
      </div>

      {/* Two-column: Schedule + Attendance */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Today's Timetable */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-blue-500" />
              <h3 className="font-bold text-gray-900">Today&apos;s Schedule</h3>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}
            </span>
          </div>
          {data?.today_schedule && data.today_schedule.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {data.today_schedule.map((slot, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <p className="text-xs font-black text-blue-600 uppercase tracking-wider">{slot.period}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{slot.start_time}</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{slot.subject}</p>
                      <p className="text-xs text-slate-400 font-medium">{slot.class_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400">{slot.start_time} – {slot.end_time}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Calendar className="mx-auto text-slate-200 mb-3" size={32} />
              <p className="text-slate-400 text-sm font-medium">No timetable configured for today</p>
              <p className="text-slate-300 text-xs mt-1">Ask your admin to set up your timetable slots.</p>
            </div>
          )}
        </div>

        {/* Attendance Status */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <h3 className="font-bold text-gray-900">Attendance Status</h3>
          </div>
          {data?.attendance_status && data.attendance_status.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {data.attendance_status.map((cls, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      cls.marked_today ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {cls.marked_today ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    </div>
                    <span className="font-bold text-slate-900">{cls.class_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                      cls.marked_today 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : 'bg-amber-50 text-amber-700 animate-pulse'
                    }`}>
                      {cls.marked_today ? 'Marked ✓' : 'Pending'}
                    </span>
                    {!cls.marked_today && (
                      <Link href="/attendance" 
                        className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-700 transition-all">
                        <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Users className="mx-auto text-slate-200 mb-3" size={32} />
              <p className="text-slate-400 text-sm font-medium">No class assignments found</p>
              <p className="text-slate-300 text-xs mt-1">Contact your admin for teacher assignments.</p>
            </div>
          )}
        </div>
      </div>

      {/* My Classes Grid */}
      {data?.assigned_classes && data.assigned_classes.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            My Assigned Classes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.assigned_classes.map(cls => (
              <div key={cls.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{cls.display_name}</h4>
                  {cls.is_class_teacher && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black rounded-full uppercase">
                      Class Teacher
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">
                  <Users size={12} className="inline mr-1" />
                  {cls.student_count} students
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
