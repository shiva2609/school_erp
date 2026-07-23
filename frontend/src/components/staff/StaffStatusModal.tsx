import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';

export type StaffStatus = 'ACTIVE' | 'INACTIVE' | 'RESIGNED';

interface StaffStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
  currentStatus: string;
  targetStatus: StaffStatus;
  onSuccess: () => void;
}

export default function StaffStatusModal({
  isOpen,
  onClose,
  staffId,
  staffName,
  currentStatus,
  targetStatus,
  onSuccess
}: StaffStatusModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetStatus !== 'ACTIVE' && !reason.trim()) {
      toast.error('Reason is required');
      return;
    }

    setLoading(true);
    try {
      await api.patch(`staff/${staffId}/`, {
        status: targetStatus,
        status_reason: targetStatus === 'ACTIVE' ? null : reason,
      });
      toast.success(`${staffName} status updated to ${targetStatus}`);
      onSuccess();
      onClose();
      setReason('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error updating status');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (targetStatus) {
      case 'INACTIVE': return 'Make Inactive';
      case 'RESIGNED': return 'Mark as Resigned';
      case 'ACTIVE': return 'Make Active';
      default: return 'Update Status';
    }
  };

  const getWarningText = () => {
    if (targetStatus === 'INACTIVE' || targetStatus === 'RESIGNED') {
      return `This will revoke ${staffName}'s portal access and change their status.`;
    }
    return `This will restore ${staffName}'s status to ACTIVE.`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{getTitle()}</h2>
              <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="flex gap-3 p-4 bg-amber-50 text-amber-800 rounded-xl mb-6 text-sm">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <p>{getWarningText()}</p>
              </div>

              {targetStatus !== 'ACTIVE' && (
                <div className="space-y-2 mb-6">
                  <label className="text-sm font-bold text-slate-700">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Enter the reason..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none h-28"
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || (targetStatus !== 'ACTIVE' && !reason.trim())}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? 'Updating...' : 'Confirm Update'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
