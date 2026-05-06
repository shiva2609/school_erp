"""
Academic Year Transition Services
=================================
Core business logic for year closing, promotion, carry-forward,
payment allocation, write-offs, and dropout handling.
"""
import logging
from decimal import Decimal
from datetime import date

from django.db import transaction
from django.db.models import Count, Sum, Q
from django.utils import timezone

from accounts.utils import log_audit_action, log_bulk_action

logger = logging.getLogger(__name__)


def aggregate_sar_status_counts_by_academic_year(tenant, academic_year_ids):
    """
    Per academic year, count StudentAcademicRecord rows by status for the tenant.
    Returned keys are str(academic_year_id). Used for year-closing summaries and logs.
    """
    if not tenant or not academic_year_ids:
        return {}
    from students.models import StudentAcademicRecord

    rows = StudentAcademicRecord.objects.filter(
        student__tenant=tenant,
        academic_year_id__in=academic_year_ids,
    ).values('academic_year_id').annotate(
        records_total=Count('id'),
        active=Count('id', filter=Q(status='ACTIVE')),
        promoted=Count('id', filter=Q(status='PROMOTED')),
        detained=Count('id', filter=Q(status='DETAINED')),
        dropout=Count('id', filter=Q(status='DROPOUT')),
        graduated=Count('id', filter=Q(status='GRADUATED')),
        transferred=Count('id', filter=Q(status='TRANSFERRED')),
    )
    out = {str(r['academic_year_id']): r for r in rows}
    z = {
        'records_total': 0,
        'active': 0,
        'promoted': 0,
        'detained': 0,
        'dropout': 0,
        'graduated': 0,
        'transferred': 0,
    }
    for aid in academic_year_ids:
        key = str(aid)
        if key not in out:
            out[key] = {**z, 'academic_year_id': aid}
    return out


# ─── Academic Year Closing ──────────────────────────────────────

def initiate_year_closing(tenant, source_year, target_year, user):
    """
    Phase 1: Validate and begin closing process.
    Sets source year to CLOSING, creates a ClosingLog.
    Returns the closing log with preview statistics.
    """
    from tenants.models import AcademicYear
    from fees.models import FeeInvoice, AcademicYearClosingLog
    from students.models import StudentAcademicRecord

    # Validate state machine
    if source_year.status != 'ACTIVE':
        raise ValueError(f"Cannot close a year in '{source_year.status}' status. Must be ACTIVE.")
    if target_year.status not in ('PLANNING', 'ACTIVE'):
        raise ValueError(f"Target year must be in PLANNING or ACTIVE status, got '{target_year.status}'.")
    if source_year.tenant != target_year.tenant:
        raise ValueError("Source and target years must belong to the same tenant.")

    # Count students and outstanding
    active_records = StudentAcademicRecord.objects.filter(
        academic_year=source_year, status='ACTIVE'
    )
    students_with_dues = FeeInvoice.objects.filter(
        academic_year=source_year, outstanding_amount__gt=0,
        status__in=['SENT', 'PARTIALLY_PAID', 'OVERDUE']
    ).values('student').distinct().count()

    total_outstanding = FeeInvoice.objects.filter(
        academic_year=source_year, outstanding_amount__gt=0,
        status__in=['SENT', 'PARTIALLY_PAID', 'OVERDUE']
    ).aggregate(total=Sum('outstanding_amount'))['total'] or Decimal('0')

    # Set year to CLOSING
    source_year.status = 'CLOSING'
    source_year.save()

    # Create closing log
    closing_log = AcademicYearClosingLog.objects.create(
        tenant=tenant,
        academic_year=source_year,
        target_academic_year=target_year,
        status='IN_PROGRESS',
        total_students=active_records.count(),
        initiated_by=user,
    )

    log_audit_action(
        user=user,
        action='INITIATE_YEAR_CLOSING',
        model_name='AcademicYear',
        record_id=source_year.id,
        details={
            'source_year': source_year.name,
            'target_year': target_year.name,
            'total_students': active_records.count(),
        }
    )

    return {
        'closing_log_id': str(closing_log.id),
        'status': 'IN_PROGRESS',
        'students_to_process': active_records.count(),
        'students_with_dues': students_with_dues,
        'estimated_carry_forward_amount': str(total_outstanding),
    }


