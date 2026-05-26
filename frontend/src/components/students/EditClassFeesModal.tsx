"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';
import { X, Receipt, AlertTriangle, CheckCircle, Info, ArrowRight } from 'lucide-react';

interface EditClassFeesModalProps {
  student: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditClassFeesModal({ student, isOpen, onClose, onSuccess }: EditClassFeesModalProps) {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [feeStructure, setFeeStructure] = useState<any>(null);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [offeredTotal, setOfferedTotal] = useState<number>(0);
  const [standardTotal, setStandardTotal] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load available classes for this branch and academic year
  useEffect(() => {
    if (isOpen && student) {
      setLoadingClasses(true);
      setSelectedClassId(student.class_section?.id || '');
      setReason('');
      
      api.get(`/classes/?branch_id=${student.branch}&academic_year_id=${student.academic_year}`)
        .then(res => {
          const arr = res.data?.data ?? res.data?.results ?? res.data;
          setClasses(Array.isArray(arr) ? arr : []);
        })
        .catch(err => {
          toast.error('Failed to load available classes.');
        })
        .finally(() => {
          setLoadingClasses(false);
        });
    }
  }, [isOpen, student]);

  // Load fee structure when target class changes
  useEffect(() => {
    if (isOpen && student && selectedClassId) {
      const cls = classes.find(c => c.id === selectedClassId);
      if (cls && cls.grade) {
        setLoadingStructure(true);
        setFeeStructure(null);
        
        api.get(`/fees/structures/?branch_id=${student.branch}&academic_year_id=${student.academic_year}&grade=${cls.grade}`)
          .then(res => {
            const arr = res.data?.data ?? res.data?.results ?? res.data;
            const list = Array.isArray(arr) ? arr : [];
            const structure = list[0];
            setFeeStructure(structure);
            if (structure) {
              const actualTotal = (structure.items || []).reduce((acc: number, item: any) => acc + Number(item.amount), 0);
              setStandardTotal(actualTotal);
              
              // Only default offered total if we changed classes.
              // If it's the student's current class, pre-fill from current fee stats
              if (selectedClassId === student.class_section?.id) {
                setOfferedTotal(student.fee_stats?.total_fee || actualTotal);
              } else {
                setOfferedTotal(actualTotal);
              }
            } else {
              setStandardTotal(0);
              setOfferedTotal(0);
            }
          })
          .catch(err => {
            toast.error('Failed to load fee structure for the selected class.');
            setFeeStructure(null);
            setStandardTotal(0);
            setOfferedTotal(0);
          })
          .finally(() => {
            setLoadingStructure(false);
          });
      }
    } else {
      setFeeStructure(null);
      setStandardTotal(0);
      setOfferedTotal(0);
    }
  }, [selectedClassId, classes, student, isOpen]);

  if (!isOpen || !student) return null;

  const hasPaidAlready = student.fee_stats?.total_paid > 0;
  const isClassChanged = selectedClassId !== student.class_section?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) {
      toast.error('Please select a target class.');
      return;
    }
    if (!feeStructure) {
      toast.error('No active fee structure found for the selected class.');
      return;
    }
    if (offeredTotal <= 0) {
      toast.error('Agreed total fee must be greater than zero.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason for the modifications (required for audit logging).');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/students/${student.id}/update-class-fees/`, {
        class_section_id: selectedClassId,
        offered_total: offeredTotal,
        reason: reason.trim()
      });
      toast.success('Student class and fees updated successfully.');
      onSuccess();
      onClose();
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.response?.data?.message || 'Failed to update student class and fees.';
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-8 pb-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-1">Super Admin Actions</span>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-wide">Edit Class & Fees</h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Student: <span className="font-bold text-slate-800">{student.first_name} {student.last_name}</span> ({student.admission_number})
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shadow-inner"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* Warning Banner for Payments */}
          {hasPaidAlready && (
            <div className="flex gap-4 p-5 bg-amber-50 rounded-3xl border border-amber-100/70 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest">Active Payments Found</h4>
                <p className="text-xs text-amber-600 leading-relaxed font-medium">
                  This student has already paid <span className="font-extrabold">₹{student.fee_stats.total_paid.toLocaleString('en-IN')}</span> on their current invoice. 
                  {isClassChanged && " Changing their class will cancel the existing annual invoice, but payments already received will stay recorded. A manual reconciliation or credit note application will be required."}
                </p>
              </div>
            </div>
          )}

          {/* Current vs New Class Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Class</label>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-600">
                {student.class_section_display || 'Not Enrolled'}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Class <span className="text-red-500">*</span></label>
              {loadingClasses ? (
                <div className="h-14 bg-slate-50 animate-pulse rounded-2xl border border-slate-100" />
              ) : (
                <select 
                  required
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="w-full h-14 px-4 bg-white border border-slate-200 focus:border-blue-600 rounded-2xl text-sm font-bold text-slate-800 transition-colors focus:outline-none"
                >
                  <option value="">Select a new class...</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.display_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Fee Configuration Panel */}
          <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Receipt size={16} className="text-blue-600" />
                Fee Structure Config
              </h4>
              {feeStructure && (
                <span className="text-[9px] font-black px-3 py-1 bg-green-100 text-green-700 rounded-full uppercase tracking-wider">
                  Structure Loaded
                </span>
              )}
            </div>

            {loadingStructure ? (
              <div className="space-y-3 py-4">
                <div className="h-4 bg-slate-200 animate-pulse rounded w-1/3" />
                <div className="h-10 bg-slate-200 animate-pulse rounded-xl" />
              </div>
            ) : feeStructure ? (
              <div className="space-y-4">
                {/* Fee structure items list */}
                <div className="max-h-40 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
                  {(feeStructure.items || []).map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center text-xs font-semibold py-1.5 border-b border-slate-100 last:border-0">
                      <span className="text-slate-500 uppercase tracking-wider">{item.category_name || item.category}</span>
                      <span className="text-slate-800 tabular-nums">₹{Number(item.amount).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200/60 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Standard Total</label>
                    <p className="text-base font-black text-slate-600 tabular-nums">₹{standardTotal.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Agreed Offered Total (₹) <span className="text-red-500">*</span></label>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={offeredTotal}
                      onChange={e => setOfferedTotal(Number(e.target.value))}
                      className="w-full h-11 px-3 bg-white border border-slate-200 focus:border-blue-600 rounded-xl text-sm font-bold text-slate-800 transition-colors focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                {/* Reduction warning / status */}
                {offeredTotal < standardTotal && (
                  <div className="flex gap-2 p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-[11px] text-blue-700 font-medium leading-relaxed">
                    <Info size={14} className="shrink-0 mt-0.5 text-blue-600" />
                    <span>
                      An offered total below the standard total (₹{standardTotal.toLocaleString()}) will trigger the system's discount approval routing after creation.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
                <Receipt size={28} className="text-slate-300 mb-2" />
                <p className="text-xs font-black uppercase tracking-wider">
                  {selectedClassId ? 'No active structure found for selected grade.' : 'Select class to preview fees.'}
                </p>
                {selectedClassId && (
                  <p className="text-[10px] text-red-500 mt-1 font-semibold">
                    Enrollment is blocked without active fees. Ensure a fee structure is configured first.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Audit Reason Text Area */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
              <span>Reason for Modification <span className="text-red-500">*</span></span>
              <span className="text-[9px] text-slate-400 font-semibold uppercase">Mandatory Audit Log</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide a detailed explanation of why the class and/or fees are being changed (e.g. 'Scholarship approved by Principal', 'Correction of data entry error during admission')."
              className="w-full p-4 border border-slate-200 focus:border-blue-600 rounded-2xl text-xs font-medium text-slate-800 transition-colors focus:outline-none leading-relaxed"
            />
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-8 border-t border-slate-50 flex items-center justify-between bg-slate-50/20">
          <button 
            type="button" 
            onClick={onClose}
            className="px-8 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors uppercase tracking-widest"
          >
            Cancel
          </button>
          
          <button 
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedClassId || !feeStructure || offeredTotal <= 0 || !reason.trim()}
            className="bg-blue-600 text-white px-10 py-3.5 rounded-2xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-blue-200 tracking-widest uppercase flex items-center gap-2"
          >
            {submitting ? 'Updating...' : 'Update Class & Fees'}
            <ArrowRight size={14} />
          </button>
        </div>

      </div>
    </div>
  );
}
