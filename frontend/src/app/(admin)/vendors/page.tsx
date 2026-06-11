"use client";

import React, { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { Plus, Search, Edit2, Shield, AlertCircle, Building2, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';
import Modal from '@/components/common/Modal';

interface Vendor {
  id: string;
  vendor_type: 'INDIVIDUAL' | 'COMPANY';
  first_name?: string;
  last_name?: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  pan_number?: string;
  aadhaar?: string;
  is_active: boolean;
  category: 'GENERAL' | 'COMMUTE';
  associated_expense_types: string[];
}

export default function VendorsPage() {
  const { selectedBranch } = useBranch();
  const branchParam = selectedBranch ? `branch_id=${selectedBranch}` : '';
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'COMMUTE'>('GENERAL');
  
  const { data: vendors, loading, error, refetch } = useApi<Vendor[]>(
    `/vendors/?${branchParam}&category=${activeTab}&search=${search}`
  );
  const { data: categoriesData, refetch: refetchCategories } = useApi<any[]>(`/expenses/categories/${branchParam ? `?${branchParam}` : ''}`);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  
  const categories = Array.isArray(categoriesData) ? categoriesData : [];
  
  const [formData, setFormData] = useState<Partial<Vendor>>({
    vendor_type: 'COMPANY',
    category: 'GENERAL',
    name: '',
    first_name: '',
    last_name: '',
    contact_person: '',
    phone: '',
    email: '',
    pan_number: '',
    aadhaar: '',
    is_active: true,
    associated_expense_types: []
  });

  const handleOpenAdd = () => {
    setEditingVendor(null);
    setFormData({
      vendor_type: 'COMPANY',
      category: activeTab,
      name: '',
      first_name: '',
      last_name: '',
      contact_person: '',
      phone: '',
      email: '',
      pan_number: '',
      aadhaar: '',
      is_active: true,
      associated_expense_types: []
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: Vendor) => {
    setEditingVendor(v);
    setFormData({
      vendor_type: v.vendor_type,
      category: v.category || 'GENERAL',
      name: v.name || '',
      first_name: v.first_name || '',
      last_name: v.last_name || '',
      contact_person: v.contact_person || '',
      phone: v.phone || '',
      email: v.email || '',
      pan_number: v.pan_number || '',
      aadhaar: v.aadhaar || '',
      is_active: v.is_active,
      associated_expense_types: v.associated_expense_types || []
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (formData.vendor_type === 'COMPANY' && !formData.name) {
        toast.error("Company Name is required");
        return;
      }
      if (formData.vendor_type === 'INDIVIDUAL' && (!formData.first_name || !formData.last_name)) {
        toast.error("First and Last Name are required");
        return;
      }
      if (!formData.phone) {
        toast.error("Mobile number is required");
        return;
      }
      if (!formData.associated_expense_types || formData.associated_expense_types.length === 0) {
        toast.error("At least one expense type must be associated");
        return;
      }

      if (editingVendor) {
        await api.patch(`/vendors/${editingVendor.id}/`, formData);
        toast.success("Vendor updated successfully");
      } else {
        await api.post(`/vendors/`, formData);
        toast.success("Vendor created successfully");
      }
      setIsModalOpen(false);
      refetch();
    } catch (err: any) {
        toast.error(err.response?.data?.detail || "Failed to save vendor");
    }
  };

  const handleCreateExpenseType = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Expense type name is required.');
      return;
    }
    try {
      const res = await api.post(`/expenses/categories/${branchParam ? `?${branchParam}` : ''}`, {
        name: newCategoryName,
        description: newCategoryDesc
      });
      toast.success('Expense type created!');
      // Add to selected list
      setFormData(prev => ({
        ...prev,
        associated_expense_types: [...(prev.associated_expense_types || []), res.data.id]
      }));
      // Reset and close
      setNewCategoryName('');
      setNewCategoryDesc('');
      setIsNewCategoryModalOpen(false);
      // refetch categories so it appears in the list
      await refetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.name?.[0] || err.response?.data?.detail || 'Failed to create expense type.');
    }
  };

  const toggleExpenseType = (id: string) => {
    const current = formData.associated_expense_types || [];
    if (current.includes(id)) {
      setFormData({ ...formData, associated_expense_types: current.filter(x => x !== id) });
    } else {
      setFormData({ ...formData, associated_expense_types: [...current, id] });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Vendor Management</h1>
          <p className="text-slate-500 mt-1">Manage suppliers, service providers, and associated expense categories.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm shadow-blue-200"
        >
          <Plus size={18} />
          Add Vendor
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('GENERAL')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'GENERAL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              General Vendors
            </button>
            <button
              onClick={() => setActiveTab('COMMUTE')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'COMMUTE' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Commute Vendors
            </button>
          </div>

          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors by name, phone, PAN..." 
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="p-4 pl-6">Vendor Name</th>
                <th className="p-4">Type</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Tax IDs</th>
                <th className="p-4">Status</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Loading vendors...</td></tr>}
              {!loading && vendors?.length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-slate-500 bg-slate-50/50">No vendors found.</td></tr>
              )}
              {!loading && vendors?.map(vendor => (
                <tr key={vendor.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <p className="font-bold text-slate-800">{vendor.name}</p>
                    {vendor.vendor_type === 'COMPANY' && vendor.contact_person && (
                      <p className="text-xs text-slate-500 mt-0.5">Contact: {vendor.contact_person}</p>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                      vendor.vendor_type === 'COMPANY' ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'
                    }`}>
                      {vendor.vendor_type === 'COMPANY' ? <Building2 size={12}/> : <User size={12}/>}
                      {vendor.vendor_type}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className="text-slate-700 font-medium">{vendor.phone || '-'}</p>
                    <p className="text-slate-500 text-xs">{vendor.email}</p>
                  </td>
                  <td className="p-4">
                    <div className="text-xs space-y-1">
                      {vendor.pan_number && <p><span className="text-slate-400 uppercase">PAN:</span> <span className="font-medium text-slate-700">{vendor.pan_number}</span></p>}
                      {vendor.aadhaar && <p><span className="text-slate-400 uppercase">Aadhaar:</span> <span className="font-medium text-slate-700">{vendor.aadhaar}</span></p>}
                      {!vendor.pan_number && !vendor.aadhaar && <span className="text-slate-400">-</span>}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      vendor.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {vendor.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4 pr-6 text-right">
                    <button 
                      onClick={() => handleOpenEdit(vendor)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingVendor ? "Edit Vendor" : "Add New Vendor"} maxWidth="3xl">
        <div className="p-6 space-y-8">
          
          {/* Vendor Type Selection */}
          <div className="flex gap-4">
            {(['COMPANY', 'INDIVIDUAL'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFormData({ ...formData, vendor_type: type })}
                className={`flex-1 p-4 rounded-2xl border-2 flex items-center justify-center gap-3 transition-all ${
                  formData.vendor_type === type 
                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold shadow-sm shadow-blue-100' 
                    : 'border-slate-100 hover:border-slate-300 text-slate-500 font-medium'
                }`}
              >
                {type === 'COMPANY' ? <Building2 size={20} /> : <User size={20} />}
                {type === 'COMPANY' ? 'Company / Business' : 'Individual / Freelancer'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {formData.vendor_type === 'COMPANY' ? (
              <>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Company Name *</label>
                  <input 
                    value={formData.name || ''} 
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all font-medium" 
                    placeholder="e.g. Acme Supplies Pvt Ltd"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contact Person</label>
                  <input 
                    value={formData.contact_person || ''} 
                    onChange={e => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all" 
                    placeholder="Name of contact person"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">First Name *</label>
                  <input 
                    value={formData.first_name || ''} 
                    onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all font-medium" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Last Name *</label>
                  <input 
                    value={formData.last_name || ''} 
                    onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all font-medium" 
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mobile Number *</label>
              <input 
                value={formData.phone || ''} 
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all font-medium" 
                placeholder="10 digit mobile"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
              <input 
                type="email"
                value={formData.email || ''} 
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">PAN Number</label>
              <input 
                value={formData.pan_number || ''} 
                onChange={e => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all font-medium uppercase" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Aadhaar Number</label>
              <input 
                value={formData.aadhaar || ''} 
                onChange={e => setFormData({ ...formData, aadhaar: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all font-medium tracking-wider" 
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Associated Expense Types *</label>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 max-h-48 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {categories.map((cat: any) => {
                  const isSelected = formData.associated_expense_types?.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleExpenseType(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all border ${
                        isSelected 
                          ? 'bg-blue-100 border-blue-200 text-blue-700 shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
                {categories.length === 0 && <p className="text-sm text-slate-500 p-2">No expense categories found. Please create them first.</p>}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200">
                <button
                  onClick={(e) => { e.preventDefault(); setIsNewCategoryModalOpen(true); }}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Plus size={16} /> Add New Expense Type
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <input 
              type="checkbox" 
              id="is_active"
              checked={formData.is_active}
              onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="font-semibold text-slate-700 cursor-pointer">
              Vendor is active
            </label>
          </div>

        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 rounded-b-3xl">
          <button 
            onClick={() => setIsModalOpen(false)}
            className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors"
          >
            Save Vendor
          </button>
        </div>
      </Modal>

      {/* New Category Modal */}
      <Modal isOpen={isNewCategoryModalOpen} onClose={() => setIsNewCategoryModalOpen(false)} title="Add Expense Type" maxWidth="md">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name *</label>
            <input 
              value={newCategoryName} 
              onChange={e => setNewCategoryName(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all font-medium" 
              placeholder="e.g. Stationery, Catering"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
            <textarea 
              value={newCategoryDesc} 
              onChange={e => setNewCategoryDesc(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all" 
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button 
              onClick={() => setIsNewCategoryModalOpen(false)}
              className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleCreateExpenseType}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