@transaction.atomic
def confirm_year_closing(tenant, source_year, closing_log, user):
    """
    Phase 2: Execute the full closing process:
    1. Generate carry-forwards for all outstanding dues
    2. Close the year
    """
    from fees.models import AcademicYearClosingLog

    if closing_log.status != 'IN_PROGRESS':
        raise ValueError(f"Closing log is in '{closing_log.status}' state, expected IN_PROGRESS.")
    if source_year.status != 'CLOSING':
        raise ValueError(f"Year must be in CLOSING status, got '{source_year.status}'.")

    target_year = closing_log.target_academic_year

    try:
        # Generate carry-forwards
        cf_result = generate_carry_forwards(
            tenant=tenant,
            source_year=source_year,
            target_year=target_year,
            user=user,
        )

        # Update closing log with results
        closing_log.carry_forwards_created = cf_result['created']
        closing_log.total_carry_forward_amount = Decimal(cf_result['total_amount'])

        sar_map = aggregate_sar_status_counts_by_academic_year(tenant, [source_year.id])
        sar = sar_map.get(str(source_year.id), {})
        closing_log.promoted_count = sar.get('promoted') or 0
        closing_log.detained_count = sar.get('detained') or 0
        closing_log.dropout_count = sar.get('dropout') or 0
        closing_log.graduated_count = sar.get('graduated') or 0

        closing_log.status = 'COMPLETED'
        closing_log.completed_at = timezone.now()
        closing_log.save()

        # Lock the source year
        source_year.status = 'CLOSED'
        source_year.is_active = False
        source_year.closed_at = timezone.now()
        source_year.closed_by = user
        source_year.save()

        # Activate target year if still in PLANNING
        if target_year.status == 'PLANNING':
            target_year.status = 'ACTIVE'
            target_year.is_active = True
            target_year.save()

        log_audit_action(
            user=user,
            action='CONFIRM_YEAR_CLOSING',
            model_name='AcademicYear',
            record_id=source_year.id,
            details={
                'carry_forwards_created': cf_result['created'],
                'total_carry_forward_amount': cf_result['total_amount'],
            }
        )

        return {
            'status': 'CLOSED',
            'summary': {
                'promoted': closing_log.promoted_count,
                'detained': closing_log.detained_count,
                'dropouts': closing_log.dropout_count,
                'graduated': closing_log.graduated_count,
                'carry_forwards_created': cf_result['created'],
                'total_carry_forward_amount': cf_result['total_amount'],
            }
        }

    except Exception as e:
        closing_log.status = 'FAILED'
        closing_log.error_details = {'error': str(e)}
        closing_log.save()
        # Re-raise so @transaction.atomic rolls back other changes
        raise


