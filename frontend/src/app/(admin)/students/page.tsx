"use client";

import React, { useState, useEffect } from 'react';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import Link from 'next/link';
import { Plus, Search, Users, Filter, Receipt, Building2, UserPlus, CheckCircle, Trash2, ShieldCheck, AlertTriangle, UserMinus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import StudentForm from '@/components/students/StudentForm';
import { useBranch } from '@/components/common/BranchContext';
import Modal from '@/components/common/Modal';
import FloatingActionBar from '@/components/common/FloatingActionBar';
import CsvImportModal from '@/components/students/CsvImportModal';

interface Student {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  class_section: string;
  class_section_display: string;
  status: string;
  branch: string;
  branch_name: string;
  roll_number: number | null;
  proposed_fee?: number;
}

export default function StudentsPage() {
  const push = useResolvedPush();
  const { selectedBranch } = useBranch();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data: students, loading, error, refetch } = useApi<Student[]>(
    `/students/?status=${statusFilter}&search=${search}&branch_id=${selectedBranch}`
  );

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    api.get('auth/me/').then(res => setUser(res.data.data));
  }, []);

  const handleEnroll = async (formData: any) => {
    try {
      const payload = { ...formData };
      delete payload.branch_name;
      delete payload.class_section_display;
      for (const key of ['aadhar_number', 'father_aadhaar', 'mother_aadhaar'] as const) {
        if (typeof payload[key] === 'string') {
          payload[key] = payload[key].replace(/\D/g, '').slice(0, 12);
        }
      }
      // Clean integer fields — DRF IntegerField rejects '' (needs null or a number)
      if (payload.roll_number === '' || payload.roll_number === undefined) {
        payload.roll_number = null;
      }
      const res = await api.post('/students/', payload);
      const row = res.data?.data ?? res.data;
      setShowDrawer(false);
      refetch();
      if (row?.requires_admission_payment && row?.id) {
        toast.success('Student saved. Continue to admission fee payment.');
        push(`/students/${row.id}/pay-admission`);
        return;
      }
      toast.success('Student enrolled.');
    } catch (err: any) {
      toast.error("Failed to enroll: " + (err.response?.data?.detail || JSON.stringify(err.response?.data)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const generateBulkIdCards = async () => {
    if (selectedIds.length === 0) return;
    const loadingToast = toast.loading('Generating ID cards...', { icon: '🪪' });
    try {
      const response = await api.post('/templates/generate/bulk-id-cards/', {
        student_ids: selectedIds
      }, { responseType: 'blob' });
      
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ID_Cards_Bulk_${selectedIds.length}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss(loadingToast);
      toast.success('ID cards generated!');
    } catch (err: any) {
      toast.dismiss(loadingToast);
      const text = await err.response?.data?.text?.();
      try {
        const json = JSON.parse(text || '{}');
        toast.error(json.error || 'Failed to generate ID cards.');
      } catch {
        toast.error('Failed to generate ID cards. Check template configuration.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Student Directory</h1>
           <p className="text-gray-500 text-sm mt-1">Manage enrollments, academic mapping, and student lifecycle.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowImport(true)}
            className="bg-white border border-gray-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:border-blue-300 transition-all flex items-center gap-2 group"
          >
            <Users size={18} className="text-blue-500 group-hover:scale-110 transition-transform" />
            Import CSV
          </button>
          <button 
            onClick={() => setShowDrawer(true)}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center gap-2 group"
          >
            <UserPlus size={18} className="group-hover:scale-110 transition-transform" />
            Enroll Student
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[300px]">
           <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
           <input 
             placeholder="Search by name or admission number..." 
             value={search}
             onChange={e => setSearch(e.target.value)}
             className="w-full pl-11 pr-4 py-2.5 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 ring-blue-500" 
           />
        </div>
        
        <div className="flex gap-2 bg-white p-1 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto scrollbar-hide">
           {['ACTIVE', 'PENDING_APPROVAL', 'DROPOUT', 'ARCHIVED'].map(s => (
             <button key={s} onClick={() => setStatusFilter(s)}
               className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                 statusFilter === s ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
               }`}>
               {s.replace('_', ' ')}
             </button>
           ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="p-20 text-center animate-pulse text-slate-300">
             <Users size={64} className="mx-auto mb-4 opacity-20" />
             <p className="font-bold whitespace-nowrap uppercase tracking-widest text-xs opacity-50">Syncing Directory...</p>
          </div>
        ) : error ? (
          <div className="p-20 text-center text-rose-500">
             <AlertTriangle size={32} className="mx-auto mb-2" />
             <p className="font-bold">Failed to load data</p>
             <p className="text-sm opacity-60">{error}</p>
          </div>
        ) : students && students.length === 0 ? (
          <div className="p-20 text-center text-slate-400">
             <Users size={64} className="mx-auto mb-4 opacity-10" />
             <p className="font-bold text-slate-900">No students found</p>
             <p className="text-sm">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/50 border-b border-gray-100">
              <tr>
                 <th className="px-6 py-4 w-10">
                    <input type="checkbox" onChange={(e) => {
                       if (e.target.checked) setSelectedIds(students?.map(s => s.id) || []);
                       else setSelectedIds([]);
                    }} />
                 </th>
                 <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">Admission</th>
                 <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">Student Name</th>
                 <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">Context</th>
                 <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">Mapping</th>
                 <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-tighter text-[10px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students?.map((s) => (
                <tr key={s.id} className={`hover:bg-blue-50/30 transition-colors group ${selectedIds.includes(s.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-6 py-4">
                     <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleSelect(s.id)} />
                  </td>
                  <td className="px-6 py-4">
                     <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md group-hover:bg-white transition-colors border border-transparent group-hover:border-slate-200">
                       {s.admission_number}
                     </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900">
                    <Link href={`/students/${s.id}`} className="hover:text-blue-600 transition-colors">
                      {s.first_name} {s.last_name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
                       <Building2 size={10} />
                       {s.branch_name || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 italic">
                    {s.class_section_display || 'Unassigned'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                      s.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 
                      s.status === 'PENDING_APPROVAL' ? 'bg-blue-50 text-blue-700' :
                      s.status === 'DROPOUT' ? 'bg-red-50 text-red-600' :
                      s.status === 'ARCHIVED' ? 'bg-amber-50 text-amber-800' :
                      s.status === 'TRANSFERRED' ? 'bg-purple-50 text-purple-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CSV Import Modal */}
      <CsvImportModal 
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => refetch()}
        branchId={selectedBranch}
      />

      {/* Centered Modal for Enrollment */}
      <Modal 
        isOpen={showDrawer} 
        onClose={() => setShowDrawer(false)} 
        title="Student Enrollment"
        maxWidth="5xl"
      >
        <div className="p-8">
          <div className="bg-blue-50/50 p-6 rounded-3xl mb-8 border border-blue-100 flex gap-4 items-center">
             <div className="bg-blue-100 p-3 rounded-2xl">
               <ShieldCheck size={24} className="text-blue-700" />
             </div>
             <div>
                <h4 className="text-base font-bold text-blue-900">Authenticated Admission</h4>
                <p className="text-sm text-blue-700 opacity-80 mt-0.5">All data entered here automatically links to the selected branch and initiates the financial lifecycle.</p>
             </div>
          </div>
          <StudentForm
            onSubmit={handleEnroll}
            onCancel={() => setShowDrawer(false)}
            requireParentEmails={false}
            submitLabel="Submit"
          />
        </div>
      </Modal>

      {/* Bulk Actions */}
      <FloatingActionBar 
        count={selectedIds.length}
        onClear={() => setSelectedIds([])}
        actions={[
          { label: 'Bulk ID Generation', icon: Receipt, onClick: generateBulkIdCards },
          { label: 'Mark Dropout', icon: UserMinus, variant: 'danger' as const, onClick: async () => {
            const reason = prompt('Enter dropout reason for selected students:');
            if (!reason) return;
            let success = 0;
            for (const sid of selectedIds) {
              try {
                await api.post(`/student-lifecycle/${sid}/dropout/`, { reason });
                success++;
              } catch (err: any) {
                toast.error(`Failed for student: ${err.response?.data?.error || 'Unknown error'}`);
              }
            }
            if (success > 0) {
              toast.success(`${success} student(s) marked as dropout.`);
              setSelectedIds([]);
              refetch();
            }
          }},
          { label: 'Archive Selected', icon: Trash2, variant: 'danger' as const, onClick: async () => {
            if (selectedIds.length === 0) return;
            const reason = window.prompt('Reason for archiving (optional):') ?? '';
            if (reason === null) return;
            try {
              const res = await api.post('students/bulk-archive/', {
                student_ids: selectedIds,
                reason: reason.trim() || 'Archived',
              });
              const n = res.data?.archived_count ?? 0;
              toast.success(n > 0 ? `${n} student(s) archived.` : 'No students were archived (check selection or permissions).');
              setSelectedIds([]);
              refetch();
            } catch (err: any) {
              toast.error(err.response?.data?.error || err.response?.data?.detail || 'Archive failed.');
            }
          } },
        ]}
      />
    </div>
  );
}
