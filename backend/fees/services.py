from decimal import Decimal
from datetime import date
from django.db import transaction
from django.db.models import Sum
from .models import FeeInvoice, FeeInvoiceItem, FeeStructure, FeeStructureItem, Payment, StudentFeeItem
from students.models import Student
from accounts.utils import log_audit_action, log_bulk_action
import logging

logger = logging.getLogger(__name__)


def generate_monthly_invoices(tenant, branch, academic_year_id, month, target='BRANCH', class_section_id=None, student_id=None, user=None):
    """
    Service to generate invoices for a specific target.
    Logic extracted from FeeInvoiceViewSet for reuse and testability.
    """
    # Get target students (always tenant-scoped for STUDENT/CLASS targets)
    if target == 'STUDENT':
        students = Student.objects.filter(id=student_id, status='ACTIVE', tenant=tenant)
    elif target == 'CLASS':
        students = Student.objects.filter(
            class_section_id=class_section_id,
            status='ACTIVE',
            tenant=tenant,
        )
    else:  # BRANCH
        students = Student.objects.filter(
            branch=branch, academic_year_id=academic_year_id, status='ACTIVE'
        )

    generated = 0
    skipped = 0
    errors = []

    from tenants.models import AcademicYear
    ay = AcademicYear.objects.get(id=academic_year_id)
    target_year, target_month = map(int, month.split('-'))
    month_index = (target_year - ay.start_date.year) * 12 + target_month - ay.start_date.month

    with transaction.atomic():
        for student in students:
            # Skip if academic invoice already exists for this student/month
            has_academic = FeeInvoice.objects.filter(student=student, month=month).exclude(invoice_number__startswith='TRN-').exists()
            has_transport = FeeInvoice.objects.filter(student=student, month=month, invoice_number__startswith='TRN-').exists()

            from transport.models import StudentTransport
            active_transport = StudentTransport.objects.filter(student=student, is_active=True).first()

            if has_academic and (has_transport or not active_transport):
                skipped += 1
                continue

            # Lookup fee structure for student's grade
            grade = student.class_section.grade if student.class_section else None
            if not grade:
                errors.append({'student_id': str(student.id), 'error': 'No class assigned'})
                continue

            structure = FeeStructure.objects.filter(
                branch=student.branch, academic_year_id=academic_year_id, grade=grade, is_active=True
            ).first()
            if not structure:
                errors.append({'student_id': str(student.id), 'error': 'No fee structure found'})
                continue

            from .models import DocumentSequence

            gross = Decimal('0.00')
            invoice_items = []
            
            # Use structure items to build the invoice
            for item in structure.items.filter(is_optional=False):
                include_item = False
                if item.frequency == 'MONTHLY' or item.frequency == 'ONE_TIME':
                    include_item = True
                elif item.frequency == 'QUARTERLY' and month_index % 3 == 0:
                    include_item = True
                elif item.frequency == 'HALF_YEARLY' and month_index % 6 == 0:
                    include_item = True
                elif item.frequency == 'ANNUALLY' and month_index == 0:
                    include_item = True
                    
                if include_item:
                    gross += item.amount
                    invoice_items.append(FeeInvoiceItem(
                        category=item.category,
                        original_amount=item.amount,
                        concession=Decimal('0.00'),
                        final_amount=item.amount,
                    ))

            # Apply Concessions (Simplify for now: hard-code 0)
            discount = Decimal('0.00')
            academic_net = gross - discount

            created_any = False
            if invoice_items and not has_academic:
                invoice_number = DocumentSequence.get_next_sequence(
                    branch=student.branch, 
                    document_type='INVOICE', 
                    prefix=f"INV-{student.branch.branch_code}-{month}"
                )
                invoice = FeeInvoice.objects.create(
                    tenant=student.tenant,
                    branch=student.branch,
                    academic_year_id=academic_year_id,
                    student=student,
                    month=month,
                    invoice_number=invoice_number,
                    due_date=date.today().replace(day=10),
                    gross_amount=gross,
                    concession_amount=discount,
                    net_amount=academic_net,
                    outstanding_amount=academic_net,
                    status='SENT',
                    generated_by='AUTO'
                )

                for item in invoice_items:
                    item.invoice = invoice
                FeeInvoiceItem.objects.bulk_create(invoice_items)
                created_any = True

            # Also generate transport invoice if needed
            if active_transport and not has_transport:
                _create_transport_invoice(student, academic_year_id, month, active_transport)
                created_any = True

            if created_any:
                generated += 1

        if generated > 0 and user:
            log_bulk_action(
                user=user,
                action_type='INVOICE_GENERATION',
                record_count=generated,
                details={'month': month, 'target': target},
                tenant=tenant,
            )

    return {
        'generated': generated,
        'skipped': skipped,
        'errors': errors
    }


