"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/common/AuthProvider';
import { BranchProvider } from '@/components/common/BranchContext';
import GlobalBranchSelector from '@/components/common/GlobalBranchSelector';
import CommandPalette from '@/components/common/CommandPalette';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import NotificationBell from '@/components/common/NotificationBell';
import ForcePasswordChange from '@/components/common/ForcePasswordChange';
import TopNavigation from '@/components/common/TopNavigation';
import { LogOut, Search, User } from 'lucide-react';
import { getNavGroups } from '@/lib/roleNav';

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, refreshUser, logout } = useAuth();

  const handleLogout = async () => {
    await logout({ confirm: true });
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
          <div className="w-12 h-12 border-4 border-brand-600/30 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Initializing Portal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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

  return (
    <BranchProvider>
      <CommandPalette />
      <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
        
        {/* Global Utility Header */}
        <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex items-center gap-6">
            {/* Branding */}
            <Link href="/" className="flex items-center gap-3">
              {user?.tenant_logo ? (
                <img
                  src={user.tenant_logo}
                  alt={user.tenant_name || 'Logo'}
                  className="max-h-8 object-contain"
                />
              ) : (
                <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center font-bold text-lg">
                  S
                </div>
              )}
              <h1 className="text-lg font-semibold tracking-tight hidden sm:block">
                {user?.tenant_name || 'ScoolERP'}
              </h1>
            </Link>

            <div className="hidden md:block h-6 w-px bg-white/20 mx-2" />

            {/* Context Selectors */}
            <div className="hidden md:flex items-center">
              <GlobalBranchSelector user={user} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Search Trigger */}
            <button 
              onClick={() => {
                const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
                window.dispatchEvent(e);
              }}
              className="flex items-center gap-3 bg-white/10 hover:bg-white/20 border border-white/5 rounded-lg px-3 py-2 transition-colors group"
            >
              <Search size={16} className="text-slate-300 group-hover:text-white" />
              <span className="text-sm font-medium text-slate-300 group-hover:text-white hidden sm:block">Search...</span>
              <div className="hidden lg:flex items-center gap-1 opacity-50 ml-2">
                <span className="text-[10px] font-black border border-white/30 rounded px-1">⌘</span>
                <span className="text-[10px] font-black border border-white/30 rounded px-1">K</span>
              </div>
            </button>

            <NotificationBell />

            {/* User Profile Dropdown (Simplified for now) */}
            <div className="relative group ml-2">
              <button className="flex items-center gap-2 focus:outline-none">
                <div className="w-9 h-9 bg-brand-600 rounded-full flex items-center justify-center text-sm font-bold shadow-inner border-2 border-slate-800 group-hover:border-slate-700 transition-colors">
                  {user?.first_name?.charAt(0) || 'U'}
                </div>
              </button>
              
              {/* Simple hover dropdown for profile */}
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-dropdown border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 origin-top-right">
                <div className="p-3 border-b border-slate-100">
                  <p className="font-semibold text-slate-900 truncate">{user?.first_name} {user?.last_name}</p>
                  <p className="text-xs text-slate-500 font-medium tracking-wide mt-0.5 truncate">{user?.role?.replace('_', ' ') || 'User'}</p>
                </div>
                <div className="p-1">
                  <Link href="/profile" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 rounded-md">
                    <User size={16} /> My Profile
                  </Link>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md">
                    <LogOut size={16} /> Log out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Mega Menu Navigation Bar */}
        <TopNavigation navGroups={navGroups} />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50 relative z-0">
          <ErrorBoundary>
            <div key={pathname} className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out h-full">
              {children}
            </div>
          </ErrorBoundary>
        </main>
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
