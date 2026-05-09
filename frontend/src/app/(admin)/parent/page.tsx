"use client";

import { useAuth } from '@/components/common/AuthProvider';
import ParentDashboard from '@/components/dashboards/ParentDashboard';

export default function ParentPortalPage() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-gray-100 animate-pulse rounded-2xl w-full" />
      </div>
    );
  }

  if (user.role !== 'PARENT') {
    return (
      <div className="p-8 text-center text-slate-600">
        <p className="font-semibold">This area is for parent accounts.</p>
      </div>
    );
  }

  return <ParentDashboard user={user} />;
}
