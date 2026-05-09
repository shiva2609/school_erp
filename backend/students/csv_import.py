"""
Student CSV import (onboarding from another SIS).

What each row can create / update
---------------------------------
- **Student**: demographics, address, emergency contact, previous school, parents (inline fields),
  parent **User** links via ``link_parent_accounts_to_student``.
- **Class**: ``grade`` + ``section`` → ``ClassSection`` for the job’s academic year.
- **Admission number**: New students always receive ``admission_number`` from
  ``Student.generate_admission_number`` (tenant ``admission_no_format`` / branch / year).
  The CSV value is stored in ``legacy_admission_number`` for traceability and duplicate matching.
- **Fees (optional columns)**: If ``total_fee`` / ``total amount`` is present, one **annual**
  ``FeeInvoice`` is created with optional ``fee_paid``, ``concession``, ``fee_due_date``,
  and a **Payment** when ``fee_paid`` > 0.
- **Old-year dues**: ``past_due_amount`` + optional ``past_due_year`` creates a ``FeeCarryForward``
  (not a full historical invoice per line item).

Not imported (would need richer templates / multiple rows per student)
---------------------------------------------------------------------
- Per-component fee structures, multiple invoices per year, transport, discounts by head,
  full payment history lines, document files.
"""
import csv
import io
import re
import datetime
from datetime import datetime as dt
from decimal import Decimal, InvalidOperation
from datetime import date
from openpyxl import load_workbook
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from rest_framework.response import Response

from accounts.permissions import normalize_role
from tenants.models import AcademicYear, Branch
from students.models import ClassSection, Student, GRADE_CHOICES, CsvImportJob
from fees.models import FeeInvoice, Payment, FeeCarryForward, DocumentSequence
from .services import create_student_fees, link_parent_accounts_to_student


def handle_csv_import(request):
    """
    Validates CSV file and creates a background CsvImportJob.
    """
    try:
        user = request.user
        branch_id = request.data.get('branch_id')
        academic_year_id = request.data.get('academic_year_id')
        file_obj = request.FILES.get('file') or request.data.get('file')
        if not file_obj:
            return Response(
                {
                    'success': False,
                    'detail': 'No file was received. If this keeps happening, try another browser or contact support.',
                },
                status=400,
            )

        file_name = (getattr(file_obj, 'name', None) or '').lower()
        looks_csv = file_name.endswith('.csv')
        looks_xlsx = file_name.endswith('.xlsx')
        if not (looks_csv or looks_xlsx):
            try:
                head = file_obj.read(4)
                if hasattr(file_obj, 'seek'):
                    file_obj.seek(0)
                if len(head) >= 2 and head[:2] == b'PK':
                    looks_xlsx = True
            except Exception:
                if hasattr(file_obj, 'seek'):
                    file_obj.seek(0)

        if not (looks_csv or looks_xlsx):
            return Response({'success': False, 'detail': 'Please upload a valid CSV or XLSX file.'}, status=400)

        max_bytes = getattr(settings, 'STUDENT_CSV_IMPORT_MAX_BYTES', 5 * 1024 * 1024)
        if getattr(file_obj, 'size', 0) and file_obj.size > max_bytes:
            return Response(
                {
                    'success': False,
                    'detail': f'Import file too large. Maximum size is {max_bytes // (1024 * 1024)} MB.',
                },
                status=400,
            )

        # Handle 'undefined' and empty strings from FormData
        if branch_id in ['undefined', '']: branch_id = None
        if academic_year_id in ['undefined', '']: academic_year_id = None

        try:
            if normalize_role(user.role) == 'OWNER':
                if not branch_id:
                    return Response({'success': False, 'detail': 'Owner must provide a branch_id.'}, status=400)
                branch = Branch.objects.get(id=branch_id)
                tenant = branch.tenant
            else:
                branch = Branch.objects.get(id=branch_id, tenant=user.tenant) if branch_id else user.branch
                if not branch:
                    return Response({'success': False, 'detail': 'No branch associated with your account.'}, status=400)
                tenant = user.tenant

            if academic_year_id:
                ay = AcademicYear.objects.get(id=academic_year_id, tenant=tenant)
            else:
                ay = AcademicYear.objects.filter(tenant=tenant, is_active=True).first()
                if not ay:
                    return Response({'success': False, 'detail': 'No active academic year found. Please select one.'}, status=400)
        except (Branch.DoesNotExist, AcademicYear.DoesNotExist):
            return Response({'success': False, 'detail': 'Invalid branch or academic year.'}, status=400)

        # Create the background job
        job = CsvImportJob.objects.create(
            tenant=tenant,
            branch=branch,
            academic_year=ay,
            file=file_obj,
            created_by=user,
            status='PENDING'
        )

        # Trigger Celery Task
        from .tasks import process_student_csv_import
        process_student_csv_import.delay(job.id)

        return Response({
            'success': True,
            'message': 'Import started in the background.',
            'job_id': job.id
        })

    except Exception as e:
        import logging
        logging.getLogger(__name__).exception('CSV import request failed')
        return Response({
            'success': False,
            'detail': 'An unexpected server error occurred.',
        }, status=500)


