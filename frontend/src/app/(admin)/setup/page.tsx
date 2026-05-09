"use client";

import React, { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import DateInput from '@/components/DateInput';
import { 
  Settings, Calendar, Building2, BookOpen, 
  Receipt, CheckCircle2, XCircle, Clock, AlertTriangle,
  Layers, Tag, IndianRupee, Plus as CustomPlus, Trash2, Edit2, Truck, CheckCircle2 as CheckCircle 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useConfirm } from '@/components/common/ConfirmProvider';

type TabType = 'school' | 'years' | 'branches' | 'classes' | 'subjects';

export default function SetupPage() {
  const [activeTab, setActiveTab] = useState<TabType>('school');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    api.get('auth/me/').then(res => setUser(res.data.data));
  }, []);
  
  const tabs = [
    { id: 'school', label: 'School Settings', icon: Settings, roles: ['SUPER_ADMIN'] },
    { id: 'years', label: 'Academic Years', icon: Calendar, roles: ['SUPER_ADMIN'] },
    { id: 'branches', label: 'Branches', icon: Layers, roles: ['SUPER_ADMIN'] },
    { id: 'subjects', label: 'Subjects', icon: Tag, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
    { id: 'classes', label: 'Class & Fees', icon: BookOpen, roles: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
  ].filter(t => user && t.roles.includes(user.role));

  useEffect(() => {
    // If current tab is not allowed for user role, switch to the first allowed tab
    if (user && !tabs.find(t => t.id === activeTab)) {
      setActiveTab(tabs[0]?.id as TabType || 'school');
    }
  }, [user, activeTab]);

  if (!user) return <div className="p-8">Loading profile...</div>;

  if (!['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="bg-red-50 p-4 rounded-full mb-4">
          <XCircle className="text-red-500" size={48} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-2">You do not have permission to access setup.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">School Setup</h1>
          <p className="text-gray-500 text-sm mt-1">Configure your school structure and fee settings</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[50vh]">
        {activeTab === 'school' && <SchoolSettings />}
        {activeTab === 'years' && <AcademicYearManager />}
        {activeTab === 'branches' && <BranchManager />}
        {activeTab === 'subjects' && <SubjectManager />}
        {activeTab === 'classes' && <ClassAndFeeSetup user={user} />}
      </div>
    </div>
  );
}
function SchoolSettings() {
  const { data: tenant, refetch } = useApi<any>('/tenants/me/');
  const [formData, setFormData] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name,
        logo_url: tenant.logo_url || '',
        admission_no_format: tenant.admission_no_format || 'YEAR_BRANCH_SEQ',
        admission_no_prefix: tenant.admission_no_prefix || ''
      });
    }
  }, [tenant]);

  const formats = [
    { id: 'YEAR_BRANCH_SEQ', label: 'YEAR/BRANCH/001' },
    { id: 'BRANCH_YEAR_SEQ', label: 'BRANCH/YEAR/001' },
    { id: 'YEAR_SEQ', label: 'YEAR/001' },
    { id: 'PREFIX_SEQ', label: 'PREFIX-001' },
  ];

  const getPreview = (fmt: string, pref: string) => {
    const yr = new Date().getFullYear();
    const code = "CODE";
    if (fmt === 'YEAR_BRANCH_SEQ') return `${yr}/${code}/001`;
    if (fmt === 'BRANCH_YEAR_SEQ') return `${code}/${yr}/001`;
    if (fmt === 'YEAR_SEQ') return `${yr}/001`;
    if (fmt === 'PREFIX_SEQ') return `${pref || 'STU'}-001`;
    return '---';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { ...payload } = formData;
      await api.patch('tenants/me/', payload);
      refetch();
      toast.success("Settings saved successfully");
    } catch (err) { toast.error("Error saving settings"); }
    finally { setSaving(false); }
  };

  if (!formData) return <div className="p-8 text-gray-500 font-medium animte-pulse">Loading settings...</div>;

  return (
    <div className="w-full bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left Side: Configuration */}
        <div className="flex-1 space-y-8">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Organization Settings</h2>
            <p className="text-gray-400 text-xs font-medium leading-relaxed max-w-lg">
              Manage organization-wide enrollment rules for sequential student indexing across all branches.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">School Name</label>
                <input 
                  placeholder="e.g. Global Minds School" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl text-xs font-bold focus:ring-4 focus:ring-blue-100 outline-none" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Logo URL</label>
                <input 
                  placeholder="https://example.com/logo.png" 
                  value={formData.logo_url}
                  onChange={e => setFormData({...formData, logo_url: e.target.value})}
                  className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl text-xs font-bold focus:ring-4 focus:ring-blue-100 outline-none" 
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] px-1">Enrollment Format</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {formats.map(f => (
                      <button
                          key={f.id}
                          type="button"
                          onClick={() => setFormData({...formData, admission_no_format: f.id})}
                          className={`flex items-center justify-between px-5 py-3 rounded-xl border-2 transition-all text-left ${
                              formData.admission_no_format === f.id 
                              ? 'border-blue-600 bg-blue-50/30' 
                              : 'border-gray-50 hover:border-gray-100 bg-white'
                          }`}
                      >
                          <span className={`text-xs font-bold ${formData.admission_no_format === f.id ? 'text-blue-700' : 'text-gray-500'}`}>
                              {f.label}
                          </span>
                          {formData.admission_no_format === f.id && <CheckCircle size={14} className="text-blue-600" />}
                      </button>
                  ))}
              </div>
            </div>

            {formData.admission_no_format === 'PREFIX_SEQ' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Sequence Prefix</label>
                  <input placeholder="e.g. SGM" value={formData.admission_no_prefix}
                  onChange={e => setFormData({...formData, admission_no_prefix: e.target.value})}
                  className="w-full max-w-xs px-5 py-3 bg-gray-50 border-none rounded-xl text-xs font-bold focus:ring-4 focus:ring-blue-100 outline-none" />
              </div>
            )}

            <button type="submit" disabled={saving} 
              className="px-8 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50 active:scale-[0.98]">
              {saving ? 'Updating...' : 'Save Configuration'}
            </button>
          </form>
        </div>

        {/* Right Side: Preview Card */}
        <div className="lg:w-80 flex flex-col justify-start pt-2">
            <div className="relative overflow-hidden bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/10 rounded-full -mr-12 -mt-12 blur-2xl"></div>
                
                <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-500/20 p-1.5 rounded-lg"><Tag size={12} className="text-blue-400"/></div>
                        <p className="text-[9px] uppercase font-black text-slate-500 tracking-[0.15em]">Live ID Preview</p>
                    </div>
                    
                    <div className="space-y-1">
                        <p className="text-2xl font-mono font-black text-white tracking-tight">
                            {getPreview(formData.admission_no_format, formData.admission_no_prefix)}
                        </p>
                        <p className="text-[10px] text-slate-500 font-medium">Auto-increments organization-wide</p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/50 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Active System</p>
                    </div>
                </div>
            </div>
            
            <div className="mt-4 p-4 rounded-2xl bg-amber-50/50 border border-amber-100">
                <p className="text-[10px] text-amber-700 leading-normal font-medium">
                    <b>Note:</b> Changing the format will affect all future enrollments across all current and future branches.
                </p>
            </div>
        </div>

      </div>
    </div>
  );
}