@transaction.atomic
def rollback_year_closing(tenant, source_year, user, reason):
    """
    Emergency rollback: reverse a completed year closing.
    Only possible if no payments exist in the target year for affected students.
    """
    from fees.models import AcademicYearClosingLog, FeeCarryForward, Payment, PaymentAllocation
    from students.models import StudentAcademicRecord

    if source_year.status != 'CLOSED':
        raise ValueError("Can only rollback a CLOSED year.")

    closing_log = AcademicYearClosingLog.objects.filter(
        academic_year=source_year, status='COMPLETED'
    ).order_by('-completed_at').first()

    if not closing_log:
        raise ValueError("No completed closing log found for this year.")

    target_year = closing_log.target_academic_year

    # Check for payments against carry-forwards from this closing
    cf_ids = FeeCarryForward.objects.filter(
        source_academic_year=source_year,
        target_academic_year=target_year,
    ).values_list('id', flat=True)

    has_payments = PaymentAllocation.objects.filter(
        carry_forward_id__in=cf_ids
    ).exists()

    if has_payments:
        raise ValueError(
            "Cannot rollback: payments have been recorded against carry-forwards from this year. "
            "Manual intervention required."
        )

    # 1. Delete carry-forwards
    deleted_cf = FeeCarryForward.objects.filter(
        source_academic_year=source_year,
        target_academic_year=target_year,
    ).delete()[0]

    # 2. Delete new-year academic records created by this promotion
    new_records = StudentAcademicRecord.objects.filter(
        academic_year=target_year,
        promoted_from__academic_year=source_year,
    )
    deleted_records = new_records.delete()[0]

    # 3. Revert source-year records from PROMOTED → ACTIVE
    reverted = StudentAcademicRecord.objects.filter(
        academic_year=source_year,
        status='PROMOTED',
    ).update(
        status='ACTIVE',
        status_changed_at=timezone.now(),
        status_changed_by=user,
        status_reason=f'Rollback: {reason}',
    )

    # 4. Revert year status
    source_year.status = 'ACTIVE'
    source_year.is_active = True
    source_year.closed_at = None
    source_year.closed_by = None
    source_year.save()

    # 5. Update closing log
    closing_log.status = 'ROLLED_BACK'
    closing_log.error_details = {
        'rollback_reason': reason,
        'rolled_back_by': str(user.id),
        'rolled_back_at': timezone.now().isoformat(),
        'carry_forwards_deleted': deleted_cf,
        'records_deleted': deleted_records,
        'records_reverted': reverted,
    }
    closing_log.save()

    log_audit_action(
        user=user,
        action='ROLLBACK_YEAR_CLOSING',
        model_name='AcademicYear',
        record_id=source_year.id,
        details={
            'reason': reason,
            'carry_forwards_deleted': deleted_cf,
            'records_reverted': reverted,
        }
    )

    return {
        'records_rolled_back': reverted + deleted_records,
        'carry_forwards_deleted': deleted_cf,
    }


# ─── Fee Carry-Forward ─────────────────────────────────────────

def sync_carry_forwards_from_invoices(
    tenant, source_year, target_year, user, *, student_ids=None, branch=None
):
    """
    Create FeeCarryForward rows from unpaid FeeInvoice totals in source_year
    toward target_year. Idempotent with get_or_create (same keys as year closing).

    student_ids: optional list of student PKs (e.g. just promoted).
    branch: optional Branch instance — only invoices for students in this branch.
    """
    from fees.models import FeeInvoice, FeeCarryForward
    from students.models import Student, StudentAcademicRecord

    if source_year.id == target_year.id:
        return {'created': 0, 'total_amount': str(Decimal('0'))}

    qs = FeeInvoice.objects.filter(
        academic_year=source_year,
        outstanding_amount__gt=0,
        status__in=['SENT', 'PARTIALLY_PAID', 'OVERDUE'],
        student__tenant=tenant,
    )
    if branch is not None:
        qs = qs.filter(student__branch=branch)
    if student_ids is not None:
        qs = qs.filter(student_id__in=student_ids)

    outstanding_invoices = qs.values('student').annotate(
        total_fee=Sum('net_amount'),
        total_paid=Sum('paid_amount'),
        total_outstanding=Sum('outstanding_amount'),
    )

    created = 0
    total_amount = Decimal('0')

    for row in outstanding_invoices:
        student_id = row['student']
        carry_amount = row['total_outstanding']

        if carry_amount <= 0:
            continue

        source_record = StudentAcademicRecord.objects.filter(
            student_id=student_id, academic_year=source_year
        ).first()

        student = Student.objects.get(id=student_id)

        cf, was_created = FeeCarryForward.objects.get_or_create(
            student_id=student_id,
            source_academic_year=source_year,
            target_academic_year=target_year,
            defaults={
                'tenant': tenant,
                'branch': student.branch,
                'source_record': source_record,
                'total_fee_amount': row['total_fee'],
                'total_paid_amount': row['total_paid'],
                'carry_forward_amount': carry_amount,
                'status': 'PENDING',
                'created_by': user,
            }
        )

        if was_created:
            created += 1
            total_amount += carry_amount

    return {
        'created': created,
        'total_amount': str(total_amount),
    }


