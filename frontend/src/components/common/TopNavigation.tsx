import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { NavGroup } from '@/lib/roleNav';

interface TopNavigationProps {
  navGroups: NavGroup[];
}

export default function TopNavigation({ navGroups }: TopNavigationProps) {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close mega menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine active item to highlight the top-level group
  let activeItemHref = '';
  let activeGroupName = '';
  navGroups.forEach(group => {
    group.sections.forEach(section => {
      section.items.forEach(item => {
        if (!item.isFuture && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
          // If we found a match, ensure it's the deepest match
          // For example, if path is /reports/financial, it matches /reports and /reports/financial.
          // We want the longest href to win.
          if (item.href !== '/' && item.href.length > activeItemHref.length) {
            activeItemHref = item.href;
            activeGroupName = group.group;
          }
        }
      });
    });
  });

  return (
    <nav className="min-h-14 bg-white border-b border-slate-200 shadow-sm shrink-0 relative z-10" ref={navRef}>
      <div className="flex flex-wrap items-center px-4 sm:px-6 gap-1 sm:gap-2 py-2 sm:py-0 sm:h-14">
        {navGroups.map((group) => {
          const isActiveGroup = activeGroupName === group.group;
          const isMenuOpen = activeMenu === group.group;

          return (
            <div key={group.group} className="relative h-full flex items-center">
              <button
                onClick={() => setActiveMenu(isMenuOpen ? null : group.group)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActiveGroup || isMenuOpen
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-slate-600 hover:text-brand-600 hover:bg-slate-50'
                }`}
              >
                {group.group}
                <ChevronDown size={14} className={`transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Mega Menu Dropdown */}
              {isMenuOpen && (
                <div className="absolute top-[calc(100%-4px)] left-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-dropdown z-50 animate-in fade-in slide-in-from-top-2 duration-200 max-h-[80vh] overflow-y-auto">
                  <div className="p-3">
                    {group.sections.map((section, sIdx) => (
                      <div key={sIdx} className="mb-4 last:mb-0">
                        {section.title && (
                          <h4 className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                            {section.title}
                          </h4>
                        )}
                        <div className="space-y-0.5">
                          {section.items.map((item) => {
                            const Icon = item.icon;
                            const isActiveItem = item.href === activeItemHref && !item.isFuture;
                            
                            // Render placeholder for future pages
                            if (item.isFuture) {
                              return (
                                <button
                                  key={item.label}
                                  type="button"
                                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 cursor-default opacity-80"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    // Intentionally do nothing
                                  }}
                                >
                                  {Icon && <Icon size={16} className="text-slate-300" />}
                                  {item.label}
                                </button>
                              );
                            }

                            // Render actual link for existing pages
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setActiveMenu(null)}
                                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                  isActiveItem
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'text-slate-700 hover:bg-slate-50 hover:text-brand-600'
                                }`}
                              >
                                {Icon && <Icon size={16} className={isActiveItem ? 'text-brand-600' : 'text-slate-400'} />}
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
