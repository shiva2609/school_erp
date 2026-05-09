"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/axios';
import { useAuth } from '@/components/common/AuthProvider';
import { Calendar, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const DAY_LABEL: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

type Slot = {
  period: { name: string; start_time: string; end_time: string };
  subject: string | null;
  teacher: string | null;
};

type Child = {
  id: string;
  first_name: string;
  last_name?: string;
  class_section?: string | null;
};

function ParentTimetableContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const childFromUrl = searchParams.get('child');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [timetable, setTimetable] = useState<Record<string, Slot[]>>({});
  const [busy, setBusy] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (loading || !user || user.role !== 'PARENT') return;
    api
      .get('parent/children/')
      .then((res) => {
        const data = res.data?.data ?? [];
        const list = Array.isArray(data) ? data : [];
        setChildren(list);
        const initial =
          (childFromUrl && list.some((c: Child) => c.id === childFromUrl) ? childFromUrl : null) ||
          (list[0]?.id ?? '');
        setSelectedChild(initial);
      })
      .catch(() => {
        toast.error('Could not load children');
        setChildren([]);
      })
      .finally(() => setBusy(false));
  }, [loading, user, childFromUrl]);

  useEffect(() => {
    if (!selectedChild || user?.role !== 'PARENT') return;
    api
      .get(`parent/children/${selectedChild}/timetable/`)
      .then((res) => {
        const raw = res.data?.data?.timetable ?? res.data?.timetable ?? {};
        setTimetable(typeof raw === 'object' && raw !== null ? raw : {});
      })
      .catch(() => {
        toast.error('Could not load timetable');
        setTimetable({});
      });
  }, [selectedChild, user?.role]);

  const orderedDays = useMemo(() => {
    const keys = Object.keys(timetable);
    return [...DAY_ORDER.filter((d) => keys.includes(d)), ...keys.filter((k) => !DAY_ORDER.includes(k as (typeof DAY_ORDER)[number]))];
  }, [timetable]);

  if (loading || !user) {
    return <div className="h-40 bg-slate-100 animate-pulse rounded-2xl" />;
  }

  if (user.role !== 'PARENT') {
    return (
      <div className="p-8 text-center text-slate-600">
        <p className="font-semibold">This area is for parent accounts.</p>
      </div>
    );
  }

  if (busy) {
    return <div className="h-40 bg-slate-100 animate-pulse rounded-2xl" />;
  }

  if (children.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Calendar className="mx-auto text-slate-200 mb-3" size={40} />
        <p>No children linked to your account.</p>
      </div>
    );
  }

  const current = children.find((c) => c.id === selectedChild);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Class timetable</h1>
          <p className="text-slate-500 mt-1 text-sm">Weekly schedule for your child&apos;s section.</p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => children.length > 1 && setDropdownOpen((o) => !o)}
            className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm text-left min-w-[200px]"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {current?.first_name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 text-sm truncate">
                {[current?.first_name, current?.last_name].filter(Boolean).join(' ')}
              </p>
              <p className="text-xs text-slate-400 truncate">{current?.class_section}</p>
            </div>
            {children.length > 1 && <ChevronDown size={16} className="text-slate-400 shrink-0" />}
          </button>
          {dropdownOpen && children.length > 1 && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-100 rounded-xl shadow-lg z-20">
              {children.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setSelectedChild(ch.id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl ${
                    ch.id === selectedChild ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="font-medium text-slate-900">
                    {[ch.first_name, ch.last_name].filter(Boolean).join(' ')}
                  </span>
                  <span className="block text-xs text-slate-400">{ch.class_section}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {orderedDays.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-500 text-sm">
          No timetable published for this class yet.
        </div>
      ) : (
        <div className="space-y-6">
          {orderedDays.map((day) => (
            <section key={day} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/80">
                <h2 className="font-bold text-slate-900">{DAY_LABEL[day] ?? day}</h2>
              </div>
              <ul className="divide-y divide-slate-50">
                {(timetable[day] ?? []).map((slot, idx) => (
                  <li key={idx} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <div className="text-xs font-semibold text-slate-500 sm:w-40 shrink-0">
                      {slot.period?.name}
                      <span className="block font-normal text-slate-400">
                        {slot.period?.start_time?.slice(0, 5)} – {slot.period?.end_time?.slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">{slot.subject ?? '—'}</p>
                      {slot.teacher && <p className="text-xs text-slate-500 mt-0.5">{slot.teacher}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ParentTimetablePage() {
  return (
    <Suspense fallback={<div className="h-40 bg-slate-100 animate-pulse rounded-2xl max-w-4xl" />}>
      <ParentTimetableContent />
    </Suspense>
  );
}