def process_rows(job, rows):
    """Actual logic to process parsed rows asynchronously."""
    if not rows:
        job.status = 'FAILED'
        job.error_log = ['Import file is empty.']
        job.save(update_fields=['status', 'error_log'])
        return

    job.total_rows = len(rows)
    job.status = 'PROCESSING'
    job.save(update_fields=['total_rows', 'status'])

    errors = []
    success_count = 0
    skipped_duplicates = 0
    processed_rows = 0

    tenant = job.tenant
    branch = job.branch
    ay = job.academic_year
    user = job.created_by

    # ── helpers ──────────────────────────────────────────────────────────
    def parse_date(date_str):
        if not date_str:
            return None
        date_str = date_str.strip()
        for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y/%m/%d', '%d.%m.%Y']:
            try:
                return dt.strptime(date_str, fmt).date()
            except ValueError:
                continue
        return None

    def get_val(row, *keys):
        """Flexible column lookup: exact, underscore→space, partial match."""
        for k in keys:
            if k in row and row[k]:
                return row[k]
            k_space = k.replace('_', ' ')
            if k_space in row and row[k_space]:
                return row[k_space]
            for rk in row.keys():
                if k == rk or k_space == rk:
                    continue
                if k in rk and row[rk]:
                    return row[rk]
                if k_space in rk and row[rk]:
                    return row[rk]
        return ''

    def safe_phone(val, max_len=15):
        if not val:
            return None
        cleaned = re.sub(r'[\s\-\(\)]', '', str(val))
        return cleaned[:max_len] if cleaned else None

    def safe_str(val, max_len=None):
        if not val:
            return None
        s = str(val).strip()
        if max_len:
            s = s[:max_len]
        return s or None

    # Chunk processing: batch size of 50
    CHUNK_SIZE = 50
    
    for i in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[i:i + CHUNK_SIZE]
        
        for row_idx_offset, raw_row in enumerate(chunk):
            row_idx = i + row_idx_offset + 2 # +2 for header and 1-based index
            row_label = f"Row {row_idx}"
            
            try:
                with transaction.atomic():
                    row = {}
                    for k, v in raw_row.items():
                        key = k.strip().lower() if isinstance(k, str) and k else 'col'
                        if isinstance(v, list):
                            val = ' '.join(str(x) for x in v if x).strip()
                        elif isinstance(v, str):
                            val = v.strip()
                        else:
                            val = str(v).strip() if v else ''
                        row[key] = val

                    if not any(row.values()):
                        processed_rows += 1
                        continue

                    first_name = get_val(row, 'first name', 'first_name', 'student name', 'name').strip() or 'Unknown'
                    last_name  = get_val(row, 'last name', 'last_name').strip()
                    if not last_name and ' ' in first_name:
                        parts = first_name.rsplit(' ', 1)
                        first_name = parts[0].strip()
                        last_name  = parts[1].strip()

                    row_label = f"Row {row_idx} ({first_name} {last_name})".strip()

                    dob_raw   = get_val(row, 'date of birth', 'date_of_birth', 'dob').strip()
                    gender    = get_val(row, 'gender').strip().upper()
                    grade_str = get_val(row, 'class', 'grade', 'class name').strip()

                    section_raw = get_val(row, 'section').strip()
                    section = section_raw.split()[0] if section_raw else 'A'
                    section = section[:50]

                    csv_admission = get_val(row, 'admission number', 'admission_number', 'admission no', 'old admission', 'legacy admission').strip()

                    if gender not in ('MALE', 'FEMALE', 'OTHER'):
                        gender = 'OTHER'

                    parsed_dob = parse_date(dob_raw) or date(2000, 1, 1)

                    grade = None
                    if grade_str:
                        g_clean = grade_str.upper().strip().replace('GRADE', '').replace('CLASS', '').strip()
                        roman_map = {'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10', 'XI': '11', 'XII': '12'}
                        if g_clean in roman_map: g_clean = roman_map[g_clean]
                        for k, v in GRADE_CHOICES:
                            if g_clean == k or g_clean == v.upper().replace('GRADE ', ''):
                                grade = k
                                break
                        if not grade and grade_str.upper().strip() in dict(GRADE_CHOICES):
                            grade = grade_str.upper().strip()
                        if not grade: grade = grade_str[:50]

                    cs = None
                    if grade:
                        cs, _ = ClassSection.objects.get_or_create(
                            tenant=tenant, branch=branch, academic_year=ay,
                            grade=grade, section=section.upper(),
                        )

                    existing_student = None
                    if csv_admission:
                        existing_student = Student.objects.filter(
                            branch=branch, academic_year=ay,
                        ).filter(
                            Q(admission_number__iexact=csv_admission)
                            | Q(legacy_admission_number__iexact=csv_admission),
                        ).first()
                    if not existing_student and cs:
                        existing_student = Student.objects.filter(
                            branch=branch, academic_year=ay,
                            first_name__iexact=first_name, last_name__iexact=last_name,
                            date_of_birth=parsed_dob, class_section=cs,
                        ).first()

                    is_new_student = False
                    if existing_student:
                        student = existing_student
                        skipped_duplicates += 1
                    else:
                        is_new_student = True
                        platform_admission = Student.generate_admission_number(branch, ay)
                        while Student.objects.filter(
                            branch=branch, academic_year=ay, admission_number=platform_admission,
                        ).exists():
                            platform_admission = Student.generate_admission_number(branch, ay)
                        legacy_stored = (csv_admission or '')[:64]

                        blood_group_raw = row.get('blood group', row.get('blood_group', '')).upper().strip()
                        blood_group = blood_group_raw if blood_group_raw in ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN', ''] else 'UNKNOWN'
                        caste_raw = row.get('caste category', row.get('caste_category', '')).upper().strip()
                        caste_category = caste_raw if caste_raw in ['GEN', 'OBC', 'SC', 'ST', 'EWS', 'OTHER', ''] else None

                        roll_raw = get_val(row, 'roll number', 'roll_number', 'roll no').strip()
                        roll_num = int(roll_raw) if roll_raw.isdigit() else None

                        student = Student.objects.create(
                            tenant=tenant, branch=branch, academic_year=ay, class_section=cs,
                            first_name=first_name, last_name=last_name or '', date_of_birth=parsed_dob,
                            gender=gender, admission_number=platform_admission,
                            legacy_admission_number=legacy_stored,
                            roll_number=roll_num,
                            blood_group=blood_group or 'UNKNOWN', religion=safe_str(row.get('religion'), 100), caste_category=caste_category,
                            aadhar_number=safe_str(row.get('aadhar number', row.get('aadhar_number')), 12), mother_tongue=safe_str(row.get('mother tongue', row.get('mother_tongue')), 50),
                            nationality=safe_str(row.get('nationality'), 50) or 'Indian',
                            father_name=safe_str(get_val(row, 'father name', 'father_name', 'parent name'), 200),
                            father_phone=safe_phone(get_val(row, 'father mobile', 'father_phone', 'parent mobile', 'father mobile')),
                            father_email=safe_str(row.get('father email', row.get('father_email')), 254), father_qualification=safe_str(row.get('father_qualification'), 100),
                            father_occupation=safe_str(row.get('father_occupation'), 100), father_aadhaar=safe_str(row.get('father_aadhaar'), 12),
                            mother_name=safe_str(get_val(row, 'mother name', 'mother_name'), 200),
                            mother_phone=safe_phone(get_val(row, 'mother mobile', 'mother_phone', 'mother mobile')),
                            mother_email=safe_str(row.get('mother email', row.get('mother_email')), 254), mother_qualification=safe_str(row.get('mother_qualification'), 100),
                            mother_occupation=safe_str(row.get('mother_occupation'), 100), mother_aadhaar=safe_str(row.get('mother_aadhaar'), 12),
                            guardian_name=safe_str(get_val(row, 'guardian name', 'guardian_name'), 200),
                            guardian_phone=safe_phone(get_val(row, 'guardian mobile', 'guardian_phone', 'guardian mobile')),
                            guardian_relation=safe_str(row.get('guardian_relation'), 100),
                            address_line1=safe_str(row.get('address', row.get('address_line1')), 255), address_line2=safe_str(row.get('address_line2'), 255),
                            city=safe_str(row.get('city'), 100), district=safe_str(row.get('district'), 100),
                            state=safe_str(row.get('state'), 100), pincode=safe_str(row.get('pincode'), 6),
                            previous_school_name=safe_str(row.get('previous_school_name'), 200), previous_class=safe_str(row.get('previous_class'), 20),
                            previous_school_ay=safe_str(row.get('previous_school_ay'), 20),
                            emergency_contact_name=safe_str(row.get('emergency_contact_name'), 200), emergency_contact_phone=safe_phone(row.get('emergency_contact_phone')),
                            emergency_contact_relation=safe_str(row.get('emergency_contact_relation'), 100),
                            created_by=user, status='ACTIVE',
                        )

                        father_info = {'phone': student.father_phone, 'email': student.father_email, 'name': student.father_name or ''}
                        mother_info = {'phone': student.mother_phone, 'email': student.mother_email, 'name': student.mother_name or ''}
                        link_parent_accounts_to_student(
                            student, father_info, mother_info, tenant, branch,
                            strict_parent_email=False,
                        )

                    total_fee_raw   = get_val(row, 'total_fee', 'total amount (₹)', 'total fee').replace(',', '').replace('"', '').strip()
                    fee_paid_raw    = get_val(row, 'fee_paid', 'amount paid (₹)', 'fee paid').replace(',', '').replace('"', '').strip()
                    concession_raw  = get_val(row, 'concession_amount', 'concession (₹)', 'concession').replace(',', '').replace('"', '').strip()
                    past_due_raw = get_val(row, 'past_due_amount', 'past due', 'old dues', 'arrears').replace(',', '').replace('"', '').strip()
                    past_due_year_raw = get_val(row, 'past_due_year', 'past due year', 'arrears year').strip()
                    fee_due_date_raw = get_val(row, 'fee_due_date', 'due date', 'fee due date').strip()

                    if total_fee_raw:
                        try:
                            total_fee  = Decimal(total_fee_raw)  if total_fee_raw  else Decimal('0')
                            fee_paid   = Decimal(fee_paid_raw)   if fee_paid_raw   else Decimal('0')
                            concession = Decimal(concession_raw) if concession_raw else Decimal('0')
                            past_due   = Decimal(past_due_raw)   if past_due_raw   else Decimal('0')
                        except InvalidOperation:
                            raise ValueError("Fee columns must be valid numbers.")

                        net_amount         = total_fee - concession
                        outstanding_amount = net_amount - fee_paid
                        
                        invoice_status = 'PAID' if outstanding_amount <= 0 else ('PARTIALLY_PAID' if fee_paid > 0 else 'SENT')
                        outstanding_amount = Decimal('0') if outstanding_amount <= 0 else outstanding_amount

                        due_date = parse_date(fee_due_date_raw) or date.today()
                        if invoice_status not in ('PAID', 'CANCELLED', 'WAIVED') and due_date < date.today():
                            invoice_status = 'OVERDUE'

                        invoice_number = DocumentSequence.get_next_sequence(branch, 'INVOICE', f"INV-{ay.start_date.year:04d}")
                        invoice = FeeInvoice.objects.create(
                            tenant=tenant, branch=branch, academic_year=ay, student=student,
                            invoice_number=invoice_number, month="ANNUAL",
                            gross_amount=total_fee, concession_amount=concession, net_amount=net_amount,
                            paid_amount=fee_paid, outstanding_amount=outstanding_amount,
                            due_date=due_date, status=invoice_status, generated_by='MANUAL', created_by=user,
                        )

                        if fee_paid > 0:
                            receipt_number = DocumentSequence.get_next_sequence(branch, 'RECEIPT', f"RCP-{ay.start_date.year:04d}")
                            Payment.objects.create(
                                tenant=tenant, branch=branch, invoice=invoice, student=student,
                                amount=fee_paid, payment_mode='CASH', payment_date=date.today(),
                                status='COMPLETED', collected_by=user, receipt_number=receipt_number,
                            )

                        if past_due > 0:
                            legacy_ay_name = past_due_year_raw or "Legacy-Dues"
                            target_year    = ay.start_date.year - 1
                            legacy_ay, _   = AcademicYear.objects.get_or_create(
                                tenant=tenant, name=legacy_ay_name,
                                defaults={'start_date': datetime.date(target_year, 4, 1), 'end_date': datetime.date(target_year + 1, 3, 31), 'is_active': False, 'status': 'CLOSED'}
                            )
                            FeeCarryForward.objects.create(
                                tenant=tenant, branch=branch, student=student, source_academic_year=legacy_ay, target_academic_year=ay,
                                total_fee_amount=past_due, total_paid_amount=Decimal('0'), carry_forward_amount=past_due, status='PENDING', created_by=user,
                            )
                    else:
                        if is_new_student:
                            create_student_fees(student, None, None, 'Auto-generated on CSV Import', user)

                    success_count += 1
                    
            except Exception as row_error:
                errors.append(f"{row_label}: {str(row_error)}")
            
            processed_rows += 1
            
        # Update job progress after every chunk
        job.processed_rows = processed_rows
        job.success_count = success_count
        job.skipped_duplicates = skipped_duplicates
        job.error_log = errors
        job.save(update_fields=['processed_rows', 'success_count', 'skipped_duplicates', 'error_log'])

    # Finalize job
    job.status = 'COMPLETED'
    job.save(update_fields=['status'])


