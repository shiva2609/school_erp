import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardCheck,
  Calendar,
  Receipt,
  TrendingDown,
  TrendingUp,
  PenTool,
  Megaphone,
  Shield,
  Settings,
  Bus,
  BarChart3,
  ArrowUpRight,
  Award,
  Eye,
} from 'lucide-react';
import { toMobilePath } from '@/lib/mobilePath';

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { group: string; items: NavItem[] };

const platformNavGroups: NavGroup[] = [
  {
    group: 'Platform',
    items: [
      { href: '/management-dashboard', label: 'Global Overview', icon: LayoutDashboard },
      { href: '/tenants', label: 'Tenant Control', icon: Shield },
      { href: '/users', label: 'Global Users', icon: Users },
      { href: '/audit-logs', label: 'System Ledger', icon: ClipboardCheck },
      { href: '/system-settings', label: 'System Settings', icon: Settings },
      { href: '/system-settings/templates', label: 'Document Templates', icon: PenTool },
    ],
  },
];

const tenantSuperAdminNavGroups: NavGroup[] = [
  {
    group: 'Analytics',
    items: [
      { href: '/dashboard', label: 'School Analytics', icon: LayoutDashboard },
      { href: '/reports', label: 'Reports Center', icon: BarChart3 },
      { href: '/audit-logs', label: 'Activity ledger', icon: ClipboardCheck },
      { href: '/reports/financial', label: 'Financial Analytics', icon: TrendingUp },
      { href: '/approvals', label: 'Approvals', icon: ClipboardCheck },
    ],
  },
  {
    group: 'Directories',
    items: [
      { href: '/users', label: 'Global Staff', icon: Shield },
      { href: '/teachers', label: 'All Teachers', icon: Users },
      { href: '/students', label: 'All Students', icon: Users },
    ],
  },
  {
    group: 'Configuration',
    items: [
      { href: '/setup', label: 'School Settings', icon: Settings },
      { href: '/system-settings/templates', label: 'Document Templates', icon: PenTool },
      { href: '/academic-transition', label: 'Year Transition', icon: ArrowUpRight },
    ],
  },
  {
    group: 'Communicate',
    items: [{ href: '/announcements', label: 'Announcements', icon: Megaphone }],
  },
];

