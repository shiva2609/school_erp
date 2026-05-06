"use client";

import React, { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { Plus, Search, Shield, UserCog, Trash2, Mail, Lock, Phone, Building2, User, KeyRound } from 'lucide-react';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  is_active: boolean;
  tenant?: string | null;
  branch: string | null;
  branch_name: string | null;
  mfa_enabled?: boolean;
}

interface Branch {
  id: string;
  name: string;
  tenant: string; // The tenant ID
}

const ROLE_RANKS: Record<string, number> = {
  OWNER: -1,
  SUPER_ADMIN: 0,
  CHIEF_ACCOUNTANT: 1,
  ZONAL_ADMIN: 1,
  PRINCIPAL: 2,
  BRANCH_ADMIN: 2,
  ACCOUNTANT: 3,
  TEACHER: 3,
  PARENT: 4,
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  SUPER_ADMIN: 'Super Admin',
  CHIEF_ACCOUNTANT: 'Chief Accountant',
  ZONAL_ADMIN: 'Zonal Admin',
  PRINCIPAL: 'Principal',
  BRANCH_ADMIN: 'Branch Admin',
  ACCOUNTANT: 'Accountant',
  TEACHER: 'Teacher',
  PARENT: 'Parent',
};

/** Home branch optional at signup (tenant- or zone-scoped roles). */
const BRANCH_OPTIONAL_ROLES = new Set(['CHIEF_ACCOUNTANT', 'ZONAL_ADMIN']);

