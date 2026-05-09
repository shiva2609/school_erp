"use client";

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/common/AuthProvider';
import { BranchProvider } from '@/components/common/BranchContext';
import ForcePasswordChange from '@/components/common/ForcePasswordChange';
import MobileAppShell from '@/components/mobile/MobileAppShell';

function MobileGate({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const next = encodeURIComponent(pathname || '/m');
      router.replace(`/login?next=${next}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-100">
        <div className="w-11 h-11 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
        <p className="mt-4 text-sm font-medium text-slate-500">Loading app…</p>
      </div>
    );
  }

  if (!user) return null;

  if (user.must_change_password) {
    return (
      <ForcePasswordChange
        onPasswordChanged={async () => {
          await refreshUser();
        }}
      />
    );
  }

  return <MobileAppShell>{children}</MobileAppShell>;
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BranchProvider>
        <MobileGate>{children}</MobileGate>
      </BranchProvider>
    </AuthProvider>
  );
}
