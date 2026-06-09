"use client";

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { Building2, Users, TrendingUp, IndianRupee } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import FinanceChart from '@/components/dashboard/FinanceChart';
import AcademicYearFilter from '@/components/dashboard/AcademicYearFilter';
import { useBranch } from '@/components/common/BranchContext';
import { DashboardPieChart, DashboardBarChart, DashboardFunnelChart } from '@/components/dashboard/DashboardCharts';

export default function AdminDashboard({ user }: { user: any }) {
  const { selectedBranch } = useBranch();
  const [selectedAY, setSelectedAY] = useState<string>('');
  const [data, setData] = useState<any>({ 
    finance: [], 
    stats: {}, 
    attendance: [],
    branchDistribution: [],
    feeCollectionByBranch: [],
    expenseBreakdown: [],
    admissionFunnel: []
  });
  const [loading, setLoading] = useState(true);
  const hasTransportRevenue = Number(data.stats?.transport_revenue_collected || 0) > 0;

  useEffect(() => {
    // Don't fetch until AY is resolved
    if (!selectedAY) return;

    let isMounted = true;

    const fetchData = (isInitial = false) => {
      if (isInitial) setLoading(true);
      const params = new URLSearchParams();
      if (selectedBranch) params.set('branch_id', selectedBranch);
      if (selectedAY) params.set('academic_year_id', selectedAY);
      const qs = params.toString();
      
      Promise.all([
        api.get(`reports/finance/summary/?days=30${qs ? '&' + qs : ''}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/fees/stats/?${qs}`).catch(() => ({ data: { data: {} } })),
        api.get(`reports/attendance/stats/?${qs}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/analytics/branch-distribution/?${qs}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/analytics/fee-collection-by-branch/?${qs}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/analytics/expense-breakdown/?days=30${qs ? '&' + qs : ''}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/analytics/admission-funnel/?${qs}`).catch(() => ({ data: { data: [] } })),
      ]).then(([financeRes, feeRes, attRes, branchRes, feeBranchRes, expRes, funnelRes]) => {
        if (!isMounted) return;
        setData({
          finance: financeRes.data.data || [],
          stats: feeRes.data.data || {},
          attendance: attRes.data.data || [],
          branchDistribution: branchRes.data.data || [],
          feeCollectionByBranch: feeBranchRes.data.data || [],
          expenseBreakdown: expRes.data.data || [],
          admissionFunnel: funnelRes.data.data || []
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
  }, [selectedBranch, selectedAY]);

  if (loading) return <div className="animate-pulse h-96 bg-gray-100 rounded-2xl w-full"></div>;

  return (
    <div className="space-y-6 pb-10">
      {/* Header with Academic Year filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-gray-500 mt-1">Global oversight of {user?.tenant_name || 'your institution'}.</p>
        </div>
        <AcademicYearFilter
          value={selectedAY}
          onChange={id => { setSelectedAY(id); setLoading(true); }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Enrollment" value={(data.stats?.total_students || 0).toLocaleString('en-IN')} icon={Users} color="blue" />
        <StatCard title="Active Branches" value={(data.stats?.active_branches || 0).toString()} icon={Building2} color="purple" />
        <StatCard
          title="Academic revenue received"
          value={`₹${(data.stats?.academic_revenue_collected ?? data.stats?.revenue_collected ?? data.stats?.total_paid ?? 0).toLocaleString('en-IN')}`}
          icon={TrendingUp}
          color="green"
        />
        {hasTransportRevenue && (
          <StatCard
            title="Transport revenue received"
            value={`₹${(data.stats?.transport_revenue_collected || 0).toLocaleString('en-IN')}`}
            icon={IndianRupee}
            color="amber"
          />
        )}
        <StatCard 
          title="Avg Attendance" 
          value={`${data.attendance.length > 0 ? Math.round(data.attendance.reduce((a: any, b: any) => a + b.percentage, 0) / data.attendance.length) : 0}%`} 
          icon={Users} 
          color="amber" 
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
         <div className="xl:col-span-2">
           <FinanceChart title="Consolidated Finance (30 Days)" data={data.finance} />
         </div>
         <div className="xl:col-span-1">
           <DashboardPieChart 
             title="Expense Breakdown" 
             data={data.expenseBreakdown} 
             dataKey="total" 
             nameKey="category" 
           />
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <DashboardBarChart 
            title="Student Distribution" 
            data={data.branchDistribution} 
            xKey="branch__name" 
            yKey="count" 
            label="Students"
          />
        </div>
        <div className="xl:col-span-1">
          <DashboardBarChart 
            title="Collection by Branch" 
            data={data.feeCollectionByBranch} 
            xKey="branch__name" 
            yKey="collected" 
            label="Collected"
          />
        </div>
        <div className="xl:col-span-1">
          <DashboardFunnelChart 
            title="Admission Funnel" 
            data={data.admissionFunnel} 
          />
        </div>
      </div>
    </div>
  );
}
