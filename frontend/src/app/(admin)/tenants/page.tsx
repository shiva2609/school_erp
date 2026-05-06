"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/axios';
import { Building2, Search, PowerOff, Power, ShieldAlert, CheckCircle2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useConfirm } from '@/components/common/ConfirmProvider';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  owner_email: string;
  owner_phone: string;
}

export default function TenantControlPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const response = await api.get('tenants/super-admin/all/');
      setTenants(response.data.results || response.data);
    } catch (err: any) {
      setError('Failed to load tenants. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (tenantId: string, currentStatus: boolean) => {
    const isConfirmed = await confirm({
      title: 'Tenant Status',
      message: `Are you sure you want to ${currentStatus ? 'freeze' : 'activate'} this tenant? ${currentStatus ? 'Users will be locked out immediately.' : ''}`,
      isDestructive: currentStatus // destructive if freezing
    });
    
    if (!isConfirmed) return;

    try {
      const response = await api.patch(`tenants/super-admin/all/${tenantId}/toggle-status/`);
      setTenants(tenants.map(t => t.id === tenantId ? { ...t, is_active: response.data.is_active } : t));
      setSuccess(`Tenant successfully ${currentStatus ? 'frozen' : 'activated'}!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError('Failed to update tenant status.');
      setTimeout(() => setError(''), 3000);
    }
  };


  const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
    const isConfirmed = await confirm({
      title: 'Delete Tenant Permanently',
      message: `Delete ${tenantName}? This permanently removes tenant data across branches, users, students, fees, and logs. This cannot be undone.`,
      isDestructive: true,
      confirmText: 'Delete Tenant',
    });
    if (!isConfirmed) return;

    try {
      await api.delete(`tenants/super-admin/all/${tenantId}/`);
      setTenants(prev => prev.filter(t => t.id !== tenantId));
      setSuccess('Tenant deleted permanently.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete tenant.');
      setTimeout(() => setError(''), 4000);
    }
  };

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.owner_email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 border-l-4 border-indigo-600 pl-4">Tenant Control Center</h1>
          <p className="text-sm text-gray-500 mt-1 pl-5">Manage participating schools across the global platform</p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search school or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-80 pl-9 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100 shadow-sm">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <p className="font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-xl flex items-center gap-3 border border-green-100 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-green-500 animate-pulse" />
          <p className="font-medium">{success}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">School Name</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact Info</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Registration Date</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Kill Switch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Loading tenants...</td></tr>
              ) : filteredTenants.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  <Building2 className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                  <p>No schools found matching your search.</p>
                </td></tr>
              ) : (
                filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className={`transition-colors ${!tenant.is_active ? 'bg-red-50/30 grayscale-[50%]' : 'hover:bg-indigo-50/30'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${tenant.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">{tenant.name}</div>
                          <div className="text-xs text-gray-500 font-mono">@{tenant.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{tenant.owner_email}</div>
                      <div className="text-xs text-gray-500">{tenant.owner_phone || 'No phone provided'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                        tenant.is_active 
                          ? 'bg-green-100 text-green-800 border-green-200 shadow-sm' 
                          : 'bg-red-100 text-red-800 border-red-200'
                      }`}>
                        {tenant.is_active ? 'Active' : 'Frozen'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{format(new Date(tenant.created_at), 'MMM dd, yyyy')}</div>
                      <div className="text-xs text-gray-500">{format(new Date(tenant.created_at), 'hh:mm a')}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStatus(tenant.id, tenant.is_active)}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                            tenant.is_active
                              ? 'bg-white border-red-200 text-red-600 hover:bg-red-50 hover:shadow-md'
                              : 'bg-green-600 border-transparent text-white hover:bg-green-700 hover:shadow-md'
                          }`}
                        >
                          {tenant.is_active ? (
                            <><PowerOff className="w-4 h-4" /> Freeze</>
                          ) : (
                            <><Power className="w-4 h-4" /> Reactivate</>
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-300 text-rose-700 bg-white hover:bg-rose-50 text-sm font-semibold transition-all"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
