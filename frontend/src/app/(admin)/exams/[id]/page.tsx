"use client";

import React, { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { ArrowLeft, Save, CheckCircle2, ChevronRight, Award } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ClassSection {
  id: string;
  grade: string;
  section: string;
  display_name: string;
}

interface Subject {
  id: string;
  name: string;
  code: string;
  grade_levels: string[];
}

interface ExamSubjectConfig {
  class_section: string;
  subject: string;
  max_marks: number;
}

export default function ExamConfigPage() {
  const params = useParams();
  const examId = params.id as string;

  const { data: classes } = useApi<ClassSection[]>('/classes/');
  const { data: subjects } = useApi<Subject[]>('/subjects/');
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [configs, setConfigs] = useState<ExamSubjectConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (examId) {
      setLoadingConfigs(true);
      api.get(`/academics/exams/${examId}/configs/`)
        .then(res => {
          setConfigs(res.data.data || []);
        })
        .catch(err => {
          toast.error('Failed to load exam configurations');
        })
        .finally(() => setLoadingConfigs(false));
    }
  }, [examId]);

  // Set default selected class once loaded
  useEffect(() => {
    if (classes && classes.length > 0 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  const selectedClass = classes?.find(c => c.id === selectedClassId);
  const availableSubjects = subjects?.filter(s => 
    s.grade_levels.length === 0 || (selectedClass && s.grade_levels.includes(selectedClass.grade))
  ) || [];

  const handleMaxMarksChange = (subjectId: string, maxMarks: string) => {
    const val = parseFloat(maxMarks);
    if (isNaN(val)) return;

    setConfigs(prev => {
      const existing = prev.find(c => c.class_section === selectedClassId && c.subject === subjectId);
      if (existing) {
        return prev.map(c => 
          (c.class_section === selectedClassId && c.subject === subjectId) 
            ? { ...c, max_marks: val } 
            : c
        );
      } else {
        return [...prev, { class_section: selectedClassId, subject: subjectId, max_marks: val }];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/academics/exams/${examId}/configs/`, {
        configs: configs
      });
      toast.success('Exam configuration saved successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const getConfig = (subjectId: string) => {
    return configs.find(c => c.class_section === selectedClassId && c.subject === subjectId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/exams" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} className="text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exam Configuration</h1>
          <p className="text-gray-500 text-sm mt-1">Configure maximum marks for subjects</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Class Selection Sidebar */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Classes</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {classes?.map(c => {
              const isSelected = c.id === selectedClassId;
              const hasConfigs = configs.some(conf => conf.class_section === c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors ${
                    isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${hasConfigs ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    <span className={`font-medium text-sm ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                      {c.display_name}
                    </span>
                  </div>
                  {isSelected && <ChevronRight size={16} className="text-blue-500" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Subjects Configuration Area */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col h-[calc(100vh-200px)]">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Award size={20} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800">{selectedClass?.display_name || 'Select a Class'}</h2>
                <p className="text-xs text-slate-500">Configure max marks for subjects in this class</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Configuration
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {loadingConfigs ? (
              <div className="flex justify-center items-center h-40">
                <span className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : availableSubjects.length === 0 ? (
              <div className="text-center text-slate-500 mt-10">
                No subjects assigned to this class grade level.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableSubjects.map(sub => {
                  const conf = getConfig(sub.id);
                  const isConfigured = !!conf;
                  return (
                    <div key={sub.id} className={`p-4 rounded-xl border bg-white shadow-sm transition-all ${
                      isConfigured ? 'border-emerald-200' : 'border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{sub.name}</span>
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{sub.code || 'NO CODE'}</span>
                        </div>
                        {isConfigured && <CheckCircle2 size={16} className="text-emerald-500" />}
                      </div>
                      
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max Marks</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 100"
                          value={conf?.max_marks || ''}
                          onChange={e => handleMaxMarksChange(sub.id, e.target.value)}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