def generate_carry_forwards(tenant, source_year, target_year, user):
    """
    Generate FeeCarryForward records for all students with outstanding dues.
    Called during year closing.
    """
    return sync_carry_forwards_from_invoices(
        tenant, source_year, target_year, user,
        student_ids=None,
        branch=None,
    )


# ─── Promotion Engine ──────────────────────────────────────────

@transaction.atomic
def execute_promotion(tenant, source_year, target_year, branch, user, overrides=None, scope='BRANCH', class_section_id=None):
    """
    Execute student promotions based on ClassPromotionMap configuration.
    
    Args:
        overrides: list of dicts with {'student_id', 'action', 'target_grade'(optional)}
                   action: 'PROMOTE', 'DETAIN', 'DROPOUT', 'TRANSFER', 'GRADUATE'
    Returns:
        dict with counts and errors
    """
    from students.models import StudentAcademicRecord, ClassSection, ClassPromotionMap

    overrides = overrides or []
    override_map = {o['student_id']: o for o in overrides}

    # Load promotion map
    promotion_maps = {
        pm.from_grade: pm.to_grade
        for pm in ClassPromotionMap.objects.filter(
            branch=branch, academic_year=source_year
        )
    }

    # Get active records for this year
    records_qs = StudentAcademicRecord.objects.filter(
        academic_year=source_year,
        status='ACTIVE',
        student__branch=branch,
    ).select_related('student', 'class_section')

    if scope == 'CLASS' and class_section_id:
        records_qs = records_qs.filter(class_section_id=class_section_id)

    promoted = 0
    detained = 0
    graduated = 0
    dropouts = 0
    errors = []
    promoted_student_ids = []

    for record in records_qs:
        student_id = str(record.student_id)
        override = override_map.get(student_id)
        current_grade = record.class_section.grade if record.class_section else None

        if not current_grade:
            errors.append({'student_id': student_id, 'error': 'No class assigned'})
            continue

        # Determine action
        if override:
            action = override.get('action', 'PROMOTE')
            target_grade = override.get('target_grade')
        else:
            action = 'PROMOTE'
            target_grade = promotion_maps.get(current_grade)

        if action == 'PROMOTE':
            if not target_grade:
                target_grade = promotion_maps.get(current_grade)
            if not target_grade:
                errors.append({
                    'student_id': student_id,
                    'error': f'No promotion mapping for grade {current_grade}'
                })
                continue

            # Find target class section
            target_section = record.class_section.section if record.class_section else 'A'
            target_cs = ClassSection.objects.filter(
                branch=branch, academic_year=target_year,
                grade=target_grade, section=target_section
            ).first()

            if not target_cs:
                # Try any section in target grade
                target_cs = ClassSection.objects.filter(
                    branch=branch, academic_year=target_year,
                    grade=target_grade,
                ).first()

            if not target_cs:
                errors.append({
                    'student_id': student_id,
                    'error': f'No class section for {target_grade} in {target_year.name}'
                })
                continue

            # Create new academic record
            new_record = StudentAcademicRecord.objects.create(
                student=record.student,
                academic_year=target_year,
                class_section=target_cs,
                status='ACTIVE',
                promoted_from=record,
            )

            # Mark old record as PROMOTED
            record.status = 'PROMOTED'
            record.status_changed_at = timezone.now()
            record.status_changed_by = user
            record.status_reason = f'Promoted to {target_grade}'
            record.save()

            # Update student's current year/class (dual-write for backward compat)
            student = record.student
            student.academic_year = target_year
            student.class_section = target_cs
            student.save()

            promoted += 1
            promoted_student_ids.append(record.student_id)

        elif action == 'DETAIN':
            # Same grade next year
            target_cs = ClassSection.objects.filter(
                branch=branch, academic_year=target_year,
                grade=current_grade,
                section=record.class_section.section if record.class_section else 'A',
            ).first()

            if target_cs:
                StudentAcademicRecord.objects.create(
                    student=record.student,
                    academic_year=target_year,
                    class_section=target_cs,
                    status='ACTIVE',
                    promoted_from=record,
                )

            record.status = 'DETAINED'
            record.status_changed_at = timezone.now()
            record.status_changed_by = user
            record.status_reason = override.get('reason', 'Detained')
            record.save()

            student = record.student
            student.status = 'DETAINED'
            student.academic_year = target_year
            if target_cs:
                student.class_section = target_cs
            student.save()

            detained += 1

        elif action == 'DROPOUT':
            record.status = 'DROPOUT'
            record.status_changed_at = timezone.now()
            record.status_changed_by = user
            record.status_reason = override.get('reason', 'Dropped out')
            record.save()

            record.student.status = 'DROPOUT'
            record.student.save()

            dropouts += 1

        elif action == 'GRADUATE':
            record.status = 'GRADUATED'
            record.status_changed_at = timezone.now()
            record.status_changed_by = user
            record.save()

            record.student.status = 'GRADUATED'
            record.student.save()

            graduated += 1

        elif action == 'TRANSFER':
            record.status = 'TRANSFERRED'
            record.status_changed_at = timezone.now()
            record.status_changed_by = user
            record.status_reason = override.get('reason', 'Transferred')
            record.save()

            record.student.status = 'TRANSFERRED'
            record.student.leaving_date = timezone.now().date()
            record.student.leaving_reason = override.get('reason', 'Transferred')
            record.student.save()

    if promoted_student_ids:
        sync_carry_forwards_from_invoices(
            tenant, source_year, target_year, user,
            student_ids=promoted_student_ids,
            branch=branch,
        )

    log_bulk_action(
        user=user,
        action_type='PROMOTION',
        record_count=promoted + detained + graduated + dropouts,
        details={
            'source_year': source_year.name,
            'target_year': target_year.name,
            'promoted': promoted,
            'detained': detained,
            'graduated': graduated,
            'dropouts': dropouts,
        },
        tenant=tenant,
    )

    return {
        'promoted': promoted,
        'detained': detained,
        'graduated': graduated,
        'dropouts': dropouts,
        'errors': errors,
    }