def generate_transport_invoice_only(student_id, academic_year_id, month):
    """
    Generate ONLY a transport invoice for a specific student.
    Called from the Student Profile "Generate Invoice" button.
    Does NOT create academic invoices.
    """
    student = Student.objects.filter(id=student_id, status='ACTIVE').first()
    if not student:
        return {'error': 'Student not found or not active.'}

    from transport.models import StudentTransport
    active_transport = StudentTransport.objects.filter(student=student, is_active=True).first()
    if not active_transport:
        return {'error': 'Student is not enrolled in transport.'}

    # Check if transport invoice already exists for this month
    has_transport = FeeInvoice.objects.filter(
        student=student, month=month, invoice_number__startswith='TRN-'
    ).exists()
    if has_transport:
        return {'error': f'Transport invoice already exists for {month}.'}

    with transaction.atomic():
        _create_transport_invoice(student, academic_year_id, month, active_transport)

    return {'success': True}


def _create_transport_invoice(student, academic_year_id, month, active_transport):
    """Internal helper: creates a single transport invoice + line item."""
    from .models import FeeCategory as FC, DocumentSequence

    transport_cat, _ = FC.objects.get_or_create(
        branch=student.branch,
        code='TRANSPORT',
        defaults={
            'tenant': student.tenant,
            'name': 'Transport Fee',
            'description': 'Monthly school transport fee',
            'is_active': True,
            'order': 99,
        }
    )
    transport_amount = active_transport.monthly_fee
    transport_invoice_number = DocumentSequence.get_next_sequence(
        branch=student.branch,
        document_type='INVOICE',
        prefix=f"TRN-{student.branch.branch_code}-{month}"
    )

    transport_invoice = FeeInvoice.objects.create(
        tenant=student.tenant,
        branch=student.branch,
        academic_year_id=academic_year_id,
        student=student,
        month=month,
        invoice_number=transport_invoice_number,
        due_date=date.today().replace(day=10),
        gross_amount=transport_amount,
        concession_amount=Decimal('0.00'),
        net_amount=transport_amount,
        outstanding_amount=transport_amount,
        status='SENT',
        generated_by='AUTO'
    )

    FeeInvoiceItem.objects.create(
        invoice=transport_invoice,
        category=transport_cat,
        original_amount=transport_amount,
        concession=Decimal('0.00'),
        final_amount=transport_amount,
        description=f"Transport: {active_transport.pickup_point} ({active_transport.distance_km} km)"
    )
    return transport_invoice


def _create_admission_fee_invoice(student, amount: Decimal, user, payment_date):
    """One-time ADM-* invoice; not part of annual / monthly academic fee structure."""
    from .models import DocumentSequence, FeeCategory

    amount = Decimal(str(amount))
    cat, _ = FeeCategory.objects.get_or_create(
        branch=student.branch,
        code='ADMISSION',
        defaults={
            'tenant': student.tenant,
            'name': 'Admission Fee',
            'description': 'One-time admission / application fee',
            'is_active': True,
            'order': 0,
        },
    )
    inv_no = DocumentSequence.get_next_sequence(
        student.branch,
        'INVOICE',
        f'ADM-{student.branch.branch_code}-{student.academic_year.start_date.year}',
    )
    invoice = FeeInvoice.objects.create(
        tenant=student.tenant,
        branch=student.branch,
        academic_year=student.academic_year,
        student=student,
        month=None,
        invoice_number=inv_no,
        due_date=payment_date,
        gross_amount=amount,
        concession_amount=Decimal('0.00'),
        net_amount=amount,
        outstanding_amount=amount,
        paid_amount=Decimal('0.00'),
        status='SENT',
        generated_by='MANUAL',
        created_by=user,
    )
    FeeInvoiceItem.objects.create(
        invoice=invoice,
        category=cat,
        original_amount=amount,
        concession=Decimal('0.00'),
        final_amount=amount,
        description='Admission fee',
    )
    return invoice