function AcademicYearManager() {
  const { data, loading, error, refetch } = useApi<any[]>('/tenants/academic-years/');
  const { data: branches } = useApi<any[]>('/tenants/branches/');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', start_date: '', end_date: '', is_active: true
  });
  const [saving, setSaving] = useState(false);

  const handleEdit = (ay: any) => {
    setFormData({ 
      name: ay.name, 
      start_date: ay.start_date, 
      end_date: ay.end_date, 
      is_active: ay.is_active
    });
    setEditingId(ay.id);
    setShowForm(true);
  };

  const handleClone = async (targetId: string) => {
    const sourceYearName = prompt("Enter the Name of the Source Academic Year to clone from (e.g. 2024-2025):");
    if (!sourceYearName) return;
    
    const sourceYear = data?.find(y => y.name === sourceYearName);
    if (!sourceYear) { toast.error("Source Academic Year not found"); return; }
    
    setSaving(true);
    try {
      await api.post(`/tenants/academic-years/${targetId}/clone-setup/`, { source_year_id: sourceYear.id });
      toast.success("Setup cloned successfully! Classes and Fees have been replicated.");
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Error cloning setup");
    } finally { setSaving(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.start_date || !formData.end_date) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/tenants/academic-years/${editingId}/`, formData);
      } else {
        await api.post('tenants/academic-years/', formData);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', start_date: '', end_date: '', is_active: true });
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error saving academic year');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => {
          setShowForm(!showForm);
          if (showForm) { setEditingId(null); setFormData({ name: '', start_date: '', end_date: '', is_active: true }); }
        }}
          className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2">
          {showForm ? 'Cancel' : 'Add Academic Year'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 px-1">AY Name (e.g. 2025-2026)</label>
              <input placeholder="2025-2026" value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <DateInput
              label="Start Date"
              required
              value={formData.start_date}
              onChange={val => setFormData({...formData, start_date: val})}
              className="space-y-1"
            />
            <DateInput
              label="End Date"
              required
              value={formData.end_date}
              onChange={val => setFormData({...formData, end_date: val})}
              className="space-y-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
            <label className="text-sm text-gray-700 font-medium">Set as Active Year</label>
          </div>
          <button type="submit" disabled={saving}
            className="w-full md:w-auto bg-blue-600 text-white px-8 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 shadow-md">
            {saving ? 'Saving...' : (editingId ? 'Update Academic Year' : 'Create Academic Year')}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data?.map((ay) => (
          <div key={ay.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 text-lg">{ay.name}</h3>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${ay.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {ay.is_active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <div className="text-sm text-gray-500 space-y-1 font-medium mb-4">
              <p>Period: {ay.start_date} to {ay.end_date}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(ay)} className="flex-1 py-2 bg-gray-50 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors border border-gray-100">
                Edit
              </button>
              <button onClick={() => handleClone(ay.id)} className="flex-1 py-2 bg-purple-50 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors border border-purple-100 flex items-center justify-center gap-1">
                <Layers size={14} /> Clone Setup
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BranchManager() {
  const { confirm } = useConfirm();
  const { data, refetch } = useApi<any[]>('/tenants/branches/');
  const { data: zones, refetch: refetchZones } = useApi<any[]>('/tenants/zones/');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '', branch_code: '', address: '', is_active: true, zone: '',
  });

  const resetForm = () => {
    setFormData({ name: '', branch_code: '', address: '', is_active: true, zone: '' });
    setEditingBranchId(null);
    setShowForm(false);
  };

  const handleCreateZone = async () => {
    const name = prompt('Enter zone name (e.g. North Zone):', 'Zone 1');
    if (!name?.trim()) return;
    try {
      await api.post('tenants/zones/', { name: name.trim(), is_active: true });
      toast.success('Zone created');
      refetchZones();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not create zone');
    }
  };

  const handleEditZone = async (zone: any) => {
    const name = prompt('Edit zone name:', zone.name || '');
    if (!name?.trim() || name.trim() === zone.name) return;
    try {
      await api.patch(`tenants/zones/${zone.id}/`, { name: name.trim() });
      toast.success('Zone updated');
      refetchZones();
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not update zone');
    }
  };

  const handleDeleteZone = async (zone: any) => {
    const ok = await confirm({
      title: 'Delete Zone',
      message: `Delete zone "${zone.name}"? Branches in this zone will become unassigned.`,
      isDestructive: true,
      confirmText: 'Delete Zone',
    });
    if (!ok) return;
    try {
      await api.delete(`tenants/zones/${zone.id}/`);
      toast.success('Zone deleted');
      refetchZones();
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not delete zone');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.branch_code?.trim()) {
      toast.error('Branch name and code are required');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        branch_code: formData.branch_code.trim().toUpperCase(),
        address: formData.address,
        is_active: formData.is_active,
      };
      if (formData.zone) payload.zone = formData.zone;

      if (editingBranchId) {
        await api.patch(`tenants/branches/${editingBranchId}/`, payload);
        toast.success('Branch updated');
      } else {
        await api.post('tenants/branches/', payload);
        toast.success('Branch created');
      }
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error saving branch');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (branch: any) => {
    setEditingBranchId(branch.id);
    setFormData({
      name: branch.name || '',
      branch_code: branch.branch_code || '',
      address: branch.address || '',
      is_active: !!branch.is_active,
      zone: branch.zone || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (branch: any) => {
    const ok = await confirm({
      title: 'Delete Branch',
      message: `Delete branch "${branch.name}" permanently? This removes linked data by cascade rules and cannot be undone.`,
      isDestructive: true,
      confirmText: 'Delete Branch',
    });
    if (!ok) return;

    try {
      await api.delete(`tenants/branches/${branch.id}/`);
      toast.success('Branch deleted');
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to delete branch');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={handleCreateZone}
          className="bg-violet-100 text-violet-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-violet-200 transition-colors"
        >
          + Add Zone
        </button>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          {showForm ? 'Cancel' : <><CustomPlus size={16} /> Add Branch</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 px-1">Branch Name</label>
              <input
                placeholder="e.g. Hyderabad Main"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 px-1">Branch Code</label>
              <input
                placeholder="e.g. HYD001"
                value={formData.branch_code}
                onChange={e => setFormData({ ...formData, branch_code: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 px-1">Address</label>
              <input
                placeholder="Branch address (optional)"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 px-1">Zone</label>
              <select
                value={formData.zone}
                onChange={e => setFormData({ ...formData, zone: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
              >
                <option value="">Unassigned</option>
                {zones?.map((z: any) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                />
                Branch active
              </label>
            </div>
          </div>

          <button type="submit" disabled={saving} className="bg-slate-900 text-white px-8 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
            {saving ? 'Saving...' : editingBranchId ? 'Update Branch' : 'Create Branch'}
          </button>
        </form>
      )}

      {!!zones?.length && (
        <div className="bg-white p-4 rounded-xl border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">Zones</p>
          <div className="flex flex-wrap gap-2">
            {zones.map((z: any) => (
              <div key={z.id} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                <span>{z.name}</span>
                <button
                  type="button"
                  onClick={() => handleEditZone(z)}
                  className="rounded-full p-0.5 hover:bg-violet-100"
                  title="Edit zone"
                >
                  <Edit2 size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteZone(z)}
                  className="rounded-full p-0.5 hover:bg-rose-100 hover:text-rose-700"
                  title="Delete zone"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data?.map((branch) => (
          <div key={branch.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-50 p-2.5 rounded-xl text-blue-600"><Building2 size={20} /></div>
                <div>
                  <h3 className="font-bold text-gray-900">{branch.name}</h3>
                  <p className="text-xs text-gray-500 font-medium">{branch.branch_code}</p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${branch.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {branch.is_active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <div className="space-y-1 mb-3">
              <p className="text-xs text-blue-600 font-bold">Zone: {branch.zone_name || 'Unassigned'}</p>
              {branch.address && <p className="text-xs text-gray-500">{branch.address}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => openEdit(branch)}
                className="flex-1 py-2 bg-gray-50 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 border border-gray-100 flex items-center justify-center gap-1"
              >
                <Edit2 size={13} /> Edit
              </button>
              <button
                onClick={() => handleDelete(branch)}
                className="flex-1 py-2 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-100 border border-rose-100 flex items-center justify-center gap-1"
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassAndFeeSetup({ user }: { user: any }) {
  const { confirm } = useConfirm();
  const canEditAdmissionFee = user && ['SUPER_ADMIN', 'OWNER'].includes(user.role);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedAY, setSelectedAY] = useState('');
  const { data: branches } = useApi<any[]>('/tenants/branches/');
  const { data: years, refetch: refetchYears } = useApi<any[]>('/tenants/academic-years/');
  const { data: categories, refetch: refetchCategories } = useApi<any[]>('/fees/categories/');
  
  const { data: classes, loading, refetch } = useApi<any[]>(
    selectedBranch && selectedAY ? `/classes/?branch_id=${selectedBranch}&academic_year_id=${selectedAY}` : null
  );

  const { data: structures, refetch: refetchStructures } = useApi<any[]>(
    selectedBranch && selectedAY ? `/fees/structures/?branch_id=${selectedBranch}&academic_year_id=${selectedAY}` : null
  );

  const { data: slabs, refetch: refetchSlabs } = useApi<any[]>(
    selectedBranch ? `/transport/rate-slabs/?branch_id=${selectedBranch}` : null
  );

  const { data: admissionConfig, refetch: refetchAdmissionConfig } = useApi<any>(
    selectedBranch && selectedAY
      ? `tenants/branches/${selectedBranch}/admission-fee/?academic_year_id=${selectedAY}`
      : null
  );
  const [admissionFeeInput, setAdmissionFeeInput] = useState('0');

  useEffect(() => {
    if (branches?.length && !selectedBranch) setSelectedBranch(branches[0].id);
    if (years?.length && !selectedAY) setSelectedAY(years.find(y => y.is_active)?.id || years[0].id);
  }, [branches, years]);

  useEffect(() => {
    if (admissionConfig && typeof admissionConfig.amount !== 'undefined') {
      setAdmissionFeeInput(String(admissionConfig.amount));
    }
  }, [admissionConfig, selectedBranch, selectedAY]);

  const grades = [
    'NURSERY','LKG','UKG','1','2','3','4','5','6','7','8','9','10',
    '11_SCIENCE','11_COMMERCE','11_ARTS','12_SCIENCE','12_COMMERCE','12_ARTS'
  ];

  const handleCreateClass = async () => {
    const grade = prompt("Enter Grade (e.g. 1, 2, NURSERY):", "1");
    if (!grade) return;
    try {
      await api.post('classes/', { grade, section: 'A', branch: selectedBranch, academic_year: selectedAY, max_capacity: 40 });
      refetch();
    } catch (err) { toast.error("Error creating class"); }
  };

  const handleEditGrade = async (grade: string) => {
    const newGrade = prompt(`Edit Grade Name for ${grade}:`, grade);
    if (!newGrade || newGrade === grade) return;
    
    const gradeClasses = classes?.filter(c => c.grade === grade) || [];
    try {
      await Promise.all(gradeClasses.map(c => api.patch(`classes/${c.id}/`, { grade: newGrade })));
      // Update fee structure name and grade
      const structure = structures?.find(s => s.grade === grade);
      if (structure) {
        await api.patch(`fees/structures/${structure.id}/`, { grade: newGrade, name: `Fees for ${newGrade}` });
      }
      toast.success("Grade updated successfully");
      refetch();
      refetchStructures();
    } catch (err) {
      toast.error("Error updating grade");
    }
  };

  const handleDeleteGrade = async (grade: string) => {
    const isConfirmed = await confirm({
      title: "Delete Grade",
      message: `Are you sure you want to delete Grade ${grade}? This will also remove its classes and fee structures.`,
      isDestructive: true
    });
    
    if (isConfirmed) {
      const gradeClasses = classes?.filter(c => c.grade === grade) || [];
      try {
        await Promise.all(gradeClasses.map(c => api.delete(`classes/${c.id}/`)));
        const structure = structures?.find(s => s.grade === grade);
        if (structure) {
          await api.delete(`fees/structures/${structure.id}/`);
        }
        toast.success("Grade deleted successfully");
        refetch();
        refetchStructures();
      } catch (err) {
        toast.error("Error deleting grade");
      }
    }
  };

  // ─── Transport Rate Slab Handler (uses dedicated transport/rate-slabs/ API) ───
  const handleUpdateTransportSlab = async (label: string, minKm: number, maxKm: number, existingSlab: any) => {
    const amount = prompt(`Enter monthly rate for ${label}:`, existingSlab?.monthly_rate?.toString() || '0');
    if (amount === null) return;
    const rate = parseFloat(amount);
    if (isNaN(rate) || rate < 0) { toast.error('Please enter a valid amount'); return; }

    try {
      if (existingSlab) {
        await api.patch(`transport/rate-slabs/${existingSlab.id}/`, { monthly_rate: rate });
      } else {
        await api.post('transport/rate-slabs/', {
          branch: selectedBranch,
          min_km: minKm,
          max_km: maxKm,
          monthly_rate: rate,
        });
      }
      toast.success('Transport rate updated!');
      refetchSlabs();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error updating transport rate slab');
    }
  };

  const findClassFeeCategory = (allCategories: any[] | null | undefined, branchId: string) => {
    if (!Array.isArray(allCategories)) return null;
    return (
      allCategories.find(
        c => c.branch === branchId && (c.code === 'CLASS_FEE' || c.code === 'TUITION')
      ) ||
      allCategories.find(
        c =>
          c.branch === branchId &&
          (c.name?.toLowerCase().includes('class fee') || c.name?.toLowerCase().includes('tuition'))
      ) ||
      null
    );
  };

  // ─── Class Fee Handler (uses fees/structures/ API) ───
  const handleUpdateFee = async (
    grade: string,
    currentActualAmount: number,
    currentLockedAmount: number
  ) => {
    const amount = prompt(`Enter actual fee for Grade ${grade}:`, currentActualAmount.toString());
    if (amount === null) return;
    const lockedAmount = prompt(
      `Enter locked fee for Grade ${grade}:`,
      currentLockedAmount.toString()
    );
    if (lockedAmount === null) return;

    try {
      // Find or Auto-Create Class Fee category if missing
      let cat = findClassFeeCategory(categories, selectedBranch);
      
      if (!cat) {
        const newCatRes = await api.post('fees/categories/', {
          name: 'Class Fee',
          code: 'CLASS_FEE',
          branch: selectedBranch,
          description: 'Automatically created class fee category'
        });
        cat = newCatRes.data;
        await refetchCategories?.();
      }

      // Get or Create Fee Structure — backend wraps as {success, data}
      let structRes = await api.get(`/fees/structures/?branch_id=${selectedBranch}&academic_year_id=${selectedAY}&grade=${grade}`);
      const structList = structRes.data?.data ?? structRes.data?.results ?? structRes.data;
      const existingStruct = Array.isArray(structList) ? structList[0] : null;
      let structureId = existingStruct?.id;

      if (!structureId) {
        const createRes = await api.post('fees/structures/', {
          branch: selectedBranch, academic_year: selectedAY, grade, name: `Fees for ${grade}`
        });
        structureId = createRes.data.id;
      }

      // Update or create item
      const existingItem = (existingStruct?.items || []).find((i: any) => i.category === cat.id);
      if (existingItem) {
        await api.patch(`/fees/structure-items/${existingItem.id}/`, {
          amount,
          locked_amount: lockedAmount,
        });
      } else {
        await api.post(`/fees/structures/${structureId}/items/`, {
          category: cat.id,
          amount,
          locked_amount: lockedAmount,
          frequency: 'ANNUALLY',
        });
      }
      toast.success("Fee updated!");
      refetch();
      refetchStructures();
    } catch (err: any) { 
      toast.error(err.response?.data?.detail || "Error updating fee. Check console for details."); 
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1">Branch</label>
          <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none">
            {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1">Academic Year</label>
          <select value={selectedAY} onChange={e => setSelectedAY(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none">
            {years?.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={handleCreateClass} className="w-full bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 flex items-center justify-center gap-2">
            <CustomPlus size={16} /> Add Grade/Class
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-50 rounded-xl text-amber-700">
            <IndianRupee size={22} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">One-time admission fee</h3>
            <p className="text-xs text-gray-500 mt-1">
              Shown when enrolling a new student. Not part of grade fee structure totals (e.g. not included in the
              annual tuition figure).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1 flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Amount (₹)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={admissionFeeInput}
              onChange={(e) => setAdmissionFeeInput(e.target.value)}
              disabled={!canEditAdmissionFee}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await api.patch(`tenants/branches/${selectedBranch}/admission-fee/`, {
                  academic_year_id: selectedAY,
                  amount: admissionFeeInput,
                });
                toast.success('Admission fee saved for this branch and year.');
                refetchAdmissionConfig();
              } catch (err: any) {
                toast.error(err.response?.data?.detail || 'Could not save admission fee');
              }
            }}
            disabled={!selectedBranch || !selectedAY || !canEditAdmissionFee}
            className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
          >
            Save admission fee
          </button>
        </div>
      </div>

            {/* Branch Transport Section */}
            <div className="mb-8 border border-blue-100 bg-blue-50/5 rounded-3xl overflow-hidden shadow-xl shadow-blue-900/5">
              <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold flex items-center gap-2 text-lg">
                    <Truck size={20} />
                    Branch-wide Transport Fees
                  </h3>
                  <p className="text-blue-100 text-[10px] mt-1 font-medium">Standard KM-based rates applicable to all students in this branch</p>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: '0-2 KM', minKm: 0, maxKm: 2 },
                  { label: '2-5 KM', minKm: 2, maxKm: 5 },
                  { label: '5-10 KM', minKm: 5, maxKm: 10 },
                  { label: '10+ KM', minKm: 10, maxKm: 50 },
                ].map(tier => {
                  const slab = slabs?.find((s: any) => Number(s.min_km) === tier.minKm && Number(s.max_km) === tier.maxKm);
                  return (
                    <div key={tier.label} className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm hover:shadow-md transition-all group">
                      <div className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-3">({tier.label})</div>
                      <div className="flex items-center justify-between">
                        {slab ? (
                          <div className="flex flex-col">
                            <span className="text-xl font-black text-gray-900 leading-none">₹{Number(slab.monthly_rate).toLocaleString('en-IN')}</span>
                            <button onClick={() => handleUpdateTransportSlab(tier.label, tier.minKm, tier.maxKm, slab)} className="text-[10px] text-blue-600 font-bold mt-2 hover:underline text-left">Change Rate</button>
                          </div>
                        ) : (
                          <button onClick={() => handleUpdateTransportSlab(tier.label, tier.minKm, tier.maxKm, null)} className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl text-xs font-black hover:bg-blue-100 transition-colors uppercase">Set Rate</button>
                        )}
                        {slab && <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform"><CheckCircle size={20} /></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Class Fees Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Grade</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Sections</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Actual Fee</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest">Locked Fee</th>
                    <th className="px-6 py-4 text-right text-xs font-black text-gray-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Loading configuration...</td></tr>
            ) : (!classes || classes.length === 0) ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">No classes configured for this year. Click "Add Grade" to start.</td></tr>
            ) : (
              // Group classes by grade
              Array.from(new Set(classes.map(c => c.grade))).map(grade => {
                const gradeClasses = classes.filter(c => c.grade === grade);
                const structure = structures?.find(s => s.grade === grade);
                
                const classFeeCategory = findClassFeeCategory(categories, selectedBranch);
                const classFeeItem = classFeeCategory
                  ? structure?.items?.find((i: any) => i.category === classFeeCategory.id)
                  : structure?.items?.[0];

                return (
                  <tr key={grade} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-black">{grade}</div>
                        <span className="font-bold text-gray-900">Grade {grade}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {gradeClasses.map(c => (
                          <span key={c.id} className="px-2 py-1 bg-gray-100 rounded text-[10px] font-bold text-gray-600 whitespace-nowrap">{c.section}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {classFeeItem ? (
                        <div className="flex items-center gap-2">
                          <span>₹{Number(classFeeItem.amount).toLocaleString('en-IN')}</span>
                          <button
                            onClick={() =>
                              handleUpdateFee(
                                grade,
                                Number(classFeeItem.amount || 0),
                                Number(classFeeItem.locked_amount ?? classFeeItem.amount ?? 0)
                              )
                            }
                            className="text-blue-600 text-xs hover:underline"
                          >
                            Edit
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleUpdateFee(grade, 0, 0)}
                          className="text-blue-600 hover:underline"
                        >
                          Set Fees
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {classFeeItem ? `₹${Number(classFeeItem.locked_amount ?? classFeeItem.amount).toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button onClick={() => handleEditGrade(grade)} title="Rename Grade" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDeleteGrade(grade)} title="Delete Grade" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-yellow-50 p-6 rounded-3xl border border-yellow-100 flex gap-4">
        <AlertTriangle className="text-yellow-600 flex-shrink-0" size={24} />
        <div>
          <h4 className="font-bold text-yellow-900">Unified Configuration</h4>
          <p className="text-sm text-yellow-800 mt-1 leading-relaxed">
            Fees defined here apply to all sections within the grade. Configure actual fee and locked fee per class for approval routing.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeeApprovalManager() {
  const { data, loading, refetch } = useApi<any[]>('/fees/approvals/');
  const [actioning, setActioning] = useState<string | null>(null);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    const remarks = prompt(`Remarks for ${action}:`);
    if (remarks === null) return;
    setActioning(id);
    try {
      await api.post(`/fees/approvals/${id}/${action}/`, { remarks });
      refetch();
    } catch (err) { toast.error('Error processing request'); } finally { setActioning(null); }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {loading ? (
        <div className="p-12 text-center text-gray-400">Loading requests...</div>
      ) : data?.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-gray-100 text-center">
          <Clock className="mx-auto text-gray-200 mb-4" size={48} />
          <p className="text-gray-400 font-medium">No pending fee approvals</p>
        </div>
      ) : (
        data?.filter(r => r.status === 'PENDING').map((req) => (
          <div key={req.id} className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 text-lg">{req.student_name}</h3>
              <p className="text-sm text-gray-500 font-medium">{req.branch_name} • Requested by {req.requested_by_name}</p>
              {(req.academic_year_name || req.class_section_display) ? (
                <p className="text-xs text-gray-600 mt-1">
                  {req.academic_year_name ? <><span className="font-semibold text-gray-700">Academic year:</span> {req.academic_year_name}</> : null}
                  {req.academic_year_name && req.class_section_display ? ' · ' : null}
                  {req.class_section_display ? <><span className="font-semibold text-gray-700">Class:</span> {req.class_section_display}</> : null}
                </p>
              ) : null}
              <div className="mt-3 inline-block px-3 py-1 bg-yellow-50 text-yellow-700 text-[10px] font-black rounded-lg border border-yellow-100">PENDING APPROVAL</div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Offered Fee</p>
              <p className="text-2xl font-black text-slate-900">₹{Number(req.offered_total).toLocaleString('en-IN')}</p>
              <p className="text-xs text-gray-400 line-through">₹{Number(req.standard_total).toLocaleString('en-IN')}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleAction(req.id, 'approve')} disabled={actioning === req.id} className="bg-green-600 text-white px-5 py-2.5 rounded-2xl text-sm font-bold hover:bg-green-700">Approve</button>
              <button onClick={() => handleAction(req.id, 'reject')} disabled={actioning === req.id} className="bg-red-50 text-red-600 px-5 py-2.5 rounded-2xl text-sm font-bold hover:bg-red-100">Reject</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SubjectManager() {
  const { data: subjects, refetch, loading } = useApi('subjects/?assigned_only=false');
  const { data: branches } = useApi('branches/');
  const { confirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', code: '', branch: '' });
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    api.get('auth/me/').then(res => {
      const u = res.data.data;
      setUser(u);
      if (u.branch_id) setFormData(prev => ({ ...prev, branch: u.branch_id }));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) {
      toast.error("Name and Code are required");
      return;
    }
    setSaving(true);
    try {
      // If branch is "ALL", it means "All Branches" which the backend handles as null
      const payload = { 
        ...formData, 
        branch: formData.branch === "ALL" ? null : formData.branch 
      };
      await api.post('subjects/', payload);
      setShowForm(false);
      setFormData({ name: '', code: '', branch: user?.branch_id || '' });
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error creating subject');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm({
      title: "Delete Subject",
      message: "Are you sure you want to delete this subject?",
      isDestructive: true
    });
    if (!isConfirmed) return;
    
    try {
      await api.delete(`subjects/${id}/`);
      refetch();
    } catch (err) {
      toast.error("Error deleting subject. It might be in use.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2">
          {showForm ? 'Cancel' : <><CustomPlus size={16} /> Add New Subject</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase px-1">Subject Name</label>
              <input required placeholder="e.g. Robotics" value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-4 focus:ring-blue-100 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase px-1">Subject Code</label>
              <input required placeholder="e.g. ROB" value={formData.code}
                onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-4 focus:ring-blue-100 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase px-1">Assign to Branch</label>
              <select required value={formData.branch} disabled={!!user?.branch_id}
                onChange={e => setFormData({...formData, branch: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-4 focus:ring-blue-100 outline-none disabled:opacity-50">
                <option value="">Select Branch</option>
                {user?.role === 'SUPER_ADMIN' && <option value="ALL">--- All Branches ---</option>}
                {Array.isArray(branches) && branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving} className="bg-blue-600 text-white px-8 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50">
            {saving ? 'Creating...' : 'Register Subject'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
           [1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)
        ) : Array.isArray(subjects) && subjects.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400 font-medium bg-white rounded-3xl border border-gray-100">
            No subjects registered yet.
          </div>
        ) : (
          Array.isArray(subjects) && subjects.map((sub: any) => (
            <div key={sub.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-lg">
                    {sub.code}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 leading-tight">{sub.name}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                      {Array.isArray(branches) ? branches.find(b => b.id === sub.branch)?.name || 'Multiple Branches' : 'Multiple Branches'}
                    </p>
                  </div>
                </div>
                <button onClick={() => handleDelete(sub.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
