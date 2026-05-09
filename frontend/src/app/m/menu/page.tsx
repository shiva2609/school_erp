"use client";

import Link from 'next/link';
import { useAuth } from '@/components/common/AuthProvider';
import { getMobileNavGroups } from '@/lib/roleNav';
import { toMobilePath } from '@/lib/mobilePath';
import { LogOut } from 'lucide-react';

export default function MobileMenuPage() {
  const { user, logout } = useAuth();
  const groups = user?.role ? getMobileNavGroups({ role: user.role, tenant: user.tenant }) : [];

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-lg font-bold text-slate-900">All shortcuts</h2>
        <p className="text-xs text-slate-500 mt-1">Same access as the desktop site — optimized for small screens.</p>
      </div>

      {groups.map((g) => (
        <section key={g.group} className="space-y-2">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">{g.group}</h3>
          <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-50 overflow-hidden shadow-sm">
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                      <Icon size={18} />
                    </div>
                    <span className="font-semibold text-slate-900 text-sm">{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="space-y-2">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Account</h3>
        <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-50 overflow-hidden shadow-sm">
          <li>
            <Link
              href={toMobilePath('/profile')}
              className="flex items-center gap-3 px-4 py-3.5 font-semibold text-slate-900 text-sm hover:bg-slate-50"
            >
              Profile & security
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => logout({ confirm: true })}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left font-semibold text-rose-600 text-sm hover:bg-rose-50"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}
