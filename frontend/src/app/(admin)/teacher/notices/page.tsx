"use client";

import { useEffect, useState, useMemo } from 'react';
import api from '@/lib/axios';
import { useAuth } from '@/components/common/AuthProvider';
import { Megaphone, Mail, Users, CheckCircle, Search, Inbox, ShieldAlert, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  published_at?: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
  target_audience: 'ALL' | 'TEACHERS' | 'STAFF' | 'PARENTS' | 'CLASS' | 'INDIVIDUAL';
  recipient_email?: string | null;
  is_read: boolean;
  created_by?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
};

type TabType = 'ALL_STAFF' | 'TEACHERS_ONLY' | 'DIRECT_MESSAGES';

export default function TeacherNoticesPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('ALL_STAFF');
  const [searchQuery, setSearchQuery] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);

  const fetchNotices = () => {
    setBusy(true);
    api
      .get('announcements/')
      .then((res) => {
        const data = res.data?.data ?? res.data?.results ?? res.data;
        setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        toast.error('Unable to fetch your notices');
        setRows([]);
      })
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (loading || !user || user.role !== 'TEACHER') return;
    fetchNotices();
  }, [loading, user]);

  const handleMarkAsRead = async (id: string) => {
    setMarkingId(id);
    try {
      await api.post(`announcements/${id}/mark-read/`);
      toast.success('Notice marked as read');
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, is_read: true } : row))
      );
    } catch {
      toast.error('Could not update notice status');
    } finally {
      setMarkingId(null);
    }
  };

  // Filter notices based on search query
  const searchedNotices = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase();
    return rows.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.body.toLowerCase().includes(query) ||
        (a.created_by?.first_name && a.created_by.first_name.toLowerCase().includes(query)) ||
        (a.created_by?.last_name && a.created_by.last_name.toLowerCase().includes(query))
    );
  }, [rows, searchQuery]);

  // Grouped notices for tabs
  const tabNotices = useMemo(() => {
    return searchedNotices.filter((a) => {
      if (activeTab === 'ALL_STAFF') {
        return a.target_audience === 'ALL' || a.target_audience === 'STAFF';
      }
      if (activeTab === 'TEACHERS_ONLY') {
        return a.target_audience === 'TEACHERS';
      }
      if (activeTab === 'DIRECT_MESSAGES') {
        return a.target_audience === 'INDIVIDUAL';
      }
      return false;
    });
  }, [searchedNotices, activeTab]);

  // Unread counts per tab category (calculated from all rows)
  const unreadCounts = useMemo(() => {
    return rows.reduce(
      (acc, a) => {
        if (!a.is_read) {
          if (a.target_audience === 'ALL' || a.target_audience === 'STAFF') {
            acc.ALL_STAFF += 1;
          } else if (a.target_audience === 'TEACHERS') {
            acc.TEACHERS_ONLY += 1;
          } else if (a.target_audience === 'INDIVIDUAL') {
            acc.DIRECT_MESSAGES += 1;
          }
        }
        return acc;
      },
      { ALL_STAFF: 0, TEACHERS_ONLY: 0, DIRECT_MESSAGES: 0 }
    );
  }, [rows]);

  if (loading || !user) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto p-6 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 rounded-xl" />
        <div className="h-4 w-96 bg-slate-200 rounded-xl" />
        <div className="h-12 w-full bg-slate-200 rounded-xl mt-8" />
        <div className="space-y-4 mt-8">
          <div className="h-32 bg-slate-100 rounded-2xl border border-slate-200" />
          <div className="h-32 bg-slate-100 rounded-2xl border border-slate-200" />
        </div>
      </div>
    );
  }

  if (user.role !== 'TEACHER') {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white/80 backdrop-blur-md rounded-3xl border border-rose-100 shadow-xl text-center">
        <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
          <ShieldAlert size={28} className="text-rose-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">Access Restricted</h2>
        <p className="text-slate-500 mt-2 text-sm leading-relaxed">
          This portal is dedicated to teacher and staff noticeboards. Your current role ({user.role}) is not authorized.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
      {/* Premium Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-950 rounded-3xl p-6 md:p-8 text-white shadow-2xl border border-white/5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold tracking-wide text-indigo-200 border border-white/10">
              <Sparkles size={12} className="text-indigo-300 animate-pulse" /> Staff Bulletin Center
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
              Notices & Bulletins
            </h1>
            <p className="text-indigo-200/80 text-sm max-w-xl leading-relaxed">
              Stay updated with branch announcements, administrative notices, and direct private messages.
            </p>
          </div>
          
          {/* Real-time search */}
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-300/60" size={16} />
            <input
              type="text"
              placeholder="Search notices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/10 rounded-2xl text-white placeholder-indigo-200/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all backdrop-blur-md"
            />
          </div>
        </div>
      </div>

      {/* Tabs and Filtering */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between border-b border-slate-200/80 pb-1">
        <div className="flex gap-2 p-1 bg-slate-100/80 backdrop-blur rounded-2xl self-start">
          {[
            { id: 'ALL_STAFF', label: 'All Staff', icon: Megaphone, count: unreadCounts.ALL_STAFF },
            { id: 'TEACHERS_ONLY', label: 'Teachers Only', icon: Users, count: unreadCounts.TEACHERS_ONLY },
            { id: 'DIRECT_MESSAGES', label: 'Direct Messages', icon: Mail, count: unreadCounts.DIRECT_MESSAGES },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-white text-indigo-950 shadow-md shadow-slate-200'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`inline-flex items-center justify-center px-2 py-0.5 text-xxs font-bold rounded-full ${
                    isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-slate-400 px-1 font-medium">
          Showing {tabNotices.length} {tabNotices.length === 1 ? 'bulletin' : 'bulletins'}
        </div>
      </div>

      {/* Notices List */}
      {busy ? (
        <div className="space-y-4">
          <div className="h-32 bg-slate-50 animate-pulse rounded-2xl border border-slate-100" />
          <div className="h-32 bg-slate-50 animate-pulse rounded-2xl border border-slate-100" />
        </div>
      ) : tabNotices.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center max-w-xl mx-auto mt-6">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300">
            <Inbox size={28} />
          </div>
          <h3 className="text-lg font-bold text-slate-800">All caught up!</h3>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">
            {searchQuery
              ? 'No notices match your current search queries. Try refining your keywords.'
              : 'There are no active announcements in this channel.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tabNotices.map((notice) => {
            const isUnread = !notice.is_read;
            return (
              <div
                key={notice.id}
                className={`relative overflow-hidden bg-white rounded-2xl border transition-all duration-300 ${
                  isUnread
                    ? 'border-indigo-100 shadow-md ring-1 ring-indigo-50/50 bg-indigo-50/5'
                    : 'border-slate-100 shadow-sm hover:shadow-md'
                }`}
              >
                {/* Visual Accent Pill for Unread Notices */}
                {isUnread && (
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-indigo-600" />
                )}

                <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start justify-between">
                  <div className="space-y-3 min-w-0 flex-1">
                    {/* Meta headers */}
                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400">
                      {/* Badge for audience type */}
                      {notice.target_audience === 'ALL' && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-sky-50 text-sky-700 border border-sky-100 text-[10px] tracking-wide uppercase">
                          All Staff
                        </span>
                      )}
                      {notice.target_audience === 'STAFF' && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-100 text-[10px] tracking-wide uppercase">
                          General Staff
                        </span>
                      )}
                      {notice.target_audience === 'TEACHERS' && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] tracking-wide uppercase">
                          Teachers
                        </span>
                      )}
                      {notice.target_audience === 'INDIVIDUAL' && (
                        <span className="px-2 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-100 text-[10px] tracking-wide uppercase animate-pulse">
                          Confidential DM
                        </span>
                      )}

                      {notice.published_at && (
                        <span>
                          {new Date(notice.published_at).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      )}

                      {notice.branch && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="font-semibold text-slate-500">{notice.branch.name}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-start gap-2.5">
                      <h2 className={`font-extrabold text-lg md:text-xl tracking-tight text-slate-900 ${isUnread ? 'text-indigo-950' : 'text-slate-800'}`}>
                        {notice.title}
                      </h2>
                      {isUnread && (
                        <span className="flex h-2 w-2 relative mt-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                        </span>
                      )}
                    </div>

                    <div className="text-slate-600 text-sm md:text-base whitespace-pre-wrap leading-relaxed">
                      {notice.body}
                    </div>

                    {/* Sender footer */}
                    {notice.created_by && (
                      <div className="pt-2 text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                          {(notice.created_by.first_name?.[0] || notice.created_by.email?.[0] || 'A').toUpperCase()}
                        </span>
                        <span>
                          From:{' '}
                          {notice.created_by.first_name
                            ? `${notice.created_by.first_name} ${notice.created_by.last_name || ''}`
                            : notice.created_by.email}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Mark as Read action */}
                  {isUnread && (
                    <button
                      onClick={() => handleMarkAsRead(notice.id)}
                      disabled={markingId === notice.id}
                      className="self-end md:self-start flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100/50 hover:bg-indigo-600 hover:text-white hover:border-transparent transition-all duration-300 disabled:opacity-50 shadow-sm shadow-indigo-100/40 shrink-0"
                    >
                      <CheckCircle size={14} />
                      <span>{markingId === notice.id ? 'Updating...' : 'Mark as Read'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
