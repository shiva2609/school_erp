import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/common/AuthProvider';
import { useBranch } from '@/components/common/BranchContext';
import api from '@/lib/axios';
import { Search } from 'lucide-react';

interface ReportFiltersProps {
  onFilterChange: (filters: any) => void;
  showDateRange?: boolean;
  showAcademicYear?: boolean;
  showClassSection?: boolean;
  showExam?: boolean;
  showStatus?: boolean;
  statusOptions?: { value: string; label: string }[];
  showAdSource?: boolean;
  showPaymentMode?: boolean;
  showVendor?: boolean;
  showExpenseCategory?: boolean;
  /** Free-text / datalist: sent as `expense_type` (category name contains, case-insensitive). */
  showExpenseTypeSearch?: boolean;
  /** Free-text / datalist: sent as `vendor_name` (vendor name contains). */
  showVendorNameSearch?: boolean;
}

export default function ReportFilters({
  onFilterChange,
  showDateRange = true,
  showAcademicYear = true,
  showClassSection = true,
  showExam = false,
  showStatus = false,
  statusOptions = [],
  showAdSource = false,
  showPaymentMode = false,
  showVendor = false,
  showExpenseCategory = false,
  showExpenseTypeSearch = false,
  showVendorNameSearch = false,
}: ReportFiltersProps) {
  const { user } = useAuth();
  const { selectedBranch } = useBranch();

  const [filters, setFilters] = useState<any>({
    branch_id: '',
    academic_year_id: '',
    startDate: '',
    endDate: '',
    class_id: '',
    section_id: '',
    exam_id: '',
    status: '',
    source: '',
    payment_mode: '',
    vendor_id: '',
    expense_category_id: '',
    expense_type: '',
    vendor_name: '',
  });

  const [branches, setBranches] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [classSections, setClassSections] = useState<any[]>([]);
  const [examTerms, setExamTerms] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);

  const effectiveBranchId =
    filters.branch_id ||
    (selectedBranch && selectedBranch !== 'all' ? selectedBranch : '');

  useEffect(() => {
    if (['SUPER_ADMIN', 'OWNER'].includes(user?.role || '')) {
      fetchBranches();
    }
    if (showAcademicYear || showExam) fetchAcademicYears();
    if (showClassSection) fetchClassSections();
  }, [user, showAcademicYear, showClassSection, showExam]);

  useEffect(() => {
    if (!showExam) return;
    const loadExams = async () => {
      try {
        const params: Record<string, string> = {};
        if (filters.branch_id) params.branch_id = filters.branch_id;
        if (filters.academic_year_id) params.academic_year_id = filters.academic_year_id;
        const res = await api.get('reports/academics/exam-terms/', { params });
        const raw = res.data?.data ?? res.data;
        setExamTerms(Array.isArray(raw) ? raw : []);
      } catch (e) {
        console.error('Failed to fetch exam terms:', e);
        setExamTerms([]);
      }
    };
    loadExams();
  }, [showExam, filters.branch_id, filters.academic_year_id]);

  useEffect(() => {
    const needCategories = showExpenseCategory || showExpenseTypeSearch;
    const needVendors = showVendor || showVendorNameSearch;
    if (!needCategories && !needVendors) return;
    const qp = effectiveBranchId ? `?branch_id=${effectiveBranchId}` : '';
    const unwrap = (res: any) => {
      const d = res.data?.data ?? res.data;
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.results)) return d.results;
      return [];
    };
    const load = async () => {
      try {
        const [catRes, vendRes] = await Promise.all([
          needCategories ? api.get(`expenses/categories/${qp}`) : Promise.resolve({ data: null }),
          needVendors ? api.get(`vendors/${qp}`) : Promise.resolve({ data: null }),
        ]);
        if (needCategories) setExpenseCategories(unwrap(catRes));
        if (needVendors) setVendors(unwrap(vendRes));
      } catch (e) {
        console.error('Failed to fetch expense categories / vendors:', e);
        if (needCategories) setExpenseCategories([]);
        if (needVendors) setVendors([]);
      }
    };
    load();
  }, [showVendor, showExpenseCategory, showExpenseTypeSearch, showVendorNameSearch, effectiveBranchId]);

  const fetchBranches = async () => {
    try {
      const res = await api.get('tenants/branches/');
      const raw = res.data?.data ?? res.data?.results ?? res.data;
      setBranches(Array.isArray(raw) ? raw : []);
    } catch (e) {
      console.error('Failed to fetch branches:', e);
    }
  };

  const fetchAcademicYears = async () => {
    try {
      const res = await api.get('tenants/academic-years/');
      const raw = res.data?.data ?? res.data?.results ?? res.data;
      setAcademicYears(Array.isArray(raw) ? raw : []);
    } catch (e) {
      console.error('Failed to fetch academic years:', e);
    }
  };

  const fetchClassSections = async () => {
    try {
      const res = await api.get('classes/');
      const raw = res.data?.data ?? res.data?.results ?? res.data;
      setClassSections(Array.isArray(raw) ? raw : []);
    } catch (e) {
      console.error('Failed to fetch class sections:', e);
    }
  };

  const handleChange = (key: string, value: string) => {
    setFilters((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    // Only pass non-empty values
    const cleanFilters: any = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) cleanFilters[k] = v;
    });
    onFilterChange(cleanFilters);
  };

  // Derive unique grades from class sections for the grade dropdown
  const uniqueGrades = [...new Set(classSections.map((cs: any) => cs.grade))].sort();

  const selectClass = "p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 mb-6">
      <div className="flex flex-wrap gap-4 items-end">
        {['SUPER_ADMIN', 'OWNER'].includes(user?.role || '') && (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Branch</label>
            <select 
              className={selectClass}
              value={filters.branch_id}
              onChange={(e) => handleChange('branch_id', e.target.value)}
            >
              <option value="">All Branches</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {(showAcademicYear || showExam) && (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Academic Year</label>
            <select 
              className={selectClass}
              value={filters.academic_year_id}
              onChange={(e) => handleChange('academic_year_id', e.target.value)}
            >
              <option value="">Current Year</option>
              {academicYears.map((ay: any) => (
                <option key={ay.id} value={ay.id}>{ay.name}</option>
              ))}
            </select>
          </div>
        )}

        {showExam && (
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Exam term</label>
            <select
              className={selectClass}
              value={filters.exam_id}
              onChange={(e) => handleChange('exam_id', e.target.value)}
            >
              <option value="">Select exam…</option>
              {examTerms.map((ex: any) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>
        )}

        {showDateRange && (
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Start Date</label>
              <input 
                type="date" 
                className={selectClass}
                value={filters.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">End Date</label>
              <input 
                type="date" 
                className={selectClass}
                value={filters.endDate}
                onChange={(e) => handleChange('endDate', e.target.value)}
              />
            </div>
          </div>
        )}

        {showClassSection && (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Class</label>
            <select 
              className={selectClass}
              value={filters.class_id}
              onChange={(e) => {
                const v = e.target.value;
                setFilters((prev: any) => ({ ...prev, class_id: v, section_id: '' }));
              }}
            >
              <option value="">All Classes</option>
              {uniqueGrades.map((grade: any) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
          </div>
        )}

        {showClassSection && filters.class_id && (
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Section</label>
            <select
              className={selectClass}
              value={filters.section_id}
              onChange={(e) => handleChange('section_id', e.target.value)}
            >
              <option value="">All sections</option>
              {classSections
                .filter((cs: any) => cs.grade === filters.class_id)
                .slice()
                .sort((a: any, b: any) => String(a.section || '').localeCompare(String(b.section || '')))
                .map((cs: any) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.display_name || `${cs.grade} - ${cs.section}`}
                  </option>
                ))}
            </select>
          </div>
        )}

        {showStatus && (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
            <select 
              className={selectClass}
              value={filters.status}
              onChange={(e) => handleChange('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              {statusOptions.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        )}

        {showAdSource && (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Source</label>
            <select 
              className={selectClass}
              value={filters.source}
              onChange={(e) => handleChange('source', e.target.value)}
            >
              <option value="">All Sources</option>
              {['WALKIN', 'WEBSITE', 'REFERRAL', 'CAMPAIGN', 'OTHER'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {showPaymentMode && (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Payment Mode</label>
            <select 
              className={selectClass}
              value={filters.payment_mode}
              onChange={(e) => handleChange('payment_mode', e.target.value)}
            >
              <option value="">All Modes</option>
              {['CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER', 'CARD'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {showExpenseCategory && (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Exp. Category</label>
            <select 
              className={selectClass}
              value={filters.expense_category_id}
              onChange={(e) => handleChange('expense_category_id', e.target.value)}
            >
              <option value="">All Categories</option>
              {expenseCategories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {showVendor && (
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-xs font-semibold text-slate-500 uppercase">Vendor</label>
            <select 
              className={selectClass}
              value={filters.vendor_id}
              onChange={(e) => handleChange('vendor_id', e.target.value)}
            >
              <option value="">All Vendors</option>
              {vendors.map((v: any) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}

        {showExpenseTypeSearch && (
          <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 sm:max-w-xs">
            <label className="text-xs font-semibold text-slate-500 uppercase">Filter by expense type</label>
            <input
              type="text"
              className={selectClass}
              list="report-expense-type-options"
              placeholder="e.g. Stationery, Miscellaneous"
              value={filters.expense_type}
              onChange={(e) => handleChange('expense_type', e.target.value)}
              autoComplete="off"
            />
            <datalist id="report-expense-type-options">
              {expenseCategories.map((c: any) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
        )}

        {showVendorNameSearch && (
          <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 sm:max-w-xs">
            <label className="text-xs font-semibold text-slate-500 uppercase">Filter by vendor name</label>
            <input
              type="text"
              className={selectClass}
              list="report-vendor-name-options"
              placeholder="Type or pick a vendor"
              value={filters.vendor_name}
              onChange={(e) => handleChange('vendor_name', e.target.value)}
              autoComplete="off"
            />
            <datalist id="report-vendor-name-options">
              {vendors.filter((v: any) => v?.name).map((v: any) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
          </div>
        )}

        {/* Generate Report Button */}
        <button
          onClick={handleSubmit}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <Search size={16} />
          Generate Report
        </button>
      </div>
    </div>
  );
}
