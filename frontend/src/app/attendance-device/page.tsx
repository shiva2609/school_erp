import KioskView from '@/components/staff-attendance/KioskView';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Attendance Kiosk',
};

export default function AttendanceDevicePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <KioskView />
    </div>
  );
}
