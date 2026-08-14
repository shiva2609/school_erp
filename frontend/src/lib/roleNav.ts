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
  Building,
  Banknote,
  BookMarked,
  ClipboardList,
} from 'lucide-react';
import { toMobilePath } from '@/lib/mobilePath';

export type NavItem = { 
  href: string; 
  label: string; 
  icon?: LucideIcon;
  isFuture?: boolean;
  allowedRoles: string[]; // Making this required to prevent capability leaks
  requireTenant?: boolean; // If true, user MUST have a tenant to see this
  forbidTenant?: boolean;  // If true, user MUST NOT have a tenant to see this
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export type NavCategory = {
  group: string;
  sections: NavSection[];
};

export type NavGroup = NavCategory; // Alias for backward compatibility

// Common role groupings
const ALL_ADMINS = ['OWNER', 'SUPER_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN'];
const SCHOOL_ADMINS = ['SUPER_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'];
const FINANCE_ROLES = ['OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ACCOUNTANT', 'BRANCH_ADMIN', 'ZONAL_ADMIN'];

const masterNavigation: NavCategory[] = [
  {
    group: 'Dashboard',
    sections: [
      {
        items: [
          { href: '/dashboard', label: 'School Analytics', icon: LayoutDashboard, allowedRoles: ['SUPER_ADMIN'], requireTenant: true },
          { href: '/dashboard', label: 'Branch Dashboard', icon: LayoutDashboard, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN'] },
          { href: '/management-dashboard', label: 'Global Overview', icon: LayoutDashboard, allowedRoles: ['OWNER', 'SUPER_ADMIN'], forbidTenant: true },
          { href: '/teacher-dashboard', label: 'Teacher Dashboard', icon: LayoutDashboard, allowedRoles: ['TEACHER'] },
          { href: '/parent', label: 'Parent Dashboard', icon: LayoutDashboard, allowedRoles: ['PARENT'] },
        ]
      }
    ]
  },
  {
    group: 'Admissions',
    sections: [
      {
        title: 'Admission Management',
        items: [
          { href: '#admissions-dashboard', label: 'Dashboard', isFuture: true, icon: LayoutDashboard, allowedRoles: SCHOOL_ADMINS },
          { href: '#admissions-applicants', label: 'Applicants', isFuture: true, icon: Users, allowedRoles: SCHOOL_ADMINS },
        ]
      }
    ]
  },
  {
    group: 'Academics',
    sections: [
      {
        title: 'Class Management',
        items: [
          { href: '/classes', label: 'Classes', icon: BookOpen, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      },
      {
        title: 'Student Management',
        items: [
          { href: '/students', label: 'All Students', icon: Users, allowedRoles: ['SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '/attendance', label: 'Student Attendance', icon: ClipboardCheck, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT', 'TEACHER'] },
          { href: '#student-bulk-edit', label: 'Student Bulk Edit', isFuture: true, icon: Users, allowedRoles: SCHOOL_ADMINS },
          { href: '#student-import', label: 'Student Import', isFuture: true, icon: Users, allowedRoles: SCHOOL_ADMINS },
          { href: '#student-profile-update', label: 'Student Profile Update Request', isFuture: true, icon: Users, allowedRoles: SCHOOL_ADMINS },
          { href: '#student-tags', label: 'Student Tags', isFuture: true, icon: Users, allowedRoles: SCHOOL_ADMINS },
        ]
      },
      {
        title: 'Teaching & Learning',
        items: [
          { href: '#class-diary', label: 'Class Diary', isFuture: true, icon: BookOpen, allowedRoles: ['TEACHER', 'PRINCIPAL', 'BRANCH_ADMIN'] },
          { href: '#online-classes', label: 'Online Classes', isFuture: true, icon: BookOpen, allowedRoles: ['TEACHER', 'PRINCIPAL', 'BRANCH_ADMIN'] },
          { href: '/homework', label: 'Assignments', icon: PenTool, allowedRoles: ['PRINCIPAL', 'TEACHER'] },
          { href: '/homework-tracking', label: 'Assignment Tracking', icon: Eye, allowedRoles: ['PRINCIPAL', 'TEACHER'] },
        ]
      },
      {
        title: 'Examination',
        items: [
          { href: '/exam-marks', label: 'Exam Marks', icon: Award, allowedRoles: ['PRINCIPAL', 'TEACHER'] },
          { href: '/academics/subjects', label: 'Subjects', icon: BookMarked, allowedRoles: ['OWNER', 'SUPER_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '/academics/assessments', label: 'Assessments', icon: ClipboardList, allowedRoles: ['OWNER', 'SUPER_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      },
      {
        title: 'Academic Operations',
        items: [
          { href: '/academic-transition', label: 'Year Transition', icon: ArrowUpRight, allowedRoles: ['OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '/timetable', label: 'Timetable', icon: Calendar, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT', 'TEACHER'] },
          { href: '/parent/timetable', label: 'Timetable', icon: Calendar, allowedRoles: ['PARENT'] },
          { href: '/announcements', label: 'Announcements', icon: Megaphone, allowedRoles: ALL_ADMINS },
          { href: '/teacher/notices', label: 'Notices', icon: Megaphone, allowedRoles: ['TEACHER'] },
          { href: '/parent/notices', label: 'Parent Notices', icon: Megaphone, allowedRoles: ['PARENT'] },
        ]
      }
    ]
  },
  {
    group: 'Finance',
    sections: [
      {
        title: 'Overview',
        items: [
          { href: '#finance-dashboard', label: 'Dashboard', isFuture: true, icon: LayoutDashboard, allowedRoles: FINANCE_ROLES },
        ]
      },
      {
        title: 'Student Fee Management',
        items: [
          { href: '/fees', label: 'Fee Collections', icon: Receipt, allowedRoles: ['CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#student-fee-allocation', label: 'Student Fee Allocation', isFuture: true, icon: Receipt, allowedRoles: ['CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#past-dues', label: 'Past Dues', isFuture: true, icon: Receipt, allowedRoles: ['CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#bulk-adhoc-charges', label: 'Bulk Adhoc Charges', isFuture: true, icon: Receipt, allowedRoles: ['CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#concession-requests', label: 'Concession Requests', isFuture: true, icon: Receipt, allowedRoles: ['CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      },
      {
        title: 'Accounting',
        items: [
          { href: '/vendors', label: 'Vendors', icon: Users, allowedRoles: ['OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '/vendor-bills', label: 'Vendor Bills', icon: Receipt, allowedRoles: ['SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '/other-income', label: 'Other Income', icon: TrendingDown, allowedRoles: ['CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#payroll', label: 'Payroll', isFuture: true, icon: Banknote, allowedRoles: ['CHIEF_ACCOUNTANT', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#banking', label: 'Banking', isFuture: true, icon: Banknote, allowedRoles: ['CHIEF_ACCOUNTANT', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      },
      {
        title: 'Financial Operations',
        items: [
          { href: '#post-dated-cheques', label: 'Post Dated Cheques', isFuture: true, icon: Receipt, allowedRoles: ['CHIEF_ACCOUNTANT', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '/approvals', label: 'Approvals', icon: ClipboardCheck, allowedRoles: ['SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      }
    ]
  },
  {
    group: 'Staff',
    sections: [
      {
        title: 'Staff Management',
        items: [
          { href: '/users', label: 'Global Staff', icon: Shield, allowedRoles: ['OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN'] },
          { href: '/staff', label: 'Staff Management', icon: Users, allowedRoles: ['SUPER_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      },
      {
        title: 'Attendance',
        items: [
          { href: '/my-attendance', label: 'My Attendance', icon: ClipboardCheck, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT', 'TEACHER', 'STAFF'] },
          { href: '#add-staff-attendance', label: 'Add Staff Attendance', isFuture: true, icon: ClipboardCheck, allowedRoles: SCHOOL_ADMINS },
          { href: '/staff-attendance-report', label: 'Staff Attendance Report', icon: ClipboardCheck, allowedRoles: SCHOOL_ADMINS },
        ]
      },
      {
        title: 'Utilities',
        items: [
          { href: '#staff-bulk-edit', label: 'Staff Bulk Edit', isFuture: true, icon: Users, allowedRoles: SCHOOL_ADMINS },
        ]
      }
    ]
  },
  {
    group: 'Transport',
    sections: [
      {
        title: 'Fleet Management',
        items: [
          { href: '/transport', label: 'Buses', icon: Bus, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#drivers', label: 'Drivers', isFuture: true, icon: Users, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#routes', label: 'Routes', isFuture: true, icon: Bus, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      },
      {
        title: 'Student Transport',
        items: [
          { href: '#student-bus-allocation', label: 'Student Bus Allocation', isFuture: true, icon: Bus, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      }
    ]
  },
  {
    group: 'Hostel',
    sections: [
      {
        title: 'Hostel Management',
        items: [
          { href: '#hostel', label: 'Hostel', isFuture: true, icon: Building, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
          { href: '#rooms', label: 'Rooms', isFuture: true, icon: Building, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      },
      {
        title: 'Student Allocation',
        items: [
          { href: '#assign-student', label: 'Assign Student', isFuture: true, icon: Users, allowedRoles: ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      }
    ]
  },
  {
    group: 'Reports',
    sections: [
      {
        items: [
          { href: '/reports', label: 'Reports Center', icon: BarChart3, allowedRoles: ALL_ADMINS },
          { href: '/reports/financial', label: 'Financial Analytics', icon: TrendingUp, allowedRoles: ['SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'] },
        ]
      }
    ]
  },
  {
    group: 'Settings',
    sections: [
      {
        items: [
          { href: '/system-settings', label: 'System Settings', icon: Settings, allowedRoles: ['OWNER', 'SUPER_ADMIN'], forbidTenant: true },
          { href: '/setup', label: 'School Settings', icon: Settings, allowedRoles: ['OWNER', 'SUPER_ADMIN'] },
          { href: '/tenants', label: 'Tenant Control', icon: Shield, allowedRoles: ['OWNER', 'SUPER_ADMIN'], forbidTenant: true },
          { href: '/system-settings/templates', label: 'Document Templates', icon: PenTool, allowedRoles: ['OWNER', 'SUPER_ADMIN'] },
          { href: '/audit-logs', label: 'Activity ledger', icon: ClipboardCheck, allowedRoles: ['OWNER', 'SUPER_ADMIN'] },
        ]
      }
    ]
  }
];

export function getNavGroups(user: { role: string; tenant?: string | null }): NavGroup[] {
  const { role, tenant } = user;
  
  const filteredNav: NavGroup[] = [];

  for (const category of masterNavigation) {
    const filteredSections: NavSection[] = [];
    
    for (const section of category.sections) {
      const filteredItems = section.items.filter(item => {
        // Enforce tenant presence requirements
        if (item.requireTenant && !tenant) return false;
        if (item.forbidTenant && tenant) return false;

        // Check if role is allowed
        return item.allowedRoles.includes(role);
      });

      if (filteredItems.length > 0) {
        filteredSections.push({
          title: section.title,
          items: filteredItems
        });
      }
    }

    if (filteredSections.length > 0) {
      filteredNav.push({
        group: category.group,
        sections: filteredSections
      });
    }
  }

  return filteredNav;
}

export function getMobileNavGroups(user: { role: string; tenant?: string | null }): NavGroup[] {
  return getNavGroups(user).map((g) => ({
    ...g,
    sections: g.sections.map(s => ({
      ...s,
      items: s.items.map((item) => ({
        ...item,
        href: item.isFuture ? item.href : toMobilePath(item.href),
      })),
    })),
  }));
}
