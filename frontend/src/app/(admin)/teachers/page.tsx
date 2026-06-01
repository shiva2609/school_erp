"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import { 
  Users, Plus, Search, Mail, Phone, 
  MapPin, GraduationCap, Calendar, 
  BookOpen, PlusCircle, Trash2, CheckCircle2,
  MoreVertical, X, UserPlus, Filter
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfirm } from '@/components/common/ConfirmProvider';

export default function TeachersPage() {
  const { data: staff, refetch: refetchStaff, loading: staffLoading, error: staffError } = useApi<any[]>('staff/');
  const { data: branches } = useApi<any[]>('tenants/branches/');
  const { data: subjects, refetch: refetchSubjects } = useApi<any[]>('subjects/');
  const { data: years } = useApi<any[]>('tenants/academic-years/');
  const { data: classes } = useApi<any[]>('classes/');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState<any | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showQuickSubject, setShowQuickSubject] = useState(false);
  const [quickSubject, setQuickSubject] = useState({ name: '', code: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const { confirm } = useConfirm();
  const [error, setError] = useState('');

  // New Teacher Form
  const [newTeacher, setNewTeacher] = useState({
    first_name: '', last_name: '', email: '', phone: '', password: 'Password123!',
    employee_id: '', qualification: '', specialization: '', joining_date: '', branch: ''
  });

  // Assignment Form
  const [assignment, setAssignment] = useState({
    academic_year: '',
    is_class_teacher: false,
    primary_class_id: '',
    class_assignments: {} as Record<string, string[]> // { class_id: [subject_ids] }
  });

  useEffect(() => {
    if (branches?.length && !newTeacher.branch) setNewTeacher({...newTeacher, branch: branches[0].id});
    if (years?.length && !assignment.academic_year) setAssignment({...assignment, academic_year: years.find(y => y.is_active)?.id || years[0].id});
  }, [branches, years]);

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Send everything in one atomic request
      await api.post('staff/', {
        ...newTeacher,
        joining_date: newTeacher.joining_date || null
      });

      setShowAddModal(false);
      refetchStaff();
      setNewTeacher({
        first_name: '', last_name: '', email: '', phone: '', password: 'Password123!',
        employee_id: '', qualification: '', specialization: '', joining_date: '', branch: ''
      });
    } catch (err: any) {
      let errorMsg = "Error creating teacher";
      if (err.response?.data) {
        const data = err.response.data;
        if (typeof data === 'object') {
          errorMsg = Object.entries(data)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('; ');
        } else if (typeof data === 'string') {
          errorMsg = data;
        }
      }
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAssignments = Object.values(assignment.class_assignments).some(subs => subs.length > 0);
    if (!showAssignModal || !hasAssignments) return;
    
    setSaving(true);
    try {
      await api.post('staff/assign/', {
        teacher: showAssignModal,
        academic_year: assignment.academic_year,
        is_class_teacher: assignment.is_class_teacher,
        primary_class_id: assignment.primary_class_id,
        class_assignments: assignment.class_assignments
      });
      toast.success("Assignment successful!");
      setShowAssignModal(null);
      setAssignment({ 
        class_assignments: {}, 
        academic_year: years?.find((y: any) => y.is_active)?.id || years?.[0]?.id || '', 
        is_class_teacher: false,
        primary_class_id: ''
      });
      refetchStaff();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Error assigning teacher");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveStaff = async (id: string, name: string) => {
    const isConfirmed = await confirm({
      title: "Remove Staff",
      message: `Are you sure you want to remove ${name}? This will also delete their login account.`,
      isDestructive: true
    });
    if (!isConfirmed) return;
    
    try {
      await api.delete(`staff/${id}/`);
      toast.success("Staff removed successfully");
      refetchStaff();
    } catch (err) {
      toast.error("Error removing staff");
    }
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setSaving(true);
    try {
      await api.patch(`staff/${showEditModal.id}/`, showEditModal);
      toast.success("Details updated!");
      setShowEditModal(null);
      refetchStaff();
    } catch (err) {
      toast.error("Error updating details");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSubject.name || !quickSubject.code || !newTeacher.branch) {
      toast.error("Subject Name, Code, and Branch are required");
      return;
    }
    setSavingSubject(true);
    try {
      await api.post('subjects/', { 
        ...quickSubject, 
        branch: newTeacher.branch 
      });
      setShowQuickSubject(false);
      setQuickSubject({ name: '', code: '' });
      await refetchSubjects();
      toast.success("Subject added successfully!");
    } catch (err: any) {
      let errorMsg = "Error adding subject";
      if (err.response?.data) {
        const data = err.response.data;
        if (typeof data === 'object') {
          errorMsg = Object.entries(data)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('\n');
        } else if (typeof data === 'string') {
          errorMsg = data;
        }
      }
      toast.error(errorMsg);
    } finally {
      setSavingSubject(false);
    }
  };

  const filteredStaff = staff?.filter(s => 
    `${s.user_details?.first_name} ${s.user_details?.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.employee_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-blue-600" />
            Teacher Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage staff profiles and academic assignments.</p>
        </div>
        
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search teachers..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64 shadow-sm"
            />
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-lg shadow-slate-200"
          >
            <Plus size={18} />
            Add Teacher
          </button>
        </div>
      </div>

      {/* Main Grid */}
      {staffLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : staffError ? (
        <div className="bg-red-50 text-red-600 p-6 rounded-3xl border border-red-100 text-center">
           <p className="font-bold">Error loading teachers</p>
           <p className="text-sm mt-1">{staffError}</p>
           <button onClick={() => refetchStaff()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold">Try Again</button>
        </div>
      ) : filteredStaff?.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
           <UserPlus className="mx-auto text-gray-200 mb-4" size={48} />
           <p className="text-gray-400 font-medium">No teachers found. Start by adding one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredStaff?.map((t) => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={t.id} 
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group relative"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-xl font-bold border-2 border-white shadow-sm">
                    {t.user_details?.first_name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg leading-tight">{t.user_details?.first_name} {t.user_details?.last_name}</h3>
                    <p className="text-xs text-blue-600 font-bold mt-1 uppercase tracking-wider">{t.employee_id}</p>
                  </div>
                </div>
                <div className="relative">
                  <button 
                    onClick={() => setActiveMenu(activeMenu === t.id ? null : t.id)}
                    className="p-2 text-gray-400 hover:text-slate-900 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {activeMenu === t.id && (
                    <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-10 animate-in fade-in slide-in-from-top-2">
                       <button 
                         onClick={() => setShowEditModal({
                           ...t,
                           first_name: t.user_details?.first_name || '',
                           last_name: t.user_details?.last_name || '',
                           email: t.user_details?.email || ''
                         })}
                         className="w-full px-4 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                       >
                          <UserPlus size={16} className="text-gray-400" />
                          Edit Detail
                       </button>
                       <button 
                         onClick={() => handleRemoveStaff(t.id, t.user_details.first_name)}
                         className="w-full px-4 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                       >
                          <Trash2 size={16} />
                          Remove Staff
                       </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                  <Mail size={14} className="text-gray-300" />
                  {t.user_details?.email}
                </div>
                
                {t.assignments && t.assignments.length > 0 && (
                  <div className="space-y-2 py-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Active Roles:</p>
                    <div className="flex flex-wrap gap-2">
                      {t.assignments.map((as: any) => (
                        <span key={as.id} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 border ${
                          as.is_class_teacher 
                            ? 'bg-blue-600 text-white border-blue-600 ring-4 ring-blue-50' 
                            : 'bg-white text-gray-600 border-gray-100 shadow-sm'
                        }`}>
                          {as.is_class_teacher && <CheckCircle2 size={12} />}
                          {as.class_name}: {as.subject_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 pt-2">
                   <div className="flex items-center gap-2 text-xs text-gray-400 font-bold border-r border-gray-100 pr-4">
                      <GraduationCap size={14} /> {t.qualification || 'N/A'}
                   </div>
                   <div className="flex items-center gap-2 text-xs text-blue-600 font-bold">
                      <BookOpen size={14} /> {t.specialization || 'General'}
                   </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-50 flex items-center justify-between gap-3">
                <button 
                  onClick={() => {
                    const currentMap: Record<string, string[]> = {};
                    t.assignments?.forEach((a: any) => {
                      if (!currentMap[a.class_section]) {
                        currentMap[a.class_section] = [];
                      }
                      currentMap[a.class_section].push(a.subject);
                    });

                    setShowAssignModal(t.id);
                    setAssignment({
                      ...assignment,
                      class_assignments: currentMap,
                      academic_year: years?.find((y: any) => y.is_active)?.id || years?.[0]?.id || '',
                      is_class_teacher: t.is_class_teacher || false,
                      primary_class_id: t.primary_class_id || ''
                    });
                  }}
                  className="flex-1 py-3 bg-blue-50 text-blue-600 rounded-2xl text-xs font-bold hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                >
                  <PlusCircle size={14} /> Assign Class
                </button>
                <button 
                  onClick={() => setShowProfileModal(t)}
                  className="px-4 py-3 bg-white text-gray-600 rounded-2xl text-xs font-bold border border-gray-100 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  Profile
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-white/20"
            >
               {/* Profile Header */}
               <div className="relative h-32 bg-gradient-to-r from-blue-600 to-indigo-700 p-8">
                  <div className="absolute -bottom-12 left-8">
                     <div className="w-24 h-24 rounded-3xl bg-white p-1 shadow-2xl">
                        <div className="w-full h-full rounded-[1.25rem] bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-3xl font-black text-blue-600 border border-blue-200">
                          {showProfileModal.user_details.first_name[0]}
                        </div>
                     </div>
                  </div>
                  <button onClick={() => setShowProfileModal(null)} className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                     <X size={20} />
                  </button>
               </div>

               <div className="pt-16 px-8 pb-8 space-y-8">
                  <div className="flex justify-between items-start">
                     <div>
                        <h2 className="text-2xl font-black text-gray-800 tracking-tighter">
                          {showProfileModal.user_details.first_name} {showProfileModal.user_details.last_name}
                        </h2>
                        <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">{showProfileModal.employee_id}</p>
                     </div>
                     <div className="flex gap-2">
                        <div className="px-4 py-2 bg-green-50 text-green-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-green-100">
                           Active Staff
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                     <div className="p-4 bg-gray-50 rounded-3xl border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Qualification</p>
                        <p className="text-sm font-bold text-gray-700">{showProfileModal.qualification || 'N/A'}</p>
                     </div>
                     <div className="p-4 bg-gray-50 rounded-3xl border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Joined Date</p>
                        <p className="text-sm font-bold text-gray-700">{showProfileModal.joining_date || 'N/A'}</p>
                     </div>
                     <div className="p-4 bg-gray-50 rounded-3xl border border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Specialization</p>
                        <p className="text-sm font-bold text-gray-700">{showProfileModal.specialization || 'General'}</p>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Academic Assignments</h4>
                     <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2">
                        {showProfileModal.assignments?.length > 0 ? showProfileModal.assignments.map((a: any) => (
                          <div key={a.id} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 group hover:border-blue-200 transition-all">
                             <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                <BookOpen size={16} />
                             </div>
                             <div>
                                <p className="text-xs font-black text-gray-800 tracking-tight">{a.class_name}</p>
                                <p className="text-[10px] font-extrabold text-blue-600 uppercase">{a.subject_name}</p>
                             </div>
                          </div>
                        )) : (
                          <div className="col-span-2 py-8 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                             <p className="text-xs font-bold text-gray-400">No classes assigned yet</p>
                          </div>
                        )}
                     </div>
                  </div>

                  {showProfileModal.bio && (
                    <div className="p-6 bg-blue-50/50 rounded-3xl border border-blue-100/50">
                       <p className="text-[10px] font-black text-blue-600 uppercase mb-2 tracking-widest">About Teacher</p>
                       <p className="text-sm font-medium text-gray-600 leading-relaxed italic">"{showProfileModal.bio}"</p>
                    </div>
                  )}
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
               <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                  <div>
                     <h3 className="text-xl font-black text-gray-800 tracking-tighter">Edit Details</h3>
                     <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Update Profile Information</p>
                  </div>
                  <button onClick={() => setShowEditModal(null)} className="p-2 hover:bg-white hover:shadow-lg rounded-full text-gray-400 transition-all">
                     <X size={20} />
                  </button>
               </div>
               <form onSubmit={handleUpdateStaff} className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">First Name</label>
                       <input 
                         type="text" 
                         value={showEditModal.first_name || ''}
                         onChange={e => setShowEditModal({...showEditModal, first_name: e.target.value})}
                         className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-100 transition-all"
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Last Name</label>
                       <input 
                         type="text" 
                         value={showEditModal.last_name || ''}
                         onChange={e => setShowEditModal({...showEditModal, last_name: e.target.value})}
                         className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-100 transition-all"
                       />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Email</label>
                     <input 
                       type="email" 
                       value={showEditModal.email || ''}
                       onChange={e => setShowEditModal({...showEditModal, email: e.target.value})}
                       className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-100 transition-all"
                     />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Qualification</label>
                       <input 
                         type="text" 
                         value={showEditModal.qualification || ''}
                         onChange={e => setShowEditModal({...showEditModal, qualification: e.target.value})}
                         className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-100 transition-all"
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Specialization</label>
                       <input 
                         type="text" 
                         value={showEditModal.specialization || ''}
                         onChange={e => setShowEditModal({...showEditModal, specialization: e.target.value})}
                         className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-100 transition-all"
                       />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Joining Date</label>
                     <input 
                       type="date" 
                       value={showEditModal.joining_date || ''}
                       onChange={e => setShowEditModal({...showEditModal, joining_date: e.target.value})}
                       className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-100 transition-all"
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Bio / About</label>
                     <textarea 
                       rows={3}
                       value={showEditModal.bio || ''}
                       onChange={e => setShowEditModal({...showEditModal, bio: e.target.value})}
                       className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-100 transition-all resize-none"
                     />
                  </div>
                  <button type="submit" disabled={saving} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 disabled:opacity-50">
                     {saving ? 'Updating Details...' : 'Save Changes'}
                  </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100"
            >
              <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-slate-50/50">
                 <div>
                    <h2 className="text-xl font-bold text-gray-900">New Teacher Profile</h2>
                    <p className="text-xs text-gray-500 mt-1 font-medium">Create user account and staff profile simultaneously.</p>
                 </div>
                 <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white rounded-full text-gray-400 transition-colors">
                    <X size={20} />
                 </button>
              </div>

              <form onSubmit={handleAddTeacher} className="p-8 space-y-6">
                 <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase px-1">Email (Username)</label>
                    <input required type="email" placeholder="john.doe@school.com" value={newTeacher.email}
                      onChange={e => setNewTeacher({...newTeacher, email: e.target.value})}
                      className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-4 focus:ring-blue-100 outline-none" />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-gray-400 uppercase px-1">First Name</label>
                       <input required placeholder="John" value={newTeacher.first_name}
                         onChange={e => setNewTeacher({...newTeacher, first_name: e.target.value})}
                         className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-4 focus:ring-blue-100 outline-none" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-gray-400 uppercase px-1">Last Name</label>
                       <input required placeholder="Doe" value={newTeacher.last_name}
                         onChange={e => setNewTeacher({...newTeacher, last_name: e.target.value})}
                         className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-4 focus:ring-blue-100 outline-none" />
                    </div>
                 </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <div className="flex items-center justify-between px-1">
                           <label className="text-xs font-bold text-gray-400 uppercase">Specialization / Subject</label>
                           <button 
                             type="button"
                             onClick={() => setShowQuickSubject(!showQuickSubject)}
                             className="text-blue-600 hover:text-blue-700 p-1 rounded-lg hover:bg-blue-50 transition-all"
                             title="Add New Subject"
                           >
                              <Plus size={14} className={showQuickSubject ? 'rotate-45 transition-transform' : 'transition-transform'} />
                           </button>
                        </div>
                        
                        {showQuickSubject ? (
                          <div className="space-y-2 p-3 bg-blue-50/50 rounded-2xl border border-blue-100 animate-in fade-in slide-in-from-top-1">
                             <input 
                               placeholder="Sub Name (e.g. Robotics)" 
                               value={quickSubject.name}
                               onChange={e => setQuickSubject({...quickSubject, name: e.target.value})}
                               className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                             />
                             <div className="flex gap-2">
                                <input 
                                  placeholder="Code (e.g. ROB)" 
                                  value={quickSubject.code}
                                  onChange={e => setQuickSubject({...quickSubject, code: e.target.value.toUpperCase()})}
                                  className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button 
                                  type="button"
                                  onClick={handleQuickSubjectSubmit}
                                  disabled={savingSubject}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {savingSubject ? '...' : 'Add'}
                                </button>
                             </div>
                          </div>
                        ) : (
                          <select required value={newTeacher.specialization}
                            onChange={e => setNewTeacher({...newTeacher, specialization: e.target.value})}
                            className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-4 focus:ring-blue-100 outline-none">
                             <option value="">Select Specialization</option>
                             {subjects?.filter(s => !newTeacher.branch || s.branch === newTeacher.branch).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                        )}
                     </div>
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-gray-400 uppercase px-1">Employee ID (Auto-Generated)</label>
                       <input disabled placeholder="Auto-generates on save" value={newTeacher.employee_id}
                         className="w-full px-5 py-3 bg-gray-100 border-none rounded-2xl text-sm font-medium outline-none cursor-not-allowed opacity-60" />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-gray-400 uppercase px-1">Qualification</label>
                       <input placeholder="M.Sc. Mathematics" value={newTeacher.qualification}
                         onChange={e => setNewTeacher({...newTeacher, qualification: e.target.value})}
                         className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-4 focus:ring-blue-100 outline-none" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-gray-400 uppercase px-1">Assign Branch</label>
                       <select required value={newTeacher.branch}
                         onChange={e => setNewTeacher({...newTeacher, branch: e.target.value})}
                         className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-4 focus:ring-blue-100 outline-none">
                          {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                       </select>
                    </div>
                 </div>

                 <div className="pt-4">
                    <button type="submit" disabled={saving} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-[0.98] disabled:opacity-50">
                       {saving ? 'Creating Teacher Account...' : 'Confirm Registration'}
                    </button>
                    <p className="text-center text-[10px] text-gray-400 mt-4 uppercase font-bold tracking-widest leading-relaxed">
                       Default password: <span className="text-blue-600">Password123!</span> — Teacher will be prompted to change on first login.
                    </p>
                 </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Assign Modal */}
      <AnimatePresence>
        {showAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-50 bg-gray-50/30 rounded-t-3xl">
                 <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100">
                       <BookOpen size={20} />
                    </div>
                    <div>
                       <h3 className="text-lg font-black text-gray-800 tracking-tighter">Academic Assignment</h3>
                       <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Assign Classes & Subjects</p>
                    </div>
                 </div>
                 <button onClick={() => setShowAssignModal(null)} className="p-2 hover:bg-gray-50 rounded-full text-gray-400 transition-colors">
                    <X size={18} />
                 </button>
              </div>

              <form onSubmit={handleAssign} className="p-6 space-y-6">
                 <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase px-1">Academic Year</label>
                    <select required value={assignment.academic_year}
                      onChange={e => setAssignment({...assignment, academic_year: e.target.value})}
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-4 focus:ring-blue-100">
                       <option value="">Select Year...</option>
                       {years?.map(y => <option key={y.id} value={y.id}>{y.name} {y.is_active ? '(Active)' : ''}</option>)}
                    </select>
                 </div>

                 <div className="space-y-4">
                    <label className="text-xs font-bold text-gray-400 uppercase px-1">Step 1: Select Classes</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                       {classes?.map(c => (
                         <label key={c.id} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
                           assignment.class_assignments[c.id] ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-transparent hover:bg-white hover:border-gray-100'
                         }`}>
                            <input 
                              type="checkbox" 
                              checked={!!assignment.class_assignments[c.id]}
                              onChange={e => {
                                const newMap = { ...assignment.class_assignments };
                                if (e.target.checked) newMap[c.id] = [];
                                else delete newMap[c.id];
                                setAssignment({...assignment, class_assignments: newMap});
                              }}
                              className="w-5 h-5 text-blue-600 rounded-lg border-gray-300" 
                            />
                            <span className="text-sm font-bold text-gray-700">{c.display_name}</span>
                         </label>
                       ))}
                    </div>
                 </div>

                 <div className="space-y-4">
                    <label className="text-xs font-bold text-gray-400 uppercase px-1">Step 2: Assign Subjects per Class</label>
                    <div className="space-y-3 max-h-60 overflow-y-auto px-1 pb-4">
                       {Object.keys(assignment.class_assignments).length === 0 ? (
                         <div className="text-center py-8 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select a class above first</p>
                         </div>
                       ) : (
                         Object.keys(assignment.class_assignments).map(classId => {
                           const classObj = classes?.find(c => c.id === classId);
                           return (
                             <div key={classId} className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm animate-in zoom-in-95">
                               <div className="flex items-center justify-between mb-3">
                                 <span className="text-sm font-black text-blue-600 uppercase tracking-tighter">{classObj?.display_name}</span>
                                 <span className="text-[10px] font-bold text-gray-400">{assignment.class_assignments[classId].length} Selected</span>
                               </div>
                               <div className="flex flex-wrap gap-2">
                                 {subjects?.filter((s: any) => {
                                      const assignTeacher = staff?.find((t: any) => t.id === showAssignModal);
                                      const teacherBranchId = typeof assignTeacher?.branch === 'object' ? assignTeacher.branch?.id : assignTeacher?.branch;
                                      return !teacherBranchId || s.branch === teacherBranchId;
                                 }).map((s: any) => (
                                   <button
                                     key={s.id}
                                     type="button"
                                     onClick={() => {
                                       const currentSubs = assignment.class_assignments[classId];
                                       const newSubs = currentSubs.includes(s.id)
                                         ? currentSubs.filter(id => id !== s.id)
                                         : [...currentSubs, s.id];
                                       setAssignment({
                                         ...assignment,
                                         class_assignments: { ...assignment.class_assignments, [classId]: newSubs }
                                       });
                                     }}
                                     className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border ${
                                       assignment.class_assignments[classId].includes(s.id)
                                         ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100 scale-105'
                                         : 'bg-gray-50 text-gray-500 border-transparent hover:bg-white hover:border-gray-200'
                                     }`}
                                   >
                                     {s.name}
                                   </button>
                                 ))}
                               </div>
                             </div>
                           );
                         })
                       )}
                    </div>
                 </div>

                 <div className="space-y-4 pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white transition-all">
                       <input type="checkbox" checked={assignment.is_class_teacher}
                         onChange={e => setAssignment({...assignment, is_class_teacher: e.target.checked})}
                         className="w-5 h-5 text-blue-600 rounded-lg border-gray-300 focus:ring-blue-500" />
                       <span className="text-sm font-semibold text-gray-700">Set as primary Class Teacher</span>
                    </div>

                    {assignment.is_class_teacher && Object.keys(assignment.class_assignments).length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 px-1">
                         <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Select Class Teacher Role For:</label>
                         <select 
                           value={assignment.primary_class_id}
                           onChange={e => setAssignment({...assignment, primary_class_id: e.target.value})}
                           required={assignment.is_class_teacher}
                           className="w-full px-4 py-3 bg-blue-50 border-2 border-blue-100 rounded-2xl text-sm font-bold text-blue-700 outline-none"
                         >
                            <option value="">Choose Class...</option>
                            {Object.keys(assignment.class_assignments).map(classId => {
                               const c = classes?.find(cl => cl.id === classId);
                               return <option key={classId} value={classId}>{c?.display_name}</option>;
                            })}
                         </select>
                      </motion.div>
                    )}
                 </div>

                 <button type="submit" disabled={saving || !Object.values(assignment.class_assignments).some(s => s.length > 0)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-[0.98] disabled:opacity-50">
                    {saving ? 'Processing Assignments...' : 'Finalize Assignment'}
                 </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
