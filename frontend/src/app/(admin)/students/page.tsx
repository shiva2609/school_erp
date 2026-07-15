"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import api from '@/lib/axios';
import Link from 'next/link';
import { Plus, Search, Users, Filter, Receipt, Building2, UserPlus, CheckCircle, Trash2, ShieldCheck, AlertTriangle, UserMinus, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
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
  father_name: string | null;
  proposed_fee?: number;
}

interface ClassSection {
  id: string;
  display_name: string;
  grade: string;
  section: string;
}

interface PaginatedResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Student[];
}

const PAGE_SIZE = 50;

export default function StudentsPage() {
  const push = useResolvedPush();
  const { selectedBranch } = useBranch();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [classSectionFilter, setClassSectionFilter] = useState('');
  const [page, setPage] = useState(1);

  const [students, setStudents] = useState<Student[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classSections, setClassSections] = useState<ClassSection[]>([]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Fetch user info once
  useEffect(() => {
    api.get('auth/me/').then(res => setUser(res.data.data));
  }, []);

  const [activeAyId, setActiveAyId] = useState('');

  // Fetch active academic year
  useEffect(() => {
    api.get('tenants/academic-years/')
      .then(res => {
        const data = res.data?.data ?? res.data?.results ?? res.data ?? [];
        const active = data.find((y: any) => y.is_active);
        if (active) setActiveAyId(active.id);
      })
      .catch(() => {});
  }, []);

  // Fetch class sections for filter dropdown (scoped to branch and active year)
  useEffect(() => {
    if (!activeAyId && selectedBranch) return; // wait for active year if branch is selected? Actually wait for both to settle if possible, but let's just pass activeAyId when available.
    const params = new URLSearchParams();
    if (selectedBranch) params.set('branch_id', selectedBranch);
    if (activeAyId) params.set('academic_year_id', activeAyId);
    api.get(`classes/?${params.toString()}`)
      .then(res => {
        const data = res.data?.data ?? res.data?.results ?? res.data ?? [];
        setClassSections(Array.isArray(data) ? data : []);
      })
      .catch(() => setClassSections([]));
  }, [selectedBranch, activeAyId]);

  // Fetch students (paginated)
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      params.set('page', String(page));
      if (search) params.set('search', search);
      if (selectedBranch) params.set('branch_id', selectedBranch);
      if (classSectionFilter) params.set('class_section_id', classSectionFilter);

      const res = await api.get(`/students/?${params.toString()}`);
      const payload = res.data;

      // Handle both paginated { count, results } and wrapped { data: [...] } formats
      if (payload?.results !== undefined) {
        setStudents(payload.results);
        setTotalCount(payload.count ?? payload.results.length);
        setHasNext(!!payload.next);
        setHasPrev(!!payload.previous);
      } else if (payload?.data !== undefined) {
        const list = Array.isArray(payload.data) ? payload.data : [];
        setStudents(list);
        setTotalCount(list.length);
        setHasNext(false);
        setHasPrev(false);
      } else {
        const list = Array.isArray(payload) ? payload : [];
        setStudents(list);
        setTotalCount(list.length);
        setHasNext(false);
        setHasPrev(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, search, selectedBranch, classSectionFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, selectedBranch, classSectionFilter]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const startRecord = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endRecord = Math.min(page * PAGE_SIZE, totalCount);

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
      if (payload.roll_number === '' || payload.roll_number === undefined) {
        payload.roll_number = null;
      }
      const res = await api.post('/students/', payload);
      const row = res.data?.data ?? res.data;
      setShowDrawer(false);
      fetchStudents();
      if (row?.requires_admission_payment && row?.id) {
        toast.success('Student saved. Continue to admission fee payment.');
        push(`/students/${row.id}/pay-admission`);
        return;
      }
      toast.success('Student enrolled.');
    } catch (err: any) {
      console.error("Enrollment error:", err);
      let errMsg = err.response?.data?.detail;
      if (!errMsg && err.response?.data) {
        errMsg = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
      }
      if (!errMsg) {
        errMsg = err.message || 'Unknown error';
      }
      toast.error("Failed to enroll: " + errMsg);
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
           <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Student Directory</h1>
           <p className="text-slate-500 text-sm mt-1">Manage enrollments, academic mapping, and student lifecycle.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowImport(true)}
            className="btn btn-outline"
          >
            <Users size={16} className="text-brand-600" />
            Import CSV
          </button>
          <button 
            onClick={() => setShowDrawer(true)}
            className="btn btn-primary"
          >
            <UserPlus size={16} />
            Enroll Student
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
           <Search size={16} className="absolute left-3.5 top-2.5 text-slate-400" />
           <input 
             placeholder="Search by name or admission number..." 
             value={search}
             onChange={e => { setSearch(e.target.value); }}
             className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" 
           />
        </div>

        {/* Class/Section Filter */}
        <div className="relative min-w-[180px]">
          <BookOpen size={14} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
          <select
            value={classSectionFilter}
            onChange={e => setClassSectionFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white appearance-none text-slate-700"
          >
            <option value="">All Classes</option>
            {classSections.map(cs => (
              <option key={cs.id} value={cs.id}>{cs.display_name}</option>
            ))}
          </select>
          <ChevronRight size={13} className="absolute right-3 top-3 text-slate-400 pointer-events-none rotate-90" />
        </div>
        
        {/* Status Filter */}
        <div className="flex gap-1 bg-slate-100/50 p-1 rounded-lg border border-slate-200 overflow-x-auto scrollbar-hide">
           {['ALL', 'ACTIVE', 'PENDING_APPROVAL', 'INACTIVE', 'DROPOUT', 'ARCHIVED'].map(s => (
             <button key={s} onClick={() => setStatusFilter(s)}
               className={`px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all ${
                 statusFilter === s ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 border border-transparent'
               }`}>
               {s.replace('_', ' ')}
             </button>
           ))}
        </div>
      </div>

      {/* Table */}
      <div className="esms-card overflow-hidden min-h-[400px]">
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
        ) : students.length === 0 ? (
          <div className="p-20 text-center text-slate-400">
             <Users size={64} className="mx-auto mb-4 opacity-10" />
             <p className="font-bold text-slate-900">No students found</p>
             <p className="text-sm">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="esms-table-container">
            <table className="esms-table">
              <thead>
                <tr>
                   <th className="w-10">
                      <input type="checkbox" onChange={(e) => {
                         if (e.target.checked) setSelectedIds(students.map(s => s.id));
                         else setSelectedIds([]);
                      }} checked={selectedIds.length === students.length && students.length > 0} 
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                   </th>
                   <th>Admission</th>
                   <th>Student Name</th>
                   <th>Parent Name</th>
                   <th>Context</th>
                   <th>Mapping</th>
                   <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className={selectedIds.includes(s.id) ? 'esms-table-selected' : ''}>
                    <td>
                       <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleSelect(s.id)}
                       className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    </td>
                    <td>
                       <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">
                         {s.admission_number}
                       </span>
                    </td>
                    <td className="font-semibold text-slate-900">
                      <Link href={`/students/${s.id}`} className="hover:text-brand-600 transition-colors block">
                        {s.first_name} {s.last_name}
                      </Link>
                    </td>
                    <td className="text-slate-600 text-sm">
                      {s.father_name || '-'}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                         <Building2 size={12} />
                         {s.branch_name || 'N/A'}
                      </div>
                    </td>
                    <td className="text-slate-600 italic">
                      {s.class_section_display || 'Unassigned'}
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-tight ${
                        s.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                        s.status === 'PENDING_APPROVAL' ? 'bg-brand-50 text-brand-700 border border-brand-200' :
                        s.status === 'DROPOUT' ? 'bg-red-50 text-red-700 border border-red-200' :
                        s.status === 'ARCHIVED' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        s.status === 'TRANSFERRED' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                        'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && !error && students.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                Showing <span className="font-bold text-slate-700">{startRecord}–{endRecord}</span> of{' '}
                <span className="font-bold text-slate-700">{totalCount}</span> students
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!hasPrev}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 border border-gray-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={14} /> Previous
                </button>

                <div className="flex items-center gap-1">
                  {/* Show page numbers: first, last, and ±1 around current */}
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i < 5 ? i + 1 : i === 5 ? -1 : totalPages;
                    } else if (page >= totalPages - 3) {
                      pageNum = i === 0 ? 1 : i === 1 ? -1 : totalPages - 6 + i;
                    } else {
                      pageNum = i === 0 ? 1 : i === 1 ? -1 : i <= 4 ? page - 2 + (i - 2) : i === 5 ? -1 : totalPages;
                    }
                    if (pageNum === -1) {
                      return <span key={`ellipsis-${i}`} className="px-1 text-slate-400 text-xs">…</span>;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          page === pageNum
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!hasNext}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 border border-gray-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
        )}
      </div>

      {/* CSV Import Modal */}
      <CsvImportModal 
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => fetchStudents()}
        branchId={selectedBranch}
        requireExplicitBranch={['SUPER_ADMIN', 'OWNER', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN'].includes(
          user?.role
        )}
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
              fetchStudents();
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
              fetchStudents();
            } catch (err: any) {
              toast.error(err.response?.data?.error || err.response?.data?.detail || 'Archive failed.');
            }
          } },
          ...(statusFilter === 'ARCHIVED' && ['SUPER_ADMIN', 'OWNER'].includes(user?.role?.replace(' ', '_')?.toUpperCase() || user?.role) ? [{
            label: 'Permanently Delete', icon: AlertTriangle, variant: 'danger' as const, onClick: async () => {
              if (selectedIds.length === 0) return;
              if (!window.confirm(`Are you absolutely sure you want to PERMANENTLY DELETE ${selectedIds.length} archived student(s)? This will wipe all their fee and payment records forever.`)) return;
              let success = 0;
              for (const sid of selectedIds) {
                try {
                  await api.delete(`students/${sid}/hard-delete/`);
                  success++;
                } catch (err: any) {
                  toast.error(`Failed to delete student: ${err.response?.data?.error || err.response?.data?.detail || 'Unknown error'}`);
                }
              }
              if (success > 0) {
                toast.success(`${success} student(s) permanently deleted.`);
                setSelectedIds([]);
                fetchStudents();
              }
            }
          }] : []),
        ]}
      />
    </div>
  );
}
