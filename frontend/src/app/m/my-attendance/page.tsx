import MyAttendanceView from '@/components/staff-attendance/MyAttendanceView';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Attendance',
};

export default function MobileMyAttendancePage() {
  return <MyAttendanceView />;
}
