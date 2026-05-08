"use client";

import React, { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { Plus, Megaphone, Eye, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';
import { useAuth } from '@/components/common/AuthProvider';

interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  target_audience: string;
  recipient_email?: string | null;
  target_class_labels?: string[];
  is_published: boolean;
  published_at: string | null;
  read_count: number;
}

interface ClassSectionOption {
  id: string;
  display_name: string;
}

const AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Everyone (this branch)' },
  { value: 'PARENTS', label: 'Parents only' },
  { value: 'TEACHERS', label: 'Teachers only' },
  { value: 'STAFF', label: 'All staff (admins, accountants, teachers, …)' },
  { value: 'CLASS', label: 'Specific classes (parents of those classes)' },
  { value: 'INDIVIDUAL', label: 'One person (by email)' },
];

export default function AnnouncementsPage() {
  const { selectedBranch } = useBranch();
  const { user } = useAuth();
  const { data, loading, refetch } = useApi<AnnouncementItem[]>('/announcements/');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    target_audience: 'ALL',
    recipient_email: '',
    send_push: true,
    send_email: false,
  });
  const [targetClassIds, setTargetClassIds] = useState<string[]>([]);
  const [branchClasses, setBranchClasses] = useState<ClassSectionOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveBranchId = selectedBranch || user?.branch_id || user?.branch || '';

  useEffect(() => {
    if (!effectiveBranchId || formData.target_audience !== 'CLASS') {
      setBranchClasses([]);
      return;
    }
    let cancelled = false;
    setClassesLoading(true);
    api
      .get(`/classes/?branch_id=${effectiveBranchId}`)
      .then(res => {
        if (cancelled) return;
        const raw = res.data?.data ?? res.data;
        setBranchClasses(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {
        if (!cancelled) setBranchClasses([]);
      })
      .finally(() => {
        if (!cancelled) setClassesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveBranchId, formData.target_audience]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveBranchId) {
      toast.error('Select a branch in the header before creating an announcement.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: formData.title,
        body: formData.body,
        target_audience: formData.target_audience,
        branch: effectiveBranchId,
        send_push: formData.send_push,
        send_email: formData.target_audience === 'INDIVIDUAL' ? true : formData.send_email,
      };
      if (formData.target_audience === 'INDIVIDUAL') {
        payload.recipient_email = formData.recipient_email.trim();
      }
      if (formData.target_audience === 'CLASS') {
        if (!targetClassIds.length) {
          toast.error('Select at least one class.');
          setSaving(false);
          return;
        }
        payload.target_classes = targetClassIds;
      }
      await api.post('announcements/', payload);
      setShowForm(false);
      setFormData({
        title: '',
        body: '',
        target_audience: 'ALL',
        recipient_email: '',
        send_push: true,
        send_email: false,
      });
      setTargetClassIds([]);
      refetch();
      toast.success('Announcement created.');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.response?.data?.error || JSON.stringify(err.response?.data || {});
      toast.error(msg && msg !== '{}' ? msg : 'Error creating announcement');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await api.patch(`/announcements/${id}/publish/`);
      refetch();
      toast.success('Published and notifications queued');
    } catch {
      toast.error('Publish failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-gray-500 text-sm mt-1">
            Create and manage school announcements for the selected branch.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800"
        >
          <Plus size={16} /> New Announcement
        </button>
      </div>

      {!effectiveBranchId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Choose a <strong>branch</strong> from the global selector to create or scope announcements.
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4"
        >
          <input
            placeholder="Title"
            required
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
          />
          <textarea
            placeholder="Announcement body..."
            required
            value={formData.body}
            onChange={e => setFormData({ ...formData, body: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm h-28"
          />
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Audience
            </label>
            <select
              value={formData.target_audience}
              onChange={e => {
                const v = e.target.value;
                setFormData({
                  ...formData,
                  target_audience: v,
                  recipient_email: v === 'INDIVIDUAL' ? formData.recipient_email : '',
                });
                if (v !== 'CLASS') setTargetClassIds([]);
              }}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
            >
              {AUDIENCE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {formData.target_audience === 'CLASS' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Classes (parents of students in these sections receive this notice)
              </label>
              {classesLoading ? (
                <p className="text-sm text-gray-500">Loading classes…</p>
              ) : branchClasses.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  No classes found for this branch. Add sections in School Setup first.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {branchClasses.map(c => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={targetClassIds.includes(c.id)}
                        onChange={() => {
                          setTargetClassIds(prev =>
                            prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id],
                          );
                        }}
                      />
                      <span>{c.display_name}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {targetClassIds.length} section{targetClassIds.length === 1 ? '' : 's'} selected
              </p>
            </div>
          )}
          {formData.target_audience === 'INDIVIDUAL' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Recipient email (must match an active user in your organization)
              </label>
              <input
                type="email"
                required
                placeholder="user@school.org"
                value={formData.recipient_email}
                onChange={e => setFormData({ ...formData, recipient_email: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Push and email notifications are enabled for direct messages.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.send_push}
                onChange={e => setFormData({ ...formData, send_push: e.target.checked })}
              />
              In-app / push
            </label>
            {formData.target_audience !== 'INDIVIDUAL' && (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.send_email}
                  onChange={e => setFormData({ ...formData, send_email: e.target.checked })}
                />
                Also queue email (bulk)
              </label>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !effectiveBranchId}
              className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Announcement'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-gray-100 text-gray-700 px-5 py-2 rounded-xl text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <Megaphone className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 font-medium">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.map((a: AnnouncementItem) => (
            <div key={a.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{a.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        a.is_published ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      {a.is_published ? 'Published' : 'Draft'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                      {a.target_audience}
                      {a.recipient_email ? ` → ${a.recipient_email}` : ''}
                      {a.target_audience === 'CLASS' && a.target_class_labels?.length
                        ? ` → ${a.target_class_labels.join(', ')}`
                        : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">{a.body.slice(0, 150)}...</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                    {a.published_at && (
                      <span>Published: {new Date(a.published_at).toLocaleDateString()}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Eye size={12} /> {a.read_count} reads
                    </span>
                  </div>
                </div>
                {!a.is_published && (
                  <button
                    onClick={() => handlePublish(a.id)}
                    className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700"
                  >
                    <Send size={12} /> Publish
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
