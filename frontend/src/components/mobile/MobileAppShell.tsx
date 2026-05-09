"use client";

import React, { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/common/AuthProvider';
import GlobalBranchSelector from '@/components/common/GlobalBranchSelector';
import NotificationBell from '@/components/common/NotificationBell';
import CommandPalette from '@/components/common/CommandPalette';
import { getMobileNavGroups, type NavItem } from '@/lib/roleNav';
import { getMobilePostLoginPath, stripMobilePrefix, toMobilePath } from '@/lib/mobilePath';
import { getPostLoginPath } from '@/lib/rolePortal';
import { LayoutDashboard, Menu as MenuIcon, ExternalLink } from 'lucide-react';

function flattenNavItems(groups: { items: NavItem[] }[]): NavItem[] {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  for (const g of groups) {
    for (const it of g.items) {
      if (seen.has(it.href)) continue;
      seen.add(it.href);
      out.push(it);
    }
  }
  return out;
}

function titleForPath(pathname: string, flat: NavItem[]): string {
  const web = stripMobilePrefix(pathname);
  let best = '';
  let label = 'ScoolERP';
  for (const it of flat) {
    const whref = stripMobilePrefix(it.href);
    if (web === whref || web.startsWith(`${whref}/`)) {
      if (whref.length >= best.length) {
        best = whref;
        label = it.label;
      }
    }
  }
  return label;
}

export default function MobileAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { user } = useAuth();

  const navGroups = user?.role ? getMobileNavGroups({ role: user.role, tenant: user.tenant }) : [];
  const flat = useMemo(() => flattenNavItems(navGroups), [navGroups]);
  const homeHref = user ? getMobilePostLoginPath(user.role, user.tenant) : '/m';

  const shortcuts = useMemo(() => {
    return flat.filter((it) => it.href !== homeHref).slice(0, 3);
  }, [flat, homeHref]);

  const pageTitle = titleForPath(pathname, flat);

  const desktopHref = (() => {
    const w = stripMobilePrefix(pathname);
    if (w === '/menu' || w === '/' || w === '') {
      return user ? getPostLoginPath(user.role, user.tenant) : '/dashboard';
    }
    return w;
  })();

  useEffect(() => {
    if (!pathname.startsWith('/m')) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('a[href]');
      if (!el) return;
      const a = el as HTMLAnchorElement;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (href.startsWith('http://') || href.startsWith('https://')) return;
      if (!href.startsWith('/')) return;
      if (href.startsWith('/m') || href.startsWith('/login')) return;
      e.preventDefault();
      router.push(toMobilePath(href));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname, router]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-100 text-slate-900 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <CommandPalette />
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-3 bg-white/95 backdrop-blur-md border-b border-slate-200/80 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link href={homeHref} className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <LayoutDashboard size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                {user?.tenant_name || 'ScoolERP'}
              </p>
              <h1 className="text-sm font-bold text-slate-900 truncate leading-tight">{pageTitle}</h1>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <GlobalBranchSelector user={user} />
          <NotificationBell />
          <Link
            href={toMobilePath('/profile')}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-700"
          >
            {user?.first_name?.charAt(0) || 'U'}
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-3 py-4 w-full">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/90 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_24px_rgba(15,23,42,0.06)]">
        <div className="max-w-lg mx-auto flex items-stretch justify-around h-14">
          <Link
            href={homeHref}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${
              isActive(homeHref) ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <LayoutDashboard size={20} strokeWidth={isActive(homeHref) ? 2.5 : 2} />
            Home
          </Link>
          {shortcuts.map((it) => {
            const Icon = it.icon;
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${
                  active ? 'text-blue-600' : 'text-slate-500'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="truncate max-w-[4.5rem] text-center leading-tight">{it.label}</span>
              </Link>
            );
          })}
          <Link
            href="/m/menu"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${
              pathname === '/m/menu' ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <MenuIcon size={20} strokeWidth={pathname === '/m/menu' ? 2.5 : 2} />
            More
          </Link>
        </div>
      </nav>

      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] right-3 z-30">
        <a
          href={desktopHref}
          className="flex items-center gap-1.5 rounded-full bg-slate-800 text-white text-[10px] font-bold px-3 py-2 shadow-lg opacity-90 hover:opacity-100"
          title="Open this screen in the desktop layout"
        >
          <ExternalLink size={12} />
          Desktop
        </a>
      </div>
    </div>
  );
}