def _academic_invoice_for_initial_tuition(student):
    """Outstanding academic fee invoice — excludes admission (ADM-) and transport (TRN-)."""
    qs = (
        FeeInvoice.objects.filter(student=student, outstanding_amount__gt=0)
        .exclude(invoice_number__startswith='ADM-')
        .exclude(invoice_number__startswith='TRN-')
        .select_for_update()
        .order_by('created_at')
    )
    annual = qs.filter(month='ANNUAL').first()
    return annual or qs.first()


def _ensure_academic_invoice_for_initial_tuition(student, user):
    """
    Ensure there is an annual academic invoice to receive initial tuition payment.

    This is important for discounted admissions that are pending approval; front-desk
    should still be able to collect payment immediately.
    """
    existing = _academic_invoice_for_initial_tuition(student)
    if existing:
        return existing

    fee_items = StudentFeeItem.objects.filter(student=student, academic_year=student.academic_year)
    net = fee_items.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    if net <= 0:
        return None

    seq = FeeInvoice.objects.filter(branch=student.branch).count() + 1
    invoice = FeeInvoice.objects.create(
        tenant=student.tenant,
        invoice_number=f"INV-{student.academic_year.start_date.year}-{seq:04d}",
        student=student,
        branch=student.branch,
        academic_year=student.academic_year,
        month='ANNUAL',
        gross_amount=net,
        concession_amount=Decimal('0.00'),
        net_amount=net,
        outstanding_amount=net,
        due_date=date.today(),
        status='SENT',
        generated_by='AUTO',
        created_by=user,
    )
    FeeInvoiceItem.objects.bulk_create([
        FeeInvoiceItem(
            invoice=invoice,
            category=it.category,
            original_amount=it.amount,
            concession=Decimal('0.00'),
            final_amount=it.amount,
        )
        for it in fee_items
    ])
    return invoice


def _apply_payment_to_invoice(user, student, invoice, amount: Decimal, payment_mode, payment_date, reference_number, description: str):
    from .models import DocumentSequence
    from expenses.models import TransactionLog

    amount = Decimal(str(amount))
    if amount <= 0:
        return None
    amount_to_apply = min(amount, invoice.outstanding_amount)
    if amount_to_apply <= 0:
        return None

    receipt_number = DocumentSequence.get_next_sequence(
        student.branch,
        'RECEIPT',
        prefix=f"RCP-{payment_date.strftime('%Y%m')}",
    )
    payment = Payment.objects.create(
        tenant=student.tenant,
        invoice=invoice,
        student=student,
        branch=student.branch,
        amount=amount_to_apply,
        payment_mode=payment_mode,
        payment_date=payment_date,
        reference_number=reference_number or '',
        status='COMPLETED',
        collected_by=user,
        receipt_number=receipt_number,
    )
    invoice.paid_amount += amount_to_apply
    invoice.outstanding_amount = max(invoice.net_amount - invoice.paid_amount, Decimal('0.00'))
    if invoice.outstanding_amount <= 0:
        invoice.status = 'PAID'
        invoice.outstanding_amount = Decimal('0.00')
    else:
        invoice.status = 'PARTIALLY_PAID'
    invoice.save()

    TransactionLog.objects.create(
        tenant=student.tenant,
        branch=student.branch,
        transaction_type='INCOME',
        category='Admission Fee' if invoice.invoice_number.startswith('ADM-') else 'Fee Payment',
        reference_model='Payment',
        reference_id=payment.id,
        amount=amount_to_apply,
        description=description,
        transaction_date=payment_date,
    )
    payment.receipt_url = f"/api/templates/generate/receipt/{payment.id}/"
    payment.save(update_fields=['receipt_url'])

    log_audit_action(
        user=user,
        action='CREATE_INITIAL_PAYMENT',
        model_name='Payment',
        record_id=payment.id,
        details={
            'invoice_number': invoice.invoice_number,
            'amount': float(amount_to_apply),
            'receipt_number': receipt_number,
        },
        tenant=student.tenant,
    )
    return payment


