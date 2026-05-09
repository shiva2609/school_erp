import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, FileText, AlertCircle, CheckCircle2, Download, RefreshCw, Info, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '@/lib/axios';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** From branch context; may be empty when backend should use the logged-in user's branch. */
  branchId: string;
  /** Roles that see the header branch selector must pick a concrete branch (not "All Branches"). */
  requireExplicitBranch?: boolean;
}

type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface JobData {
  id: string;
  status: JobStatus;
  total_rows: number;
  processed_rows: number;
  success_count: number;
  skipped_duplicates: number;
  errors: string[];
}

export default function CsvImportModal({
  isOpen,
  onClose,
  onSuccess,
  branchId,
  requireExplicitBranch = false,
}: Props) {
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [ayId, setAyId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [jobData, setJobData] = useState<JobData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchAcademicYears = async () => {
      try {
        const res = await api.get('tenants/academic-years/');
        const raw = res.data?.data ?? res.data?.results ?? res.data;
        const years = Array.isArray(raw) ? raw : [];
        setAcademicYears(years);
        const active = years.find((ay: any) => ay.is_active === true);
        if (active) setAyId(active.id);
      } catch (e) {
        console.error('Failed to fetch academic years:', e);
        toast.error('Could not load academic years.');
      }
    };
    fetchAcademicYears();
  }, [isOpen]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const startPolling = useCallback((jobId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await api.get(`students/import-csv/status/${jobId}/`);
        const data: JobData = res.data.data;
        setJobData(data);

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          if (data.status === 'COMPLETED') {
            const hasErrors = data.errors && data.errors.length > 0;
            if (hasErrors) {
              toast.success(`Imported ${data.success_count} student(s). ${data.errors.length} row(s) had errors.`);
            } else {
              toast.success(`Successfully imported ${data.success_count} student(s)!`);
              setTimeout(() => { onSuccess(); handleClose(); }, 2000);
            }
            onSuccess();
          } else {
            toast.error('Import failed. Please check errors and retry.');
          }
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000); // poll every 2 seconds
  }, [onSuccess]);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const lowerName = droppedFile.name.toLowerCase();
      if (lowerName.endsWith('.csv') || lowerName.endsWith('.xlsx')) {
        setFile(droppedFile);
        setJobData(null);
      } else {
        toast.error("Please upload a .csv or .xlsx file.");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return toast.error("Please select a file.");
    if (requireExplicitBranch && !String(branchId || '').trim()) {
      return toast.error('Select a branch in the header (not "All Branches") before importing.');
    }

    setUploading(true);
    setJobData(null);

    const formData = new FormData();
    formData.append('file', file, file.name || 'upload.csv');
    const b = String(branchId || '').trim();
    if (b) formData.append('branch_id', b);
    if (String(ayId || '').trim()) formData.append('academic_year_id', ayId);

    try {
      // Do not set Content-Type manually — the browser/axios must add the multipart boundary.
      const res = await api.post('students/import-csv/', formData);
      const data = res.data;

      if (data.success && data.job_id) {
        toast.success('Import started in the background.');
        // Set initial job state and start polling
        setJobData({
          id: data.job_id,
          status: 'PENDING',
          total_rows: 0,
          processed_rows: 0,
          success_count: 0,
          skipped_duplicates: 0,
          errors: [],
        });
        startPolling(data.job_id);
      } else {
        toast.error(data.detail || 'Import failed to start.');
      }
    } catch (err: any) {
      const data = err.response?.data;
      const errMsgs = data?.errors && Array.isArray(data.errors) ? data.errors : [];
      toast.error(data?.detail || 'Import failed.');
      // Show errors from server in UI
      if (errMsgs.length > 0) {
        setJobData({
          id: '',
          status: 'FAILED',
          total_rows: 0,
          processed_rows: 0,
          success_count: 0,
          skipped_duplicates: 0,
          errors: errMsgs,
        });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
    setFile(null);
    setJobData(null);
    setUploading(false);
    setAyId('');
    onClose();
  };

  const downloadTemplate = () => {
    const headers = [
      'first_name', 'last_name', 'date_of_birth', 'gender', 'grade', 'section',
      'admission_number', 'roll_number', 'blood_group', 'religion', 'caste_category',
      'aadhar_number', 'mother_tongue', 'nationality',
      'father_name', 'father_phone', 'father_email', 'father_occupation', 'father_qualification', 'father_aadhaar',
      'mother_name', 'mother_phone', 'mother_email', 'mother_occupation', 'mother_qualification', 'mother_aadhaar',
      'guardian_name', 'guardian_phone', 'guardian_relation',
      'address', 'city', 'district', 'state', 'pincode',
      'previous_school_name', 'previous_class', 'previous_school_ay',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
      'total_fee', 'fee_paid', 'concession_amount', 'fee_due_date', 'past_due_amount', 'past_due_year'
    ];
    const sample = [
      'John', 'Doe', '2015-05-20', 'MALE', '5', 'A',
      'OLD-SIS-1092', '12', 'A+', 'Hindu', 'OC', '123456789012', 'English', 'Indian',
      'James Doe', '9876543210', 'james@example.com', 'Engineer', 'B.Tech', '987654321098',
      'Jane Doe', '9876543211', 'jane@example.com', 'Teacher', 'M.A.', '876543210987',
      '', '', '',
      '123 Main St', 'Hyderabad', 'Rangareddy', 'Telangana', '500001',
      'ABC School', 'Grade 4', '2024-25',
      'James Doe', '9876543210', 'Father',
      '45000', '15000', '5000', '2025-06-01', '0', ''
    ];
    const csv = headers.join(',') + '\n' + sample.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "student_import_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const isProcessing = jobData && (jobData.status === 'PENDING' || jobData.status === 'PROCESSING');
  const isCompleted = jobData?.status === 'COMPLETED';
  const isFailed = jobData?.status === 'FAILED';
  const progress = jobData && jobData.total_rows > 0
    ? Math.round((jobData.processed_rows / jobData.total_rows) * 100)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Bulk Import Students</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Upload a CSV or XLSX to import students, parents, and fee records at once.</p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Target Academic Year</label>
              <select
                value={ayId}
                onChange={e => setAyId(e.target.value)}
                disabled={!!isProcessing}
                className="w-full px-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none disabled:opacity-60"
              >
                <option value="">Auto-Detect Current Year...</option>
                {academicYears.map((ay: any) => (
                  <option key={ay.id} value={ay.id}>
                    {ay.name || ay.display_name || `${ay.start_date?.substring(0, 4)}-${ay.end_date?.substring(0, 4)}`}
                    {ay.is_active ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={downloadTemplate}
              className="px-4 py-2 border border-gray-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 h-[42px]"
            >
              <Download size={14} /> Template
            </button>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
            <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 leading-relaxed">
              <strong>Admission numbers:</strong> New students always get an ID in your school’s configured format (Setup / tenant). Put their <strong>old SIS admission number</strong> in the <code className="bg-blue-100 px-1 rounded">admission_number</code> column — it is stored as legacy for traceability and duplicate detection; the live <strong>Admission</strong> field in the app is the generated one.
              <br />
              <strong>Financial migration (optional):</strong> <code className="bg-blue-100 px-1 rounded">total_fee</code>, <code className="bg-blue-100 px-1 rounded">fee_paid</code>, <code className="bg-blue-100 px-1 rounded">concession_amount</code> create one annual invoice + payment; <code className="bg-blue-100 px-1 rounded">past_due_amount</code> + <code className="bg-blue-100 px-1 rounded">past_due_year</code> create a carry-forward record (not full historical invoices). If fee columns are blank, standard fees are generated.
              <br />
              <strong>Dates:</strong> YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY. <strong>Grades:</strong> NURSERY, LKG, 1 … 10, 11_SCIENCE, etc. Rows matching an existing student (legacy admission, same admission no, or same name+DOB+class) are skipped as duplicates.
            </div>
          </div>

          {/* File Drop Zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
              file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-slate-50'
            } ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
          >
            <input
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) {
                  const lowerName = selectedFile.name.toLowerCase();
                  if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.xlsx')) {
                    toast.error("Please upload a .csv or .xlsx file.");
                    return;
                  }
                  setFile(selectedFile);
                  setJobData(null);
                }
              }}
            />
            {file ? (
              <>
                <FileText className="text-blue-500 mb-3" size={32} />
                <h3 className="text-sm font-bold text-blue-900">{file.name}</h3>
                <p className="text-xs text-blue-600/70 mt-1">{(file.size / 1024).toFixed(2)} KB • Click to change</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 mb-3 text-slate-400">
                  <Upload size={20} />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Click to upload or drag and drop</h3>
                <p className="text-xs text-slate-500 mt-1">CSV or XLSX file. First row must be headers.</p>
              </>
            )}
          </div>

          {/* Progress Tracker */}
          {isProcessing && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                <Loader2 size={16} className="animate-spin" />
                {jobData?.status === 'PENDING' ? 'Queued — waiting for worker...' : `Processing rows in the background...`}
              </div>
              {progress !== null && (
                <>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-blue-600">
                    {jobData?.processed_rows} / {jobData?.total_rows} rows processed ({progress}%)
                    {jobData?.success_count !== undefined && ` · ${jobData.success_count} imported`}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Completed Banner */}
          {isCompleted && (
            <div className={`border rounded-xl p-4 ${jobData.errors?.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${jobData.errors?.length > 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                  <CheckCircle2 size={16} className={jobData.errors?.length > 0 ? 'text-amber-600' : 'text-emerald-600'} />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${jobData.errors?.length > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {jobData.errors?.length > 0 ? 'Partial Import Complete' : 'Import Successful'}
                  </p>
                  <p className={`text-xs mt-0.5 ${jobData.errors?.length > 0 ? 'text-amber-600/80' : 'text-emerald-600/80'}`}>
                    {jobData.success_count} imported
                    {jobData.skipped_duplicates > 0 ? ` · ${jobData.skipped_duplicates} duplicate${jobData.skipped_duplicates !== 1 ? 's' : ''} skipped` : ''}
                    {jobData.errors?.length > 0 ? ` · ${jobData.errors.length} row(s) NOT imported (see below)` : ''}
                    {' · Fees and parent accounts created automatically'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Failed Banner */}
          {isFailed && !jobData?.errors?.length && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                <AlertCircle size={16} />
                Import Failed
              </div>
              <p className="text-xs text-rose-600 mt-1">The background worker encountered an unexpected error. Please try again or contact support.</p>
            </div>
          )}

          {/* Per-row Errors */}
          {jobData?.errors && jobData.errors.length > 0 && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
              <div className="flex items-center gap-2 text-rose-600 font-bold mb-1.5 text-sm">
                <AlertCircle size={16} />
                {isFailed ? 'Import Failed — No Students Were Imported' : `${jobData.errors.length} Student${jobData.errors.length !== 1 ? 's' : ''} Could Not Be Imported`}
              </div>
              <p className="text-xs text-rose-600/80 mb-2">
                {isFailed
                  ? 'All rows failed. Fix the issues below and re-upload.'
                  : 'The rows below had errors and were skipped. All other students were imported successfully.'
                }
              </p>
              <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {jobData.errors.map((err, i) => {
                  const colonIdx = err.indexOf(': ');
                  const label = colonIdx > -1 ? err.substring(0, colonIdx) : `Error ${i + 1}`;
                  const msg = colonIdx > -1 ? err.substring(colonIdx + 2) : err;
                  return (
                    <li key={i} className="text-xs bg-white border border-rose-100 rounded-lg px-3 py-2">
                      <span className="font-bold text-rose-700">{label}: </span>
                      <span className="text-rose-600 font-mono">{msg}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            {isProcessing ? 'Close (running in background)' : 'Cancel'}
          </button>
          <button
            onClick={handleUpload}
            disabled={
              !file ||
              (requireExplicitBranch && !String(branchId || '').trim()) ||
              uploading ||
              !!isProcessing ||
              isCompleted
            }
            className={`px-6 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2 ${
              file &&
              (!requireExplicitBranch || !!String(branchId || '').trim()) &&
              !uploading &&
              !isProcessing &&
              !isCompleted
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {uploading ? (
              <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
            ) : (
              'Upload & Import Data'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
