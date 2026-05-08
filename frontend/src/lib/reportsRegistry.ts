import React from 'react';

export type ReportConfig = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  apiEndpoint: string;
  exportKey: string;
  columns: { key: string; label: string; render?: (v: any, row: any) => React.ReactNode }[];
  filters: {
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
    showExpenseTypeSearch?: boolean;
    showVendorNameSearch?: boolean;
  };
  /** Offer “Download PDF” (uses tenant document template + `?file=pdf`). */
  offerPdfDownload?: boolean;
};

export type ReportCategory = {
  id: string;
  title: string;
  reports: ReportConfig[];
};

// ──────────────────────────────────────────────────────────────
// IMPORTANT: apiEndpoint must NOT start with a leading slash.
// The axios base URL is "http://host/api/" — a leading slash
// would cause axios to resolve from the root, skipping /api/.
// ──────────────────────────────────────────────────────────────

export const reportsRegistry: ReportCategory[] = [
  // ═══════════════════════════════
  //  ADMIT REPORTS
  // ═══════════════════════════════
  {
    id: 'admit',
    title: 'Admissions',
    reports: [
      {
        id: 'applicants',
        categoryId: 'admit',
        title: 'Applicants',
        description: 'List of applicants by status, class or ad source',
        apiEndpoint: 'reports/admit/applicants/',
        exportKey: 'ADMIT_APPLICANTS',
        filters: { showDateRange: true, showAcademicYear: true, showClassSection: true, showStatus: true, statusOptions: [
          { value: 'ENQUIRY', label: 'Enquiry' },
          { value: 'APPLIED', label: 'Applied' },
          { value: 'ADMITTED', label: 'Admitted' },
          { value: 'REJECTED', label: 'Rejected' },
        ], showAdSource: true },
        // Backend .values(): id, first_name, last_name, grade_applying_for, source, status, created_at, father_phone, application_fee_paid, application_fee_amount
        columns: [
          { key: 'id', label: 'App No.', render: (_v: any, row: any) => (row.id || '').toString().split('-')[0].toUpperCase() },
          { key: 'student_name', label: 'Applicant Name', render: (_v: any, row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' },
          { key: 'grade_applying_for', label: 'Applied For' },
          { key: 'source', label: 'Source' },
          { key: 'status', label: 'Status' },
          { key: 'father_phone', label: 'Phone' },
        ]
      },
      {
        id: 'fee-allocations',
        categoryId: 'admit',
        title: 'Applicants Fee Allocations',
        description: 'List of applicants with their fee allocation amounts',
        apiEndpoint: 'reports/admit/fee-allocations/',
        exportKey: 'ADMIT_FEE_ALLOCATIONS',
        filters: { showDateRange: true, showAcademicYear: true, showClassSection: true, showAdSource: true },
        // Backend .values(): id, first_name, last_name, grade_applying_for, source, status, created_at, application_fee_paid, application_fee_amount
        columns: [
          { key: 'id', label: 'App No.', render: (_v: any, row: any) => (row.id || '').toString().split('-')[0].toUpperCase() },
          { key: 'student_name', label: 'Applicant Name', render: (_v: any, row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' },
          { key: 'application_fee_amount', label: 'Allocated Fee', render: (_v: any, row: any) => `₹${Number(row.application_fee_amount || 0).toLocaleString('en-IN')}` },
          { key: 'application_fee_paid', label: 'Fee Paid', render: (_v: any, row: any) => row.application_fee_paid ? 'Yes' : 'No' },
          { key: 'status', label: 'Status' }
        ]
      },
      {
        id: 'counts-by-class',
        categoryId: 'admit',
        title: 'Applicant counts by class',
        description: 'Class wise applicant counts',
        apiEndpoint: 'reports/admit/applicant-counts/',
        exportKey: 'ADMIT_COUNTS_BY_CLASS',
        filters: { showDateRange: false, showAcademicYear: true, showClassSection: false },
        // Backend returns: .values('grade_applying_for').annotate(count=Count('id'))
        columns: [
          { key: 'grade_applying_for', label: 'Class/Grade' },
          { key: 'count', label: 'Total Applications' }
        ]
      },
      {
        id: 'counts-by-month',
        categoryId: 'admit',
        title: 'Applicant counts by month',
        description: 'Month wise applicant counts',
        apiEndpoint: 'reports/admit/applicant-monthly-counts/',
        exportKey: 'ADMIT_COUNTS_BY_MONTH',
        filters: { showDateRange: false, showAcademicYear: true, showClassSection: false },
        // Backend returns: .annotate(month=TruncMonth('created_at')).values('month').annotate(count=Count('id'))
        columns: [
          { key: 'month', label: 'Month', render: (_v: any, row: any) => row.month ? new Date(row.month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '-' },
          { key: 'count', label: 'Total Applications' }
        ]
      }
    ]
  },

  // ═══════════════════════════════
  //  ACADEMICS REPORTS
  // ═══════════════════════════════
  {
    id: 'academics',
    title: 'Academics',
    reports: [
      {
        id: 'students',
        categoryId: 'academics',
        title: 'Students List',
        description: 'List of students by class and section',
        apiEndpoint: 'reports/academics/students-list/',
        exportKey: 'ACADEMICS_STUDENTS',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        // Backend .values(): id, admission_number, first_name, last_name, class_section__grade, class_section__section, status, gender, caste_category
        columns: [
          { key: 'admission_number', label: 'Admission No.' },
          { key: 'name', label: 'Student Name', render: (_v: any, row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.class_section__grade || ''}-${row.class_section__section || ''}`.replace(/-$/, '') },
          { key: 'gender', label: 'Gender' },
          { key: 'status', label: 'Status' }
        ]
      },
      {
        id: 'strength',
        categoryId: 'academics',
        title: 'Student Strength',
        description: 'Counts of active students by gender and category',
        apiEndpoint: 'reports/academics/student-strength/',
        exportKey: 'ACADEMICS_STRENGTH',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        // Backend returns: .values('gender', 'caste_category').annotate(count=Count('id'))
        columns: [
          { key: 'gender', label: 'Gender' },
          { key: 'caste_category', label: 'Category', render: (_v: any, row: any) => row.caste_category || 'General' },
          { key: 'count', label: 'Count' }
        ]
      },
      {
        id: 'year-transition-summary',
        categoryId: 'academics',
        title: 'Promotion & dropout summary',
        description: 'Per branch: counts from student academic records for a year (promoted, detained, dropout, graduated, transferred). Pick the source academic year and optionally one branch or all branches.',
        apiEndpoint: 'reports/academics/year-transition-summary/',
        exportKey: 'ACADEMICS_YEAR_TRANSITION',
        filters: { showDateRange: false, showClassSection: false, showAcademicYear: true },
        columns: [
          { key: 'branch_name', label: 'Branch' },
          { key: 'academic_year_name', label: 'Academic year' },
          { key: 'records_total', label: 'Records' },
          { key: 'active', label: 'Active' },
          { key: 'promoted', label: 'Promoted' },
          { key: 'detained', label: 'Detained' },
          { key: 'dropout', label: 'Dropout' },
          { key: 'graduated', label: 'Graduated' },
          { key: 'transferred', label: 'Transferred' },
        ]
      },
      {
        id: 'attendance',
        categoryId: 'academics',
        title: 'Student Attendance',
        description: 'View daily attendance records for students',
        apiEndpoint: 'reports/academics/student-attendance-daily/',
        exportKey: 'ACADEMICS_ATTENDANCE',
        filters: { showDateRange: true, showClassSection: true, showAcademicYear: false },
        // Backend .values(): date, status, student__first_name, student__last_name, class_section__grade, class_section__section
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.class_section__grade || ''}-${row.class_section__section || ''}`.replace(/-$/, '') },
          { key: 'status', label: 'Status' }
        ]
      },
      {
        id: 'notes',
        categoryId: 'academics',
        title: 'Student Notes',
        description: 'Attendance remarks and exam evaluator remarks',
        apiEndpoint: 'reports/academics/student-notes/',
        exportKey: 'ACADEMICS_NOTES',
        filters: { showDateRange: true, showClassSection: true, showAcademicYear: true },
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'source', label: 'Source' },
          { key: 'student_name', label: 'Student' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.grade || ''}-${row.section || ''}`.replace(/-$/, '') },
          { key: 'note', label: 'Note', render: (_v: any, row: any) => row.note || '-' },
        ]
      },
      {
        id: 'hall-tickets',
        categoryId: 'academics',
        title: 'Hall Tickets',
        description: 'Preview students, then download a multi-page PDF from your Hall Ticket template (System Settings → Templates).',
        apiEndpoint: 'reports/academics/hall-tickets/',
        exportKey: 'ACADEMICS_HALL_TICKETS',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true, showExam: true },
        offerPdfDownload: true,
        columns: [
          { key: 'exam_term__name', label: 'Exam' },
          { key: 'admission_number', label: 'Adm. No.' },
          { key: 'name', label: 'Student', render: (_v: any, row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.class_section__grade || ''}-${row.class_section__section || ''}`.replace(/-$/, '') },
        ]
      },
      {
        id: 'consolidated-marks',
        categoryId: 'academics',
        title: 'Consolidated Marks Sheet',
        description: 'Long-format marks for one exam term (filter by exam, class)',
        apiEndpoint: 'reports/academics/consolidated-marks/',
        exportKey: 'ACADEMICS_CONSOLIDATED_MARKS',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true, showExam: true },
        columns: [
          { key: 'student', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'adm', label: 'Adm. No.', render: (_v: any, row: any) => row.student__admission_number || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'exam_term__name', label: 'Exam' },
          { key: 'subject__name', label: 'Subject' },
          { key: 'marks_obtained', label: 'Marks' },
          { key: 'max_marks', label: 'Max' },
          { key: 'percentage', label: '%' },
          { key: 'grade', label: 'Grade' },
        ]
      },
      {
        id: 'section-report-cards',
        categoryId: 'academics',
        title: 'Section Report Cards',
        description: 'One PDF per student with marks; design your layout under Templates → Report Card (HTML or standard).',
        apiEndpoint: 'reports/academics/section-report-cards/',
        exportKey: 'ACADEMICS_SECTION_REPORT_CARDS',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true, showExam: true },
        offerPdfDownload: true,
        columns: [
          { key: 'exam_term__name', label: 'Exam' },
          { key: 'admission_number', label: 'Adm. No.' },
          { key: 'name', label: 'Student', render: (_v: any, row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.class_section__grade || ''}-${row.class_section__section || ''}`.replace(/-$/, '') },
        ]
      },
      {
        id: 'section-report-cards-summary',
        categoryId: 'academics',
        title: 'Section Report Cards Summary',
        description: 'Landscape summary table PDF plus on-screen totals (template: Report Card Summary).',
        apiEndpoint: 'reports/academics/section-report-cards-summary/',
        exportKey: 'ACADEMICS_SECTION_REPORT_CARDS_SUMMARY',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true, showExam: true },
        offerPdfDownload: true,
        columns: [
          { key: 'admission_number', label: 'Adm. No.' },
          { key: 'name', label: 'Student', render: (_v: any, row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.class_section__grade || ''}-${row.class_section__section || ''}`.replace(/-$/, '') },
          { key: 'total_marks', label: 'Total' },
          { key: 'max_marks', label: 'Max' },
          { key: 'percentage', label: '%' },
        ]
      },
      {
        id: 'ranks',
        categoryId: 'academics',
        title: 'Student Ranks',
        description: 'Ranks within each subject and class section for one exam term',
        apiEndpoint: 'reports/academics/student-ranks/',
        exportKey: 'ACADEMICS_RANKS',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true, showExam: true },
        columns: [
          { key: 'rank', label: 'Rank' },
          { key: 'subject__name', label: 'Subject' },
          { key: 'student', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'marks_obtained', label: 'Marks' },
          { key: 'max_marks', label: 'Max' },
          { key: 'percentage', label: '%' },
        ]
      },
      {
        id: 'missing-parent-app',
        categoryId: 'academics',
        title: 'Missing Parent App Registrations',
        description: 'Active students with no linked parent or no parent login yet',
        apiEndpoint: 'reports/academics/missing-parent-logins/',
        exportKey: 'ACADEMICS_MISSING_PARENT_APP',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        columns: [
          { key: 'admission_number', label: 'Admission No.' },
          { key: 'name', label: 'Student', render: (_v: any, row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.class_section__grade || ''}-${row.class_section__section || ''}`.replace(/-$/, '') },
        ]
      },
      {
        id: 'id-cards',
        categoryId: 'academics',
        title: 'Student ID Cards',
        description: 'Preview students, then download a multi-page PDF from your ID Card template.',
        apiEndpoint: 'reports/academics/student-id-cards/',
        exportKey: 'ACADEMICS_ID_CARDS',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        offerPdfDownload: true,
        columns: [
          { key: 'admission_number', label: 'Adm. No.' },
          { key: 'name', label: 'Student', render: (_v: any, row: any) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.class_section__grade || ''}-${row.class_section__section || ''}`.replace(/-$/, '') },
          { key: 'status', label: 'Status' },
          { key: 'gender', label: 'Gender' },
        ]
      }
    ]
  },

  // ═══════════════════════════════
  //  PAYMENT REPORTS
  // ═══════════════════════════════
  {
    id: 'payments',
    title: 'Financial',
    reports: [
      {
        id: 'fee-balances',
        categoryId: 'payments',
        title: 'Fee Balances',
        description: 'Outstanding fee balances by student',
        apiEndpoint: 'reports/payments/fee-balances/',
        exportKey: 'PAYMENTS_FEE_BALANCES',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        // Backend .values(): invoice_number, student__first_name, student__last_name, student__class_section__grade, student__class_section__section, gross_amount, net_amount, paid_amount, outstanding_amount, due_date, status
        columns: [
          { key: 'invoice_number', label: 'Invoice No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'net_amount', label: 'Net Amount', render: (_v: any, row: any) => `₹${Number(row.net_amount || 0).toLocaleString('en-IN')}` },
          { key: 'paid_amount', label: 'Paid', render: (_v: any, row: any) => `₹${Number(row.paid_amount || 0).toLocaleString('en-IN')}` },
          { key: 'outstanding_amount', label: 'Balance', render: (_v: any, row: any) => `₹${Number(row.outstanding_amount || 0).toLocaleString('en-IN')}` },
          { key: 'due_date', label: 'Due Date' },
          { key: 'status', label: 'Status' }
        ]
      },
      {
        id: 'daily-collections',
        categoryId: 'payments',
        title: 'Daily Collections',
        description: 'Payments collected in a date range',
        apiEndpoint: 'reports/payments/daily-collections/',
        exportKey: 'PAYMENTS_DAILY_COLLECTIONS',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false, showPaymentMode: true },
        // Backend .values(): receipt_number, student__first_name, student__last_name, amount, payment_mode, payment_date
        columns: [
          { key: 'receipt_number', label: 'Receipt No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'payment_mode', label: 'Mode' },
          { key: 'payment_date', label: 'Date' }
        ]
      },
      {
        id: 'receipts',
        categoryId: 'payments',
        title: 'Receipts',
        description: 'List of receipts for a date range',
        apiEndpoint: 'reports/payments/receipts/',
        exportKey: 'PAYMENTS_RECEIPTS',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false, showPaymentMode: true },
        // Backend .values(): receipt_number, student__first_name, student__last_name, amount, payment_mode, payment_date, status
        columns: [
          { key: 'receipt_number', label: 'Receipt No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'payment_mode', label: 'Mode' },
          { key: 'payment_date', label: 'Date' },
          { key: 'status', label: 'Status' }
        ]
      },
      {
        id: 'deleted-receipts',
        categoryId: 'payments',
        title: 'Deleted Receipts',
        description: 'List of deleted/refunded receipts',
        apiEndpoint: 'reports/payments/deleted-receipts/',
        exportKey: 'PAYMENTS_DELETED_RECEIPTS',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        // Backend .values(): receipt_number, student__first_name, student__last_name, amount, payment_mode, payment_date, status
        columns: [
          { key: 'receipt_number', label: 'Receipt No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'payment_date', label: 'Date' },
          { key: 'status', label: 'Status' }
        ]
      },
      {
        id: 'income-statement',
        categoryId: 'payments',
        title: 'Income Statement',
        description: 'Income breakdown by category for a period',
        apiEndpoint: 'reports/payments/income-statement/',
        exportKey: 'PAYMENTS_INCOME_STATEMENT',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        // Backend returns: .values('category').annotate(total=Sum('amount'))
        columns: [
          { key: 'category', label: 'Category' },
          { key: 'total', label: 'Total Amount', render: (_v: any, row: any) => `₹${Number(row.total || 0).toLocaleString('en-IN')}` }
        ]
      },
      {
        id: 'expenses',
        categoryId: 'payments',
        title: 'Expenses',
        description: 'List of expenses by date range; narrow by expense type or vendor name',
        apiEndpoint: 'reports/payments/expenses/',
        exportKey: 'PAYMENTS_EXPENSES',
        filters: {
          showDateRange: true,
          showClassSection: false,
          showAcademicYear: false,
          showExpenseTypeSearch: true,
          showVendorNameSearch: true,
        },
        columns: [
          { key: 'voucher_number', label: 'Voucher No.', render: (v: any) => (v != null && v !== '' ? String(v) : '—') },
          {
            key: 'category__name',
            label: 'Expense type',
            render: (_v: any, row: any) =>
              React.createElement(
                'span',
                {
                  className:
                    'inline-flex px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium whitespace-normal',
                },
                row['category__name'] || '—',
              ),
          },
          { key: 'title', label: 'Description' },
          { key: 'vendor__name', label: 'Vendor', render: (_v: any, row: any) => row['vendor__name'] || '—' },
          {
            key: 'expense_date',
            label: 'Payment date',
            render: (v: any) =>
              v
                ? new Date(String(v) + 'T12:00:00').toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—',
          },
          {
            key: 'payment_mode',
            label: 'Mode',
            render: (v: any) => {
              const labels: Record<string, string> = {
                CASH: 'Cash',
                CHEQUE: 'Cheque',
                NEFT: 'NEFT',
                RTGS: 'RTGS',
                UPI: 'UPI',
                CARD: 'Card',
                BANK_TRANSFER: 'Bank Transfer',
              };
              return v ? labels[String(v)] || String(v) : '—';
            },
          },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'status', label: 'Status' },
        ]
      },
      {
        id: 'fee-balances-teachers',
        categoryId: 'payments',
        title: 'Fee Balances (Teachers View)',
        description: 'Fee balances filtered for teacher access',
        apiEndpoint: 'reports/payments/fee-balances-teachers/',
        exportKey: 'PAYMENTS_FEE_BALANCES_TEACHERS',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        columns: [
          { key: 'invoice_number', label: 'Invoice No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'outstanding_amount', label: 'Balance', render: (_v: any, row: any) => `₹${Number(row.outstanding_amount || 0).toLocaleString('en-IN')}` },
          { key: 'due_date', label: 'Due Date' },
          { key: 'status', label: 'Status' },
        ]
      },
      {
        id: 'other-income',
        categoryId: 'payments',
        title: 'Other Income Receipts',
        description: 'Cashbook income not from tuition/fees (uniforms, trips, events, books, donations, etc.). Record from Expense Desk → Record other income.',
        apiEndpoint: 'reports/payments/other-income/',
        exportKey: 'PAYMENTS_OTHER_INCOME',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        columns: [
          { key: 'transaction_date', label: 'Date' },
          { key: 'category', label: 'Category' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'description', label: 'Description' },
          { key: 'reference_model', label: 'Ref. type' },
          { key: 'reference_id', label: 'Ref. ID', render: (_v: any, row: any) => (row.reference_id != null ? String(row.reference_id) : '-') },
        ]
      },
      {
        id: 'deleted-other-income',
        categoryId: 'payments',
        title: 'Deleted Other Income',
        description: 'Negative non–fee income adjustments (includes full reversals of manual other income from Expense Desk)',
        apiEndpoint: 'reports/payments/deleted-other-income/',
        exportKey: 'PAYMENTS_DELETED_OTHER_INCOME',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        columns: [
          { key: 'transaction_date', label: 'Date' },
          { key: 'category', label: 'Category' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'description', label: 'Description' },
          { key: 'reference_model', label: 'Ref. type' },
        ]
      },
      {
        id: 'cheques',
        categoryId: 'payments',
        title: 'Cheques',
        description: 'List of cheques received',
        apiEndpoint: 'reports/payments/cheques/',
        exportKey: 'PAYMENTS_CHEQUES',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        columns: [
          { key: 'receipt_number', label: 'Receipt' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'payment_date', label: 'Date' },
          { key: 'reference_number', label: 'Cheque ref' },
          { key: 'bank_name', label: 'Bank' },
          { key: 'status', label: 'Status' },
        ]
      },
      {
        id: 'concessions',
        categoryId: 'payments',
        title: 'Concessions',
        description: 'Student concession amount and percentage from actual fee',
        apiEndpoint: 'reports/payments/concessions/',
        exportKey: 'PAYMENTS_CONCESSIONS',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        columns: [
          { key: 'student__admission_number', label: 'Adm. No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'gross_amount', label: 'Actual Fee', render: (_v: any, row: any) => `₹${Number(row.gross_amount || 0).toLocaleString('en-IN')}` },
          { key: 'net_amount', label: 'Given Fee', render: (_v: any, row: any) => `₹${Number(row.net_amount || 0).toLocaleString('en-IN')}` },
          { key: 'concession_amount', label: 'Concession', render: (_v: any, row: any) => `₹${Number(row.concession_amount || 0).toLocaleString('en-IN')}` },
          { key: 'concession_percent', label: 'Concession %', render: (_v: any, row: any) => `${Number(row.concession_percent || 0).toFixed(2)}%` },
        ]
      },
      {
        id: 'fees-paid',
        categoryId: 'payments',
        title: 'Fees Paid',
        description: 'Fees paid breakdown by payment mode',
        apiEndpoint: 'reports/payments/fees-paid/',
        exportKey: 'PAYMENTS_FEES_PAID',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        columns: [
          { key: 'payment_mode', label: 'Mode' },
          { key: 'total', label: 'Total', render: (_v: any, row: any) => `₹${Number(row.total || 0).toLocaleString('en-IN')}` },
        ]
      },
      {
        id: 'bank-transactions',
        categoryId: 'payments',
        title: 'Bank Transactions',
        description: 'Bank transfer and cheque records',
        apiEndpoint: 'reports/payments/bank-transactions/',
        exportKey: 'PAYMENTS_BANK_TRANSACTIONS',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        columns: [
          { key: 'receipt_number', label: 'Receipt' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'payment_mode', label: 'Mode' },
          { key: 'payment_date', label: 'Date' },
          { key: 'reference_number', label: 'Reference' },
          { key: 'bank_name', label: 'Bank' },
          { key: 'status', label: 'Status' },
        ]
      },
      {
        id: 'bus-expenses',
        categoryId: 'payments',
        title: 'Bus Expenses',
        description: 'List of transport-related expenses',
        apiEndpoint: 'reports/payments/bus-expenses/',
        exportKey: 'PAYMENTS_BUS_EXPENSES',
        filters: {
          showDateRange: true,
          showClassSection: false,
          showAcademicYear: false,
          showExpenseTypeSearch: true,
          showVendorNameSearch: true,
        },
        columns: [
          { key: 'voucher_number', label: 'Voucher No.', render: (v: any) => (v != null && v !== '' ? String(v) : '—') },
          {
            key: 'category__name',
            label: 'Expense type',
            render: (_v: any, row: any) =>
              React.createElement(
                'span',
                {
                  className:
                    'inline-flex px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium whitespace-normal',
                },
                row['category__name'] || '—',
              ),
          },
          { key: 'title', label: 'Description' },
          { key: 'vendor__name', label: 'Vendor', render: (_v: any, row: any) => row['vendor__name'] || '—' },
          {
            key: 'expense_date',
            label: 'Payment date',
            render: (v: any) =>
              v
                ? new Date(String(v) + 'T12:00:00').toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—',
          },
          {
            key: 'payment_mode',
            label: 'Mode',
            render: (v: any) => {
              const labels: Record<string, string> = {
                CASH: 'Cash',
                CHEQUE: 'Cheque',
                NEFT: 'NEFT',
                RTGS: 'RTGS',
                UPI: 'UPI',
                CARD: 'Card',
                BANK_TRANSFER: 'Bank Transfer',
              };
              return v ? labels[String(v)] || String(v) : '—';
            },
          },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'status', label: 'Status' },
        ]
      },
      {
        id: 'fee-balances-no-concession',
        categoryId: 'payments',
        title: 'Fee Balances (No Concession)',
        description: 'Fee balances excluding concessions',
        apiEndpoint: 'reports/payments/fee-balances-no-concession/',
        exportKey: 'PAYMENTS_FEE_BALANCES_NO_CONCESSION',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        columns: [
          { key: 'invoice_number', label: 'Invoice No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'outstanding_amount', label: 'Balance', render: (_v: any, row: any) => `₹${Number(row.outstanding_amount || 0).toLocaleString('en-IN')}` },
          { key: 'due_date', label: 'Due Date' },
          { key: 'status', label: 'Status' },
        ]
      },
      {
        id: 'all-receipts',
        categoryId: 'payments',
        title: 'All Receipts',
        description: 'Comprehensive list of all receipts',
        apiEndpoint: 'reports/payments/all-receipts/',
        exportKey: 'PAYMENTS_ALL_RECEIPTS',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false, showPaymentMode: true },
        columns: [
          { key: 'receipt_number', label: 'Receipt' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'payment_mode', label: 'Mode' },
          { key: 'payment_date', label: 'Date' },
          { key: 'status', label: 'Status' },
        ]
      },
      {
        id: 'all-receipts-with-mismatch',
        categoryId: 'payments',
        title: 'Receipts with Mismatch',
        description: 'Receipts where invoice paid amount differs from payment sum',
        apiEndpoint: 'reports/payments/all-receipts-with-mismatch/',
        exportKey: 'PAYMENTS_ALL_RECEIPTS_WITH_MISMATCH',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        columns: [
          { key: 'invoice_number', label: 'Invoice' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => row.student_name || '-' },
          { key: 'invoice_paid', label: 'Invoice paid' },
          { key: 'payment_sum', label: 'Payment sum' },
          { key: 'delta', label: 'Delta' },
        ]
      },
      {
        id: 'all-income-expenses',
        categoryId: 'payments',
        title: 'All Income & Expenses',
        description: 'Combined income and expenses view',
        apiEndpoint: 'reports/payments/all-income-expenses/',
        exportKey: 'PAYMENTS_ALL_INCOME_EXPENSES',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        columns: [
          { key: 'transaction_type', label: 'Type' },
          { key: 'category', label: 'Category' },
          { key: 'amount', label: 'Amount', render: (_v: any, row: any) => `₹${Number(row.amount || 0).toLocaleString('en-IN')}` },
          { key: 'transaction_date', label: 'Date' },
          { key: 'description', label: 'Description' },
        ]
      },
      {
        id: 'student-detailed-balances',
        categoryId: 'payments',
        title: 'Student Detailed Balances',
        description: 'Detailed balance breakdown per student',
        apiEndpoint: 'reports/payments/student-detailed-balances/',
        exportKey: 'PAYMENTS_STUDENT_DETAILED_BALANCES',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        columns: [
          { key: 'student__admission_number', label: 'Adm. No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'total_net', label: 'Net', render: (_v: any, row: any) => `₹${Number(row.total_net || 0).toLocaleString('en-IN')}` },
          { key: 'total_paid', label: 'Paid', render: (_v: any, row: any) => `₹${Number(row.total_paid || 0).toLocaleString('en-IN')}` },
          { key: 'total_outstanding', label: 'Outstanding', render: (_v: any, row: any) => `₹${Number(row.total_outstanding || 0).toLocaleString('en-IN')}` },
        ]
      }
    ]
  },

  // ═══════════════════════════════
  //  STAFF & HR REPORTS
  // ═══════════════════════════════
  {
    id: 'staff',
    title: 'Staff & HR',
    reports: [
      {
        id: 'attendance',
        categoryId: 'staff',
        title: 'Staff Attendance',
        description: 'Teacher and staff attendance records',
        apiEndpoint: 'reports/staff/attendance/',
        exportKey: 'STAFF_ATTENDANCE',
        filters: { showDateRange: true, showClassSection: false, showAcademicYear: false },
        // Backend .values(): date, status, staff__employee_id, staff__user__first_name, staff__user__last_name, staff__branch__name, remarks
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'staff_name', label: 'Staff Name', render: (_v: any, row: any) => `${row.staff__user__first_name || ''} ${row.staff__user__last_name || ''}`.trim() || '-' },
          { key: 'staff__employee_id', label: 'Employee ID' },
          { key: 'staff__branch__name', label: 'Branch' },
          { key: 'status', label: 'Status' },
          { key: 'remarks', label: 'Remarks' }
        ]
      }
    ]
  },

  // ═══════════════════════════════
  //  TRANSPORT REPORTS
  // ═══════════════════════════════
  {
    id: 'bus',
    title: 'Transport',
    reports: [
      {
        id: 'bus-fee-balances',
        categoryId: 'bus',
        title: 'Transport Fee Balances',
        description: 'Bus fee balances for students',
        apiEndpoint: 'reports/bus/bus-fee-balances/',
        exportKey: 'BUS_FEE_BALANCES',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        // Backend .values(): invoice_number, student__first_name, student__last_name, student__class_section__grade, student__class_section__section, outstanding_amount, due_date
        columns: [
          { key: 'invoice_number', label: 'Invoice No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'outstanding_amount', label: 'Balance', render: (_v: any, row: any) => `₹${Number(row.outstanding_amount || 0).toLocaleString('en-IN')}` },
          { key: 'due_date', label: 'Due Date' }
        ]
      }
    ]
  },

  // ═══════════════════════════════
  //  PAST DUES REPORTS
  // ═══════════════════════════════
  {
    id: 'past-dues',
    title: 'Past Dues & Aging',
    reports: [
      {
        id: 'list',
        categoryId: 'past-dues',
        title: 'Students With Past Due Fees',
        description: 'View students with overdue fee balances',
        apiEndpoint: 'reports/past-dues/list/',
        exportKey: 'PAST_DUES_LIST',
        filters: { showDateRange: false, showClassSection: true, showAcademicYear: true },
        // Backend .values(): invoice_number, student__first_name, student__last_name, student__class_section__grade, student__class_section__section, outstanding_amount, due_date, days_overdue
        columns: [
          { key: 'invoice_number', label: 'Invoice No.' },
          { key: 'student_name', label: 'Student', render: (_v: any, row: any) => `${row.student__first_name || ''} ${row.student__last_name || ''}`.trim() || '-' },
          { key: 'class', label: 'Class', render: (_v: any, row: any) => `${row.student__class_section__grade || ''}-${row.student__class_section__section || ''}`.replace(/-$/, '') },
          { key: 'outstanding_amount', label: 'Balance', render: (_v: any, row: any) => `₹${Number(row.outstanding_amount || 0).toLocaleString('en-IN')}` },
          { key: 'due_date', label: 'Due Date' },
          { key: 'days_overdue', label: 'Days Overdue', render: (_v: any, row: any) => {
            const days = row.days_overdue || 0;
            const color = days > 90 ? 'text-red-600 bg-red-50' : days > 30 ? 'text-amber-600 bg-amber-50' : 'text-slate-600 bg-slate-50';
            return React.createElement('span', { className: `px-2 py-0.5 rounded-full text-xs font-bold ${color}` }, `${days} days`);
          }}
        ]
      }
    ]
  }
];

export const getReportConfig = (categoryId: string, reportId: string): ReportConfig | undefined => {
  const category = reportsRegistry.find(c => c.id === categoryId);
  return category?.reports.find(r => r.id === reportId);
};
