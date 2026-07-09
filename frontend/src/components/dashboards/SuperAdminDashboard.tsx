"use client";

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { Building2, Users, TrendingUp, GraduationCap } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import { DashboardPieChart, DashboardBarChart } from '@/components/dashboard/DashboardCharts';

export default function SuperAdminDashboard({ user }: { user: any }) {
  const [data, setData] = useState<any>({ 
    summary: {}, 
    growth: [], 
    roles: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchData = (isInitial = false) => {
      if (isInitial) setLoading(true);
      Promise.all([
        api.get(`reports/platform/summary/`).catch(() => ({ data: { data: {} } })),
        api.get(`reports/platform/growth/`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/platform/roles/`).catch(() => ({ data: { data: [] } })),
      ]).then(([summaryRes, growthRes, rolesRes]) => {
        if (!isMounted) return;
        setData({
          summary: summaryRes.data?.data || {},
          growth: growthRes.data?.data || [],
          roles: rolesRes.data?.data || [],
        });
        if (isInitial) setLoading(false);
      });
    };

    fetchData(true);
    // Poll for real-time updates every 30 seconds
    const interval = setInterval(() => fetchData(false), 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const roleLabels: Record<string, string> = {
    'SUPER_ADMIN': 'Super Admins (orgs)',
    'BRANCH_ADMIN': 'Branch Admins',
    'ACCOUNTANT': 'Accountants',
    'TEACHER': 'Teachers',
    'PARENT': 'Parents',
  };

  const formattedRoles = data.roles.map((r: any) => ({
    name: roleLabels[r.role] || r.role,
    value: r.count
  }));

  const formattedGrowth = data.growth.map((g: any) => ({
    month: g.month, // e.g. "2024-03"
    count: g.count
  }));

  return (
    <div className="space-y-6 pb-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">SaaS Platform Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Global oversight of platform adoption and scale.</p>
      </div>

      {loading ? (
        <div className="animate-pulse h-96 esms-card w-full flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading metrics...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Active Schools" value={(data.summary?.active_tenants || 0).toLocaleString('en-IN')} icon={Building2} color="blue" />
            <StatCard title="Total Branches" value={(data.summary?.total_branches || 0).toLocaleString('en-IN')} icon={TrendingUp} color="purple" />
            <StatCard title="Global Students" value={(data.summary?.total_students || 0).toLocaleString('en-IN')} icon={GraduationCap} color="green" />
            <StatCard title="System Users" value={(data.summary?.total_users || 0).toLocaleString('en-IN')} icon={Users} color="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="esms-card p-6">
              <DashboardBarChart 
                title="Onboarding Growth (Schools/Month)" 
                data={formattedGrowth} 
                xKey="month" 
                yKey="count" 
                label="New Schools" 
              />
            </div>
            <div className="esms-card p-6">
              <DashboardPieChart 
                title="Global User Distribution" 
                data={formattedRoles} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
