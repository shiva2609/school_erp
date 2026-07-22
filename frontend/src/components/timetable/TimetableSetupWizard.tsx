"use client";

import React, { useState, useEffect } from 'react';
import { Settings, Save, Zap, AlertTriangle, Plus, Trash2, Edit2, Play } from 'lucide-react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';
import { useApi } from '@/lib/hooks';
import { useConfirm } from '@/components/common/ConfirmProvider';

export default function TimetableSetupWizard() {
  const { selectedBranch } = useBranch();
  const { confirm } = useConfirm();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Demands state
  const [selectedClass, setSelectedClass] = useState('');
  
  const { data: classes } = useApi<any[]>('/classes/');
  const { data: subjects } = useApi<any[]>('/academics/subjects/');
  const { data: teachers } = useApi<any[]>('/staff/staff/');
  
  const { data: demands, refetch: refetchDemands } = useApi<any[]>(
    `/timetable/demands/?class_section_id=${selectedClass}`
  );

  const [newDemand, setNewDemand] = useState({
    subject: '',
    teacher: '',
    classes_per_week: 5,
    priority: 1,
    requires_double_period: false
  });

  const handleAddDemand = async () => {
    if (!selectedClass || !newDemand.subject) return;
    setLoading(true);
    try {
      await api.post('/timetable/demands/', {
        class_section: selectedClass,
        subject: newDemand.subject,
        teacher: newDemand.teacher || null,
        classes_per_week: newDemand.classes_per_week,
        priority: newDemand.priority,
        requires_double_period: newDemand.requires_double_period
      });
      setNewDemand({ subject: '', teacher: '', classes_per_week: 5, priority: 1, requires_double_period: false });
      refetchDemands();
    } catch (err: any) {
      toast.error("Error adding demand: " + (err.response?.data?.detail || JSON.stringify(err.response?.data)));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDemand = async (id: string) => {
    const isConfirmed = await confirm({
      title: "Delete Demand",
      message: "Are you sure you want to delete this demand?",
      isDestructive: true
    });
    if(!isConfirmed) return;
    
    setLoading(true);
    try {
      await api.delete(`/timetable/demands/${id}/`);
      refetchDemands();
    } catch (err) {
      toast.error("Failed to delete.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedBranch) {
        toast.error("Please select a branch first.");
        return;
    }
    
    const isConfirmed = await confirm({
      title: "Generate Timetable",
      message: "This will overwrite existing timetables for this branch. Continue?",
      isDestructive: true
    });
    if (!isConfirmed) return;
    
    setLoading(true);
    try {
      const res = await api.post('/timetable/slots/auto-generate/', {
        branch_id: selectedBranch
      });
      toast.success(res.data.message);
    } catch (err: any) {
      toast.error("Generation failed: " + (err.response?.data?.detail || JSON.stringify(err.response?.data)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
      <div className="flex border-b border-gray-100 mb-8 pb-4">
         <div className={`p-2 px-6 rounded-t-xl border-b-2 font-bold cursor-pointer ${step === 1 ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`} onClick={() => setStep(1)}>
            Step 1: Class Demands
         </div>
         <div className={`p-2 px-6 rounded-t-xl border-b-2 font-bold cursor-pointer ${step === 2 ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`} onClick={() => setStep(2)}>
            Step 2: Auto-Generate
         </div>
      </div>

      {step === 1 && (
        <div className="space-y-8 animate-in fade-in duration-300">
           <div className="flex items-center gap-4">
              <div className="w-1/3">
                 <label className="text-xs font-bold text-gray-500 uppercase">Select Class</label>
                 <select 
                   value={selectedClass} 
                   onChange={e => setSelectedClass(e.target.value)}
                   className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 ring-primary-500"
                 >
                   <option value="">Choose class...</option>
                   {classes?.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                 </select>
              </div>
           </div>

           {selectedClass && (
             <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl">
                   <h4 className="font-bold text-blue-900 mb-4 flex items-center gap-2"><Plus size={16}/> Add Subject Demand</h4>
                   <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                      <div className="col-span-2 md:col-span-1">
                          <label className="text-xs text-blue-800 font-bold">Subject</label>
                          <select 
                            value={newDemand.subject} onChange={e => setNewDemand({...newDemand, subject: e.target.value})}
                            className="w-full p-2.5 rounded-lg border-blue-200 mt-1 text-sm text-black"
                          >
                            <option value="">Select...</option>
                            {subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                          <label className="text-xs text-blue-800 font-bold">Teacher</label>
                          <select 
                            value={newDemand.teacher} onChange={e => setNewDemand({...newDemand, teacher: e.target.value})}
                            className="w-full p-2.5 rounded-lg border-blue-200 mt-1 text-sm text-black"
                          >
                            <option value="">Select...</option>
                            {teachers?.filter(t => t.is_teaching_role).map(t => <option key={t.id} value={t.id}>{t.user_details?.first_name || 'No Name'} {t.user_details?.last_name || `(${t.employee_id})`}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="text-xs text-blue-800 font-bold">Classes/Week</label>
                          <input 
                            type="number" min="1" max="15" 
                            value={newDemand.classes_per_week} onChange={e => setNewDemand({...newDemand, classes_per_week: parseInt(e.target.value)})}
                            className="w-full p-2.5 rounded-lg border-blue-200 mt-1 text-sm text-black"
                          />
                      </div>
                      <div>
                          <label className="text-xs text-blue-800 font-bold">Priority (1-10)</label>
                          <input 
                            type="number" min="1" max="10" 
                            value={newDemand.priority} onChange={e => setNewDemand({...newDemand, priority: parseInt(e.target.value)})}
                            className="w-full p-2.5 rounded-lg border-blue-200 mt-1 text-sm text-black"
                          />
                      </div>
                      
                      <button 
                        onClick={handleAddDemand}
                        disabled={loading || !newDemand.subject}
                        className="w-full bg-blue-600 text-white p-2.5 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
                      >
                         Add
                      </button>
                   </div>
                   <div className="mt-4 flex items-center gap-2">
                       <input 
                         type="checkbox" 
                         id="double_period"
                         checked={newDemand.requires_double_period}
                         onChange={e => setNewDemand({...newDemand, requires_double_period: e.target.checked})}
                         className="rounded text-blue-600 focus:ring-blue-500"
                       />
                       <label htmlFor="double_period" className="text-xs text-blue-800 font-bold">Requires Double Periods (Consecutive)</label>
                   </div>
                </div>

                <div className="border border-gray-100 rounded-2xl overflow-hidden">
                   <table className="w-full text-sm text-left">
                     <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                        <tr>
                           <th className="px-6 py-4">Subject</th>
                           <th className="px-6 py-4">Teacher</th>
                           <th className="px-6 py-4 text-center">Classes/Wk</th>
                           <th className="px-6 py-4 text-center">Priority</th>
                           <th className="px-6 py-4 text-center">Double Period</th>
                           <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {demands?.length === 0 && (
                          <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No demands configured.</td></tr>
                        )}
                        {demands?.map((d: any) => (
                           <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-bold text-gray-900">{d.subject_name}</td>
                              <td className="px-6 py-4 font-medium text-gray-600">{d.teacher_name || 'Unassigned'}</td>
                              <td className="px-6 py-4 text-center font-bold text-gray-900">{d.classes_per_week}</td>
                              <td className="px-6 py-4 text-center">
                                 <span className="bg-purple-50 text-purple-700 font-bold px-2 py-1 rounded-lg text-xs">P{d.priority}</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                 {d.requires_double_period ? <span className="text-emerald-500 font-bold text-xs">Yes</span> : <span className="text-gray-400 font-medium text-xs">No</span>}
                              </td>
                              <td className="px-6 py-4 text-right">
                                 <button onClick={() => handleDeleteDemand(d.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                                    <Trash2 size={16} />
                                 </button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                   </table>
                </div>
             </div>
           )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in fade-in duration-300 flex flex-col items-center justify-center py-12">
            <div className="w-24 h-24 bg-primary-50 rounded-full flex items-center justify-center mb-6 text-primary-600 shadow-xl shadow-primary-500/10">
               <Zap size={48} className="animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">Ready to Generate</h2>
            <p className="text-center text-slate-500 max-w-md">
               The Automated Timetable Generator will evaluate all Class Demands, Teacher availabilities, and priorities to build an optimized master schedule for <strong>every class section in this branch simultaneously</strong>.
            </p>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3 max-w-md text-amber-800 text-sm mt-4">
               <AlertTriangle size={20} className="shrink-0 mt-0.5" />
               <p><strong>Warning:</strong> Generating a new master schedule will completely overwrite the existing timetables for <strong>ALL classes</strong> in the branch.</p>
            </div>

            <button 
               onClick={handleGenerate}
               disabled={loading}
               className="mt-8 bg-slate-900 text-white px-8 py-4 rounded-xl font-black hover:bg-slate-800 transition-all flex items-center gap-3 shadow-lg shadow-slate-900/20 disabled:opacity-50"
            >
               {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={20} fill="currentColor" />}
               Generate For All Classes
            </button>
        </div>
      )}
    </div>
  );
}
