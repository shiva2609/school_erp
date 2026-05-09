"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import { Search, Command, Users, Receipt, Calendar, CreditCard, LayoutDashboard, Building2, ArrowRight, Zap, Megaphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/axios';
import { useBranch } from './BranchContext';
import { useAuth } from './AuthProvider';
import { toast } from 'react-hot-toast';

const STAFF_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', shortcut: 'D' },
  { id: 'students', label: 'Student Directory', icon: Users, path: '/students', shortcut: 'S' },
  { id: 'fees', label: 'Financial Desk (Fees)', icon: Receipt, path: '/fees', shortcut: 'F' },
  { id: 'expenses', label: 'Expense Ledger', icon: CreditCard, path: '/expenses', shortcut: 'E' },
  { id: 'attendance', label: 'Daily Attendance', icon: Calendar, path: '/attendance', shortcut: 'A' },
];

const PARENT_NAV_ITEMS = [
  { id: 'parent-home', label: 'Family overview', icon: LayoutDashboard, path: '/parent', shortcut: 'D' },
  { id: 'parent-notices', label: 'School notices', icon: Megaphone, path: '/parent/notices', shortcut: 'N' },
  { id: 'parent-timetable', label: 'Timetable', icon: Calendar, path: '/parent/timetable', shortcut: 'T' },
];

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const push = useResolvedPush();
  const { selectedBranch } = useBranch();
  const { user } = useAuth();
  const isParent = user?.role === 'PARENT';
  const navItems = isParent ? PARENT_NAV_ITEMS : STAFF_NAV_ITEMS;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Debounced search for students (staff branches only)
  useEffect(() => {
    if (isParent) {
      setResults([]);
      return;
    }
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/students/?search=${query}&branch_id=${selectedBranch}&limit=5`);
        setResults((res.data.results || res.data.data || []).map((s: any) => ({
          ...s,
          type: 'STUDENT',
          icon: Users,
          label: `${s.first_name} ${s.last_name}`,
          sub: s.admission_no,
          path: `/students?search=${s.admission_no}`
        })));
      } catch (err) {
        toast.error("Failed to execute search. Please try again.", { id: 'search-error' });
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedBranch, isParent]);

  const filteredNav = navItems.filter(item => 
    item.label.toLowerCase().includes(query.toLowerCase())
  ).map(i => ({ ...i, type: 'NAV' }));

  const allItems = [...filteredNav, ...results];

  const handleSelect = (item: any) => {
    push(item.path);
    setIsOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % allItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allItems.length) % allItems.length);
    } else if (e.key === 'Enter') {
      if (allItems[selectedIndex]) handleSelect(allItems[selectedIndex]);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9998]"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white rounded-3xl shadow-2xl z-[9999] overflow-hidden border border-gray-100"
          >
            <div className="relative p-6 border-b border-gray-50 flex items-center gap-4">
              <Search className="text-blue-500" size={20} />
              <input 
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={onKeyDown}
                placeholder="Search students, navigate to modules, or execute actions..."
                className="flex-1 bg-transparent border-none outline-none text-slate-700 font-medium placeholder:text-slate-300"
              />
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-gray-100">
                <Command size={12} className="text-slate-400" />
                <span className="text-[10px] font-black text-slate-400">ESC</span>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-2 pb-4 scrollbar-hide">
               {allItems.length > 0 ? (
                 <div className="space-y-1">
                   {allItems.map((item, idx) => {
                     const Icon = item.icon;
                     const isSelected = idx === selectedIndex;
                     return (
                       <button
                         key={item.id + (item.type === 'STUDENT' ? item.admission_no : '')}
                         onMouseEnter={() => setSelectedIndex(idx)}
                         onClick={() => handleSelect(item)}
                         className={`w-full text-left flex items-center justify-between p-4 rounded-2xl transition-all duration-200 ${
                           isSelected ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'hover:bg-slate-50 text-slate-600'
                         }`}
                       >
                         <div className="flex items-center gap-4">
                           <div className={`p-2 rounded-xl border transition-colors ${isSelected ? 'bg-blue-500 border-blue-400 text-white' : 'bg-white border-gray-100 text-slate-400'}`}>
                              <Icon size={18} />
                           </div>
                           <div>
                              <p className="font-bold text-sm tracking-tight">{item.label}</p>
                              <p className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                                {item.type === 'NAV' ? 'Navigation Jump' : `Student ID: ${item.sub || item.admission_no}`}
                              </p>
                           </div>
                         </div>
                         
                         {isSelected ? (
                           <ArrowRight size={16} className="animate-in fade-in slide-in-from-left-2" />
                         ) : item.shortcut ? (
                           <span className="text-[10px] font-black border border-gray-100 px-2 py-1 rounded-lg text-slate-300">{item.shortcut}</span>
                         ) : null}
                       </button>
                     );
                   })}
                 </div>
               ) : (
                 <div className="py-20 text-center flex flex-col items-center">
                    <Zap className="text-slate-100 mb-4 animate-pulse" size={48} />
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">System Intelligence Ready</p>
                    <p className="text-slate-300 text-xs mt-1">Start typing to search the unified ERP directory.</p>
                 </div>
               )}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-gray-100">
               <div className="flex items-center gap-6">
                 <div className="flex items-center gap-2">
                    <kbd className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-[10px] font-black text-slate-400">↑↓</kbd>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Navigate</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <kbd className="bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-[10px] font-black text-slate-400">ENTER</kbd>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Select</span>
                 </div>
               </div>
               
               <div className="flex items-center gap-2 text-blue-500">
                  <Building2 size={12} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Active Branch Scope Validated</span>
               </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
