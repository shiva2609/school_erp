"use client";

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { IndianRupee, AlertCircle, Calendar, TrendingUp } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import FinanceChart from '@/components/dashboard/FinanceChart';
import AcademicYearFilter from '@/components/dashboard/AcademicYearFilter';
import { useBranch } from '@/components/common/BranchContext';
import { DashboardPieChart, DashboardLineChart } from '@/components/dashboard/DashboardCharts';

export default function BranchDashboard({ user }: { user: any }) {
  const { selectedBranch } = useBranch();
  const [selectedAY, setSelectedAY] = useState<string>('');
  const [data, setData] = useState<any>({ 
    finance: [], 
    stats: {}, 
    attendance: [],
    attendanceTrend: [],
    feeAging: {}
  });
  const [loading, setLoading] = useState(true);

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
        api.get(`reports/analytics/attendance-trend/?days=30${qs ? '&' + qs : ''}`).catch(() => ({ data: { data: [] } })),
        api.get(`reports/analytics/fee-aging/?${qs}`).catch(() => ({ data: { data: {} } })),
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
  }, [selectedBranch, selectedAY]);

  const avgAttendance = data.attendance.length > 0 
    ? Math.round(data.attendance.reduce((acc: any, curr: any) => acc + curr.percentage, 0) / data.attendance.length)
    : 0;
  const hasTransportRevenue = Number(data.stats?.transport_revenue_collected || 0) > 0;

  return (
    <div className="space-y-6 pb-10">
      {/* Header with Academic Year filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Branch Operations</h1>
          <p className="text-sm text-slate-500 mt-1">Key metrics and recent activities across your branch.</p>
        </div>
        <div className="flex items-center gap-3">
          <AcademicYearFilter
            value={selectedAY}
            onChange={id => { setSelectedAY(id); setLoading(true); }}
          />
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse h-96 esms-card w-full flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading metrics...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="Today's Collection" 
              value={`₹${(data.stats?.today_collection || 0).toLocaleString('en-IN')}`} 
              icon={IndianRupee} 
              color="green" 
              details={
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Today Current Academic Collected:</span>
                      <span className="font-medium text-slate-900">₹{(data.stats?.today_current_academic || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Today Collected Old Dues:</span>
                      <span className="font-medium text-slate-900">₹{(data.stats?.today_old_dues || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between gap-4">
                      <span className="text-slate-700 font-medium">Total Today's Amount:</span>
                      <span className="font-bold text-slate-900">₹{(data.stats?.today_collection || 0).toLocaleString('en-IN')}</span>
                    </div>
                </div>
              }
            />
            <StatCard
              title="Academic Revenue"
              value={`₹${(data.stats?.academic_revenue_collected ?? data.stats?.revenue_collected ?? data.stats?.total_paid ?? 0).toLocaleString('en-IN')}`}
              icon={TrendingUp}
              color="blue"
              progress={{
                current: data.stats?.academic_revenue_collected ?? 0,
                total: data.stats?.academic_revenue_expected ?? 1,
                label: 'Collected'
              }}
              details={
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Academic Tuition Fees:</span>
                    <span className="font-medium text-slate-900">₹{(data.stats?.academic_tuition_only || 0).toLocaleString('en-IN')}</span>
                  </div>
                  {(data.stats?.admission_revenue_collected > 0) && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Admission Fees:</span>
                      <span className="font-medium text-slate-900">₹{(data.stats?.admission_revenue_collected || 0).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {(data.stats?.special_fee_revenue_collected > 0) && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Special Fees:</span>
                      <span className="font-medium text-slate-900">₹{(data.stats?.special_fee_revenue_collected || 0).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Transport Fees:</span>
                    <span className="font-medium text-slate-900">₹{(data.stats?.transport_revenue_collected || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Previous Year Dues:</span>
                    <span className="font-medium text-slate-900">₹{(data.stats?.previous_year_dues_collected || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between gap-4">
                    <span className="text-slate-700 font-medium">Total Expected:</span>
                    <span className="font-bold text-slate-900">₹{(data.stats?.academic_revenue_expected ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-700 font-medium">Total Collected:</span>
                    <span className="font-bold text-slate-900">₹{(data.stats?.academic_revenue_collected ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              }
            />
            {hasTransportRevenue && (
              <StatCard
                title="Transport Revenue"
                value={`₹${(data.stats?.transport_revenue_collected || 0).toLocaleString('en-IN')}`}
                icon={IndianRupee}
                color="amber"
                progress={{
                  current: data.stats?.transport_revenue_collected ?? 0,
                  total: data.stats?.transport_expected ?? 1,
                  label: 'Collected'
                }}
                details={
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Today's Collection:</span>
                      <span className="font-medium text-slate-900">₹{(data.stats?.today_transport || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between gap-4">
                      <span className="text-slate-700 font-medium">Total Expected:</span>
                      <span className="font-bold text-slate-900">₹{(data.stats?.transport_expected || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-700 font-medium">Overall Collected:</span>
                      <span className="font-bold text-slate-900">₹{(data.stats?.transport_revenue_collected || 0).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                }
              />
            )}
            <StatCard 
              title="Outstanding Dues" 
              value={`₹${(data.stats?.total_outstanding || 0).toLocaleString('en-IN')}`} 
              icon={AlertCircle} 
              color="red" 
              progress={{
                current: data.stats?.academic_revenue_collected ?? 0,
                total: data.stats?.total_expected ?? 1,
                label: 'Recovery Rate'
              }}
              details={
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">This Academic Balance Due:</span>
                    <span className="font-medium text-slate-900">₹{(data.stats?.this_academic_balance_due || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Old Dues Remaining:</span>
                    <span className="font-medium text-slate-900">₹{(data.stats?.old_dues_remaining || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between gap-4">
                    <span className="text-slate-700 font-medium">Total Final Amount:</span>
                    <span className="font-bold text-slate-900">₹{(data.stats?.total_outstanding || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              }
            />
            <StatCard title="Today's Attendance" value={`${avgAttendance}%`} icon={Calendar} color="purple" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 esms-card p-6">
              <FinanceChart title="Branch Cashflow" data={data.finance} />
            </div>
            <div className="xl:col-span-1 esms-card p-6">
              <DashboardPieChart 
                title="Fee Aging Breakdown" 
                data={Object.entries(data.feeAging).map(([key, value]) => ({
                  name: key.replace('_', '-').replace('plus', '+') + ' days',
                  value: value
                }))}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
             <div className="esms-card p-6">
               <DashboardLineChart 
                 title="Attendance Trend (30 Days)" 
                 data={data.attendanceTrend} 
                 xKey="date" 
                 yKey="percentage" 
               />
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
