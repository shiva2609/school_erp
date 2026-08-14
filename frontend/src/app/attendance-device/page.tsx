"use client";

import KioskView from '@/components/staff-attendance/KioskView';
import { AuthProvider } from '@/components/common/AuthProvider';

export default function AttendanceDevicePage() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-100/70 flex items-center justify-center p-2 sm:p-4">
        <KioskView />
      </div>
    </AuthProvider>
  );
}
