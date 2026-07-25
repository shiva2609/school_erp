"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { useApi } from '@/lib/hooks';
import InlineCreateDropdown from '@/components/common/InlineCreateDropdown';
import { useBranch } from '@/components/common/BranchContext';
import { toast } from 'react-hot-toast';
import { 
  User, Briefcase, KeyRound, HeartPulse, 
  Landmark, Phone, Save, X, Loader2, ArrowLeft,
  CheckCircle2, ShieldCheck, Mail, Building2,
  GraduationCap
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

export default function StaffCreatePage() {
  const router = useRouter();
  const { selectedBranch } = useBranch();
  
  // Master data
  const { data: categories, refetch: refetchCategories } = useApi<any[]>('staff-categories/');
  const { data: departments, refetch: refetchDepartments } = useApi<any[]>('staff-departments/');
  const { data: designations, refetch: refetchDesignations } = useApi<any[]>('staff-designations/');
  const { data: qualifications, refetch: refetchQualifications } = useApi<any[]>('staff-qualifications/');
  const { data: specializations, refetch: refetchSpecializations } = useApi<any[]>('staff-specializations/');
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // 1. Profile
    first_name: '',
    last_name: '',
    gender: 'MALE',
    date_of_birth: '',
    qualification: '',
    specialization: '',
    
    // 2. Work
    category: '',
    department: '',
    designation: '',
    joining_date: '',
    employment_type: 'REGULAR',
    experience_years: '',
    
    // 3. Login
    requires_portal_access: false,
    email: '',
    password: '',
    role: 'STAFF', // Usually determined by backend, but we can send if needed
    
    // 4. Personal
    blood_group: '',
    religion: '',
    marital_status: 'SINGLE',
    father_name: '',
    mother_name: '',
    spouse_name: '',
    
    // 5. Govt
    pan_number: '',
    aadhaar_number: '',
    pf_number: '',
    esi_number: '',
    uan_number: '',
    
    // 6. Contact
    mobile: '',
    alternate_mobile: '',
    personal_email: '',
    emergency_contact_name: '',
    emergency_contact_number: '',
    current_address: '',
    permanent_address: '',
    city: '',
    state: '',
    pincode: ''
  });

  const [extraCatData, setExtraCatData] = useState({ is_teaching_role: false });

  // Update branch when it changes
  const branchId = selectedBranch || '';

  const setField = (field: string) => (e: any) => {
    setFormData(prev => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  };

  const handleCreateMaster = async (endpoint: string, data: any, refetch: () => void) => {
    try {
      const res = await api.post(endpoint, { ...data, branch: branchId });
      toast.success("Created successfully");
      await refetch();
      return res.data;
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "Error creating entry");
      throw e;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    // Validate mandatory fields
    const requiredFields = [
      { field: 'first_name', label: 'First Name', section: 'profile' },
      { field: 'last_name', label: 'Last Name', section: 'profile' },
      { field: 'gender', label: 'Gender', section: 'profile' },
      { field: 'category', label: 'Category', section: 'work' },
      { field: 'joining_date', label: 'Joining Date', section: 'work' },
      { field: 'experience_years', label: 'Years of Experience', section: 'work' },
      { field: 'mobile', label: 'Primary Mobile', section: 'contact' },
      { field: 'personal_email', label: 'Email', section: 'contact' },
      { field: 'current_address', label: 'Current Address', section: 'contact' },
      { field: 'permanent_address', label: 'Permanent Address', section: 'contact' },
      { field: 'city', label: 'City', section: 'contact' },
      { field: 'state', label: 'State', section: 'contact' },
      { field: 'pincode', label: 'Pincode', section: 'contact' },
    ];

    for (const item of requiredFields) {
      const val = formData[item.field as keyof typeof formData];
      if (val === undefined || val === null || String(val).trim() === '') {
        toast.error(`${item.label} is required.`);
        setActiveSection(item.section);
        return;
      }
    }

    if (formData.requires_portal_access && !formData.email) {
      toast.error("Email is required for portal access");
      setActiveSection('login');
      return;
    }
    setLoading(true);
    
    try {
      // Backend expects branch in the payload
      const payload = { ...formData, branch: branchId };
      // Remove empty strings for nullable fields
      Object.keys(payload).forEach(key => {
        if (payload[key as keyof typeof payload] === '') {
          delete payload[key as keyof typeof payload];
        }
      });
      
      const res = await api.post('staff/', payload);
      toast.success("Staff profile created successfully!");
      router.push(`/staff/${res.data.id}`);
    } catch (err: any) {
      let errorMsg = "Error creating staff profile";
      if (err.response?.data) {
        if (typeof err.response.data === 'object') {
          errorMsg = Object.entries(err.response.data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\n');
        } else {
          errorMsg = String(err.response.data);
        }
      }
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    { id: 'profile', icon: User, title: 'Basic Profile', desc: 'Name, DOB & qualifications' },
    { id: 'work', icon: Briefcase, title: 'Work Details', desc: 'Department, Role & Dates' },
    { id: 'login', icon: KeyRound, title: 'Portal Access', desc: 'System login & permissions' },
    { id: 'personal', icon: HeartPulse, title: 'Personal Info', desc: 'Family & health' },
    { id: 'govt', icon: Landmark, title: 'Govt. IDs', desc: 'PAN, Aadhaar, PF' },
    { id: 'contact', icon: Phone, title: 'Contact & Address', desc: 'Mobile, emergency & location' },
  ];

  const [activeSection, setActiveSection] = useState('profile');

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/staff" className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <ArrowLeft size={18} className="text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Add New Staff Member</h1>
            <p className="text-sm text-slate-500 mt-1">Create a comprehensive employee record</p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-md shadow-blue-200 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          Save Profile
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Navigation Sidebar */}
        <div className="col-span-12 md:col-span-3 space-y-2">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-start gap-3 p-4 rounded-2xl border text-left transition-all ${
                activeSection === s.id 
                  ? 'bg-blue-50 border-blue-200 shadow-sm' 
                  : 'bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200'
              }`}
            >
              <div className={`p-2 rounded-xl mt-0.5 ${activeSection === s.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-slate-100 text-slate-500'}`}>
                <s.icon size={16} />
              </div>
              <div>
                <p className={`text-sm font-bold ${activeSection === s.id ? 'text-blue-900' : 'text-slate-700'}`}>{s.title}</p>
                <p className={`text-[10px] mt-0.5 ${activeSection === s.id ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>{s.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Form Content */}
        <div className="col-span-12 md:col-span-9 bg-white border border-slate-100 shadow-sm rounded-3xl p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* 1. Basic Profile */}
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:activeSection==='profile'?1:0, height:activeSection==='profile'?'auto':0, overflow:activeSection==='profile'?'visible':'hidden', y:activeSection==='profile'?0:10}}>
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                  <User className="text-blue-600" />
                  <h3 className="text-lg font-black text-slate-800">Basic Profile</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">First Name <span className="text-red-500">*</span></label>
                    <input required value={formData.first_name} onChange={setField('first_name')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Last Name <span className="text-red-500">*</span></label>
                    <input required value={formData.last_name} onChange={setField('last_name')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gender <span className="text-red-500">*</span></label>
                    <select value={formData.gender} onChange={setField('gender')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all appearance-none">
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date of Birth</label>
                    <input type="date" value={formData.date_of_birth} onChange={setField('date_of_birth')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Qualification</label>
                    <InlineCreateDropdown
                      options={qualifications || []}
                      value={formData.qualification}
                      onChange={v => setFormData(p => ({ ...p, qualification: v }))}
                      onCreate={(name) => handleCreateMaster('staff-qualifications/', { name }, refetchQualifications)}
                      placeholder="e.g. B.Ed, M.Sc"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Specialization</label>
                    <InlineCreateDropdown
                      options={specializations || []}
                      value={formData.specialization}
                      onChange={v => setFormData(p => ({ ...p, specialization: v }))}
                      onCreate={(name) => handleCreateMaster('staff-specializations/', { name }, refetchSpecializations)}
                      placeholder="e.g. Mathematics"
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 2. Work Details */}
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:activeSection==='work'?1:0, height:activeSection==='work'?'auto':0, overflow:activeSection==='work'?'visible':'hidden', y:activeSection==='work'?0:10}}>
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                  <Briefcase className="text-blue-600" />
                  <h3 className="text-lg font-black text-slate-800">Work Details</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Category <span className="text-red-500">*</span></label>
                    <InlineCreateDropdown
                      options={categories || []}
                      value={formData.category}
                      onChange={v => setFormData(p => ({ ...p, category: v }))}
                      onCreate={(name, extra) => handleCreateMaster('staff-categories/', { name, is_active: true, is_teaching_role: extra?.is_teaching_role }, refetchCategories)}
                      placeholder="e.g. Teaching Staff"
                      extraCreateData={extraCatData}
                      extraCreateFields={
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={extraCatData.is_teaching_role} onChange={e => setExtraCatData({ is_teaching_role: e.target.checked })} className="rounded text-blue-600 focus:ring-blue-500" />
                          <span className="text-xs font-semibold text-slate-700">Is Teaching Role?</span>
                        </label>
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Department</label>
                    <InlineCreateDropdown
                      options={departments || []}
                      value={formData.department}
                      onChange={v => setFormData(p => ({ ...p, department: v }))}
                      onCreate={(name) => handleCreateMaster('staff-departments/', { name }, refetchDepartments)}
                      placeholder="e.g. Science Dept"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Designation</label>
                    <InlineCreateDropdown
                      options={designations || []}
                      value={formData.designation}
                      onChange={v => setFormData(p => ({ ...p, designation: v }))}
                      onCreate={(name) => handleCreateMaster('staff-designations/', { name, category: formData.category || null }, refetchDesignations)}
                      placeholder="e.g. Senior Teacher"
                    />
                    {!formData.category && <p className="text-[10px] text-amber-600 mt-1">Best practice: Select Category first</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Employment Type</label>
                    <select value={formData.employment_type} onChange={setField('employment_type')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all appearance-none">
                      <option value="REGULAR">Regular</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="TEMPORARY">Temporary</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Joining Date <span className="text-red-500">*</span></label>
                    <input type="date" required value={formData.joining_date} onChange={setField('joining_date')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Years of Experience <span className="text-red-500">*</span></label>
                    <input type="number" required min="0" step="0.1" value={formData.experience_years} onChange={setField('experience_years')} placeholder="e.g. 5.5" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 3. Portal Access */}
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:activeSection==='login'?1:0, height:activeSection==='login'?'auto':0, overflow:activeSection==='login'?'visible':'hidden', y:activeSection==='login'?0:10}}>
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                  <KeyRound className="text-blue-600" />
                  <h3 className="text-lg font-black text-slate-800">System Portal Access</h3>
                </div>

                <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl shadow-sm">
                  <label className="flex items-start gap-4 cursor-pointer">
                    <div className="mt-1">
                      <input 
                        type="checkbox" 
                        checked={formData.requires_portal_access} 
                        onChange={setField('requires_portal_access')}
                        className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500" 
                      />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Requires Portal Access?</p>
                      <p className="text-xs text-slate-500 mt-1">If enabled, a user account will be created. They can login to the ERP using the provided email and password.</p>
                    </div>
                  </label>
                </div>

                <AnimatePresence>
                  {formData.requires_portal_access && (
                    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="grid grid-cols-2 gap-5 pt-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email (Username) <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <input type="email" required={formData.requires_portal_access} value={formData.email} onChange={setField('email')} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm" placeholder="employee@school.com" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Temporary Password</label>
                        <div className="relative">
                          <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <input type="text" value={formData.password} onChange={setField('password')} placeholder="Leave blank to auto-generate" className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm" />
                        </div>
                        <p className="text-[10px] text-slate-400">User will be prompted to change on first login.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* 4. Personal Info */}
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:activeSection==='personal'?1:0, height:activeSection==='personal'?'auto':0, overflow:activeSection==='personal'?'visible':'hidden', y:activeSection==='personal'?0:10}}>
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                  <HeartPulse className="text-blue-600" />
                  <h3 className="text-lg font-black text-slate-800">Personal Information</h3>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Blood Group</label>
                    <select value={formData.blood_group} onChange={setField('blood_group')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all appearance-none">
                      <option value="">Select...</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Religion</label>
                    <input type="text" value={formData.religion} onChange={setField('religion')} placeholder="e.g. Hinduism" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Marital Status</label>
                    <select value={formData.marital_status} onChange={setField('marital_status')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all appearance-none">
                      <option value="SINGLE">Single</option>
                      <option value="MARRIED">Married</option>
                      <option value="WIDOWED">Widowed</option>
                      <option value="DIVORCED">Divorced</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Father&apos;s Name</label>
                    <input type="text" value={formData.father_name} onChange={setField('father_name')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mother&apos;s Name</label>
                    <input type="text" value={formData.mother_name} onChange={setField('mother_name')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Spouse&apos;s Name</label>
                    <input type="text" value={formData.spouse_name} onChange={setField('spouse_name')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 5. Govt. IDs */}
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:activeSection==='govt'?1:0, height:activeSection==='govt'?'auto':0, overflow:activeSection==='govt'?'visible':'hidden', y:activeSection==='govt'?0:10}}>
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                  <Landmark className="text-blue-600" />
                  <h3 className="text-lg font-black text-slate-800">Govt. Identification</h3>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">PAN Number</label>
                    <input type="text" value={formData.pan_number} onChange={setField('pan_number')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all uppercase" placeholder="ABCDE1234F" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Aadhaar Number</label>
                    <input type="text" value={formData.aadhaar_number} onChange={setField('aadhaar_number')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" placeholder="1234 5678 9012" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">PF Number</label>
                    <input type="text" value={formData.pf_number} onChange={setField('pf_number')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">UAN Number</label>
                    <input type="text" value={formData.uan_number} onChange={setField('uan_number')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ESI Number</label>
                    <input type="text" value={formData.esi_number} onChange={setField('esi_number')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 6. Contact & Address */}
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:activeSection==='contact'?1:0, height:activeSection==='contact'?'auto':0, overflow:activeSection==='contact'?'visible':'hidden', y:activeSection==='contact'?0:10}}>
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                  <Phone className="text-blue-600" />
                  <h3 className="text-lg font-black text-slate-800">Contact &amp; Address</h3>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Primary Mobile <span className="text-red-500">*</span></label>
                    <input type="tel" required value={formData.mobile} onChange={setField('mobile')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Alternate Mobile</label>
                    <input type="tel" value={formData.alternate_mobile} onChange={setField('alternate_mobile')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>

                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input type="email" required value={formData.personal_email} onChange={setField('personal_email')} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" placeholder="personal@email.com" />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Emergency Contact Name</label>
                    <input type="text" value={formData.emergency_contact_name} onChange={setField('emergency_contact_name')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Emergency Contact Mobile</label>
                    <input type="tel" value={formData.emergency_contact_number} onChange={setField('emergency_contact_number')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  </div>
                </div>

                <div className="pt-4 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Current Address <span className="text-red-500">*</span></label>
                    <textarea required rows={2} value={formData.current_address} onChange={setField('current_address')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Permanent Address <span className="text-red-500">*</span></label>
                      <button type="button" onClick={() => setFormData(p => ({ ...p, permanent_address: p.current_address }))} className="text-[10px] font-bold text-blue-600 hover:text-blue-700">Same as current</button>
                    </div>
                    <textarea required rows={2} value={formData.permanent_address} onChange={setField('permanent_address')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none" />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">City <span className="text-red-500">*</span></label>
                      <input required type="text" value={formData.city} onChange={setField('city')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">State <span className="text-red-500">*</span></label>
                      <input required type="text" value={formData.state} onChange={setField('state')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pincode <span className="text-red-500">*</span></label>
                      <input required type="text" value={formData.pincode} onChange={setField('pincode')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

          </form>
        </div>
      </div>
    </div>
  );
}