def process_csv_file(job, decoded_file):
    """Parse CSV content and process rows."""
    io_string = io.StringIO(decoded_file)
    reader = list(csv.DictReader(io_string))

    if not reader:
        job.status = 'FAILED'
        job.error_log = ['CSV file is empty.']
        job.save(update_fields=['status', 'error_log'])
        return

    # Normalize headers
    fieldnames = reader[0].keys() if reader else []
    normalized_headers = [h.strip().lower() if h else f'col_{i}' for i, h in enumerate(fieldnames)]

    # Recreate reader with normalized headers
    io_string.seek(0)
    reader_obj = csv.DictReader(io_string, fieldnames=normalized_headers)
    next(reader_obj)  # skip header row
    rows = list(reader_obj)
    process_rows(job, rows)


def process_xlsx_file(job, raw_bytes):
    """Parse XLSX content and process rows."""
    workbook = load_workbook(filename=io.BytesIO(raw_bytes), read_only=True, data_only=True)
    sheet = workbook.active
    row_iter = sheet.iter_rows(values_only=True)

    try:
        header_row = next(row_iter)
    except StopIteration:
        workbook.close()
        job.status = 'FAILED'
        job.error_log = ['XLSX file is empty.']
        job.save(update_fields=['status', 'error_log'])
        return

    headers = []
    for idx, cell in enumerate(header_row):
        if cell is None:
            headers.append(f'col_{idx}')
        else:
            headers.append(str(cell).strip().lower() or f'col_{idx}')

    rows = []
    for values in row_iter:
        row = {}
        for idx, header in enumerate(headers):
            val = values[idx] if idx < len(values) else None
            row[header] = '' if val is None else str(val).strip()
        rows.append(row)

    workbook.close()
    process_rows(job, rows)
