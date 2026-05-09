"use client";

import React, { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { useAuth } from '@/components/common/AuthProvider';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import DateInput from '@/components/DateInput';
import { Plus, BookOpen, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface HomeworkItem {
  id: string;
  title: string;
  description: string;
  due_date: string;
  activity_type: string;
  class_section_display: string;
  subject_name: string;
  is_published: boolean;
}

interface ClassSection {
  id: string;
  display_name: string;
}

interface Subject {
  id: string;
  name: string;
}

export default function HomeworkPage() {
  const { user } = useAuth();
  const push = useResolvedPush();

  // Enforce teacher-only access
  useEffect(() => {
    if (user && user.role !== 'TEACHER') {
      push('/dashboard');
    }
  }, [user, push]);

  const { data, loading, refetch } = useApi<HomeworkItem[]>('/homework/');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ 
    title: '', description: '', due_date: '', activity_type: 'HOMEWORK',
    class_section: '', subject: ''
  });
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Load classes and subjects when form opens
  useEffect(() => {
    if (showForm) {
      api.get('/classes/?assigned_only=true').then(res => {
        const arr = res.data?.data ?? res.data?.results ?? res.data;
        setClasses(Array.isArray(arr) ? arr : []);
      }).catch(() => setClasses([]));
      
      api.get('/subjects/?assigned_only=true').then(res => {
        const arr = res.data?.data ?? res.data?.results ?? res.data;
        setSubjects(Array.isArray(arr) ? arr : []);
      }).catch(() => setSubjects([]));
    }
  }, [showForm]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.class_section || !formData.subject) {
      toast.error('Please select a class and subject');
      return;
    }
    setSaving(true);
    try {
      await api.post('homework/', formData);
      setShowForm(false); 
      setFormData({ title: '', description: '', due_date: '', activity_type: 'HOMEWORK', class_section: '', subject: '' });
      refetch();
    } catch { toast.error('Error creating homework'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Homework</h1>
          <p className="text-gray-500 text-sm mt-1">Assign and manage homework for classes</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800">
          <Plus size={16} /> Post Homework
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Class / Section <span className="text-red-500">*</span></label>
              <select required value={formData.class_section} onChange={e => setFormData({...formData, class_section: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                <option value="">Select Class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Subject <span className="text-red-500">*</span></label>
              <select required value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <input placeholder="Title" required value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
          <textarea placeholder="Description" required value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm h-24" />
          <div className="grid grid-cols-2 gap-4">
            <DateInput
              required
              value={formData.due_date}
              onChange={val => setFormData({...formData, due_date: val})}
            />
            <select value={formData.activity_type} onChange={e => setFormData({...formData, activity_type: e.target.value})}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
              {['HOMEWORK','CLASSWORK','PROJECT','REVISION','READING'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50">{saving ? 'Posting...' : 'Post'}</button>
            <button type="button" onClick={() => setShowForm(false)}
              className="bg-gray-100 text-gray-700 px-5 py-2 rounded-xl text-sm font-medium">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : data && data.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <BookOpen className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">No homework posted yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.map((hw: HomeworkItem) => (
            <div key={hw.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{hw.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{hw.class_section_display} • {hw.subject_name}</p>
                  <p className="text-sm text-gray-600 mt-2">{hw.description.slice(0, 100)}...</p>
                </div>
                <div className="text-right">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    hw.activity_type === 'HOMEWORK' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                  }`}>{hw.activity_type}</span>
                  <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
                    <Clock size={14} /> Due: {hw.due_date}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
