"use client";

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { Building2, ChevronDown } from 'lucide-react';
import { useBranch } from './BranchContext';

export default function GlobalBranchSelector({ user }: { user: any }) {
  const { selectedBranch, setSelectedBranch } = useBranch();
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    if (['SUPER_ADMIN', 'OWNER'].includes(user?.role)) {
      api.get('/tenants/branches/').then(res => {
        const arr = res.data?.data ?? res.data?.results ?? res.data;
        setBranches(Array.isArray(arr) ? arr : []);
      });
    }
  }, [user]);

  if (!['SUPER_ADMIN', 'OWNER'].includes(user?.role)) return null;

  return (
    <div className="flex items-center gap-2 group">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-400 transition-colors cursor-pointer ring-offset-2 focus-within:ring-2 ring-blue-500">
        <Building2 size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
        <select 
          value={selectedBranch} 
          onChange={e => setSelectedBranch(e.target.value)}
          className="text-xs font-bold text-slate-700 bg-transparent focus:outline-none appearance-none pr-4 cursor-pointer"
        >
          <option value="">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <ChevronDown size={12} className="text-slate-400 -ml-3 pointer-events-none" />
      </div>
    </div>
  );
}
