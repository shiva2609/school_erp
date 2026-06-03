"use client";

import React, { useState } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { Plus, Award, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { useAuth } from '@/components/common/AuthProvider';

interface ExamTerm {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  weightage_percentage: string;
  is_active: boolean;
}

export default function ExamsPage() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApi<ExamTerm[]>('/academics/exams/');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', 
    start_date: '', 
    end_date: '', 
    weightage_percentage: '100.00'
  });
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/academics/exams/', {
        ...formData,
        academic_year_id: user?.academic_year_id
      });
      setShowForm(false);
      refetch();
      toast.success('Exam term created');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.detail || 'Error creating exam term');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exams Management</h1>
          <p className="text-gray-500 text-sm mt-1">Create and configure exams and maximum marks</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
          <Plus size={16} /> Create Exam
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Name</label>
              <input required placeholder="e.g. Mid Term" value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
              <input required type="date" value={formData.start_date}
                onChange={e => setFormData({...formData, start_date: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>
              <input required type="date" value={formData.end_date}
                onChange={e => setFormData({...formData, end_date: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Weightage (%)</label>
              <input required type="number" step="0.01" value={formData.weightage_percentage}
                onChange={e => setFormData({...formData, weightage_percentage: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Exam'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="bg-gray-100 text-gray-700 px-5 py-2 rounded-xl text-sm font-medium">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">{error}</div>
      ) : data && data.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <Award className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">No exams created yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data?.map((exam: ExamTerm) => (
            <div key={exam.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">{exam.name}</h3>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${exam.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                    {exam.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-1 mb-4">
                  <p><strong>Dates:</strong> {exam.start_date} to {exam.end_date}</p>
                  <p><strong>Weightage:</strong> {exam.weightage_percentage}%</p>
                </div>
              </div>
              <Link href={`/exams/${exam.id}`}
                className="flex items-center justify-center gap-2 w-full bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-100 transition-colors">
                <Settings size={14} /> Configure Max Marks
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