export default function UsersPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  
  // Filters
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');

  // Fetching Base Data
  const { data: tenants } = useApi<any[]>('/tenants/');
  const { data: allBranches } = useApi<Branch[]>('/tenants/branches/');
  
  // Build query for users
  const usersUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    if (selectedRole) params.append('role', selectedRole);
    if (selectedBranch) params.append('branch_id', selectedBranch);
    if (selectedTenant) params.append('tenant_id', selectedTenant);
    const qs = params.toString();
    return qs ? `/users/?${qs}` : '/users/';
  }, [selectedRole, selectedBranch, selectedTenant]);

  const { data, loading, error, refetch } = useApi<User[]>(usersUrl);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '', last_name: '', email: '', password: '', role: 'TEACHER', phone: '', branch: ''
  });
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetMustChange, setResetMustChange] = useState(true);
  const [resetSaving, setResetSaving] = useState(false);
  const { confirm } = useConfirm();

  useEffect(() => {
    api.get('auth/me/')
      .then(res => setCurrentUser(res.data.data))
      .catch(err => {
        toast.error('Failed to authenticate session', { id: 'auth-error' });
      });
  }, []);

  // Reset branch when tenant changes
  useEffect(() => {
    setSelectedBranch('');
  }, [selectedTenant]);

  const myRank = currentUser ? (ROLE_RANKS[currentUser.role] ?? 99) : 99;
  const allowedRolesToCreate = Object.keys(ROLE_RANKS).filter(r => {
    if (r === 'OWNER') return false; // Owner should never be created from user management UI
    return ROLE_RANKS[r] > myRank || currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'OWNER';
  });

  const managerRoles = new Set(['OWNER', 'SUPER_ADMIN', 'BRANCH_ADMIN']);

  const canResetPassword = (u: User) => {
    if (!currentUser || currentUser.id === u.id) return false;
    if (!managerRoles.has(currentUser.role)) return false;
    const tr = ROLE_RANKS[u.role] ?? 99;
    const cr = ROLE_RANKS[currentUser.role] ?? 99;
    return tr > cr;
  };

  const canImpersonateUser = (u: User) => {
    if (!currentUser || currentUser.id === u.id) return false;
    if (currentUser.role === 'OWNER') return true;
    if (currentUser.role !== 'SUPER_ADMIN') return false;
    const a = currentUser.tenant ?? null;
    const b = u.tenant ?? null;
    if (a && b) return a === b;
    if (!a && !b) return true;
    return false;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = { ...formData };
      if (BRANCH_OPTIONAL_ROLES.has(formData.role) && !formData.branch?.trim()) {
        delete payload.branch;
      }
      await api.post('users/', payload);
      setShowForm(false);
      setFormData({ first_name: '', last_name: '', email: '', password: '', role: 'TEACHER', phone: '', branch: '' });
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error creating user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userToDelete: User) => {
    const isTenantSuperAdmin =
      userToDelete.role === 'SUPER_ADMIN' && !!userToDelete.tenant;

    let warningMsg = `Are you sure you want to delete ${userToDelete.first_name} ${userToDelete.last_name}?`;

    if (isTenantSuperAdmin) {
      warningMsg = `DANGER: You are about to delete an organization Super Admin (${userToDelete.first_name} ${userToDelete.last_name}).\n\nThis may remove the primary admin for that school. Confirm you have another admin account.\n\nType 'DELETE' to confirm.`;
      
      const confirmText = window.prompt(warningMsg);
      if (confirmText !== 'DELETE') return;
    } else {
      const isConfirmed = await confirm({
        title: "Delete User",
        message: warningMsg,
        isDestructive: true,
      });
      if (!isConfirmed) return;
    }

    try {
      await api.delete(`/users/${userToDelete.id}/`);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error deleting user. You may not have permission.');
    }
  };

  const handleAdminPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !resetPassword.trim()) {
      toast.error('Enter a new password.');
      return;
    }
    setResetSaving(true);
    try {
      await api.patch(`users/${resetTarget.id}/`, {
        password: resetPassword,
        must_change_password: resetMustChange,
      });
      toast.success(`Password updated for ${resetTarget.email}`);
      setResetTarget(null);
      setResetPassword('');
      setResetMustChange(true);
      refetch();
    } catch (err: any) {
      const d = err.response?.data;
      const msg = d?.detail || d?.message || (typeof d === 'string' ? d : 'Could not reset password.');
      toast.error(msg);
    } finally {
      setResetSaving(false);
    }
  };

  const handleImpersonate = async (targetUser: User) => {
    const isConfirmed = await confirm({
      title: "Impersonate User",
      message: `Are you sure you want to impersonate ${targetUser.email}?`,
      isDestructive: false,
      confirmText: "Impersonate"
    });
    if (!isConfirmed) return;
    const reason = window.prompt(
      'Enter an audit reason for impersonation (required, at least 10 characters):'
    );
    const trimmed = (reason || '').trim();
    if (trimmed.length < 10) {
      toast.error('A reason of at least 10 characters is required to impersonate.');
      return;
    }
    let actor_otp: string | undefined;
    if (currentUser?.mfa_enabled) {
      const otp = window.prompt('Enter your authenticator code (required for super-admin MFA):');
      if (otp === null) return;
      const t = otp.replace(/\s/g, '');
      if (!t) {
        toast.error('Authenticator code is required.');
        return;
      }
      actor_otp = t;
    }
    try {
      await api.post('auth/impersonate/', {
        user_id: targetUser.id,
        reason: trimmed,
        ...(actor_otp ? { actor_otp } : {}),
      });
      window.location.href = '/super-admin/all';
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.detail;
      toast.error(msg || 'Failed to impersonate user.');
    }
  };

  const filteredUsers = data?.filter(u => 
    u.first_name.toLowerCase().includes(search.toLowerCase()) || 
    u.last_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users & Roles</h1>
          <p className="text-gray-500 text-sm mt-1">Manage platform access based on your permission level</p>
        </div>
        {allowedRolesToCreate.length > 0 && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <UserCog size={18} />
              </div>
              New User Profile
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-6">
            {/* First Name */}
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                <User size={18} />
              </div>
              <input 
                placeholder="First Name" 
                required 
                value={formData.first_name}
                onChange={e => setFormData({...formData, first_name: e.target.value})}
                className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" 
              />
            </div>
            
            {/* Last Name */}
            <input 
              placeholder="Last Name" 
              required 
              value={formData.last_name}
              onChange={e => setFormData({...formData, last_name: e.target.value})}
              className="w-full px-5 py-3.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" 
            />
            
            {/* Email */}
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                <Mail size={18} />
              </div>
              <input 
                type="email" 
                placeholder="Email Address" 
                required 
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" 
              />
            </div>

            {/* Password */}
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                <Lock size={18} />
              </div>
              <input 
                type="password" 
                placeholder="Temporary Password" 
                required 
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" 
              />
            </div>

            {/* Role */}
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                <Shield size={18} />
              </div>
              <select 
                value={formData.role} 
                onChange={e => setFormData({...formData, role: e.target.value})}
                className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
              >
                {allowedRolesToCreate.map(role => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>

            {/* Branch Selector (Conditional) */}
            {formData.role !== 'SUPER_ADMIN' && !BRANCH_OPTIONAL_ROLES.has(formData.role) && (
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                  <Building2 size={18} />
                </div>
                <select 
                  required
                  value={formData.branch} 
                  onChange={e => setFormData({...formData, branch: e.target.value})}
                  className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none"
                >
                  <option value="">Select Branch</option>
                  {allBranches?.filter(b => !selectedTenant || b.tenant === selectedTenant).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Phone (Optional) */}
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                <Phone size={18} />
              </div>
              <input 
                placeholder="Phone Number (Optional)" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" 
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-50">
            <button 
              type="submit" 
              disabled={saving}
              className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 transition-all transform active:scale-95"
            >
              {saving ? 'Creating...' : 'Create User'}
            </button>
            <button 
              type="button" 
              onClick={() => setShowForm(false)}
              className="px-8 py-3 bg-gray-100 text-gray-600 rounded-2xl text-sm font-bold hover:bg-gray-200 transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex flex-wrap items-center gap-4">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              placeholder="Search by name/email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            />
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {/* Super Admin: School Filter */}
            {currentUser?.role === 'SUPER_ADMIN' && (
              <select
                value={selectedTenant}
                onChange={e => setSelectedTenant(e.target.value)}
                className="pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Schools</option>
                {tenants?.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}

            {/* Branch Filter (Filtered by School if Super Admin) */}
            {currentUser?.role === 'SUPER_ADMIN' && !!currentUser?.tenant && (
              <select
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
                className="pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">All Branches</option>
                {allBranches?.filter(b => !selectedTenant || b.tenant === selectedTenant).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}

            {/* Role Filter */}
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Roles</option>
              {Object.entries(ROLE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            <button 
              onClick={() => { setSelectedRole(''); setSelectedBranch(''); setSelectedTenant(''); setSearch(''); }}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 px-2 py-1"
            >
              Reset
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-50 rounded-lg animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 bg-red-50">{error}</div>
        ) : filteredUsers?.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Role</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Branch</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Status</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredUsers?.map(u => {
                const ur = ROLE_RANKS[u.role] ?? 99;
                const cr = ROLE_RANKS[currentUser?.role ?? ''] ?? 99;
                const canDelete =
                  currentUser &&
                  u.id !== currentUser.id &&
                  (currentUser.role === 'OWNER' || ur > cr);

                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{u.first_name} {u.last_name}</td>
                    <td className="px-6 py-4 text-gray-600">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium 
                        ${u.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' : 
                          u.role === 'OWNER' ? 'bg-indigo-100 text-indigo-700' : 
                          u.role === 'CHIEF_ACCOUNTANT' ? 'bg-amber-100 text-amber-800' :
                          u.role === 'ZONAL_ADMIN' ? 'bg-cyan-100 text-cyan-800' :
                          u.role === 'PRINCIPAL' ? 'bg-violet-100 text-violet-800' :
                          'bg-slate-100 text-slate-700'}`}>
                        <Shield size={12} />
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {u.branch_name ? (
                        <span className="text-gray-700 font-medium flex items-center gap-1.5">
                          <Building2 size={14} className="text-gray-400" />
                          {u.branch_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Global / Group</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {u.is_active ? 
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span> :
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-50 text-gray-500">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Inactive
                        </span>
                      }
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      {canImpersonateUser(u) && (
                        <button 
                          onClick={() => handleImpersonate(u)}
                          className="text-gray-400 hover:text-blue-600 p-1.5 rounded bg-white hover:bg-blue-50 transition-colors"
                          title="Impersonate user (same organization; audited)"
                        >
                          <KeyRound size={16} />
                        </button>
                      )}
                      {canResetPassword(u) && (
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(u);
                            setResetPassword('');
                            setResetMustChange(true);
                          }}
                          className="text-gray-400 hover:text-amber-600 p-1.5 rounded bg-white hover:bg-amber-50 transition-colors"
                          title="Set new password"
                        >
                          <Lock size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button 
                          onClick={() => handleDelete(u)}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded bg-white hover:bg-red-50 transition-colors"
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <form
            onSubmit={handleAdminPasswordReset}
            className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-gray-900">Reset password</h3>
            <p className="text-sm text-gray-600">
              Set a new password for <span className="font-semibold">{resetTarget.email}</span>. This is logged in the
              activity ledger.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">New password</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={resetMustChange}
                onChange={(e) => setResetMustChange(e.target.checked)}
              />
              Require password change on next login
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetSaving}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {resetSaving ? 'Saving…' : 'Save password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
