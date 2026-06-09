"use client";

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { CalendarDays, ChevronDown } from 'lucide-react';

interface AcademicYear {
  id: string;
  name: string;
  is_active: boolean;
  start_date?: string;
  end_date?: string;
}

interface Props {
  value: string;              // selected academic_year_id
  onChange: (id: string) => void;
  className?: string;
}

export default function AcademicYearFilter({ value, onChange, className = '' }: Props) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('tenants/academic-years/')
      .then(res => {
        const data: AcademicYear[] = res.data?.data ?? res.data?.results ?? res.data ?? [];
        const sorted = [...data].sort((a, b) => {
          // Active year first, then by name descending
          if (a.is_active && !b.is_active) return -1;
          if (!a.is_active && b.is_active) return 1;
          return b.name.localeCompare(a.name);
        });
        setYears(sorted);

        // Auto-select the active year if nothing is selected yet
        if (!value) {
          const active = sorted.find(y => y.is_active);
          if (active) onChange(active.id);
        }
      })
      .catch(() => setYears([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = years.find(y => y.id === value);

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none z-10" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={loading || years.length === 0}
        className="
          appearance-none pl-9 pr-8 py-2
          bg-white border border-indigo-100 rounded-xl
          text-sm font-semibold text-slate-700
          shadow-sm hover:border-indigo-300
          focus:outline-none focus:ring-2 focus:ring-indigo-300
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all min-w-[160px]
        "
      >
        {loading ? (
          <option>Loading...</option>
        ) : years.length === 0 ? (
          <option value="">No academic years</option>
        ) : (
          years.map(y => (
            <option key={y.id} value={y.id}>
              {y.name}{y.is_active ? ' ✦' : ''}
            </option>
          ))
        )}
      </select>
      <ChevronDown
        size={13}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
    </div>
  );
}
