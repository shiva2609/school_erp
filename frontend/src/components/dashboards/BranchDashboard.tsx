"use client";

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { IndianRupee, AlertCircle, Calendar, TrendingUp } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import FinanceChart from '@/components/dashboard/FinanceChart';
import { useBranch } from '@/components/common/BranchContext';
import { DashboardPieChart, DashboardLineChart } from '@/components/dashboard/DashboardCharts';

export default function BranchDashboard({ user }: { user: any }) {
  const { selectedBranch } = useBranch();
  const [data, setData] = useState<any>({ 
    finance: [], 
    stats: {}, 
    attendance: [],
    attendanceTrend: [],
    feeAging: {}
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = (isInitial = false) => {
      if (isInitial) setLoading(true);
      const params = `branch_id=${selectedBranch || ''}`;
      
      Promise.all([
        api.get(`reports/finance/summary/?days=30&${params}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/fees/stats/?${params}`).catch(() => ({ data: { data: {} } })),
        api.get(`reports/attendance/stats/?${params}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/analytics/attendance-trend/?days=30&${params}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/analytics/fee-aging/?${params}`).catch(() => ({ data: { data: {} } })),
      ]).then(([financeRes, feeRes, attRes, trendRes, agingRes]) => {
        if (!isMounted) return;
        setData({
          finance: financeRes.data.data || [],
          stats: feeRes.data.data || {},
          attendance: attRes.data.data || [],
          attendanceTrend: trendRes.data.data || [],
          feeAging: agingRes.data.data || {}
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
  }, [selectedBranch]);

  if (loading) return <div className="animate-pulse h-96 bg-gray-100 rounded-2xl w-full"></div>;

  const avgAttendance = data.attendance.length > 0 
    ? Math.round(data.attendance.reduce((acc: any, curr: any) => acc + curr.percentage, 0) / data.attendance.length)
    : 0;
  const hasTransportRevenue = Number(data.stats?.transport_revenue_collected || 0) > 0;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Branch Operations</h1>
          <p className="text-gray-500 mt-1">Actions and metrics for your branch.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Today's Collection" value={`₹${(data.stats?.today_collection || 0).toLocaleString('en-IN')}`} icon={IndianRupee} color="green" />
        <StatCard
          title="Academic revenue received"
          value={`₹${(data.stats?.academic_revenue_collected ?? data.stats?.revenue_collected ?? data.stats?.total_paid ?? 0).toLocaleString('en-IN')}`}
          icon={TrendingUp}
          color="purple"
        />
        {hasTransportRevenue && (
          <StatCard
            title="Transport revenue received"
            value={`₹${(data.stats?.transport_revenue_collected || 0).toLocaleString('en-IN')}`}
            icon={IndianRupee}
            color="amber"
          />
        )}
        <StatCard title="Outstanding Dues" value={`₹${(data.stats?.total_outstanding || 0).toLocaleString('en-IN')}`} icon={AlertCircle} color="red" />
        <StatCard title="Today's Attendance" value={`${avgAttendance}%`} icon={Calendar} color="blue" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
         <div className="xl:col-span-1">
           <FinanceChart title="Branch Cashflow" data={data.finance} />
         </div>
         <div className="xl:col-span-1">
           <DashboardLineChart 
             title="Attendance Trend (30 Days)" 
             data={data.attendanceTrend} 
             xKey="date" 
             yKey="percentage" 
           />
         </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <DashboardPieChart 
            title="Fee Aging" 
            data={Object.entries(data.feeAging).map(([key, value]) => ({
              name: key.replace('_', '-').replace('plus', '+') + ' days',
              value: value
            }))}
          />
        </div>
      </div>
    </div>
  );
}