export function getNavGroups(user: { role: string; tenant?: string | null }): NavGroup[] {
  const { role, tenant } = user;
  if (role === 'OWNER') return platformNavGroups;
  if (role === 'SUPER_ADMIN' && !tenant) return platformNavGroups;
  if (role === 'SUPER_ADMIN' && tenant) return tenantSuperAdminNavGroups;

  switch (role) {
    case 'CHIEF_ACCOUNTANT':
      return [
        {
          group: 'Overview',
          items: [
            { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { href: '/reports', label: 'Reports Center', icon: BarChart3 },
          ],
        },
        {
          group: 'Directories',
          items: [
            { href: '/users', label: 'Global Staff', icon: Shield },
            { href: '/students', label: 'All Students', icon: Users },
          ],
        },
        {
          group: 'Finance',
          items: [
            { href: '/fees', label: 'Fee Collection', icon: Receipt },
            { href: '/expenses', label: 'Expenses & Approvals', icon: TrendingDown },
            { href: '/approvals', label: 'Approvals', icon: ClipboardCheck },
            { href: '/reports/financial', label: 'Financial Analytics', icon: TrendingUp },
            { href: '/academic-transition', label: 'Year Transition', icon: ArrowUpRight },
          ],
        },
        {
          group: 'Communicate',
          items: [{ href: '/announcements', label: 'Announcements', icon: Megaphone }],
        },
      ];
    case 'ZONAL_ADMIN':
      return [
        {
          group: 'Overview',
          items: [
            { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { href: '/reports', label: 'Reports Center', icon: BarChart3 },
            { href: '/students', label: 'Students', icon: Users },
            { href: '/users', label: 'Staff directory', icon: Shield },
          ],
        },
        {
          group: 'Finance',
          items: [
            { href: '/fees', label: 'Fee Collection', icon: Receipt },
            { href: '/expenses', label: 'Expenses', icon: TrendingDown },
            { href: '/approvals', label: 'Approvals', icon: ClipboardCheck },
            { href: '/reports/financial', label: 'Financial Analytics', icon: TrendingUp },
          ],
        },
        {
          group: 'Communicate',
          items: [{ href: '/announcements', label: 'Announcements', icon: Megaphone }],
        },
      ];
    case 'PRINCIPAL':
      return [
        {
          group: 'Overview',
          items: [
            { href: '/dashboard', label: 'Branch Dashboard', icon: LayoutDashboard },
            { href: '/reports', label: 'Reports Center', icon: BarChart3 },
          ],
        },
        {
          group: 'School',
          items: [
            { href: '/students', label: 'Students', icon: Users },
            { href: '/teachers', label: 'Staff Directory', icon: Users },
            { href: '/transport', label: 'Transport', icon: Bus },
            { href: '/classes', label: 'Classes', icon: BookOpen },
          ],
        },
        {
          group: 'Academics',
          items: [
            { href: '/attendance', label: 'Attendance Overview', icon: ClipboardCheck },
            { href: '/timetable', label: 'Timetable', icon: Calendar },
            { href: '/exam-marks', label: 'Exam marks', icon: Award },
            { href: '/homework', label: 'Homework', icon: PenTool },
            { href: '/homework-tracking', label: 'Homework Tracking', icon: Eye },
          ],
        },
        {
          group: 'Communicate',
          items: [{ href: '/announcements', label: 'Announcements', icon: Megaphone }],
        },
      ];
    case 'BRANCH_ADMIN':
    case 'ACCOUNTANT':
      return [
        {
          group: 'Overview',
          items: [
            { href: '/dashboard', label: 'Branch Dashboard', icon: LayoutDashboard },
            { href: '/reports', label: 'Reports Center', icon: BarChart3 },
          ],
        },
        {
          group: 'Operations',
          items: [
            { href: '/students', label: 'Students', icon: Users },
            { href: '/teachers', label: 'Staff Directory', icon: Users },
            { href: '/transport', label: 'Transport', icon: Bus },
          ],
        },
        {
          group: 'Finance',
          items: [
            { href: '/fees', label: 'Fee Collection', icon: Receipt },
            { href: '/expenses', label: 'Expenses & Approvals', icon: TrendingDown },
            { href: '/reports/financial', label: 'Financial Analytics', icon: TrendingUp },
            { href: '/academic-transition', label: 'Year Transition', icon: ArrowUpRight },
          ],
        },
        {
          group: 'Academics',
          items: [
            { href: '/classes', label: 'Classes', icon: BookOpen },
            { href: '/attendance', label: 'Attendance Overview', icon: ClipboardCheck },
            { href: '/timetable', label: 'Timetable', icon: Calendar },
          ],
        },
        {
          group: 'Communicate',
          items: [{ href: '/announcements', label: 'Announcements', icon: Megaphone }],
        },
      ];
    case 'TEACHER':
      return [
        {
          group: 'Overview',
          items: [{ href: '/teacher-dashboard', label: 'My Dashboard', icon: LayoutDashboard }],
        },
        {
          group: 'Classroom',
          items: [
            { href: '/attendance', label: 'My Classes', icon: BookOpen },
            { href: '/homework', label: 'Homework', icon: PenTool },
            { href: '/homework-tracking', label: 'Homework Tracking', icon: Eye },
            { href: '/timetable', label: 'My Timetable', icon: Calendar },
            { href: '/exam-marks', label: 'Exam marks', icon: Award },
          ],
        },
        {
          group: 'Communicate',
          items: [{ href: '/announcements', label: 'Notices', icon: Megaphone }],
        },
      ];
    case 'PARENT':
      return [
        {
          group: 'Family portal',
          items: [
            { href: '/parent', label: 'Overview', icon: LayoutDashboard },
            { href: '/parent/notices', label: 'Notices', icon: Megaphone },
            { href: '/parent/timetable', label: 'Timetable', icon: Calendar },
          ],
        },
      ];
    default:
      return [];
  }
}

/** Same nav entries as the web app, with `/m`-prefixed hrefs for the mobile shell. */
export function getMobileNavGroups(user: { role: string; tenant?: string | null }): NavGroup[] {
  return getNavGroups(user).map((g) => ({
    ...g,
    items: g.items.map((item) => ({
      ...item,
      href: toMobilePath(item.href),
    })),
  }));
}
