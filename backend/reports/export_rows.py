"""
Build (headers, data_rows) for Excel export jobs from ExportFilterBundle.
Returns None if report_type is not implemented.
"""
from __future__ import annotations

from .export_filters import ExportFilterBundle
from .services.academics import AcademicsService
from .services.admit import AdmitService
from .services.bus import BusService
from .services.past_dues import PastDuesService
from .services.payments import PaymentsService
from .services.staff_reports import StaffReportsService


def _cell(v):
    if v is None:
        return ''
    return v


def build_export_rows(report_type: str, bundle: ExportFilterBundle) -> tuple[list[str], list[list]] | None:
    if report_type == 'FEE_BALANCES':
        report_type = 'PAYMENTS_FEE_BALANCES'

    # ─── Admit ─────────────────────────────────────────────────
    if report_type == 'ADMIT_APPLICANTS':
        qs = AdmitService.get_applicants(bundle).values(
            'id', 'first_name', 'last_name', 'grade_applying_for', 'source',
            'status', 'created_at', 'father_phone', 'application_fee_paid', 'application_fee_amount'
        )
        headers = [
            'Application ID', 'First name', 'Last name', 'Grade applying for', 'Source',
            'Status', 'Created at', 'Father phone', 'Application fee paid', 'Application fee amount',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                str(row['id']), _cell(row['first_name']), _cell(row['last_name']),
                _cell(row['grade_applying_for']), _cell(row['source']), _cell(row['status']),
                _cell(row['created_at']), _cell(row['father_phone']),
                'Yes' if row['application_fee_paid'] else 'No', _cell(row['application_fee_amount']),
            ])
        return headers, rows

    if report_type == 'ADMIT_FEE_ALLOCATIONS':
        qs = AdmitService.get_applicants(bundle).values(
            'id', 'first_name', 'last_name', 'grade_applying_for', 'source',
            'status', 'created_at', 'application_fee_paid', 'application_fee_amount'
        )
        headers = [
            'Application ID', 'First name', 'Last name', 'Grade applying for', 'Source',
            'Status', 'Created at', 'Fee paid', 'Allocated fee',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                str(row['id']), _cell(row['first_name']), _cell(row['last_name']),
                _cell(row['grade_applying_for']), _cell(row['source']), _cell(row['status']),
                _cell(row['created_at']), 'Yes' if row['application_fee_paid'] else 'No',
                _cell(row['application_fee_amount']),
            ])
        return headers, rows

    if report_type == 'ADMIT_COUNTS_BY_CLASS':
        data = AdmitService.get_applicant_counts_by_class(bundle)
        headers = ['Grade applying for', 'Application count']
        rows = [[_cell(r.get('grade_applying_for')), r.get('count', 0)] for r in data]
        return headers, rows

    if report_type == 'ADMIT_COUNTS_BY_MONTH':
        data = AdmitService.get_applicant_counts_by_month(bundle)
        headers = ['Month', 'Application count']
        rows = []
        for r in data:
            m = r.get('month')
            rows.append([m.isoformat() if hasattr(m, 'isoformat') else _cell(m), r.get('count', 0)])
        return headers, rows

    # ─── Academics ─────────────────────────────────────────────
    if report_type == 'ACADEMICS_STUDENTS':
        qs = AcademicsService.get_students(bundle).values(
            'id', 'admission_number', 'first_name', 'last_name',
            'class_section__grade', 'class_section__section', 'status', 'gender', 'caste_category',
        )
        headers = [
            'Student ID', 'Admission number', 'First name', 'Last name', 'Grade', 'Section',
            'Status', 'Gender', 'Caste category',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                str(row['id']), _cell(row['admission_number']), _cell(row['first_name']),
                _cell(row['last_name']), _cell(row['class_section__grade']),
                _cell(row['class_section__section']), _cell(row['status']),
                _cell(row['gender']), _cell(row['caste_category']),
            ])
        return headers, rows

    if report_type == 'ACADEMICS_STRENGTH':
        data = AcademicsService.get_student_strength(bundle)
        headers = ['Gender', 'Caste category', 'Count']
        rows = [[_cell(r.get('gender')), _cell(r.get('caste_category')), r.get('count', 0)] for r in data]
        return headers, rows

    if report_type == 'ACADEMICS_YEAR_TRANSITION':
        data = AcademicsService.get_year_transition_summary(bundle)
        headers = [
            'Branch', 'Academic year', 'Records total', 'Active', 'Promoted', 'Detained',
            'Dropout', 'Graduated', 'Transferred',
        ]
        rows = []
        for r in data:
            rows.append([
                _cell(r.get('branch_name')),
                _cell(r.get('academic_year_name')),
                r.get('records_total', 0),
                r.get('active', 0),
                r.get('promoted', 0),
                r.get('detained', 0),
                r.get('dropout', 0),
                r.get('graduated', 0),
                r.get('transferred', 0),
            ])
        return headers, rows

    if report_type == 'ACADEMICS_ATTENDANCE':
        qs = AcademicsService.get_student_attendance_daily(bundle).values(
            'date', 'status', 'student__first_name', 'student__last_name',
            'class_section__grade', 'class_section__section',
        )
        headers = ['Date', 'Status', 'Student first name', 'Student last name', 'Grade', 'Section']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['date']), _cell(row['status']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['class_section__grade']),
                _cell(row['class_section__section']),
            ])
        return headers, rows

    if report_type == 'ACADEMICS_ID_CARDS':
        return build_export_rows('ACADEMICS_STUDENTS', bundle)

    if report_type == 'ACADEMICS_HALL_TICKETS':
        term = AcademicsService.get_exam_term_for_print(bundle)
        if not term:
            return (
                ['Admission number', 'First name', 'Last name', 'Grade', 'Section', 'Exam'],
                [],
            )
        qs = AcademicsService.get_students_for_exam_print(bundle)
        headers = ['Admission number', 'First name', 'Last name', 'Grade', 'Section', 'Exam']
        rows = []
        for row in qs.values(
            'admission_number', 'first_name', 'last_name',
            'class_section__grade', 'class_section__section',
        ).iterator(chunk_size=500):
            rows.append([
                _cell(row['admission_number']), _cell(row['first_name']), _cell(row['last_name']),
                _cell(row['class_section__grade']), _cell(row['class_section__section']),
                term.name,
            ])
        return headers, rows

    if report_type == 'ACADEMICS_SECTION_REPORT_CARDS':
        return build_export_rows('ACADEMICS_HALL_TICKETS', bundle)

    if report_type == 'ACADEMICS_SECTION_REPORT_CARDS_SUMMARY':
        data = AcademicsService.get_report_card_summary_preview_rows(bundle)
        headers = [
            'Admission number', 'First name', 'Last name', 'Grade', 'Section',
            'Total marks', 'Max marks', 'Percentage',
        ]
        rows = []
        for row in data:
            rows.append([
                _cell(row.get('admission_number')), _cell(row.get('first_name')), _cell(row.get('last_name')),
                _cell(row.get('class_section__grade')), _cell(row.get('class_section__section')),
                _cell(row.get('total_marks')), _cell(row.get('max_marks')), _cell(row.get('percentage')),
            ])
        return headers, rows

    if report_type == 'ACADEMICS_NOTES':
        data = AcademicsService.get_student_notes(bundle)
        headers = ['Date', 'Source', 'Student', 'Grade', 'Section', 'Note']
        rows = [
            [
                _cell(r.get('date')), _cell(r.get('source')), _cell(r.get('student_name')),
                _cell(r.get('grade')), _cell(r.get('section')), _cell(r.get('note')),
            ]
            for r in data
        ]
        return headers, rows

    if report_type == 'ACADEMICS_MISSING_PARENT_APP':
        qs = AcademicsService.get_students_missing_parent_login(bundle).values(
            'admission_number', 'first_name', 'last_name',
            'class_section__grade', 'class_section__section',
        )
        headers = ['Admission number', 'First name', 'Last name', 'Grade', 'Section']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['admission_number']), _cell(row['first_name']), _cell(row['last_name']),
                _cell(row['class_section__grade']), _cell(row['class_section__section']),
            ])
        return headers, rows

    if report_type == 'ACADEMICS_RANKS':
        data = AcademicsService.get_student_ranks(bundle)
        headers = [
            'Exam', 'Subject', 'Rank', 'Admission number', 'Student first name', 'Student last name',
            'Grade', 'Section', 'Marks', 'Max marks', 'Percentage',
        ]
        rows = []
        for r in data:
            rows.append([
                _cell(r.get('exam_term__name')), _cell(r.get('subject__name')), r.get('rank', ''),
                _cell(r.get('student__admission_number')),
                _cell(r.get('student__first_name')), _cell(r.get('student__last_name')),
                _cell(r.get('student__class_section__grade')), _cell(r.get('student__class_section__section')),
                _cell(r.get('marks_obtained')), _cell(r.get('max_marks')), _cell(r.get('percentage')),
            ])
        return headers, rows

    if report_type == 'ACADEMICS_CONSOLIDATED_MARKS':
        qs = AcademicsService.get_consolidated_marks_flat(bundle).values(
            'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'exam_term__name', 'subject__name', 'marks_obtained', 'max_marks', 'percentage', 'grade',
        )
        headers = [
            'Admission number', 'First name', 'Last name', 'Grade', 'Section',
            'Exam', 'Subject', 'Marks', 'Max marks', 'Percentage', 'Grade',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['student__admission_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['student__class_section__grade']),
                _cell(row['student__class_section__section']), _cell(row['exam_term__name']),
                _cell(row['subject__name']), _cell(row['marks_obtained']), _cell(row['max_marks']),
                _cell(row['percentage']), _cell(row['grade']),
            ])
        return headers, rows

    # ─── Payments / fees ───────────────────────────────────────
    if report_type == 'PAYMENTS_FEE_BALANCES':
        qs = PaymentsService.get_fee_balances(bundle).values(
            'invoice_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'paid_amount', 'outstanding_amount', 'due_date', 'status',
        )
        headers = [
            'Invoice', 'Student first name', 'Student last name', 'Grade', 'Section',
            'Gross', 'Net', 'Paid', 'Outstanding', 'Due date', 'Status',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['invoice_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['student__class_section__grade']),
                _cell(row['student__class_section__section']), _cell(row['gross_amount']),
                _cell(row['net_amount']), _cell(row['paid_amount']), _cell(row['outstanding_amount']),
                _cell(row['due_date']), _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_FEE_BALANCES_TEACHERS':
        return build_export_rows('PAYMENTS_FEE_BALANCES', bundle)

    if report_type == 'PAYMENTS_FEE_BALANCES_NO_CONCESSION':
        qs = PaymentsService.get_fee_balances(bundle).filter(concession_amount=0).values(
            'invoice_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'paid_amount', 'outstanding_amount', 'due_date', 'status',
        )
        headers = [
            'Invoice', 'Student first name', 'Student last name', 'Grade', 'Section',
            'Gross', 'Net', 'Paid', 'Outstanding', 'Due date', 'Status',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['invoice_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['student__class_section__grade']),
                _cell(row['student__class_section__section']), _cell(row['gross_amount']),
                _cell(row['net_amount']), _cell(row['paid_amount']), _cell(row['outstanding_amount']),
                _cell(row['due_date']), _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_DAILY_COLLECTIONS':
        qs = PaymentsService.get_daily_collections(bundle).values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date',
        )
        headers = ['Receipt', 'Student first name', 'Student last name', 'Amount', 'Mode', 'Date']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['receipt_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['amount']),
                _cell(row['payment_mode']), _cell(row['payment_date']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_RECEIPTS':
        qs = PaymentsService.get_receipts(bundle, is_deleted=False).values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status',
        )
        headers = ['Receipt', 'Student first name', 'Student last name', 'Amount', 'Mode', 'Date', 'Status']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['receipt_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['amount']),
                _cell(row['payment_mode']), _cell(row['payment_date']), _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_DELETED_RECEIPTS':
        qs = PaymentsService.get_receipts(bundle, is_deleted=True).values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status',
        )
        headers = ['Receipt', 'Student first name', 'Student last name', 'Amount', 'Mode', 'Date', 'Status']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['receipt_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['amount']),
                _cell(row['payment_mode']), _cell(row['payment_date']), _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_ALL_RECEIPTS':
        qs = PaymentsService.get_all_receipts(bundle).values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status',
        )
        headers = ['Receipt', 'Student first name', 'Student last name', 'Amount', 'Mode', 'Date', 'Status']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['receipt_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['amount']),
                _cell(row['payment_mode']), _cell(row['payment_date']), _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_INCOME_STATEMENT':
        data = PaymentsService.get_income_statement(bundle)
        headers = ['Category', 'Total amount']
        rows = [[_cell(r.get('category')), _cell(r.get('total'))] for r in data]
        return headers, rows

    if report_type == 'PAYMENTS_EXPENSES':
        qs = PaymentsService.get_expenses(bundle).values(
            'id', 'voucher_number', 'title', 'amount', 'category__name',
            'vendor__name', 'expense_date', 'payment_mode', 'status',
        )
        headers = [
            'ID', 'Voucher no.', 'Title', 'Amount', 'Category', 'Vendor',
            'Expense date', 'Payment mode', 'Status',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                str(row['id']), _cell(row['voucher_number']), _cell(row['title']), _cell(row['amount']),
                _cell(row['category__name']), _cell(row['vendor__name']), _cell(row['expense_date']),
                _cell(row['payment_mode']), _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_BUS_EXPENSES':
        qs = PaymentsService.get_bus_expenses(bundle).values(
            'id', 'voucher_number', 'title', 'amount', 'category__name',
            'vendor__name', 'expense_date', 'payment_mode', 'status',
        )
        headers = [
            'ID', 'Voucher no.', 'Title', 'Amount', 'Category', 'Vendor',
            'Expense date', 'Payment mode', 'Status',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                str(row['id']), _cell(row['voucher_number']), _cell(row['title']), _cell(row['amount']),
                _cell(row['category__name']), _cell(row['vendor__name']), _cell(row['expense_date']),
                _cell(row['payment_mode']), _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_CONCESSIONS':
        qs = PaymentsService.get_concessions(bundle).values(
            'student__admission_number', 'student__first_name', 'student__last_name',
            'concession__name', 'status', 'valid_from', 'valid_until', 'notes',
        )
        headers = [
            'Admission number', 'Student first name', 'Student last name',
            'Concession', 'Status', 'Valid from', 'Valid until', 'Notes',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['student__admission_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['concession__name']),
                _cell(row['status']), _cell(row['valid_from']), _cell(row['valid_until']),
                _cell(row['notes']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_FEES_PAID':
        data = PaymentsService.get_fees_paid_by_mode(bundle)
        headers = ['Payment mode', 'Total amount']
        rows = [[_cell(r.get('payment_mode')), _cell(r.get('total'))] for r in data]
        return headers, rows

    if report_type == 'PAYMENTS_BANK_TRANSACTIONS':
        qs = PaymentsService.get_bank_transactions(bundle).values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'reference_number', 'bank_name', 'status',
        )
        headers = [
            'Receipt', 'Student first name', 'Student last name', 'Amount', 'Mode',
            'Date', 'Reference', 'Bank', 'Status',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['receipt_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['amount']), _cell(row['payment_mode']),
                _cell(row['payment_date']), _cell(row['reference_number']), _cell(row['bank_name']),
                _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_CHEQUES':
        qs = PaymentsService.get_bank_transactions(bundle).filter(payment_mode='CHEQUE').values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_date', 'reference_number', 'bank_name', 'status',
        )
        headers = ['Receipt', 'Student first name', 'Student last name', 'Amount', 'Date', 'Cheque ref', 'Bank', 'Status']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['receipt_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['amount']), _cell(row['payment_date']),
                _cell(row['reference_number']), _cell(row['bank_name']), _cell(row['status']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_ALL_RECEIPTS_WITH_MISMATCH':
        data = PaymentsService.get_mismatch_detection(bundle)
        headers = ['Invoice', 'Student', 'Invoice paid', 'Payment sum', 'Delta']
        rows = [
            [
                _cell(r.get('invoice_number')), _cell(r.get('student_name')),
                r.get('invoice_paid', ''), r.get('payment_sum', ''), r.get('delta', ''),
            ]
            for r in data
        ]
        return headers, rows

    if report_type == 'PAYMENTS_ALL_INCOME_EXPENSES':
        qs = PaymentsService.get_transaction_ledger(bundle).values(
            'transaction_type', 'category', 'amount', 'transaction_date', 'description',
            'reference_model', 'reference_id',
        )
        headers = ['Type', 'Category', 'Amount', 'Date', 'Description', 'Reference model', 'Reference ID']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['transaction_type']), _cell(row['category']), _cell(row['amount']),
                _cell(row['transaction_date']), _cell(row['description']),
                _cell(row['reference_model']), str(row['reference_id']) if row['reference_id'] else '',
            ])
        return headers, rows

    if report_type == 'PAYMENTS_STUDENT_DETAILED_BALANCES':
        agg = PaymentsService.get_student_balance_summary(bundle)
        headers = [
            'Admission number', 'First name', 'Last name', 'Grade', 'Section',
            'Total net', 'Total paid', 'Total outstanding',
        ]
        rows = []
        for row in agg.iterator(chunk_size=500):
            rows.append([
                _cell(row['student__admission_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['student__class_section__grade']),
                _cell(row['student__class_section__section']), _cell(row['total_net']),
                _cell(row['total_paid']), _cell(row['total_outstanding']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_OTHER_INCOME':
        qs = PaymentsService.get_other_income_ledger(bundle).values(
            'category', 'amount', 'transaction_date', 'description', 'reference_model', 'reference_id',
        )
        headers = ['Category', 'Amount', 'Date', 'Description', 'Reference model', 'Reference ID']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['category']), _cell(row['amount']), _cell(row['transaction_date']),
                _cell(row['description']), _cell(row['reference_model']), str(row['reference_id']),
            ])
        return headers, rows

    if report_type == 'PAYMENTS_DELETED_OTHER_INCOME':
        qs = PaymentsService.get_deleted_other_income_ledger(bundle).values(
            'category', 'amount', 'transaction_date', 'description', 'reference_model', 'reference_id',
        )
        headers = ['Category', 'Amount', 'Date', 'Description', 'Reference model', 'Reference ID']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['category']), _cell(row['amount']), _cell(row['transaction_date']),
                _cell(row['description']), _cell(row['reference_model']), str(row['reference_id']),
            ])
        return headers, rows

    # ─── Bus / past dues / staff ─────────────────────────────────
    if report_type == 'BUS_FEE_BALANCES':
        qs = BusService.get_bus_fee_balances(bundle).values(
            'invoice_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'outstanding_amount', 'due_date',
        )
        headers = [
            'Invoice', 'Student first name', 'Student last name', 'Grade', 'Section',
            'Outstanding', 'Due date',
        ]
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['invoice_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['student__class_section__grade']),
                _cell(row['student__class_section__section']), _cell(row['outstanding_amount']),
                _cell(row['due_date']),
            ])
        return headers, rows

    if report_type == 'PAST_DUES_LIST':
        qs = PastDuesService.get_past_dues(bundle)
        headers = [
            'Invoice', 'Student first name', 'Student last name', 'Grade', 'Section',
            'Outstanding', 'Due date', 'Days overdue',
        ]
        rows = []
        for row in qs.values(
            'invoice_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'outstanding_amount', 'due_date', 'days_overdue',
        ).iterator(chunk_size=500):
            overdue = row.get('days_overdue')
            days = overdue.days if overdue and hasattr(overdue, 'days') else 0
            rows.append([
                _cell(row['invoice_number']), _cell(row['student__first_name']),
                _cell(row['student__last_name']), _cell(row['student__class_section__grade']),
                _cell(row['student__class_section__section']), _cell(row['outstanding_amount']),
                _cell(row['due_date']), days,
            ])
        return headers, rows

    if report_type == 'STAFF_ATTENDANCE':
        qs = StaffReportsService.get_staff_attendance(bundle).values(
            'date', 'status', 'staff__employee_id', 'staff__user__first_name',
            'staff__user__last_name', 'staff__branch__name', 'remarks',
        )
        headers = ['Date', 'Status', 'Employee ID', 'First name', 'Last name', 'Branch', 'Remarks']
        rows = []
        for row in qs.iterator(chunk_size=500):
            rows.append([
                _cell(row['date']), _cell(row['status']), _cell(row['staff__employee_id']),
                _cell(row['staff__user__first_name']), _cell(row['staff__user__last_name']),
                _cell(row['staff__branch__name']), _cell(row['remarks']),
            ])
        return headers, rows

    return None