def preview_promotion(tenant, source_year, target_year, branch, scope='BRANCH', class_section_id=None):
    """
    Dry-run preview of what promotion would do.
    Returns list of students with their projected actions.
    """
    from students.models import StudentAcademicRecord, ClassPromotionMap
    from fees.models import FeeInvoice

    promotion_maps = {
        pm.from_grade: pm.to_grade
        for pm in ClassPromotionMap.objects.filter(
            branch=branch, academic_year=source_year
        )
    }

    records_qs = StudentAcademicRecord.objects.filter(
        academic_year=source_year,
        status='ACTIVE',
        student__branch=branch,
    ).select_related('student', 'class_section')

    if scope == 'CLASS' and class_section_id:
        records_qs = records_qs.filter(class_section_id=class_section_id)

    promotions = []
    unmapped_classes = set()
    students_with_dues = 0
    total_outstanding = Decimal('0')

    for record in records_qs:
        current_grade = record.class_section.grade if record.class_section else None
        target_grade = promotion_maps.get(current_grade) if current_grade else None

        if current_grade and not target_grade:
            unmapped_classes.add(current_grade)

        # Check outstanding
        outstanding = FeeInvoice.objects.filter(
            student=record.student,
            academic_year=source_year,
            outstanding_amount__gt=0,
        ).aggregate(total=Sum('outstanding_amount'))['total'] or Decimal('0')

        if outstanding > 0:
            students_with_dues += 1
            total_outstanding += outstanding

        promotions.append({
            'student_id': str(record.student_id),
            'student_name': f"{record.student.first_name} {record.student.last_name}",
            'admission_number': record.student.admission_number,
            'current_class': record.class_section.display_name if record.class_section else 'Unassigned',
            'current_grade': current_grade,
            'target_grade': target_grade,
            'target_class': f"{target_grade}" if target_grade else 'UNMAPPED',
            'outstanding_dues': str(outstanding),
            'action': 'PROMOTE' if target_grade else 'NEEDS_MAPPING',
        })

    return {
        'promotions': promotions,
        'unmapped_classes': list(unmapped_classes),
        'students_with_dues': students_with_dues,
        'total_outstanding': str(total_outstanding),
        'total_students': len(promotions),
    }


