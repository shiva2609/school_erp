"use client";

import React, { useState, useEffect } from 'react';
import api from '@/lib/axios';
import DateInput from '@/components/DateInput';
import { Receipt, X, User, Users, MapPin, GraduationCap, FileText, IndianRupee } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface StudentFormData {
  id?: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  blood_group: string;
  nationality: string;
  religion: string;
  caste_category: string;
  aadhar_number: string;
  mother_tongue: string;
  identification_mark_1: string;
  identification_mark_2: string;
  health_status: string;
  tenant: string;
  branch: string;
  academic_year: string;
  class_section: string;
  admission_number: string;
  father_name: string;
  father_phone: string;
  father_email: string;
  father_qualification: string;
  father_occupation: string;
  father_aadhaar: string;
  mother_name: string;
  mother_phone: string;
  mother_email: string;
  mother_qualification: string;
  mother_occupation: string;
  mother_aadhaar: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_relation: string;
  address_line1: string;
  apartment_name: string;
  address_line2: string;
  landmark: string;
  city: string;
  mandal: string;
  district: string;
  state: string;
  pincode: string;
  previous_school_name: string;
  previous_class: string;
  previous_school_ay: string;
  source: string;
  doc_tc_submitted: boolean;
  doc_bonafide_submitted: boolean;
  doc_birth_cert_submitted: boolean;
  doc_caste_cert_submitted: boolean;
  doc_aadhaar_submitted: boolean;
  admission_staff_name: string;
  admission_staff_phone: string;
  roll_number: string | number;
  offered_total: number;
  standard_total: number;
  locked_total: number;
  reason: string;
  [key: string]: any; // Allow for extra backend fields
}

/** Aadhaar is 12 digits; keep as string and strip non-digits so mobile keyboards / paste never truncate oddly. */
function digitsOnlyAadhaar(raw: string, maxLen = 12): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, maxLen);
}

interface StudentFormProps {
  initialData?: Partial<StudentFormData>;
  onSubmit: (data: StudentFormData) => Promise<void>;
  onCancel: () => void;
  title?: string;
  submitLabel?: string;
  isEdit?: boolean;
  /** When true (default), father/mother email is required if name or phone is set — skipped for profile edit / admission-style flows. */
  requireParentEmails?: boolean;
}

const DEFAULT_FORM_DATA: StudentFormData = {
  // Identity
  first_name: '', last_name: '', date_of_birth: '', gender: 'MALE',
  blood_group: 'UNKNOWN', nationality: 'Indian', religion: '', 
  caste_category: 'OC', aadhar_number: '', mother_tongue: '',
  identification_mark_1: '', identification_mark_2: '', health_status: '',
  
  // Organization
  tenant: '', branch: '', academic_year: '', class_section: '',
  admission_number: '', 

  // Parents
  father_name: '', father_phone: '', father_email: '', father_qualification: '', 
  father_occupation: '', father_aadhaar: '',
  mother_name: '', mother_phone: '', mother_email: '', mother_qualification: '', 
  mother_occupation: '', mother_aadhaar: '',
  guardian_name: '', guardian_phone: '', guardian_relation: '',

  // Address
  address_line1: '', apartment_name: '', address_line2: '', landmark: '',
  city: '', mandal: '', district: '', state: '', pincode: '',

  // Academic
  previous_school_name: '', previous_class: '', previous_school_ay: '',
  source: 'WALK_IN',

  // Documents
  doc_tc_submitted: false, doc_bonafide_submitted: false,
  doc_birth_cert_submitted: false, doc_caste_cert_submitted: false,
  doc_aadhaar_submitted: false,

  // Staff
  admission_staff_name: '', admission_staff_phone: '',
  roll_number: '',

  // Fees
  offered_total: 0, standard_total: 0, locked_total: 0, reason: ''
};

