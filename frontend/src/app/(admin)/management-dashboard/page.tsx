"use client";

import React, { useEffect, useState } from 'react';
import { Building, TrendingUp, Users, AlertCircle } from 'lucide-react';
import api from '@/lib/axios';

export default function ManagementDashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>({});
  const [growth, setGrowth] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.get('reports/platform/summary/').catch(() => ({ data: { data: {} } })),
      api.get('reports/platform/growth/').catch(() => ({ data: { data: [] } })),
      api.get('reports/platform/roles/').catch(() => ({ data: { data: [] } })),
    ]).then(([s, g, r]) => {
      setSummary(s.data?.data || {});
      setGrowth(g.data?.data || []);
      setRoles((r.data?.data || []).slice(0, 8));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading management dashboard…</div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trustee & Management View</h1>
        <p className="text-gray-500">Live platform-level metrics across active tenants.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center text-sm font-medium text-gray-500 mb-4">
            <Building className="mr-2 h-5 w-5 text-indigo-500" />
            Active Tenants
          </div>
          <div className="text-3xl font-bold text-gray-900">{Number(summary.active_tenants || 0).toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center text-sm font-medium text-gray-500 mb-4">
            <Building className="mr-2 h-5 w-5 text-indigo-500" />
            Total Branches
          </div>
          <div className="text-3xl font-bold text-gray-900">{Number(summary.total_branches || 0).toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center text-sm font-medium text-gray-500 mb-4">
            <Users className="mr-2 h-5 w-5 text-indigo-500" />
            Total Users
          </div>
          <div className="text-3xl font-bold text-gray-900">{Number(summary.total_users || 0).toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center text-sm font-medium text-gray-500 mb-4">
            <TrendingUp className="mr-2 h-5 w-5 text-green-500" />
            Total Students
          </div>
          <div className="text-3xl font-bold text-gray-900">{Number(summary.total_students || 0).toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Tenant Growth (monthly)</h3>
          {growth.length === 0 ? (
            <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 border border-dashed border-gray-200">
              No growth data yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {growth.slice(-12).map((m: any) => (
                <div key={m.month} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-700">{m.month}</span>
                  <span className="font-bold text-indigo-700">{m.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-bold text-gray-900">Role Breakdown</h3>
          </div>
          {roles.length === 0 ? (
            <div className="p-6 text-sm text-gray-500 flex items-center gap-2"><AlertCircle size={16} /> No role data found.</div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="font-medium p-4 uppercase tracking-wider text-xs">Role</th>
                  <th className="font-medium p-4 uppercase tracking-wider text-xs text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roles.map((r: any) => (
                  <tr key={`${r.role}-${r.count}`} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{r.role}</td>
                    <td className="p-4 text-right text-indigo-700 font-semibold">{Number(r.count || 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