# ─── Payment Allocation ────────────────────────────────────────

@transaction.atomic
def allocate_payment(user, student, total_amount, payment_mode, payment_date,
                     allocations=None, reference_number=None, auto_mode=True):
    """
    Create a payment and allocate it across carry-forwards and invoices.
    
    If auto_mode=True: allocate oldest debts first (carry-forwards, then invoices).
    If allocations provided: use manual allocation targets.
    """
    from fees.models import (
        Payment, FeeInvoice, FeeCarryForward, PaymentAllocation,
        DocumentSequence,
    )
    from expenses.models import TransactionLog

    if total_amount <= 0:
        raise ValueError("Payment amount must be positive.")

    # Generate receipt
    receipt_number = DocumentSequence.get_next_sequence(
        branch=student.branch,
        document_type='RECEIPT',
        prefix=f"RCP-{student.branch.branch_code}-{payment_date.strftime('%Y%m')}"
    )

    # Create the payment record (not yet linked to a specific invoice)
    # We link to the first invoice for backward compat
    first_invoice = FeeInvoice.objects.filter(
        student=student, outstanding_amount__gt=0,
        status__in=['SENT', 'PARTIALLY_PAID', 'OVERDUE']
    ).order_by('due_date').first()

    payment = Payment.objects.create(
        tenant=student.tenant,
        invoice=first_invoice,  # backward compat FK
        student=student,
        branch=student.branch,
        amount=total_amount,
        payment_mode=payment_mode,
        payment_date=payment_date,
        reference_number=reference_number,
        status='COMPLETED',
        collected_by=user,
        receipt_number=receipt_number,
    )

    remaining = total_amount
    allocation_records = []

    if allocations and not auto_mode:
        # Manual allocation mode
        for alloc in allocations:
            if remaining <= 0:
                break
            alloc_amount = min(Decimal(str(alloc['amount'])), remaining)

            if alloc['target_type'] == 'CARRY_FORWARD':
                cf = FeeCarryForward.objects.select_for_update().get(id=alloc['target_id'])
                apply_amount = min(alloc_amount, cf.remaining_amount)
                cf.paid_amount += apply_amount
                if cf.remaining_amount <= 0:
                    cf.status = 'PAID'
                else:
                    cf.status = 'PARTIALLY_PAID'
                cf.save()

                allocation_records.append(PaymentAllocation(
                    payment=payment,
                    carry_forward=cf,
                    allocated_amount=apply_amount,
                    allocation_type='PREVIOUS_YEAR_DUES',
                ))
                remaining -= apply_amount

            elif alloc['target_type'] == 'INVOICE':
                inv = FeeInvoice.objects.select_for_update().get(id=alloc['target_id'])
                apply_amount = min(alloc_amount, inv.outstanding_amount)
                inv.paid_amount += apply_amount
                inv.outstanding_amount = max(inv.net_amount - inv.paid_amount, Decimal('0'))
                inv.status = 'PAID' if inv.outstanding_amount <= 0 else 'PARTIALLY_PAID'
                inv.save()

                allocation_records.append(PaymentAllocation(
                    payment=payment,
                    invoice=inv,
                    allocated_amount=apply_amount,
                    allocation_type='CURRENT_YEAR',
                ))
                remaining -= apply_amount

    else:
        # Auto mode: oldest carry-forwards first, then oldest invoices
        # 1. Apply to carry-forwards
        carry_forwards = FeeCarryForward.objects.filter(
            student=student,
            status__in=['PENDING', 'PARTIALLY_PAID'],
        ).select_for_update().order_by('source_academic_year__start_date')

        for cf in carry_forwards:
            if remaining <= 0:
                break
            apply_amount = min(remaining, cf.remaining_amount)
            if apply_amount <= 0:
                continue

            cf.paid_amount += apply_amount
            if cf.remaining_amount <= 0:
                cf.status = 'PAID'
            else:
                cf.status = 'PARTIALLY_PAID'
            cf.save()

            allocation_records.append(PaymentAllocation(
                payment=payment,
                carry_forward=cf,
                allocated_amount=apply_amount,
                allocation_type='PREVIOUS_YEAR_DUES',
            ))
            remaining -= apply_amount

        # 2. Apply to current invoices (oldest due_date first)
        invoices = FeeInvoice.objects.filter(
            student=student,
            outstanding_amount__gt=0,
            status__in=['SENT', 'PARTIALLY_PAID', 'OVERDUE'],
        ).select_for_update().order_by('due_date')

        for inv in invoices:
            if remaining <= 0:
                break
            apply_amount = min(remaining, inv.outstanding_amount)
            if apply_amount <= 0:
                continue

            inv.paid_amount += apply_amount
            inv.outstanding_amount = max(inv.net_amount - inv.paid_amount, Decimal('0'))
            inv.status = 'PAID' if inv.outstanding_amount <= 0 else 'PARTIALLY_PAID'
            inv.save()

            allocation_records.append(PaymentAllocation(
                payment=payment,
                invoice=inv,
                allocated_amount=apply_amount,
                allocation_type='CURRENT_YEAR',
            ))
            remaining -= apply_amount

    # Bulk create allocations
    PaymentAllocation.objects.bulk_create(allocation_records)

    # Create ledger entry
    TransactionLog.objects.create(
        tenant=student.tenant,
        branch=student.branch,
        transaction_type='INCOME',
        category='Fee Payment',
        reference_model='Payment',
        reference_id=payment.id,
        amount=total_amount,
        description=f"Payment {receipt_number} for {student.admission_number}",
        transaction_date=payment_date,
    )

    log_audit_action(
        user=user,
        action='CREATE_ALLOCATED_PAYMENT',
        model_name='Payment',
        record_id=payment.id,
        details={
            'amount': float(total_amount),
            'receipt_number': receipt_number,
            'allocations': [
                {
                    'type': a.allocation_type,
                    'amount': float(a.allocated_amount),
                    'target': str(a.invoice_id or a.carry_forward_id),
                }
                for a in allocation_records
            ]
        }
    )

    return {
        'payment_id': str(payment.id),
        'receipt_number': receipt_number,
        'total_amount': str(total_amount),
        'allocated': str(total_amount - remaining),
        'unallocated': str(remaining),
        'allocations': [
            {
                'type': a.allocation_type,
                'amount': str(a.allocated_amount),
                'target_id': str(a.invoice_id or a.carry_forward_id),
            }
            for a in allocation_records
        ]
    }


