"use client";

import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { useAuth } from '@/components/common/AuthProvider';
import { Megaphone } from 'lucide-react';
import { toast } from 'react-hot-toast';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  published_at?: string | null;
  branch?: string;
  target_audience?: string;
};

export default function ParentNoticesPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading || !user || user.role !== 'PARENT') return;
    api
      .get('parent/announcements/')
      .then((res) => {
        const data = res.data?.data ?? res.data?.results ?? res.data;
        setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        toast.error('Could not load notices');
        setRows([]);
      })
      .finally(() => setBusy(false));
  }, [loading, user]);

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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">School notices</h1>
        <p className="text-slate-500 mt-1 text-sm">Announcements published for parents and your child&apos;s classes.</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-500 text-sm">
          <Megaphone className="mx-auto text-slate-200 mb-3" size={36} />
          No notices right now.
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((a) => (
            <li key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Megaphone size={18} className="text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-900">{a.title}</h2>
                  {a.published_at && (
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(a.published_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                  <div className="mt-3 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{a.body}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
