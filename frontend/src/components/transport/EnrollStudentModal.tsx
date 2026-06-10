"use client";

import React, { useState, useEffect } from 'react';
import { X, Search, Bus, IndianRupee, MapPin, CheckCircle2, Calendar } from 'lucide-react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';

interface EnrollStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  class_section_display?: string;
}

interface AcademicYearOption {
  id: string;
  name: string;
  is_active: boolean;
}

interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

export default function EnrollStudentModal({ isOpen, onClose, onSuccess }: EnrollStudentModalProps) {
  const { selectedBranch } = useBranch();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Form State
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [selectedYear, setSelectedYear] = useState('');

  const [formData, setFormData] = useState({
    agreed_amount: '',
    pickup_point: ''
  });

  // Fetch academic years
  useEffect(() => {
    if (isOpen) {
      api.get('tenants/academic-years/')
        .then(res => {
          const data: AcademicYearOption[] = res.data?.data ?? res.data?.results ?? res.data ?? [];
          setAcademicYears(data);
          const active = data.find((y: AcademicYearOption) => y.is_active);
          if (active) {
            setSelectedYear(active.id);
          } else if (data.length > 0) {
            setSelectedYear(data[0].id);
          }
        })
        .catch(() => {
          toast.error("Failed to load academic years");
        });
    }
  }, [isOpen]);

  // Fetch students on search
  useEffect(() => {
    if (searchQuery.length > 2) {
      const timer = setTimeout(() => {
        api.get(`/students/?search=${searchQuery}&branch_id=${selectedBranch}&status=ACTIVE`)
          .then(res => {
            const list: StudentOption[] = res.data?.results || res.data?.data || res.data || [];
            setStudents(list);
          });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setStudents([]);
    }
  }, [searchQuery, selectedBranch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedYear || !formData.agreed_amount) return;

    setLoading(true);
    try {
      await api.post('/transport/enrollments/', {
        student: selectedStudent.id,
        academic_year: selectedYear,
        agreed_amount: parseFloat(formData.agreed_amount),
        pickup_point: formData.pickup_point
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSearchQuery('');
        setSelectedStudent(null);
        setFormData({ agreed_amount: '', pickup_point: '' });
        onSuccess();
      }, 1500);
    } catch (err) {
      const apiErr = err as ApiError;
      toast.error("Registration failed: " + (apiErr.response?.data?.detail || "Internal error"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
           <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Bus className="text-blue-600" size={20} />
                Transport Registration
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Enroll student for annual transport fee</p>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors group">
              <X size={20} className="text-slate-400 group-hover:text-slate-900" />
           </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {success ? (
            <div className="py-12 text-center animate-in fade-in zoom-in duration-300">
               <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/10">
                  <CheckCircle2 size={48} />
               </div>
               <h3 className="text-2xl font-black text-slate-900">Successfully Registered!</h3>
               <p className="text-slate-500 mt-2">Annual transport fee invoice has been generated successfully.</p>
            </div>
          ) : (
            <>
              {/* Student Search */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">1. Select Student</label>
                {selectedStudent ? (
                  <div className="flex items-center justify-between p-4 bg-blue-50/50 border border-blue-200 rounded-2xl group animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold">
                          {selectedStudent.first_name[0]}
                       </div>
                       <div>
                          <p className="font-bold text-slate-900">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                          <p className="text-[10px] text-blue-600 font-bold uppercase tracking-tight">{selectedStudent.admission_number} • {selectedStudent.class_section_display}</p>
                       </div>
                    </div>
                    <button type="button" onClick={() => setSelectedStudent(null)} className="text-xs font-bold text-blue-600 hover:underline">Change</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                    <input 
                      autoFocus
                      placeholder="Search student by name or admission number..."
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 ring-blue-500 transition-all font-medium"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    {students.length > 0 && searchQuery.length > 2 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-10 max-h-48 overflow-y-auto scrollbar-hide py-2 animate-in fade-in slide-in-from-top-2">
                         {students.map(s => (
                           <button 
                             key={s.id} 
                             type="button" 
                             onClick={() => setSelectedStudent(s)}
                             className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
                           >
                             <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-xs font-bold text-slate-600 text-[10px]">{s.first_name[0]}</div>
                             <div>
                                <p className="text-sm font-bold text-slate-900">{s.first_name} {s.last_name}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{s.admission_number} • {s.class_section_display}</p>
                             </div>
                           </button>
                         ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Academic Year Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">2. Academic Year</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-3.5 text-slate-400" size={18} />
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 ring-blue-500 font-semibold transition-all appearance-none text-slate-700"
                    required
                  >
                    {academicYears.map(y => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.is_active ? '(Active Year)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Agreed Fee and Pickup Point */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">3. Annual Transport Fee (₹)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-4 top-3.5 text-slate-400" size={18} />
                    <input 
                      type="number" 
                      placeholder="e.g. 15000"
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 ring-blue-500 font-black transition-all"
                      value={formData.agreed_amount}
                      onChange={e => setFormData({ ...formData, agreed_amount: e.target.value })}
                      required
                      min="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">4. Pickup Point</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3.5 text-slate-400" size={16} />
                    <input 
                      placeholder="e.g. Apollo Circle"
                      className="w-full pl-9 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 ring-blue-500 font-medium transition-all"
                      value={formData.pickup_point}
                      onChange={e => setFormData({ ...formData, pickup_point: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  disabled={loading || !selectedStudent || !selectedYear || !formData.agreed_amount}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={18} /> Confirm Registration
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