export default function StudentForm({ 
  initialData, 
  onSubmit, 
  onCancel, 
  title = "Student Details", 
  submitLabel = "Save Changes",
  isEdit = false,
  requireParentEmails = true,
}: StudentFormProps) {
  const [activeTab, setActiveTab] = useState('personal');
  const [formData, setFormData] = useState<StudentFormData>({ ...DEFAULT_FORM_DATA, ...initialData });
  const [user, setUser] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [feeStructure, setFeeStructure] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const approvalThreshold = Number(formData.locked_total || formData.standard_total || 0);
  const needsApproval = !isEdit && Number(formData.offered_total || 0) < approvalThreshold;

  useEffect(() => {
    api.get('auth/me/').then(res => {
      const u = res.data.data;
      setUser(u);
      if (u.role === 'SUPER_ADMIN') {
        api.get('tenants/').then((r) => {
          const raw = r.data?.data ?? r.data?.results ?? r.data;
          setTenants(Array.isArray(raw) ? raw : []);
        });
      } else {
        if (!isEdit) {
            setFormData(prev => ({ 
              ...prev, 
              tenant: u.tenant || u.tenant_id || '',
              branch: u.branch || u.branch_id || '' 
            }));
        }
      }
    });
  }, [isEdit]);

  useEffect(() => {
    if (formData.tenant) {
      api.get(`/tenants/branches/?tenant_id=${formData.tenant}`).then(res => {
        const arr = res.data?.data ?? res.data?.results ?? res.data;
        setBranches(Array.isArray(arr) ? arr : []);
      });
    }
  }, [formData.tenant]);

  useEffect(() => {
    if (formData.branch) {
      api.get(`/tenants/academic-years/?branch_id=${formData.branch}`).then(res => {
        const arr = res.data?.data ?? res.data?.results ?? res.data;
        const years = Array.isArray(arr) ? arr : [];
        setAcademicYears(years);
        
        // Auto-select active year for new admissions
        if (!isEdit && !formData.academic_year && years.length > 0) {
          const activeYear = years.find((y: any) => y.is_active);
          if (activeYear) {
            setFormData(prev => ({ ...prev, academic_year: activeYear.id }));
          } else {
            setFormData(prev => ({ ...prev, academic_year: years[0].id }));
          }
        }
      });
    }
  }, [formData.branch, isEdit, formData.academic_year]);

  useEffect(() => {
    if (formData.branch && formData.academic_year) {
      api.get(`/classes/?branch_id=${formData.branch}&academic_year_id=${formData.academic_year}`)
        .then(res => {
          const arr = res.data?.data ?? res.data?.results ?? res.data;
          setClasses(Array.isArray(arr) ? arr : []);
        });
    }
  }, [formData.branch, formData.academic_year]);

  useEffect(() => {
    // Only auto-load fees for NEW students when branch/year/class are selected
    if (!isEdit && formData.class_section && formData.branch && formData.academic_year) { 
      const cls = classes.find(c => (c.id === formData.class_section || c.display_name === formData.class_section));
      if (cls && cls.grade) {
        setFeeStructure(null); // Reset while loading
        api.get(`/fees/structures/?branch_id=${formData.branch}&academic_year_id=${formData.academic_year}&grade=${cls.grade}`)
          .then(res => {
            const arr = res.data?.data ?? res.data?.results ?? res.data;
            const list = Array.isArray(arr) ? arr : [];
            const structure = list[0];
            setFeeStructure(structure);
            if (structure) {
              const actualTotal = (structure.items || []).reduce((acc: number, item: any) => acc + Number(item.amount), 0);
              const lockedTotal = (structure.items || []).reduce(
                (acc: number, item: any) => acc + Number(item.locked_amount ?? item.amount),
                0
              );
              setFormData(prev => ({
                ...prev,
                standard_total: actualTotal,
                locked_total: lockedTotal,
                offered_total: actualTotal,
              }));
            } else {
              setFormData(prev => ({ ...prev, standard_total: 0, locked_total: 0, offered_total: 0 }));
            }
          })
          .catch(err => {
            toast.error('Failed to load fee structure for this class');
            setFeeStructure(null);
            setFormData(prev => ({ ...prev, standard_total: 0, locked_total: 0, offered_total: 0 }));
          });
      }
    } else if (!isEdit) {
      // Clear if selection is partial
      setFeeStructure(null);
      setFormData(prev => ({ ...prev, standard_total: 0, locked_total: 0, offered_total: 0 }));
    }
  }, [formData.class_section, classes, isEdit, formData.branch, formData.academic_year]);

  const goToNextTab = () => {
    const tabs = isEdit 
      ? ['personal', 'parents', 'address', 'admission', 'academic']
      : ['personal', 'parents', 'address', 'admission', 'academic', 'fees'];
    const nextIndex = tabs.indexOf(activeTab) + 1;
    if (nextIndex < tabs.length) {
      setActiveTab(tabs[nextIndex]);
    }
  };

  const handleActualSubmit = async () => {
    if (!isEdit && activeTab !== 'fees') return;
    if (isEdit && activeTab !== 'academic') return;

    if (!isEdit) {
      if (!formData.class_section) {
        toast.error('Class Section is required for enrollment. Please select a class.');
        setActiveTab('academic');
        return;
      }
      if (!feeStructure) {
        toast.error('No active fee structure found for the selected class. Enrollment cannot proceed without valid fees.');
        setActiveTab('fees');
        return;
      }
      if (Number(formData.offered_total || 0) <= 0) {
        toast.error('Agreed total fee (offered_total) must be greater than zero.');
        setActiveTab('fees');
        return;
      }
    }

    if (!isEdit && activeTab === 'fees') {
      const ok = window.confirm(
        'Submit this admission? Fees and student details will be saved and enrollment will proceed.',
      );
      if (!ok) return;
    }

    if (requireParentEmails) {
      const hasFather = !!(formData.father_name?.trim() || formData.father_phone?.trim());
      const hasMother = !!(formData.mother_name?.trim() || formData.mother_phone?.trim());
      if (hasFather && !formData.father_email?.trim()) {
        toast.error('Father email is required when father name or phone is provided (for parent login).');
        setActiveTab('parents');
        return;
      }
      if (hasMother && !formData.mother_email?.trim()) {
        toast.error('Mother email is required when mother name or phone is provided (for parent login).');
        setActiveTab('parents');
        return;
      }
    }

    setSaving(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      toast.error("Failed to save student details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'personal', label: 'Student Info', icon: User },
    { id: 'parents', label: 'Parents', icon: Users },
    { id: 'address', label: 'Address', icon: MapPin },
    { id: 'admission', label: 'Admission', icon: GraduationCap },
    { id: 'academic', label: 'Academic', icon: FileText },
    { id: 'fees', label: 'Fees', icon: IndianRupee }
  ].filter(t => !isEdit || t.id !== 'fees');

  return (
    <div className="animate-in fade-in zoom-in-95 duration-200">
      {/* Form Tabs */}
      <div className="flex overflow-x-auto border-b border-gray-100 bg-gray-50/30 scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-8 py-5 text-sm font-bold whitespace-nowrap transition-all relative flex items-center gap-2 ${
              activeTab === tab.id 
                ? 'text-blue-600 bg-white' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/50'
            }`}
          >
            <tab.icon size={16} className={activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'} />
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      <div className="p-8">
        {activeTab === 'personal' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">First Name <span className="text-red-500">*</span></label>
                <input placeholder="Enter first name" required value={formData.first_name}
                  onChange={e => setFormData(prev => ({...prev, first_name: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Last Name</label>
                <input placeholder="Enter last name" value={formData.last_name}
                  onChange={e => setFormData(prev => ({...prev, last_name: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
              </div>
              <DateInput 
                label="Date of Birth"
                required
                value={formData.date_of_birth}
                onChange={val => setFormData(prev => ({...prev, date_of_birth: val}))}
                className="space-y-1.5"
              />
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Gender <span className="text-red-500">*</span></label>
                <select value={formData.gender} onChange={e => setFormData(prev => ({...prev, gender: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all">
                  <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Blood Group</label>
                <select value={formData.blood_group} onChange={e => setFormData(prev => ({...prev, blood_group: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all">
                  <option value="UNKNOWN">Select Blood Group</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Mother Tongue</label>
                <input placeholder="e.g. Telugu, English..." value={formData.mother_tongue}
                  onChange={e => setFormData(prev => ({...prev, mother_tongue: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Religion</label>
                <input placeholder="e.g. Hindu, Muslim, Christian..." value={formData.religion}
                  onChange={e => setFormData(prev => ({...prev, religion: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Caste Category</label>
                <select value={formData.caste_category} onChange={e => setFormData(prev => ({...prev, caste_category: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all">
                  <option value="OC">Open Category (OC)</option>
                  <option value="BC">Backward Class (BC)</option>
                  <option value="SC">Scheduled Caste (SC)</option>
                  <option value="ST">Scheduled Tribe (ST)</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="lg:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Aadhaar Card Number</label>
                <input
                  placeholder="12 digit number"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={formData.aadhar_number}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      aadhar_number: digitsOnlyAadhaar(e.target.value),
                    }))
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="lg:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Identification Mark 1</label>
                <input placeholder="e.g. A mole on right hand" value={formData.identification_mark_1}
                  onChange={e => setFormData(prev => ({...prev, identification_mark_1: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
              </div>
              <div className="lg:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Health Status / Medical Conditions</label>
                <textarea 
                  placeholder="Mention any allergies or chronic conditions..." 
                  value={formData.health_status}
                  onChange={e => setFormData(prev => ({...prev, health_status: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-h-[80px]" 
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'parents' && (
          <div className="space-y-8">
            {/* Father Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Father's Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Full Name</label>
                  <input value={formData.father_name} onChange={e => setFormData(prev => ({...prev, father_name: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Phone Number</label>
                  <input value={formData.father_phone} onChange={e => setFormData(prev => ({...prev, father_phone: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Email (for parent login)</label>
                  <input type="email" autoComplete="email" value={formData.father_email} onChange={e => setFormData(prev => ({...prev, father_email: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500" placeholder="father@example.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Occupation</label>
                  <input value={formData.father_occupation} onChange={e => setFormData(prev => ({...prev, father_occupation: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Qualification</label>
                  <input value={formData.father_qualification} onChange={e => setFormData(prev => ({...prev, father_qualification: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Aadhaar Number</label>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    value={formData.father_aadhaar}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        father_aadhaar: digitsOnlyAadhaar(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Mother Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-pink-600 uppercase tracking-widest border-l-4 border-pink-500 pl-3">Mother's Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Full Name</label>
                  <input value={formData.mother_name} onChange={e => setFormData(prev => ({...prev, mother_name: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-pink-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Phone Number</label>
                  <input value={formData.mother_phone} onChange={e => setFormData(prev => ({...prev, mother_phone: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-pink-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Email (for parent login)</label>
                  <input type="email" autoComplete="email" value={formData.mother_email} onChange={e => setFormData(prev => ({...prev, mother_email: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-pink-500" placeholder="mother@example.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Qualification</label>
                  <input value={formData.mother_qualification} onChange={e => setFormData(prev => ({...prev, mother_qualification: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-pink-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Aadhaar Number</label>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    value={formData.mother_aadhaar}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        mother_aadhaar: digitsOnlyAadhaar(e.target.value),
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-pink-500"
                  />
                </div>
              </div>
            </div>

            {/* Guardian Info */}
            <div className="space-y-4 pt-4 border-t border-gray-50">
              <div className="flex gap-6 items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Guardian Name (Optional)</label>
                  <input value={formData.guardian_name} onChange={e => setFormData(prev => ({...prev, guardian_name: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-500" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Relation</label>
                  <input value={formData.guardian_relation} onChange={e => setFormData(prev => ({...prev, guardian_relation: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Similar sections for address, academic, admission, fees... */}
        {activeTab === 'address' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Plot / House / Flat No. <span className="text-red-500">*</span></label>
                <input required value={formData.address_line1} onChange={e => setFormData(prev => ({...prev, address_line1: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Apartment Name</label>
                <input value={formData.apartment_name} onChange={e => setFormData(prev => ({...prev, apartment_name: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Colony / Area <span className="text-red-500">*</span></label>
                <input required value={formData.address_line2} onChange={e => setFormData(prev => ({...prev, address_line2: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Landmark</label>
                <input value={formData.landmark} onChange={e => setFormData(prev => ({...prev, landmark: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">City / Village <span className="text-red-500">*</span></label>
                <input required value={formData.city} onChange={e => setFormData(prev => ({...prev, city: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Mandal</label>
                <input value={formData.mandal} onChange={e => setFormData(prev => ({...prev, mandal: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">District</label>
                <input value={formData.district} onChange={e => setFormData(prev => ({...prev, district: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">State <span className="text-red-500">*</span></label>
                <input required value={formData.state} onChange={e => setFormData(prev => ({...prev, state: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Pincode <span className="text-red-500">*</span></label>
                <input required maxLength={6} value={formData.pincode} onChange={e => setFormData(prev => ({...prev, pincode: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'academic' && (
          <div className="space-y-8">
            <div className="space-y-4">
              <h4 className="text-xs font-black text-amber-600 uppercase tracking-widest border-l-4 border-amber-500 pl-3">Previous School Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">School Name & Location</label>
                  <input value={formData.previous_school_name} onChange={e => setFormData(prev => ({...prev, previous_school_name: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-amber-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Standard / Class</label>
                  <input value={formData.previous_class} onChange={e => setFormData(prev => ({...prev, previous_class: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-amber-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Academic Year</label>
                  <input placeholder="e.g. 2023-24" value={formData.previous_school_ay} onChange={e => setFormData(prev => ({...prev, previous_school_ay: e.target.value}))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-amber-500" />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h4 className="text-xs font-black text-emerald-600 uppercase tracking-widest border-l-4 border-emerald-500 pl-3">Documents Checklist</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { id: 'doc_tc_submitted', label: 'TC / Record Sheet' },
                  { id: 'doc_bonafide_submitted', label: 'Bonafide Cert' },
                  { id: 'doc_birth_cert_submitted', label: 'Birth Certificate' },
                  { id: 'doc_caste_cert_submitted', label: 'Caste Certificate' },
                  { id: 'doc_aadhaar_submitted', label: 'Aadhaar Card' }
                ].map(doc => (
                  <label key={doc.id} className="flex items-center gap-3 p-4 border border-gray-100 rounded-2xl hover:bg-emerald-50/50 cursor-pointer transition-colors group">
                    <input 
                      type="checkbox" 
                      checked={(formData as any)[doc.id]} 
                      onChange={e => setFormData(prev => ({...prev, [doc.id]: e.target.checked}))}
                      className="w-5 h-5 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500" 
                    />
                    <span className="text-xs font-bold text-gray-600 group-hover:text-emerald-700">{doc.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-4">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Source of Information</label>
              <select value={formData.source} onChange={e => setFormData(prev => ({...prev, source: e.target.value}))}
                className="w-full max-w-xs px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500">
                <option value="WALK_IN">Walk-in</option>
                <option value="REFERRAL">Referral</option>
                <option value="SOCIAL_MEDIA">Social Media</option>
                <option value="WEBSITE">Website</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'admission' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100">
              {user?.role === 'SUPER_ADMIN' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">School / Tenant</label>
                  <select required value={formData.tenant} onChange={e => setFormData(prev => ({...prev, tenant: e.target.value, branch: '', academic_year: ''}))}
                    className="w-full px-4 py-2.5 border border-white bg-white rounded-xl text-sm focus:ring-2 focus:ring-slate-200 shadow-sm outline-none">
                    <option value="">Select School</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Branch <span className="text-red-500">*</span></label>
                <select required disabled={user?.role === 'BRANCH_ADMIN' || isEdit} value={formData.branch} onChange={e => setFormData(prev => ({...prev, branch: e.target.value, academic_year: ''}))}
                  className="w-full px-4 py-2.5 border border-white bg-white rounded-xl text-sm focus:ring-2 focus:ring-slate-200 shadow-sm outline-none disabled:opacity-50">
                  <option value="">Select Branch</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Academic Year <span className="text-red-500">*</span></label>
                <select required disabled={isEdit} value={formData.academic_year} onChange={e => setFormData(prev => ({...prev, academic_year: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-white bg-white rounded-xl text-sm focus:ring-2 focus:ring-slate-200 shadow-sm outline-none disabled:opacity-50">
                  <option value="">Select Year</option>
                  {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Class / Section <span className="text-red-500">*</span></label>
              <select required value={formData.class_section} onChange={e => setFormData(prev => ({...prev, class_section: e.target.value}))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 bg-white">
                <option value="">Select Class</option>
                {classes
                  .filter(c => {
                    if (!isEdit || !initialData?.class_section) return true;
                    const initialSectionId = typeof initialData.class_section === 'object' 
                      ? initialData.class_section?.id 
                      : initialData.class_section;
                    const initialClass = classes.find(orig => orig.id === initialSectionId);
                    return initialClass ? c.grade === initialClass.grade : true;
                  })
                  .map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Roll Number</label>
              <input 
                placeholder="Auto-generated if empty"
                type="number"
                value={formData.roll_number} onChange={e => setFormData(prev => ({...prev, roll_number: e.target.value}))}
                className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50/50 rounded-xl text-sm font-bold focus:border-blue-500 outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Admission No.</label>
              <input 
                placeholder={isEdit ? "" : "Auto-generated"} 
                readOnly={true}
                value={formData.admission_number} onChange={e => setFormData(prev => ({...prev, admission_number: e.target.value}))}
                className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50/50 rounded-xl text-sm font-mono focus:border-blue-500 outline-none" />
            </div>

            <div className="lg:col-span-3 pt-6 border-t border-gray-50 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Processed By (Staff Name)</label>
                <input value={formData.admission_staff_name} onChange={e => setFormData(prev => ({...prev, admission_staff_name: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-slate-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-tight">Staff Contact</label>
                <input value={formData.admission_staff_phone} onChange={e => setFormData(prev => ({...prev, admission_staff_phone: e.target.value}))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-slate-500" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fees' && (
          <div className="bg-slate-50/80 p-8 rounded-3xl border border-slate-100 shadow-inner space-y-8 animate-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <Receipt size={20} />
              </div>
              <div>
                <h4 className="font-black text-gray-900 tracking-tight">Fee Configuration</h4>
                <p className="text-xs font-bold text-gray-400 uppercase">Set and lock fees for this academic year</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2 block">Agreed Total Fee <span className="text-red-500">*</span></label>
                    <div className="relative group">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-300 group-focus-within:text-blue-600 transition-colors">₹</span>
                      <input 
                        type="number" 
                        required
                        readOnly={isEdit}
                        value={formData.offered_total}
                        onChange={e => setFormData(prev => ({...prev, offered_total: Number(e.target.value)}))}
                        className="w-full pl-10 pr-6 py-4 border border-gray-100 bg-white rounded-2xl text-2xl font-bold text-gray-900 focus:border-blue-600 shadow-sm outline-none transition-all disabled:opacity-50" 
                      />
                    </div>
                  </div>
                  {needsApproval && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50/50 text-blue-600 rounded-xl border border-blue-100/50 text-[10px] font-bold uppercase tracking-tight">
                      <span>⚠️ Reduction below locked total requires admin approval</span>
                    </div>
                  )}
                </div>

                {needsApproval && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason for Reduction <span className="text-red-500">*</span></label>
                    <textarea 
                      placeholder="Provide a valid reason (e.g. Merit, Sibling...)"
                      required
                      value={formData.reason}
                      onChange={e => setFormData({...formData, reason: e.target.value})}
                      className="w-full px-6 py-4 border border-slate-200 bg-white rounded-2xl text-sm font-medium focus:border-blue-600 outline-none min-h-[120px] shadow-sm transition-all"
                    />
                  </div>
                )}
              </div>

              <div className="bg-white/60 backdrop-blur-sm p-8 rounded-[2rem] border border-white shadow-xl shadow-slate-200/50">
                {feeStructure || isEdit ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Actual Total</p>
                        <p className="text-xl font-black text-slate-900 leading-none">₹{formData.standard_total.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Locked Total</p>
                        <p className="text-sm font-bold text-slate-700">₹{approvalThreshold.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Items</p>
                        <p className="text-sm font-bold text-slate-500">{(feeStructure?.items || []).length} Categories</p>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2 scrollbar-hide">
                      {(feeStructure?.items || []).map((item: any) => (
                        <div key={item.id} className="flex justify-between items-center bg-gray-50/50 p-3 rounded-xl border border-transparent hover:border-gray-100 transition-all">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">{item.category_name || item.category}</span>
                          <span className="text-sm font-black text-slate-900">₹{Number(item.amount).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {isEdit && (
                          <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                            <Receipt size={16} className="text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-xs font-bold text-amber-700 leading-relaxed uppercase">
                              Fee structure is locked for enrolled students. To adjust fees or apply discounts, please use the Finance/Accounts module.
                            </p>
                          </div>
                      )}
                    </div>
                    <div className="mt-4 pt-6 border-t border-slate-100 flex items-center justify-end">
                      {!isEdit && (
                        <div className="text-right">
                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Agreed Total</p>
                          <p className="text-3xl font-black text-blue-600 leading-none tabular-nums tracking-tighter">₹{formData.offered_total.toLocaleString('en-IN')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 bg-red-50/50 rounded-3xl border border-red-100/70 text-center space-y-4">
                    <div className="w-16 h-16 bg-red-100/50 text-red-600 rounded-full flex items-center justify-center shadow-inner shadow-red-200">
                      <Receipt size={32} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-red-800 uppercase tracking-widest">
                        {formData.class_section ? 'Fee Structure Missing' : 'Select Class to Load Fees'}
                      </h4>
                      <p className="text-xs text-red-600 max-w-sm leading-relaxed">
                        {formData.class_section 
                          ? 'This class does not have an active fee structure. You cannot proceed with enrollment until a fee structure is configured under Setup > Fees.'
                          : 'Please navigate to the Academic tab and select a class to load the corresponding fee details.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
          <button type="button" onClick={onCancel}
            className="px-8 py-3 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors uppercase tracking-widest">
            Cancel
          </button>
          <div className="flex gap-4">
            {(!isEdit && activeTab !== 'fees') || (isEdit && activeTab !== 'academic') ? (
              <button 
                type="button" 
                onClick={goToNextTab}
                className="bg-slate-900 text-white px-10 py-3 rounded-2xl text-sm font-black hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 tracking-widest uppercase"
              >
                Next Step
              </button>
            ) : (
              <button 
                type="button" 
                onClick={handleActualSubmit}
                disabled={saving}
                className="bg-blue-600 text-white px-12 py-4 rounded-2xl text-sm font-black hover:bg-blue-700 disabled:opacity-50 transition-all shadow-xl shadow-blue-200 tracking-[0.15em] uppercase">
                {saving ? 'Processing...' : submitLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
