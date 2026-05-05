"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { AuthProvider, useAuth } from '@/components/common/AuthProvider';
import { BranchProvider } from '@/components/common/BranchContext';
import GlobalBranchSelector from '@/components/common/GlobalBranchSelector';
import CommandPalette from '@/components/common/CommandPalette';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import NotificationBell from '@/components/common/NotificationBell';
import ForcePasswordChange from '@/components/common/ForcePasswordChange';
import { 
  LayoutDashboard, Users, BookOpen, ClipboardCheck, 
  Calendar, Receipt, TrendingDown, TrendingUp, PenTool, 
  Megaphone, Shield, LogOut, Settings, Building2, Search,
  Menu, X, Bell, Bus, Eye, BarChart3, ArrowUpRight, Award
} from 'lucide-react';

const platformNavGroups = [
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

/** Organization (tenant) super admin — full school operations. */
const tenantSuperAdminNavGroups = [
  {
    group: 'Analytics',
    items: [
      { href: '/dashboard', label: 'School Analytics', icon: LayoutDashboard },
      { href: '/reports', label: 'Reports Center', icon: BarChart3 },
      { href: '/audit-logs', label: 'Activity ledger', icon: ClipboardCheck },
      { href: '/exam-marks', label: 'Exam marks entry', icon: Award },
      { href: '/approvals', label: 'Principal Queue', icon: ClipboardCheck },
      { href: '/reports/financial', label: 'Financial Analytics', icon: TrendingUp },
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

const getNavGroups = (user: { role: string; tenant?: string | null }) => {
  const { role, tenant } = user;
  if (role === 'OWNER') return platformNavGroups;
  if (role === 'SUPER_ADMIN' && !tenant) return platformNavGroups;
  if (role === 'SUPER_ADMIN' && tenant) return tenantSuperAdminNavGroups;

  switch (role) {
    case 'BRANCH_ADMIN':
    case 'ACCOUNTANT':
    case 'PRINCIPAL':
      return [
        {
          group: 'Overview',
          items: [
            { href: '/dashboard', label: 'Branch Dashboard', icon: LayoutDashboard },
            { href: '/reports', label: 'Reports Center', icon: BarChart3 },
          ]
        },
        {
          group: 'Operations',
          items: [
            { href: '/students', label: 'Students', icon: Users },
            { href: '/teachers', label: 'Staff Directory', icon: Users },
            { href: '/transport', label: 'Transport', icon: Bus },
          ]
        },
        {
          group: 'Finance',
          items: [
            { href: '/fees', label: 'Fee Collection', icon: Receipt },
            { href: '/expenses', label: 'Expenses & Approvals', icon: TrendingDown },
            { href: '/academic-transition', label: 'Year Transition', icon: ArrowUpRight },
          ]
        },
        {
          group: 'Academics',
          items: [
            { href: '/classes', label: 'Classes', icon: BookOpen },
            { href: '/attendance', label: 'Attendance Overview', icon: ClipboardCheck },
            { href: '/timetable', label: 'Timetable', icon: Calendar },
            { href: '/exam-marks', label: 'Exam marks', icon: Award },
          ]
        },
        {
          group: 'Communicate',
          items: [
            { href: '/announcements', label: 'Announcements', icon: Megaphone },
          ]
        }
      ];
    case 'TEACHER':
      return [
        {
          group: 'Overview',
          items: [
            { href: '/teacher-dashboard', label: 'My Dashboard', icon: LayoutDashboard },
          ]
        },
        {
          group: 'Classroom',
          items: [
            { href: '/attendance', label: 'My Classes', icon: BookOpen },
            { href: '/homework', label: 'Homework', icon: PenTool },
            { href: '/homework-tracking', label: 'Homework Tracking', icon: Eye },
            { href: '/timetable', label: 'My Timetable', icon: Calendar },
            { href: '/exam-marks', label: 'Exam marks', icon: Award },
          ]
        },
        {
          group: 'Communicate',
          items: [
            { href: '/announcements', label: 'Notices', icon: Megaphone },
          ]
        }
      ];
    case 'PARENT':
      return [
        {
          group: 'My Children',
          items: [
            { href: '/dashboard', label: 'Family Dashboard', icon: LayoutDashboard },
          ]
        }
      ];
    default:
      return [];
  }
};

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.post('auth/logout/');
    } catch (err) {
      // API might fail if token is already expired, continue to redirect regardless
    } finally {
      router.push('/login');
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Initializing Portal...</p>
        </div>
      </div>
    );
  }

  // Hide UI while redirecting
  if (!user) {
    return null;
  }

  // ─── Forced Password Change Gate ──────────────────────────────
  // If the user has must_change_password=true (e.g. parent with Welcome@123),
  // block ALL navigation and show the password change modal.
  if (user?.must_change_password) {
    return (
      <ForcePasswordChange
        onPasswordChanged={async () => {
          await refreshUser();
        }}
      />
    );
  }

  const navGroups = user?.role ? getNavGroups({ role: user.role, tenant: user.tenant }) : [];

  // Determine the active item by finding the longest matching href prefix
  let activeItemHref = '';
  navGroups.forEach(group => {
    group.items.forEach(item => {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        if (item.href.length > activeItemHref.length) {
          activeItemHref = item.href;
        }
      }
    });
  });

  return (
    <BranchProvider>
      <CommandPalette />
      <div className="flex h-screen bg-gray-50 text-gray-900">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <aside className="fixed inset-y-0 left-0 w-72 bg-slate-900 text-white flex flex-col z-50 shadow-2xl animate-in slide-in-from-left duration-300">
              <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 flex-shrink-0">
                <h1 className="text-xl font-bold font-sans tracking-tight truncate">{user?.tenant_name || 'ScoolERP'}</h1>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6 scrollbar-hide">
                {navGroups.map((group, groupIndex) => (
                  <div key={groupIndex} className="space-y-1">
                    <h3 className="px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{group.group}</h3>
                    {group.items.map(({ href, label, icon: Icon }) => {
                      const active = href === activeItemHref;
                      return (
                        <Link key={href} href={href} onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                            active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}>
                          <Icon size={18} />{label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <div className="p-4 border-t border-white/10 flex-shrink-0">
                <div className="flex items-center gap-3 px-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold shadow-inner">
                    {user?.first_name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="font-medium text-white truncate">{user?.first_name} {user?.last_name}</p>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider truncate">{user?.role?.replace('_', ' ')}</p>
                  </div>
                  <button onClick={handleLogout} className="p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors" title="Log out">
                    <LogOut size={16} />
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Desktop Sidebar */}
        <aside className="w-64 bg-slate-900 text-white flex-col hidden md:flex overflow-hidden">
          <div className="h-16 flex items-center px-6 border-b border-white/10 flex-shrink-0">
            {user?.tenant_logo ? (
              <div className="flex items-center justify-center w-full">
                <img src={user.tenant_logo} alt="Logo" className="h-10 w-auto object-contain" />
              </div>
            ) : (
              <h1 className="text-xl font-bold font-sans tracking-tight truncate">{user?.tenant_name || 'ScoolERP'}</h1>
            )}
          </div>
          
          <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6 scrollbar-hide">
            {navGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-1">
                <h3 className="px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {group.group}
                </h3>
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = href === activeItemHref;
                  return (
                    <Link key={href} href={href}
                      className={`flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                        active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}>
                      <Icon size={18} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-white/10 space-y-3 flex-shrink-0">
            <div className="flex items-center gap-3 px-3">
              <Link href="/profile" className="flex items-center gap-3 flex-1 min-w-0 group hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold group-hover:ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 transition-all shadow-inner">
                  {user?.first_name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0 text-sm truncate">
                  <p className="font-medium text-white truncate">{user?.first_name} {user?.last_name}</p>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider truncate">{user?.role?.replace('_', ' ') || 'Loading...'}</p>
                </div>
              </Link>
              <button 
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors ml-auto"
                title="Log out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 bg-white border-b flex items-center px-6 justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              {/* Mobile hamburger */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors md:hidden"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
              <div className="font-semibold text-lg capitalize text-gray-800">
                {pathname.split('/')[1]?.replace('-', ' ') || 'Dashboard'}
              </div>
              <GlobalBranchSelector user={user} />
            </div>
            <div className="flex items-center gap-4">
               {/* Search Trigger */}
               <div 
                 onClick={() => {
                   const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
                   window.dispatchEvent(e);
                 }}
                 className="flex items-center gap-3 bg-slate-50 border border-gray-100 rounded-xl px-4 py-2 cursor-pointer hover:bg-slate-100 transition-all group"
               >
                  <Search size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-600 transition-colors hidden sm:block">Quick Search...</span>
                  <div className="hidden lg:flex items-center gap-1 opacity-40 ml-2">
                     <span className="text-[10px] font-black border rounded px-1">⌘</span>
                     <span className="text-[10px] font-black border rounded px-1">K</span>
                  </div>
               </div>
               {/* Universal Notification Bell */}
               <NotificationBell />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </BranchProvider>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminLayoutContent>
        {children}
      </AdminLayoutContent>
    </AuthProvider>
  );
}