# ─── Write-Off Execution ───────────────────────────────────────

@transaction.atomic
def execute_write_off(write_off, user):
    """
    Execute an approved write-off: update the target invoice/CF and log.
    """
    from fees.models import FeeWriteOff
    from expenses.models import TransactionLog

    if write_off.status != 'APPROVED':
        raise ValueError(f"Write-off must be APPROVED to execute, got '{write_off.status}'.")

    if write_off.carry_forward:
        cf = write_off.carry_forward
        cf.written_off_amount += write_off.amount
        if cf.remaining_amount <= 0:
            cf.status = 'WRITTEN_OFF'
        cf.save()

    elif write_off.invoice:
        inv = write_off.invoice
        inv.outstanding_amount = max(inv.outstanding_amount - write_off.amount, Decimal('0'))
        if inv.outstanding_amount <= 0:
            inv.status = 'WAIVED'
        inv.save()

    write_off.status = 'EXECUTED'
    write_off.executed_at = timezone.now()
    write_off.save()

    # Create ledger entry for financial reporting
    TransactionLog.objects.create(
        tenant=write_off.tenant,
        branch=write_off.branch,
        transaction_type='EXPENSE',
        category='Fee Write-Off',
        reference_model='FeeWriteOff',
        reference_id=write_off.id,
        amount=write_off.amount,
        description=f"Write-off for {write_off.student.admission_number}: {write_off.reason[:100]}",
        transaction_date=timezone.now().date(),
    )

    log_audit_action(
        user=user,
        action='EXECUTE_WRITE_OFF',
        model_name='FeeWriteOff',
        record_id=write_off.id,
        details={
            'student': str(write_off.student_id),
            'amount': float(write_off.amount),
            'reason': write_off.reason,
        }
    )

    return {'status': 'EXECUTED', 'amount': str(write_off.amount)}