def process_initial_payment(user, student, admission_fee, tuition_payment, payment_mode, payment_date, reference_number=None):
    """
    Enrollment payments: admission goes only to ADM-* invoice; tuition only to academic invoices.
    If an ADM-* invoice already exists and admission_fee is larger than its outstanding balance,
    the excess is applied to the academic (e.g. annual) invoice together with tuition_payment.
    """
    from rest_framework.exceptions import ValidationError

    admission_fee = Decimal(str(admission_fee or 0))
    tuition_payment = Decimal(str(tuition_payment or 0))
    total_paid = admission_fee + tuition_payment
    if total_paid <= 0:
        return {'status': 'skipped', 'message': 'Amount is zero.', 'total_paid': 0.0, 'receipt_codes': []}

    receipt_codes = []
    payment_ids = []
    total_applied = Decimal('0.00')
    tuition_effective = tuition_payment

    with transaction.atomic():
        student = Student.objects.select_for_update().get(pk=student.pk)

        if admission_fee > 0:
            if FeeInvoice.objects.filter(
                student=student,
                invoice_number__startswith='ADM-',
                status='PAID',
            ).exists():
                raise ValidationError('Admission fee has already been paid for this student.')

            existing_adm = (
                FeeInvoice.objects.filter(student=student, invoice_number__startswith='ADM-')
                .exclude(status__in=['CANCELLED', 'WAIVED'])
                .select_for_update()
                .first()
            )
            if existing_adm:
                adm_inv = existing_adm
                if adm_inv.outstanding_amount <= 0:
                    raise ValidationError('Admission fee invoice is already settled.')
                pay_adm = min(admission_fee, adm_inv.outstanding_amount)
                tuition_effective += admission_fee - pay_adm
            else:
                adm_inv = _create_admission_fee_invoice(
                    student, admission_fee, user, payment_date
                )
                pay_adm = admission_fee

            p = _apply_payment_to_invoice(
                user,
                student,
                adm_inv,
                pay_adm,
                payment_mode,
                payment_date,
                reference_number,
                f'Admission fee payment for {adm_inv.invoice_number}',
            )
            if p:
                total_applied += p.amount
                receipt_codes.append(p.receipt_number)
                payment_ids.append(str(p.id))

        if tuition_effective > 0:
            acad_inv = _ensure_academic_invoice_for_initial_tuition(student, user)
            if not acad_inv:
                raise ValidationError(
                    'No outstanding academic fee invoice found. '
                    f'Cannot apply ₹{tuition_effective} toward tuition'
                    + (' (includes excess from admission payment).' if tuition_effective != tuition_payment else '.')
                )
            if tuition_effective > acad_inv.outstanding_amount:
                raise ValidationError(
                    f'Amount toward academic fees (₹{tuition_effective}) exceeds outstanding amount '
                    f'(₹{acad_inv.outstanding_amount}) on {acad_inv.invoice_number}.'
                )
            p2 = _apply_payment_to_invoice(
                user,
                student,
                acad_inv,
                tuition_effective,
                payment_mode,
                payment_date,
                reference_number,
                f'Initial tuition payment for {acad_inv.invoice_number}',
            )
            if p2:
                total_applied += p2.amount
                receipt_codes.append(p2.receipt_number)
                payment_ids.append(str(p2.id))

    return {
        'status': 'success',
        'total_paid': float(total_applied),
        'receipt_codes': receipt_codes,
        'payment_ids': payment_ids,
    }
