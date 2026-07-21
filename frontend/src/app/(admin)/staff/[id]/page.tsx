"use client";

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Camera, Pencil } from 'lucide-react';
import { differenceInYears, differenceInMonths } from 'date-fns';

export default function StaffProfilePage() {
  const { id } = useParams() as { id: string };
  const { data: staff, loading, error } = useApi<any>(`staff/${id}/`);

  const [activeTab, setActiveTab] = useState('overview');

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
  
  // Tenure calculation
  let tenureText = '-';
  if (staff.joining_date) {
    const joinDate = new Date(staff.joining_date);
    const years = differenceInYears(new Date(), joinDate);
    const months = differenceInMonths(new Date(), joinDate) % 12;
    if (years > 0) {
      tenureText = `${years} year${years > 1 ? 's' : ''}${months > 0 ? ` ${months} month${months > 1 ? 's' : ''}` : ''}`;
    } else if (months > 0) {
      tenureText = `${months} month${months > 1 ? 's' : ''}`;
    } else {
      tenureText = 'Less than a month';
    }
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents' },
  ];

  return (
    <div className="w-full bg-white min-h-screen">
      {/* Header Profile Section */}
      <div className="w-full px-8 py-8 border-b border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-2 border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                <UserAvatar />
              </div>
              <button className="absolute bottom-0 right-0 p-1.5 bg-white border border-slate-200 rounded-full shadow-sm text-slate-500 hover:text-slate-700">
                <Camera size={14} />
              </button>
            </div>
            
            {/* Basic Info */}
            <div>
              <h1 className="text-xl font-bold text-slate-900">{name}</h1>
              <p className="text-sm font-semibold text-slate-600 mt-1">{staff.designation_name || 'Staff'}</p>
              <p className="text-xs text-slate-500 mt-1">
                {staff.branch_name || staff.branch} | {staff.employment_type} {staff.department_name ? `| ${staff.department_name}` : ''}
              </p>
              <p className={`text-sm font-bold mt-2 ${staff.status === 'ACTIVE' ? 'text-red-500' : 'text-slate-500'}`}>
                {staff.status === 'ACTIVE' ? 'Active' : staff.status}
              </p>
            </div>
          </div>
          
          {/* Contact Details Right Side */}
          <div className="text-right text-xs font-semibold text-slate-500 space-y-2">
            <p>
              {staff.user_details?.email || 'no-email@example.com'} | {staff.mobile || 'N/A'}
            </p>
            {staff.spouse_name && (
              <p>{staff.spouse_name} | {staff.emergency_contact_number || 'N/A'} | Spouse</p>
            )}
          </div>
        </div>
        
        {/* Tabs */}
        <div className="mt-8 flex gap-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`pb-2 text-sm font-bold transition-all border-b-2 ${
                activeTab === t.id 
                  ? 'border-blue-600 text-slate-900' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="w-full px-8 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* LEFT COLUMN */}
              <div className="space-y-8">
                
                {/* Classes and Subjects */}
                <div className="border border-slate-200 rounded-sm">
                  <div className="flex items-center gap-2 p-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800">Classes and Subjects</h3>
                    <Pencil size={14} className="text-blue-600 cursor-pointer" />
                  </div>
                  <div className="w-full overflow-hidden">
                    <table className="w-full text-xs text-left text-slate-700">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-4 py-3 font-bold border-b border-slate-200">Class</th>
                          <th className="px-4 py-3 font-bold border-b border-slate-200">Subject/Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2 border-b border-white">Grade 1</td>
                          <td className="px-4 py-2 border-b border-white text-right">Class incharge</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="px-4 py-2 border-b border-slate-50">Grade 1 - A Section</td>
                          <td className="px-4 py-2 border-b border-slate-50 text-right">Class teacher</td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2 border-b border-white">Grade 2 - A Section</td>
                          <td className="px-4 py-2 border-b border-white">English</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="px-4 py-2 border-b border-slate-50">Grade 3 - A Section</td>
                          <td className="px-4 py-2 border-b border-slate-50">English</td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2">Grade 4 - A Section</td>
                          <td className="px-4 py-2 text-right">English</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Experience Details */}
                <div className="border border-slate-200 rounded-sm">
                  <div className="flex items-center gap-2 p-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800">Experience Details</h3>
                    <Pencil size={14} className="text-blue-600 cursor-pointer" />
                  </div>
                  <div className="w-full">
                    <table className="w-full text-xs text-slate-700">
                      <tbody>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2 border-b border-white font-medium">Years of experience</td>
                          <td className="px-4 py-2 border-b border-white text-right">{staff.experience_years || 'N/A'}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="px-4 py-2 border-b border-slate-50 font-medium">Tenure at school</td>
                          <td className="px-4 py-2 border-b border-slate-50 text-right">{tenureText}</td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2 border-b border-white font-medium">Joining date</td>
                          <td className="px-4 py-2 border-b border-white text-right">{staff.joining_date || 'N/A'}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="px-4 py-2 font-medium">Qualification</td>
                          <td className="px-4 py-2 text-right">{staff.qualification || 'N/A'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-8">
                
                {/* Activity Details */}
                <div className="border border-slate-200 rounded-sm">
                  <div className="flex items-center gap-2 p-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800">Activity Details</h3>
                  </div>
                  <div className="w-full">
                    <div className="px-4 py-2 text-xs text-slate-600 bg-slate-50">
                      Last assignment updated at {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* Personal Details */}
                <div className="border border-slate-200 rounded-sm">
                  <div className="flex items-center gap-2 p-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800">Personal Details</h3>
                    <Pencil size={14} className="text-blue-600 cursor-pointer" />
                  </div>
                  <div className="w-full">
                    <table className="w-full text-xs text-slate-700">
                      <tbody>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2 border-b border-white font-medium">Date of birth</td>
                          <td className="px-4 py-2 border-b border-white text-right">{staff.date_of_birth || 'N/A'}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="px-4 py-2 border-b border-slate-50 font-medium">Blood group</td>
                          <td className="px-4 py-2 border-b border-slate-50 text-right">{staff.blood_group || 'N/A'}</td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2 border-b border-white font-medium">Religion</td>
                          <td className="px-4 py-2 border-b border-white text-right">{staff.religion || 'N/A'}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="px-4 py-2 border-b border-slate-50 font-medium">Emergency contact</td>
                          <td className="px-4 py-2 border-b border-slate-50 text-right">{staff.emergency_contact_number || 'N/A'}</td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2 border-b border-white font-medium">Name</td>
                          <td className="px-4 py-2 border-b border-white text-right">{staff.emergency_contact_name || 'N/A'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>
          )}

          {activeTab === 'documents' && (
            <div className="py-8">
              <p className="text-sm text-slate-500">Documents section coming soon.</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const UserAvatar = () => (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);