# ─── Dropout Handling ───────────────────────────────────────────

@transaction.atomic
def handle_dropout(student, user, reason, effective_date=None, stop_future_fees=True):
    """
    Mark student as dropout:
    1. Update academic record
    2. Cancel future unpaid invoices
    3. Preserve outstanding dues
    """
    from students.models import StudentAcademicRecord
    from fees.models import FeeInvoice

    effective_date = effective_date or timezone.now().date()

    # Update current academic record
    current_record = StudentAcademicRecord.objects.filter(
        student=student, status='ACTIVE'
    ).order_by('-academic_year__start_date').first()

    if current_record:
        current_record.status = 'DROPOUT'
        current_record.status_changed_at = timezone.now()
        current_record.status_changed_by = user
        current_record.status_reason = reason
        current_record.save()

    # Update student status
    student.status = 'DROPOUT'
    student.leaving_date = effective_date
    student.leaving_reason = reason
    student.save()

    cancelled_count = 0
    outstanding_amount = Decimal('0')

    if stop_future_fees:
        # Cancel future unpaid invoices (due_date after effective_date)
        future_invoices = FeeInvoice.objects.filter(
            student=student,
            due_date__gt=effective_date,
            status__in=['DRAFT', 'SENT'],
            paid_amount=0,
        )
        cancelled_count = future_invoices.update(
            status='CANCELLED',
            cancellation_reason=f'Student dropout: {reason}'
        )

    # Calculate remaining outstanding
    outstanding_amount = FeeInvoice.objects.filter(
        student=student,
        outstanding_amount__gt=0,
        status__in=['SENT', 'PARTIALLY_PAID', 'OVERDUE'],
    ).aggregate(total=Sum('outstanding_amount'))['total'] or Decimal('0')

    log_audit_action(
        user=user,
        action='STUDENT_DROPOUT',
        model_name='Student',
        record_id=student.id,
        details={
            'reason': reason,
            'effective_date': str(effective_date),
            'invoices_cancelled': cancelled_count,
            'outstanding_dues': float(outstanding_amount),
        }
    )

    return {
        'student_id': str(student.id),
        'status': 'DROPOUT',
        'outstanding_dues': str(outstanding_amount),
        'pending_invoices_cancelled': cancelled_count,
    }


# ─── Fee Structure Finalization ─────────────────────────────────

@transaction.atomic
def finalize_fee_structure(structure, user):
    """
    Lock a fee structure so its amounts cannot be changed.
    Generates StudentFeeItem records for all students in the grade.
    """
    from fees.models import StudentFeeItem
    from students.models import Student

    if structure.is_finalized:
        raise ValueError("Fee structure is already finalized.")

    if not structure.items.exists():
        raise ValueError("Cannot finalize a fee structure with no items.")

    structure.is_finalized = True
    structure.finalized_at = timezone.now()
    structure.finalized_by = user
    structure.save()

    # Generate StudentFeeItem for all active students in this grade/year
    students = Student.objects.filter(
        branch=structure.branch,
        academic_year=structure.academic_year,
        class_section__grade=structure.grade,
        status='ACTIVE',
    )

    created_count = 0
    for student in students:
        for item in structure.items.all():
            _, was_created = StudentFeeItem.objects.get_or_create(
                student=student,
                academic_year=structure.academic_year,
                category=item.category,
                defaults={'amount': item.amount, 'is_locked': True}
            )
            if was_created:
                created_count += 1

    log_audit_action(
        user=user,
        action='FINALIZE_FEE_STRUCTURE',
        model_name='FeeStructure',
        record_id=structure.id,
        details={
            'grade': structure.grade,
            'student_fee_items_created': created_count,
        }
    )

    return {
        'structure_id': str(structure.id),
        'is_finalized': True,
        'finalized_at': structure.finalized_at.isoformat(),
        'student_fee_items_created': created_count,
    }
