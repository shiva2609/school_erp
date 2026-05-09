"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/common/AuthProvider';
import { getMobilePostLoginPath } from '@/lib/mobilePath';

export default function MobileEntryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    router.replace(getMobilePostLoginPath(user.role, user.tenant));
  }, [loading, user, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-slate-500 text-sm">Starting…</div>
  );
}
