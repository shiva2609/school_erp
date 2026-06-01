"use client";

import React, { useState } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { Megaphone, Calendar, Eye, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface NoticeItem {
  id: string;
  title: string;
  body: string;
  published_at: string | null;
  read_count: number;
  has_read?: boolean;
}

export default function TeacherNoticesPage() {
  const { data, loading, refetch } = useApi<NoticeItem[]>('/announcements/teacher/');
  const [reading, setReading] = useState<string | null>(null);

  const markAsRead = async (id: string, has_read: boolean = false) => {
    if (has_read) return;
    try {
      setReading(id);
      await api.post(`/announcements/${id}/read/`);
      refetch();
    } catch {
      // Silently fail if read status can't be updated
    } finally {
      setReading(null);
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 tracking-tight">
            <Megaphone className="text-amber-600 w-8 h-8" />
            Teacher Notices
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            Important announcements and circulars for teaching staff.
          </p>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-50 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Megaphone className="text-amber-300 w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">No notices yet</h3>
          <p className="text-gray-500 font-medium max-w-sm mx-auto mt-2">
            When administrators publish circulars or announcements for teachers, they will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {data?.map((notice: NoticeItem) => (
            <div 
              key={notice.id} 
              className={`bg-white p-6 rounded-2xl border transition-all shadow-sm ${notice.has_read ? 'border-gray-100 opacity-75' : 'border-amber-200 shadow-md ring-4 ring-amber-50'}`}
              onMouseEnter={() => markAsRead(notice.id, notice.has_read)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    {!notice.has_read && (
                      <span className="px-2.5 py-1 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1">
                        New
                      </span>
                    )}
                    <h3 className="text-xl font-bold text-gray-900">{notice.title}</h3>
                  </div>
                  
                  <div className="mt-4 text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100 whitespace-pre-wrap text-sm leading-relaxed font-medium">
                    {notice.body}
                  </div>
                  
                  <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wide">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-gray-300" /> 
                      {notice.published_at ? new Date(notice.published_at).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown Date'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Eye size={14} className="text-gray-300" /> 
                      {notice.read_count} Reads
                    </span>
                    {reading === notice.id && (
                      <span className="text-amber-600 animate-pulse">Marking as read...</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
