"use client";

import React, { useState, useMemo } from 'react';
import { useApi } from '@/lib/hooks';
import api from '@/lib/axios';
import { useResolvedPush } from '@/hooks/useResolvedNavigation';
import { ArrowLeft, Save, Building2, User, Info, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useBranch } from '@/components/common/BranchContext';
import { useConfirm } from '@/components/common/ConfirmProvider';

export default function CreateVendorBillPage() {
  const { selectedBranch } = useBranch();
  const push = useResolvedPush();
  const { confirm } = useConfirm();
  const branchParam = selectedBranch ? `branch_id=${selectedBranch}` : '';
  
  const [billType, setBillType] = useState<'GENERAL' | 'COMMUTE'>('GENERAL');
  
  const { data: vendorsData } = useApi<any[]>(`/vendors/?${branchParam}&category=${billType}&is_active=true`);
  const vendors = Array.isArray(vendorsData) ? vendorsData : [];
  
  const { data: categoriesData } = useApi<any[]>(`/expenses/categories/${branchParam ? `?${branchParam}` : ''}`);
  const categories = Array.isArray(categoriesData) ? categoriesData : [];

  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<string>('BANK_TRANSFER');
  const [description, setDescription] = useState<string>('');
  
  const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean, amount: string }>>({});
  const [applyTds, setApplyTds] = useState(false);
  const [tdsPercentage, setTdsPercentage] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const selectedVendor = useMemo(() => {
    return vendors.find(v => v.id === selectedVendorId) || null;
  }, [vendors, selectedVendorId]);

  const vendorExpenseTypes = useMemo(() => {
    if (!selectedVendor) return [];
    return categories.filter(c => selectedVendor.associated_expense_types?.includes(c.id));
  }, [selectedVendor, categories]);

  // Calculations
  const totalAmount = useMemo(() => {
    let total = 0;
    Object.values(selectedItems).forEach(item => {
      if (item.selected && item.amount) {
        total += parseFloat(item.amount) || 0;
      }
    });
    return total;
  }, [selectedItems]);

  const tdsAmount = useMemo(() => {
    if (!applyTds || !tdsPercentage) return 0;
    const perc = parseFloat(tdsPercentage) || 0;
    return (totalAmount * perc) / 100;
  }, [totalAmount, applyTds, tdsPercentage]);

  const netAmount = totalAmount - tdsAmount;

  const handleItemToggle = (categoryId: string) => {
    setSelectedItems(prev => ({
      ...prev,
      [categoryId]: {
        selected: !prev[categoryId]?.selected,
        amount: prev[categoryId]?.amount || ''
      }
    }));
  };

  const handleItemAmountChange = (categoryId: string, amount: string) => {
    setSelectedItems(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        amount
      }
    }));
  };

  const downloadReceipt = async (billId: string) => {
    try {
      const response = await api.get(`/vendor-bills/${billId}/receipt/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Receipt_${billId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to download receipt', err);
    }
  };

  const handleSave = async () => {
    if (!selectedVendorId) {
      toast.error('Please select a vendor.');
      return;
    }
    
    const itemsPayload = Object.entries(selectedItems)
      .filter(([_, data]) => data.selected && parseFloat(data.amount) > 0)
      .map(([catId, data]) => ({
        expense_type: catId,
        expense_type_name: categories.find(c => c.id === catId)?.name || 'Unknown',
        amount: parseFloat(data.amount)
      }));

    if (itemsPayload.length === 0) {
      toast.error('Please select at least one expense type and enter a valid amount.');
      return;
    }

    if (!billDate) {
      toast.error('Bill Date is required.');
      return;
    }

    const payload = {
      vendor: selectedVendorId,
      bill_date: billDate,
      payment_mode: paymentMode,
      description,
      total_amount: totalAmount,
      tds_percentage: applyTds ? (parseFloat(tdsPercentage) || 0) : 0,
      tds_amount: tdsAmount,
      net_amount: netAmount,
      items: itemsPayload
    };

    const ok = await confirm({
      title: "Confirm Submit",
      message: `Are you sure you want to submit this bill for ₹${netAmount}? This action cannot be undone.`,
      confirmText: "Submit Bill",
      isDestructive: false,
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await api.post('/vendor-bills/', payload);
      const newBill = res.data;
      toast.success('Vendor Bill submitted for approval!');
      
      // Auto download receipt
      await downloadReceipt(newBill.id);
      
      push('/vendor-bills');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save Vendor Bill.');
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-32">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => push('/vendor-bills')}
            className="p-2 text-slate-400 hover:text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Create Vendor Bill</h1>
            <p className="text-slate-500 mt-1">Select a vendor, add expenses, and generate a bill.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Vendor Selection & Info */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">1. Select Vendor</h3>
            
            <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => { setBillType('GENERAL'); setSelectedVendorId(''); setSelectedItems({}); setApplyTds(false); }}
                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${billType === 'GENERAL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                General Bill
              </button>
              <button 
                onClick={() => { setBillType('COMMUTE'); setSelectedVendorId(''); setSelectedItems({}); setApplyTds(false); }}
                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${billType === 'COMMUTE' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Commute Bill
              </button>
            </div>

            <select
              value={selectedVendorId}
              onChange={(e) => {
                const vid = e.target.value;
                setSelectedVendorId(vid);
                const vendor = vendors.find(v => v.id === vid);
                if (vendor) {
                  const associatedCats = categories.filter(c => vendor.associated_expense_types?.includes(c.id));
                  const initItems: Record<string, { selected: boolean, amount: string }> = {};
                  associatedCats.forEach(c => {
                    initItems[c.id] = { selected: false, amount: '' };
                  });
                  setSelectedItems(initItems);
                } else {
                  setSelectedItems({});
                }
                setApplyTds(false);
                setTdsPercentage('');
              }}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 ring-blue-500 outline-none transition-all font-semibold text-slate-700"
            >
              <option value="">-- Choose Vendor --</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>

            {selectedVendor && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  {selectedVendor.vendor_type === 'COMPANY' ? <Building2 size={16} className="text-indigo-500"/> : <User size={16} className="text-orange-500"/>}
                  <span className="font-bold text-slate-800">{selectedVendor.name}</span>
                </div>
                
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Type</span>
                    <span className="font-semibold text-slate-700">{selectedVendor.vendor_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mobile</span>
                    <span className="font-semibold text-slate-700">{selectedVendor.phone || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email</span>
                    <span className="font-semibold text-slate-700">{selectedVendor.email || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PAN</span>
                    <span className="font-semibold text-slate-700">{selectedVendor.pan_number || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Aadhaar</span>
                    <span className="font-semibold text-slate-700">{selectedVendor.aadhaar || '-'}</span>
                  </div>
                </div>
              </div>
            )}
            
            {!selectedVendor && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
                <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Vendor details and associated expense types will automatically load once selected.
                </p>
              </div>
            )}
          </div>

          {selectedVendor && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">3. Additional Details</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Bill Date *</label>
                  <input 
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Payment Mode *</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 ring-blue-500"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Description (Optional)</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="E.g. Invoice #1234 for services rendered in May."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 ring-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Expense Items & Math */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">2. Expense Breakdown</h3>
              <p className="text-xs text-slate-500 mt-1">Select the applicable expense types for this bill and enter the amounts.</p>
            </div>
            
            <div className="p-5 space-y-4">
              {!selectedVendor ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  Please select a vendor first.
                </div>
              ) : vendorExpenseTypes.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  This vendor has no associated expense types. <br/>Edit the vendor to add some.
                </div>
              ) : (
                <div className="space-y-3">
                  {vendorExpenseTypes.map(cat => {
                    const isSelected = selectedItems[cat.id]?.selected || false;
                    const amount = selectedItems[cat.id]?.amount || '';
                    
                    return (
                      <div key={cat.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isSelected ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100 hover:border-slate-200'
                      }`}>
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleItemToggle(cat.id)}
                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className={`font-medium ${isSelected ? 'text-blue-800 font-bold' : 'text-slate-600'}`}>
                            {cat.name}
                          </span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                          <input 
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!isSelected}
                            value={amount}
                            onChange={(e) => handleItemAmountChange(cat.id, e.target.value)}
                            placeholder="0.00"
                            className={`w-32 pl-7 pr-3 py-2 text-right rounded-lg outline-none transition-all font-semibold ${
                              isSelected 
                                ? 'bg-white border border-blue-200 focus:ring-2 ring-blue-500 text-slate-800 shadow-sm' 
                                : 'bg-slate-50 border border-transparent text-slate-400 cursor-not-allowed'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* TDS Section */}
            {selectedVendor && (
              <div className="bg-slate-50 border-t border-slate-100 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox"
                    id="apply-tds"
                    checked={applyTds}
                    onChange={(e) => setApplyTds(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="apply-tds" className="font-bold text-slate-700 cursor-pointer">
                    Apply TDS Deductions
                  </label>
                </div>
                
                {applyTds && (
                  <div className="pl-8 flex items-center gap-4">
                    <div className="relative w-32">
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={tdsPercentage}
                        onChange={(e) => setTdsPercentage(e.target.value)}
                        placeholder="0"
                        className="w-full pr-8 pl-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 ring-blue-500 font-semibold text-right"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                    </div>
                    <span className="text-sm text-slate-500 font-medium">TDS Percentage</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Live Totals */}
            <div className="bg-slate-800 text-white p-6 space-y-3">
              <div className="flex justify-between text-sm text-slate-300">
                <span>Total Gross Amount</span>
                <span className="font-semibold">₹{totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-300">
                <span>Total TDS Deductions</span>
                <span className="font-semibold text-rose-400">- ₹{tdsAmount.toFixed(2)}</span>
              </div>
              <div className="border-t border-slate-600 pt-3 mt-3 flex justify-between items-end">
                <span className="font-bold uppercase tracking-wider text-slate-300 text-sm">Net Payable</span>
                <span className="text-3xl font-black text-emerald-400 tracking-tight">₹{netAmount.toFixed(2)}</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText size={24} className="text-blue-500" />
            <div>
              <p className="font-bold text-slate-800 text-sm">Ready to save?</p>
              <p className="text-xs text-slate-500">Bill will be sent for approval.</p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving || !selectedVendorId || totalAmount <= 0}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all shadow-sm ${
              saving || !selectedVendorId || totalAmount <= 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
            }`}
          >
            {saving ? 'Saving...' : (
              <>
                <CheckCircle2 size={18} />
                Save & Generate Bill
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
