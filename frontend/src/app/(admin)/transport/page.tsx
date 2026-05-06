"use client";

import React, { useState } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { 
  Bus, Navigation, IndianRupee, 
  Search, Plus, Users, Trash2, 
  CheckCircle, AlertTriangle, UserPlus, 
  Settings2, MoreVertical, X
} from 'lucide-react';
import { useBranch } from '@/components/common/BranchContext';
import EnrollStudentModal from '@/components/transport/EnrollStudentModal';
import UpdateStudentDistanceModal from '@/components/transport/UpdateStudentDistanceModal';

export default function TransportPage() {
  const { selectedBranch } = useBranch();
  const [activeTab, setActiveTab] = useState<'students' | 'rates'>('students');
  const [search, setSearch] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedStudentForUpdate, setSelectedStudentForUpdate] = useState<any>(null);

  // Data fetching
  const { data: students, loading: studentsLoading, refetch: refetchStudents } = useApi<any[]>(
    `/transport/students/?branch_id=${selectedBranch}&search=${search}`
  );
  
  const { data: rates, loading: ratesLoading, refetch: refetchRates } = useApi<any[]>(
    `/transport/rate-slabs/?branch_id=${selectedBranch}`
  );
  const { data: feeStats } = useApi<any>(
    `/reports/fees/stats/?branch_id=${selectedBranch || ''}`
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
             <Bus className="text-blue-600" />
             Transport Management
           </h1>
           <p className="text-gray-500 text-sm mt-1">Manage student transport allocation and distance-based fee slabs.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowEnrollModal(true)}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center gap-2 group"
          >
            <UserPlus size={18} />
            Register Student
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Transport Revenue Received</p>
          <p className="text-2xl font-black text-blue-700">
            ₹{Number(feeStats?.transport_revenue_collected || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Completed TRN invoice payments only.</p>
        </div>
      </div>

      <div className="flex gap-2 bg-white p-1 rounded-2xl border border-gray-100 shadow-sm w-fit">
        {[
          { id: 'students', label: 'Enrolled Students', icon: Users },
          { id: 'rates', label: 'Rate Slabs', icon: IndianRupee },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === tab.id 
                ? 'bg-slate-900 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
        {activeTab === 'students' && (
          <div className="animate-in fade-in duration-300">
            <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row gap-4 items-center justify-between">
               <div className="relative flex-1 max-w-md w-full">
                 <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                 <input 
                   placeholder="Search student or admission number..." 
                   className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 ring-blue-500 transition-all font-medium"
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                 />
               </div>
            </div>
            
            <table className="w-full text-sm text-left">
               <thead className="bg-slate-50/50 border-b border-gray-100 uppercase text-[10px] font-black text-slate-500 tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Student</th>
                    <th className="px-6 py-4">Pickup Point</th>
                    <th className="px-6 py-4 text-center">Distance</th>
                    <th className="px-6 py-4 text-right">Monthly Fee</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {studentsLoading ? (
                    <tr><td colSpan={6} className="p-20 text-center text-slate-400 animate-pulse uppercase tracking-widest text-xs font-bold">Fetching Enrollment Data...</td></tr>
                  ) : students?.length === 0 ? (
                    <tr><td colSpan={6} className="p-20 text-center text-slate-400">No students registered for transport in this branch.</td></tr>
                  ) : students?.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                           <span className="font-bold text-slate-900">{s.student_name}</span>
                           <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{s.admission_number} • {s.class_section}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 truncate max-w-[200px]">
                        {s.pickup_point || 'Not specified'}
                      </td>
                      <td className="px-6 py-4 text-center">
                         <span className="bg-slate-100 text-slate-600 py-1 px-3 rounded-full text-[10px] font-bold">
                           {s.distance_km} KM
                         </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-900 italic">
                        ₹{parseFloat(s.monthly_fee).toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${s.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                          {s.is_active ? 'Active' : 'Stopped'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <button 
                           onClick={() => setSelectedStudentForUpdate(s)}
                           className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                         >
                           <Settings2 size={16} />
                         </button>
                      </td>
                    </tr>
                  ))}
               </tbody>
            </table>
          </div>
        )}

        {activeTab === 'rates' && (
          <div className="p-8 animate-in fade-in duration-300">
             <div className="flex items-center justify-between mb-8">
               <h3 className="font-bold text-slate-900">Distance-Based Rates</h3>
               <button className="text-blue-600 text-xs font-bold flex items-center gap-1 hover:underline">
                 <Plus size={14} /> Define Slab
               </button>
             </div>
             
             <div className="max-w-2xl mx-auto space-y-4">
                {rates?.map(slab => (
                  <div key={slab.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-transparent hover:border-blue-100 hover:bg-white transition-all group">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all text-slate-400">
                           <Settings2 size={18} />
                        </div>
                        <div>
                           <p className="font-black text-slate-900 text-lg italic tracking-tighter">
                             {slab.min_km} - {slab.max_km} <span className="text-xs font-bold text-slate-400 not-italic uppercase ml-1 tracking-widest">Kilometers</span>
                           </p>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Monthly recurring fee</p>
                        </div>
                     </div>
                     <div className="text-2xl font-black text-blue-600 tracking-tight">
                        ₹{parseFloat(slab.monthly_rate).toLocaleString('en-IN')}
                     </div>
                  </div>
                ))}
                
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex gap-4 mt-10">
                   <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                      <AlertTriangle size={20} />
                   </div>
                   <div>
                      <h4 className="text-sm font-bold text-amber-900 mb-1">Pricing Constraint Warning</h4>
                      <p className="text-xs text-amber-700 opacity-80 leading-relaxed">Ensure rate slabs cover all possible distances. If a student's distance falls outside defined slabs, the enrollment will be rejected until a matching slab is configured.</p>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Models */}
      <EnrollStudentModal 
        isOpen={showEnrollModal} 
        onClose={() => setShowEnrollModal(false)}
        onSuccess={() => {
          setShowEnrollModal(false);
          refetchStudents();
        }}
      />
      <UpdateStudentDistanceModal
        isOpen={!!selectedStudentForUpdate}
        onClose={() => setSelectedStudentForUpdate(null)}
        studentData={selectedStudentForUpdate}
        onSuccess={() => {
          setSelectedStudentForUpdate(null);
          refetchStudents();
        }}
      />
    </div>
  );
}
