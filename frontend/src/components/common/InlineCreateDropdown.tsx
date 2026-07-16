"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Search, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
  id: string;
  name: string;
  [key: string]: any;
}

interface InlineCreateDropdownProps {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  onCreate: (name: string, extraData?: any) => Promise<any>;
  placeholder?: string;
  disabled?: boolean;
  extraCreateFields?: React.ReactNode;
  extraCreateData?: Record<string, any>;
  onExtraDataChange?: (data: Record<string, any>) => void;
}

export default function InlineCreateDropdown({
  options,
  value,
  onChange,
  onCreate,
  placeholder = "Select an option",
  disabled = false,
  extraCreateFields,
  extraCreateData,
  onExtraDataChange
}: InlineCreateDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newVal, setNewVal] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setCreateMode(false);
        setSearch('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
  const selected = options.find(o => o.id === value);

  const handleCreate = async () => {
    if (!newVal.trim()) return;
    setIsCreating(true);
    try {
      const created = await onCreate(newVal, extraCreateData);
      if (created?.id) {
        onChange(created.id);
        setOpen(false);
        setCreateMode(false);
        setNewVal('');
      }
    } catch (e) {
      // Error handled by parent
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all disabled:opacity-60"
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden"
          >
            {!createMode ? (
              <div className="flex flex-col max-h-[300px]">
                <div className="p-2 border-b border-slate-50 relative shrink-0">
                  <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400"
                  />
                </div>
                
                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                  {filtered.length > 0 ? (
                    filtered.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => { onChange(opt.id); setOpen(false); setSearch(''); }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${value === opt.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        {opt.name}
                        {value === opt.id && <Check size={14} />}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-4">No results found.</p>
                  )}
                </div>

                <div className="p-2 border-t border-slate-50 shrink-0 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => { setCreateMode(true); setNewVal(search); }}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-slate-200 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    <Plus size={14} /> Create New
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">New Name</label>
                  <input
                    type="text"
                    autoFocus
                    value={newVal}
                    onChange={e => setNewVal(e.target.value)}
                    placeholder="Enter name..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400"
                  />
                </div>
                
                {extraCreateFields && (
                  <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    {extraCreateFields}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateMode(false)}
                    className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCreating || !newVal.trim()}
                    onClick={handleCreate}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isCreating ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
