"use client";

import KioskView from '@/components/staff-attendance/KioskView';
import { AuthProvider } from '@/components/common/AuthProvider';

export default function AttendanceDevicePage() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <KioskView />
      </div>
    </AuthProvider>
  );
}
