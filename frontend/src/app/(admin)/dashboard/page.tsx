"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/common/AuthProvider';
import { toMobilePath } from '@/lib/mobilePath';
import SuperAdminDashboard from '@/components/dashboards/SuperAdminDashboard';
import AdminDashboard from '@/components/dashboards/AdminDashboard';
import BranchDashboard from '@/components/dashboards/BranchDashboard';
import TeacherDashboard from '@/components/dashboards/TeacherDashboard';

export default function DashboardController() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && user?.role === 'PARENT') {
      router.replace(pathname.startsWith('/m') ? toMobilePath('/parent') : '/parent');
    }
  }, [loading, user?.role, router, pathname]);

  if (loading || !user) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-gray-100 animate-pulse rounded-2xl w-full" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (user.role === 'PARENT') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500 text-sm">
        Opening family portal…
      </div>
    );
  }

  switch (user.role) {
    case 'OWNER':
      return <SuperAdminDashboard user={user} />;
    case 'SUPER_ADMIN':
      if (!user.tenant) return <SuperAdminDashboard user={user} />;
      return <AdminDashboard user={user} />;
    case 'CHIEF_ACCOUNTANT':
      return <AdminDashboard user={user} />;
    case 'ZONAL_ADMIN':
    case 'BRANCH_ADMIN':
    case 'ACCOUNTANT':
    case 'PRINCIPAL':
      return <BranchDashboard user={user} />;
    case 'TEACHER':
      return <TeacherDashboard user={user} />;
    default:
      return (
        <div className="p-8 text-center text-gray-500">
          <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
          <p>You do not have a recognized dashboard role.</p>
        </div>
      );
  }
}
