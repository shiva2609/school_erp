"use client";

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft, User, Briefcase, HeartPulse, MapPin, Landmark, Phone, Mail,
  Calendar, CheckCircle2, ShieldCheck, GraduationCap, Clock, AlertCircle,
  BookOpen, Plus, Trash2, Edit2, KeyRound, Loader2, X, Save
} from 'lucide-react';
import { AuthProvider, useAuth } from '@/components/common/AuthProvider';
import { differenceInYears, differenceInMonths } from 'date-fns';

export default function StaffProfilePage() {
  const { id } = useParams() as { id: string };
  const { data: staff, loading, error, refetch } = useApi<any>(`staff/${id}/`);
  const { data: years } = useApi<any[]>('tenants/academic-years/');
  const { data: classes } = useApi<any[]>('classes/');
  const { data: subjects } = useApi<any[]>('academics/subjects/');

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activeAcademicYear, setActiveAcademicYear] = useState('');

  useEffect(() => {
    if (years?.length && !activeAcademicYear) {
      setActiveAcademicYear(years.find((y: any) => y.is_active)?.id || years[0].id);
    }
  }, [years, activeAcademicYear]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <p className="text-slate-500 font-medium text-sm">Loading staff profile...</p>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-3xl p-12 text-center max-w-2xl mx-auto mt-12">
        <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
        <h2 className="text-xl font-bold text-red-700">Profile Not Found</h2>
        <p className="text-red-500 mt-2">{error || "The requested staff profile does not exist or you don't have access."}</p>
        <Link href="/staff" className="inline-block mt-6 px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors">
          Return to Staff Directory
        </Link>
      </div>
    );
  }

  const name = staff.user_details ? `${staff.user_details.first_name} ${staff.user_details.last_name}`.trim() : staff.employee_id;
  const initials = staff.user_details ? `${staff.user_details.first_name.charAt(0)}${staff.user_details.last_name.charAt(0)}`.toUpperCase() : staff.employee_id.charAt(0).toUpperCase();

  const handleOpenAssign = () => {
    const currentList = staff.assignments?.map((a: any) => ({
      class_section_id: a.class_section,
      role: a.role || 'SUBJECT_TEACHER',
      subject_id: a.subject || '',
      id: Math.random().toString(36).substr(2, 9)
    })) || [];
    
    setAssignments(currentList);
    setActiveAcademicYear(years?.find((y: any) => y.is_active)?.id || years?.[0]?.id || '');
    setShowAssignModal(true);
  };

  const handleAssignSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client side validation for uniqueness
    const seen = new Set();
    for (const a of assignments) {
      const key = `${a.class_section_id}-${a.role}-${a.role === 'SUBJECT_TEACHER' ? a.subject_id : ''}`;
      if (seen.has(key)) {
        toast.error("Duplicate assignments detected. Please fix.");
        return;
      }
      seen.add(key);
    }

    setAssignSaving(true);
    try {
      await api.post('staff/assign/', {
        teacher: staff.id,
        academic_year: activeAcademicYear,
        assignments: assignments.map(a => ({
          class_section_id: a.class_section_id,
          role: a.role,
          subject_id: a.role === 'SUBJECT_TEACHER' ? a.subject_id : null
        }))
      });
      toast.success("Academic assignments updated!");
      setShowAssignModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Error assigning classes");
    } finally {
      setAssignSaving(false);
    }
  };

  // Tenure calculation
  let tenureText = '-';
  if (staff.joining_date) {
    const joinDate = new Date(staff.joining_date);
    const yearsTenure = differenceInYears(new Date(), joinDate);
    const monthsTenure = differenceInMonths(new Date(), joinDate) % 12;
    if (yearsTenure > 0) {
      tenureText = `${yearsTenure} year${yearsTenure > 1 ? 's' : ''}${monthsTenure > 0 ? ` ${monthsTenure} month${monthsTenure > 1 ? 's' : ''}` : ''}`;
    } else if (monthsTenure > 0) {
      tenureText = `${monthsTenure} month${monthsTenure > 1 ? 's' : ''}`;
    } else {
      tenureText = 'Less than a month';
    }
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'personal', label: 'Personal & Contact', icon: HeartPulse },
    { id: 'employment', label: 'Employment & Govt', icon: Briefcase },
  ];

  if (staff.is_teaching_role) {
    tabs.push({ id: 'assignments', label: 'Academic Assignments', icon: BookOpen });
  }

  return (
    <div className="w-full px-4 md:px-8 space-y-6 pb-20">
      <Link href="/staff" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors mt-6">
        <ArrowLeft size={16} /> Back to Directory
      </Link>

      {/* Header Card (Restored original styling) */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700 relative">
          <div className="absolute -bottom-12 left-8 p-1.5 bg-white rounded-3xl shadow-md">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-[1.25rem] flex items-center justify-center text-3xl font-black text-blue-600 border border-blue-100">
              {initials}
            </div>
          </div>
          <div className="absolute top-4 right-4 flex gap-2">
            <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${staff.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
              {staff.status}
            </span>
            <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
              {staff.employment_type}
            </span>
          </div>
        </div>
        
        <div className="pt-16 pb-8 px-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-black text-slate-900">{name}</h1>
              <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mt-1">{staff.employee_id}</p>
              
              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-600">
                {staff.designation_name && (
                  <span className="flex items-center gap-1.5 font-medium">
                    <Briefcase size={16} className="text-slate-400" /> {staff.designation_name}
                  </span>
                )}
                {staff.user_details?.email && (
                  <span className="flex items-center gap-1.5 font-medium">
                    <Mail size={16} className="text-slate-400" /> {staff.user_details.email}
                  </span>
                )}
                {staff.mobile && (
                  <span className="flex items-center gap-1.5 font-medium">
                    <Phone size={16} className="text-slate-400" /> {staff.mobile}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Link href={`/staff/${id}/edit`} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-sm hover:bg-slate-200 transition-colors flex items-center gap-2">
                <Edit2 size={16} /> Edit Profile
              </Link>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-8 border-t border-slate-50 flex gap-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 py-4 border-b-2 text-sm font-bold transition-all ${
                activeTab === t.id 
                  ? 'border-blue-600 text-blue-700' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* LEFT COLUMN */}
              <div className="space-y-6">
                
                {/* Classes and Subjects */}
                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="text-blue-600" /> Classes and Subjects
                    </div>
                    {['SUPER_ADMIN', 'ACCOUNTANT'].includes(user?.role || '') && (
                      <button onClick={handleOpenAssign} className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-blue-600 rounded-lg transition-colors" title="Edit Assignments">
                        <Edit2 size={16} />
                      </button>
                    )}
                  </h3>
                  <div className="w-full overflow-hidden">
                    <table className="w-full text-sm text-left text-slate-700">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 font-bold border-b border-slate-100 rounded-tl-xl">Class</th>
                          <th className="px-4 py-3 font-bold border-b border-slate-100">Subject</th>
                          <th className="px-4 py-3 font-bold border-b border-slate-100 rounded-tr-xl">Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staff.assignments?.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-slate-500 font-medium">No classes assigned yet.</td>
                          </tr>
                        ) : (
                          staff.assignments?.map((a: any, idx: number) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="px-4 py-3 border-b border-slate-50 font-medium">{a.class_name}</td>
                              <td className="px-4 py-3 border-b border-slate-50">{a.role === 'SUBJECT_TEACHER' ? a.subject_name : '—'}</td>
                              <td className="px-4 py-3 border-b border-slate-50">
                                <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg ${
                                  a.role === 'CLASS_TEACHER' ? 'bg-blue-100 text-blue-700' : 
                                  a.role === 'SECOND_CLASS_TEACHER' ? 'bg-purple-100 text-purple-700' : 
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {a.role === 'CLASS_TEACHER' ? 'Class Teacher' : a.role === 'SECOND_CLASS_TEACHER' ? 'Second Class Teacher' : 'Subject Teacher'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Experience Details */}
                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Briefcase className="text-blue-600" /> Experience Details
                  </h3>
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Years of experience</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.experience_years || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tenure at school</p>
                      <p className="font-semibold text-slate-800 mt-1">{tenureText}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Joining date</p>
                      <p className="font-semibold text-slate-800 mt-1">
                        {staff.joining_date ? new Date(staff.joining_date).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qualification</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.qualification || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-6">
                
                {/* Personal Details */}
                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <HeartPulse className="text-blue-600" /> Personal Details
                  </h3>
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date of birth</p>
                      <p className="font-semibold text-slate-800 mt-1">
                        {staff.date_of_birth ? new Date(staff.date_of_birth).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Blood group</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.blood_group || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Religion</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.religion || 'N/A'}</p>
                    </div>
                    <div className="col-span-2 border-t border-slate-50 pt-4 mt-2">
                      <h4 className="text-sm font-bold text-slate-800 mb-4">Emergency Contact</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Number</p>
                          <p className="font-semibold text-slate-800 mt-1">{staff.emergency_contact_number || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</p>
                          <p className="font-semibold text-slate-800 mt-1">{staff.emergency_contact_name || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Portal Access Card */}
                <div className="bg-slate-900 rounded-3xl p-6 shadow-md text-white">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <KeyRound className="text-blue-400" /> Portal Access
                  </h3>
                  {staff.user_details ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
                        <ShieldCheck className="text-emerald-400 shrink-0" size={24} />
                        <div>
                          <p className="text-xs font-bold text-slate-300">Account Status</p>
                          <p className="font-semibold text-white">Active Login Enabled</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Username / Email</p>
                        <p className="font-medium text-slate-200 mt-1">{staff.user_details.email}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Role</p>
                        <p className="font-medium text-slate-200 mt-1">{staff.user_details.role}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Clock className="text-slate-500" size={24} />
                      </div>
                      <p className="text-sm font-bold text-slate-300">No Portal Access</p>
                      <p className="text-xs text-slate-500 mt-1">This staff member does not have an ERP login account.</p>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* Other tabs remain essentially identical but adapted to layout */}
          {activeTab === 'personal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <HeartPulse className="text-blue-600" /> Personal Details
                </h3>
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Blood Group</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.blood_group || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Religion</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.religion || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Marital Status</p>
                    <p className="font-semibold text-slate-800 mt-1 capitalize">{staff.marital_status?.toLowerCase() || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Father's Name</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.father_name || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mother's Name</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.mother_name || 'N/A'}</p>
                  </div>
                  {staff.marital_status !== 'SINGLE' && (
                    <div className="col-span-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Spouse's Name</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.spouse_name || 'N/A'}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Phone className="text-blue-600" /> Contact Details
                  </h3>
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mobile Number</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.mobile || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alternate Mobile</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.alternate_mobile || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Emergency Contact</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.emergency_contact_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Emergency Mobile</p>
                      <p className="font-semibold text-slate-800 mt-1">{staff.emergency_contact_number || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <MapPin className="text-blue-600" /> Address Details
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Address</p>
                      <p className="font-medium text-slate-700 mt-1 whitespace-pre-line leading-relaxed">
                        {staff.current_address || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permanent Address</p>
                      <p className="font-medium text-slate-700 mt-1 whitespace-pre-line leading-relaxed">
                        {staff.permanent_address || 'N/A'}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">City</p>
                        <p className="font-semibold text-slate-800 mt-1">{staff.city || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">State</p>
                        <p className="font-semibold text-slate-800 mt-1">{staff.state || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pincode</p>
                        <p className="font-semibold text-slate-800 mt-1">{staff.pincode || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'employment' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Briefcase className="text-blue-600" /> Work Profile
                </h3>
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div className="col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.category_name || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Department</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.department_name || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Designation</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.designation_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Joined On</p>
                    <p className="font-semibold text-slate-800 mt-1">
                      {staff.joining_date ? new Date(staff.joining_date).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Employment Type</p>
                    <p className="font-semibold text-slate-800 mt-1 capitalize">{staff.employment_type?.toLowerCase() || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Years of Experience</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.experience_years || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qualification</p>
                    <p className="font-semibold text-slate-800 mt-1">{staff.qualification || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Landmark className="text-blue-600" /> Government Identifications
                </h3>
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div className="col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PAN Number</p>
                    <p className="font-mono text-sm font-semibold text-slate-800 mt-1 uppercase">{staff.pan_number || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aadhaar Number</p>
                    <p className="font-mono text-sm font-semibold text-slate-800 mt-1">{staff.aadhaar_number || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PF Number</p>
                    <p className="font-mono text-sm font-semibold text-slate-800 mt-1">{staff.pf_number || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">UAN Number</p>
                    <p className="font-mono text-sm font-semibold text-slate-800 mt-1">{staff.uan_number || 'N/A'}</p>
                  </div>
                  <div className="col-span-2 border-t border-slate-50 pt-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ESI Number</p>
                    <p className="font-mono text-sm font-semibold text-slate-800 mt-1">{staff.esi_number || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <BookOpen className="text-blue-600" /> Academic & Class Assignments
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Manage subjects taught and class teacher responsibilities.</p>
                </div>
                <button
                  onClick={handleOpenAssign}
                  className="flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                >
                  <Edit2 size={16} /> Manage Assignments
                </button>
              </div>

              {(!staff.assignments || staff.assignments.length === 0) ? (
                <div className="text-center py-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                  <GraduationCap className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="font-bold text-slate-600">No Classes Assigned</p>
                  <p className="text-sm text-slate-400 mt-1">This teacher does not have any active class or subject assignments.</p>
                  <button onClick={handleOpenAssign} className="mt-4 px-6 py-2 bg-white border border-slate-200 text-blue-600 font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                    Assign Now
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {staff.is_class_teacher && (
                    <div className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                      <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                        <CheckCircle2 size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-900">Primary Class Teacher</p>
                        <p className="text-xs font-semibold text-emerald-700 mt-0.5">Assigned to: {staff.assignments.find((a: any) => a.class_section === staff.primary_class_id)?.class_name || 'Unknown Class'}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Subject Workload</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(
                        staff.assignments.reduce((acc: any, a: any) => {
                          if (!acc[a.class_name]) acc[a.class_name] = [];
                          acc[a.class_name].push(a.subject_name);
                          return acc;
                        }, {})
                      ).map(([className, subjects]: any) => (
                        <div key={className} className="p-5 border border-slate-100 rounded-2xl bg-white hover:border-blue-100 transition-colors shadow-sm">
                          <p className="font-bold text-slate-800 text-base">{className}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {subjects.map((s: string, idx: number) => (
                              <span key={idx} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Assignment Modal */}
      <AnimatePresence>
        {showAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="flex items-center justify-between p-6 border-b border-slate-50 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-md">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Academic Assignment</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assign Classes & Subjects</p>
                  </div>
                </div>
                <button onClick={() => setShowAssignModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAssignSave} className="p-6 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">Academic Year</label>
                  <select required value={activeAcademicYear} onChange={e => setActiveAcademicYear(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/30">
                    {years?.map(y => <option key={y.id} value={y.id}>{y.name} {y.is_active ? '(Active)' : ''}</option>)}
                  </select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assignments</label>
                    <button type="button" onClick={() => setAssignments([...assignments, { id: Math.random().toString(36).substr(2, 9), class_section_id: '', role: 'SUBJECT_TEACHER', subject_id: '' }])} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      <Plus size={14} /> Add Row
                    </button>
                  </div>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto p-1 pr-2">
                    {assignments.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No assignments added yet</p>
                      </div>
                    ) : (
                      assignments.map((assignment, index) => {
                        const selectedClass = classes?.find((c: any) => c.id === assignment.class_section_id);
                        
                        // Extract unique friendly grade names from display_name (e.g., "Grade 1 - Section A" -> "Grade 1")
                        const uniqueGrades = Array.from(new Set(classes?.map((c: any) => c.display_name?.split(' - ')[0]) || []));
                        
                        // Determine the selected friendly grade based on the currently selected section
                        const selectedFriendlyGrade = selectedClass?.display_name?.split(' - ')[0] || '';
                        
                        return (
                          <div key={assignment.id} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm relative group animate-in zoom-in-95">
                            <button type="button" onClick={() => setAssignments(assignments.filter(a => a.id !== assignment.id))} className="absolute -top-2 -right-2 p-1.5 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm border border-red-200">
                              <X size={14} />
                            </button>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                              <select 
                                value={selectedFriendlyGrade} 
                                onChange={e => {
                                  // Find first section whose display_name starts with the selected friendly grade
                                  const firstSection = classes?.find((c: any) => c.display_name?.split(' - ')[0] === e.target.value);
                                  const newArr = [...assignments];
                                  newArr[index].class_section_id = firstSection ? firstSection.id : '';
                                  setAssignments(newArr);
                                }} 
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none"
                              >
                                <option value="">Select Grade</option>
                                {uniqueGrades.map((g: any) => <option key={g} value={g}>{g}</option>)}
                              </select>
                              <select 
                                required
                                value={assignment.class_section_id} 
                                onChange={e => {
                                  const newArr = [...assignments];
                                  newArr[index].class_section_id = e.target.value;
                                  setAssignments(newArr);
                                }}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none"
                              >
                                <option value="">Select Section</option>
                                {classes?.filter((c: any) => c.display_name?.split(' - ')[0] === selectedFriendlyGrade).map((c: any) => (
                                  <option key={c.id} value={c.id}>{c.display_name}</option>
                                ))}
                              </select>
                              <select 
                                required
                                value={assignment.role} 
                                onChange={e => {
                                  const newArr = [...assignments];
                                  newArr[index].role = e.target.value;
                                  if (e.target.value !== 'SUBJECT_TEACHER') newArr[index].subject_id = '';
                                  setAssignments(newArr);
                                }}
                                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none"
                              >
                                <option value="SUBJECT_TEACHER">Subject Teacher</option>
                                <option value="CLASS_TEACHER">Class Teacher</option>
                                <option value="SECOND_CLASS_TEACHER">Second Class Teacher</option>
                              </select>
                              <select 
                                required={assignment.role === 'SUBJECT_TEACHER'}
                                disabled={assignment.role !== 'SUBJECT_TEACHER'}
                                value={assignment.subject_id} 
                                onChange={e => {
                                  const newArr = [...assignments];
                                  newArr[index].subject_id = e.target.value;
                                  setAssignments(newArr);
                                }}
                                className={`w-full px-3 py-2 text-sm border rounded-xl outline-none ${assignment.role !== 'SUBJECT_TEACHER' ? 'bg-slate-100 text-slate-400 border-transparent' : 'bg-slate-50 border-slate-200'}`}
                              >
                                <option value="">Select Subject</option>
                                {subjects?.filter((s: any) => {
                                  if (selectedClass && s.grade_levels && s.grade_levels.length > 0) {
                                    return s.grade_levels.includes(selectedClass.grade);
                                  }
                                  return true;
                                }).map((s: any) => (
                                  <option key={s.id} value={s.id}>{s.name} {s.is_optional ? '(Optional)' : ''}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <button type="submit" disabled={assignSaving} className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-bold shadow-md shadow-blue-200 hover:bg-blue-700 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                  {assignSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {assignSaving ? 'Saving...' : 'Save Assignments'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
