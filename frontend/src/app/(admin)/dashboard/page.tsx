"use client";

import { useAuth } from '@/components/common/AuthProvider';
import SuperAdminDashboard from '@/components/dashboards/SuperAdminDashboard';
import AdminDashboard from '@/components/dashboards/AdminDashboard';
import BranchDashboard from '@/components/dashboards/BranchDashboard';
import TeacherDashboard from '@/components/dashboards/TeacherDashboard';
import ParentDashboard from '@/components/dashboards/ParentDashboard';

export default function DashboardController() {
  const { user, loading } = useAuth();


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

  // Render role-specific dashboards
  switch (user.role) {
    case 'OWNER':
      return <SuperAdminDashboard user={user} />;
    case 'SUPER_ADMIN':
      if (!user.tenant) return <SuperAdminDashboard user={user} />;
      return <AdminDashboard user={user} />;
    case 'BRANCH_ADMIN':
    case 'ACCOUNTANT':
    case 'PRINCIPAL':
      return <BranchDashboard user={user} />;
    case 'TEACHER':
      return <TeacherDashboard user={user} />;
    case 'PARENT':
      return <ParentDashboard user={user} />;
    default:
      return (
        <div className="p-8 text-center text-gray-500">
          <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
          <p>You do not have a recognized dashboard role.</p>
        </div>
      );
  }
}
