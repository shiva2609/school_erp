"use client";

import React, { useState } from 'react';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import { useBranch } from '@/components/common/BranchContext';
import { Plus, Search, MoreVertical, Edit2, Trash2, X, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfirm } from '@/components/common/ConfirmProvider';
import Link from 'next/link';

interface Column {
  key: string;
  label: string;
  render?: (val: any, row: any) => React.ReactNode;
}

interface ExtraField {
  key: string;
  label: string;
  type: 'checkbox' | 'select' | 'text';
  options?: { label: string; value: string }[];
}

interface MasterDataCRUDProps {
  title: string;
  description: string;
  endpoint: string;
  columns: Column[];
  extraFields?: ExtraField[];
}

export default function MasterDataCRUD({ title, description, endpoint, columns, extraFields = [] }: MasterDataCRUDProps) {
  const { selectedBranch } = useBranch();
  const { data, loading, refetch } = useApi<any[]>(endpoint);
  const { confirm } = useConfirm();

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({ name: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const filtered = (data || []).filter(item => item.name?.toLowerCase().includes(search.toLowerCase()));

  const handleOpenAdd = () => {
    setEditItem(null);
    setFormData({ name: '', is_active: true });
    setShowModal(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditItem(item);
    setFormData({ ...item });
    setShowModal(true);
    setActiveMenu(null);
  };

  const handleDelete = async (id: string, name: string) => {
    setActiveMenu(null);
    const ok = await confirm({
      title: 'Delete Record',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      isDestructive: true
    });
    if (!ok) return;

    try {
      await api.delete(`${endpoint}${id}/`);
      toast.success(`${name} deleted`);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to delete record. It might be in use.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...formData, branch: selectedBranch };
      if (editItem) {
        await api.patch(`${endpoint}${editItem.id}/`, payload);
        toast.success("Updated successfully");
      } else {
        await api.post(endpoint, payload);
        toast.success("Created successfully");
      }
      setShowModal(false);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/staff" className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <ArrowLeft size={18} className="text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 w-64 shadow-sm"
            />
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-blue-200 transition-all active:scale-95"
          >
            <Plus size={16} /> Add New
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No records found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Name</th>
                {columns.map(col => (
                  <th key={col.key} className="text-left px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">{col.label}</th>
                ))}
                <th className="text-right px-6 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Status</th>
                <th className="px-6 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-800">{item.name}</td>
                  {columns.map(col => (
                    <td key={col.key} className="px-6 py-4 text-slate-600">
                      {col.render ? col.render(item[col.key], item) : item[col.key]}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-block px-2 py-1 rounded-lg text-[10px] font-bold ${item.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      {item.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right relative">
                    <button onClick={() => setActiveMenu(activeMenu === item.id ? null : item.id)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
                      <MoreVertical size={16} />
                    </button>
                    {activeMenu === item.id && (
                      <div className="absolute right-6 top-10 w-36 bg-white border border-slate-100 shadow-xl rounded-xl py-1 z-10 animate-in fade-in zoom-in-95">
                        <button onClick={() => handleOpenEdit(item)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => handleDelete(item.id, item.name)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-900">{editItem ? 'Edit' : 'Add'} {title}</h3>
                <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Name</label>
                  <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
                </div>
                
                {extraFields.map(f => (
                  <div key={f.key} className="space-y-1.5">
                    {f.type === 'checkbox' ? (
                      <label className="flex items-center gap-2 cursor-pointer mt-2">
                        <input type="checkbox" checked={formData[f.key] || false} onChange={e => setFormData({ ...formData, [f.key]: e.target.checked })} className="rounded text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm font-semibold text-slate-700">{f.label}</span>
                      </label>
                    ) : f.type === 'select' ? (
                      <>
                        <label className="text-xs font-bold text-slate-500 uppercase">{f.label}</label>
                        <select value={formData[f.key] || ''} onChange={e => setFormData({ ...formData, [f.key]: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400">
                          <option value="">Select...</option>
                          {f.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </>
                    ) : (
                      <>
                        <label className="text-xs font-bold text-slate-500 uppercase">{f.label}</label>
                        <input value={formData[f.key] || ''} onChange={e => setFormData({ ...formData, [f.key]: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400" />
                      </>
                    )}
                  </div>
                ))}

                <label className="flex items-center gap-2 cursor-pointer mt-4">
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} className="rounded text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm font-semibold text-slate-700">Is Active?</span>
                </label>

                <div className="pt-4 flex items-center gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                  <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md shadow-blue-200">
                    {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Save'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
