import logging
from decimal import Decimal
from django.db.models import Sum, Q, F
from django.db.models.functions import Coalesce
from datetime import date
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)


def student_needs_promoted_year_fee_setup(student) -> bool:
    """
    True when the student has an academic record for the current year that came from
    promotion/detention (promoted_from set) OR they were imported via CSV directly into the active year,
    but no annual academic fee invoice/items yet.
    """
    from students.models import StudentAcademicRecord
    from fees.models import FeeInvoice
    from tenants.models import AcademicYear

    if not student.academic_year_id or not student.class_section_id:
        return False
        
    promoted = StudentAcademicRecord.objects.filter(
        student=student,
        academic_year_id=student.academic_year_id,
        promoted_from__isnull=False,
    ).exists()
    
    is_csv_eligible = False
    if not promoted and bool((student.legacy_admission_number or '').strip()):
        # Try to use already loaded relation to avoid extra query
        if getattr(student, 'academic_year', None) and getattr(student.academic_year, 'is_active', False):
            is_csv_eligible = True
        else:
            is_csv_eligible = AcademicYear.objects.filter(id=student.academic_year_id, is_active=True).exists()

    if not (promoted or is_csv_eligible):
        return False

    has_auto_annual = FeeInvoice.objects.filter(
        student=student,
        academic_year_id=student.academic_year_id,
        month='ANNUAL',
        generated_by='AUTO'
    ).exclude(invoice_number__startswith='ADM-').exclude(invoice_number__startswith='TRN-').exists()
    if has_auto_annual:
        return False
        
    if is_csv_eligible:
        return True
        
    items_total = student.fee_items.filter(academic_year_id=student.academic_year_id).aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')
    if items_total > 0:
        return False
        
    return True


def create_student_fees(student, offered_total, standard_total_input, reason, requested_by):
    """Shared logic for creating fees and triggering approvals"""
    from fees.models import FeeStructure, FeeStructureItem, StudentFeeItem, FeeApprovalRequest, FeeInvoice, FeeInvoiceItem
    from fees.approval_routing import compute_fee_approval_routing
    from .models import Student

    branch = student.branch
    ay = student.academic_year
    class_section = student.class_section
    tenant = student.tenant

    if not class_section:
        raise ValidationError('Class section is required for setting up fees.')

    if not ay:
        raise ValidationError('Academic year is required for setting up fees.')

    structure = FeeStructure.objects.filter(
        branch=branch, academic_year=ay, grade=class_section.grade, is_active=True
    ).first()
    if not structure:
        raise ValidationError(
            f"No active fee structure found for grade '{class_section.grade}' in academic year '{ay.name}'."
        )

    # 1. Calculate REAL standard_total from FeeStructure
    actual_total = structure.items.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    locked_total = structure.items.aggregate(
        total=Sum(Coalesce('locked_amount', F('amount')))
    )['total'] or Decimal('0.00')

    # Defensive: ensure offered is Decimal or fall back to actual_total if None/not provided
    if offered_total is not None:
        try:
            offered_total = Decimal(str(offered_total))
        except (ValueError, TypeError, ArithmeticError):
            raise ValidationError('Agreed total fee (offered_total) must be a valid number.')
    else:
        offered_total = actual_total

    if offered_total <= 0:
        raise ValidationError('Agreed total fee (offered_total) must be greater than zero.')

    existing_invoices = FeeInvoice.objects.filter(
        student=student,
        academic_year=ay,
        month='ANNUAL',
    ).exclude(invoice_number__startswith='ADM-').exclude(
        invoice_number__startswith='TRN-',
    ).exclude(
        status='CANCELLED',
    )
    
    if existing_invoices.exists():
        old_invoice = existing_invoices.first()
        if old_invoice.generated_by == 'MANUAL':
            if old_invoice.paid_amount > 0:
                raise ValidationError("Cannot re-setup fee: existing CSV imported invoice already has payments attached. Use 'Edit Class & Fees' instead.")
            
            # Remove old StudentFeeItems tied to this invoice's categories
            from students.models import StudentFeeItem
            old_categories = old_invoice.items.values_list('category', flat=True)
            StudentFeeItem.objects.filter(student=student, academic_year=ay, category__in=old_categories).delete()
            
            # Cancel the old invoice
            old_invoice.status = 'CANCELLED'
            old_invoice.cancellation_reason = 'Superseded by confirmed fee setup'
            old_invoice.cancelled_by = requested_by
            old_invoice.save(update_fields=['status', 'cancellation_reason', 'cancelled_by'])
        else:
            raise ValidationError(
                'Academic fee for this academic year is already set for this student.'
            )

    # 2. Create Locked Fee Items if a structure exists
    if structure:
        # We apply the reduction proportionally to all fee items
        # Use the actual standard_total from DB for ratio
        ratio = offered_total / actual_total if actual_total > 0 else 1
        
        # Generate Annual Academic Invoice
        seq = FeeInvoice.objects.filter(branch=branch).count() + 1
        invoice = FeeInvoice.objects.create(
            tenant=tenant,
            invoice_number=f"INV-{ay.start_date.year}-{seq:04d}",
            student=student,
            branch=branch,
            academic_year=ay,
            month="ANNUAL",
            gross_amount=actual_total,
            concession_amount=actual_total - offered_total if actual_total > offered_total else Decimal('0.00'),
            net_amount=offered_total,
            outstanding_amount=offered_total,
            due_date=date.today(),
            status='SENT',
            generated_by='AUTO',
            created_by=requested_by,
        )
        
        invoice_items = []
        for item in structure.items.all():
            final_amt = round(item.amount * ratio, 2)
            StudentFeeItem.objects.create(
                student=student,
                academic_year=ay,
                category=item.category,
                amount=final_amt
            )
            invoice_items.append(FeeInvoiceItem(
                invoice=invoice,
                category=item.category,
                original_amount=item.amount,
                concession=item.amount - final_amt,
                final_amount=final_amt
            ))
        
        FeeInvoiceItem.objects.bulk_create(invoice_items)

    # 3. Trigger Approval if reduction detected compared to DB standard_total
    approval_base_total = locked_total if locked_total > 0 else actual_total
    if offered_total < approval_base_total:
        # Update student status to PENDING_APPROVAL
        Student.objects.filter(id=student.id).update(status='PENDING_APPROVAL')
        student.refresh_from_db() 
        
        routing, discount_amount = compute_fee_approval_routing(branch, approval_base_total, offered_total)

        # Fallback: if zonal routing applies but no active zonal admins are mapped to this zone,
        # escalate to tenant super admin queue.
        if routing == 'ZONAL' and branch.zone_id:
            from accounts.models import User
            has_zonal_reviewer = User.objects.filter(
                tenant=tenant,
                role='ZONAL_ADMIN',
                is_active=True,
                zone_accesses__zone_id=branch.zone_id,
            ).exists()
            if not has_zonal_reviewer:
                routing = 'TENANT_SUPER'

        approval = FeeApprovalRequest.objects.create(
            tenant=tenant,
            branch=branch,
            student=student,
            requested_by=requested_by,
            standard_total=approval_base_total,
            offered_total=offered_total,
            discount_amount=discount_amount,
            routing=routing,
            reason=reason
        )
        _notify_fee_approval_reviewers(approval, routing, branch, tenant)
    return False


def _notify_fee_approval_reviewers(approval, routing, branch, tenant):
    """In-app notification to tenant super admin or zonal admins (sidebar uses bell + /approvals)."""
    from accounts.models import User
    from notifications.dispatcher import dispatch_notification

    if routing == 'ZONAL' and not branch.zone_id:
        return

    if routing == 'ZONAL':
        reviewers = User.objects.filter(
            tenant=tenant,
            role='ZONAL_ADMIN',
            is_active=True,
            zone_accesses__zone_id=branch.zone_id,
        ).distinct()
    else:
        reviewers = User.objects.filter(tenant=tenant, role='SUPER_ADMIN', is_active=True)

    student_name = f'{approval.student.first_name} {approval.student.last_name}'.strip()
    payload = {
        'title': 'Fee reduction pending approval',
        'message': (
            f'{student_name}: ₹{approval.discount_amount} discount requested at {branch.name}. '
            'Tap to open the approvals queue.'
        ),
        'link': '/approvals',
    }
    for user in reviewers:
        dispatch_notification(
            tenant=tenant,
            branch=branch,
            event_type='CUSTOM_ANNOUNCEMENT',
            recipient_user=user,
            payload=payload,
            send_sms=False,
            send_email=False,
            send_push=True,
        )


def _normalize_parent_phone(phone: str) -> str:
    """Digits only, max length matches User.phone."""
    return ''.join(c for c in (phone or '') if c.isdigit())[:15]


def _placeholder_parent_email(tenant_id, phone_digits: str) -> str:
    """Deterministic placeholder so User.email stays unique; upgraded when a real email is saved."""
    tid = str(tenant_id).replace('-', '')
    return f'parent.{tid}.{phone_digits}@parent.local'


def link_parent_accounts_to_student(
    student, father_info, mother_info, tenant, branch, *, strict_parent_email=True,
):
    """Create or reuse parent User rows and link to the student.

    - Parents can sign in with **email or phone** (``CustomTokenObtainPairSerializer``).
    - When email is missing but phone (and contact intent) is present and
      ``strict_parent_email`` is False, a stable placeholder ``...@parent.local`` email is used;
      if a real email is added later (e.g. student profile update), it replaces the placeholder.
    - When ``strict_parent_email`` is True, a real email is required whenever name or phone
      is provided (legacy strict enroll flows).
    """
    from django.contrib.auth.base_user import BaseUserManager
    from django.contrib.auth.hashers import make_password

    from accounts.models import User
    from .models import ParentStudentRelation

    def norm_email(addr):
        if not addr or not str(addr).strip():
            return ''
        return BaseUserManager.normalize_email(str(addr).strip()) or ''

    def parent_first_name(info):
        """Callers use ``name`` (views) or ``first_name`` (CSV import); support both."""
        v = info.get('name') or info.get('first_name') or ''
        return (str(v).strip() if v is not None else '')

    parents_data = [
        {
            'phone': father_info.get('phone'),
            'email': father_info.get('email'),
            'first_name': parent_first_name(father_info),
            'role_type': 'FATHER',
            'field_key': 'father',
        },
        {
            'phone': mother_info.get('phone'),
            'email': mother_info.get('email'),
            'first_name': parent_first_name(mother_info),
            'role_type': 'MOTHER',
            'field_key': 'mother',
        },
    ]

    parent_qs_base = User.objects.filter(tenant=tenant, role='PARENT')

    for p in parents_data:
        phone_raw = (p['phone'] or '').strip()
        phone_digits = _normalize_parent_phone(phone_raw)
        email_real = norm_email(p.get('email'))
        first_name = (p['first_name'] or '').strip()
        fk = p['field_key']
        role_label = 'Father' if p['role_type'] == 'FATHER' else 'Mother'

        if not phone_digits and not email_real and not first_name:
            continue

        has_contact_intent = bool(phone_raw or first_name)

        target_email = email_real
        if not target_email:
            if not phone_digits:
                if has_contact_intent and strict_parent_email:
                    raise ValidationError({
                        f'{fk}_email': (
                            f'{role_label} email is required for parent sign-in '
                            '(parents can log in with this email or mobile number).'
                        ),
                    })
                if has_contact_intent:
                    logger.warning(
                        'Skipping %s parent link for student %s: missing email and phone',
                        role_label,
                        student.pk,
                    )
                continue
            if strict_parent_email:
                raise ValidationError({
                    f'{fk}_email': (
                        f'{role_label} email is required for parent sign-in '
                        '(parents can log in with this email or mobile number).'
                    ),
                })
            target_email = _placeholder_parent_email(tenant.id, phone_digits)

        parent_user = None
        if phone_digits:
            parent_user = parent_qs_base.filter(phone=phone_digits).first()
            if not parent_user and phone_raw:
                parent_user = parent_qs_base.filter(phone=phone_raw).first()
        if not parent_user:
            parent_user = parent_qs_base.filter(email=target_email).first()

        if parent_user:
            # Placeholder target_email is only for *creating* new users. If we matched an
            # existing parent by phone and the form left email blank, reuse that account
            # (e.g. they already have f@gmail.com) — do not treat placeholder vs real as conflict.
            email_mismatch = (
                target_email
                and parent_user.email.lower() != target_email.lower()
            )
            if email_mismatch and not email_real:
                pass
            elif email_mismatch:
                if parent_user.email.endswith('@parent.local'):
                    if User.objects.filter(email=target_email).exclude(pk=parent_user.pk).exists():
                        raise ValidationError({
                            f'{fk}_email': f'This {role_label.lower()} email is already in use.',
                        })
                    parent_user.email = target_email
                    parent_user.save(update_fields=['email'])
                else:
                    raise ValidationError({
                        f'{fk}_email': (
                            f'This phone is already linked to {parent_user.email}. '
                            'Use that email or update the phone number.'
                        ),
                    })
            store_phone = phone_digits or phone_raw
            if store_phone and parent_user.phone != store_phone:
                parent_user.phone = store_phone
                parent_user.save(update_fields=['phone'])
            if first_name and not parent_user.first_name:
                parent_user.first_name = first_name
                parent_user.save(update_fields=['first_name'])
            logger.info(
                'Existing parent reused: %s — student %s',
                parent_user.email,
                student.pk,
            )
        else:
            existing = User.objects.filter(email=target_email).first()
            if existing:
                if existing.role != 'PARENT' or existing.tenant_id != tenant.id:
                    raise ValidationError({
                        f'{fk}_email': f'{role_label} email is already registered.',
                    })
                parent_user = existing
                store_phone = phone_digits or phone_raw
                if store_phone and parent_user.phone != store_phone:
                    parent_user.phone = store_phone
                    parent_user.save(update_fields=['phone'])
                if first_name and not parent_user.first_name:
                    parent_user.first_name = first_name
                    parent_user.save(update_fields=['first_name'])
            else:
                parent_user = User(
                    email=target_email,
                    first_name=first_name or 'Parent',
                    last_name='',
                    phone=(phone_digits or phone_raw or ''),
                    role='PARENT',
                    tenant=tenant,
                    branch=branch,
                    must_change_password=True,
                )
                if not hasattr(link_parent_accounts_to_student, '_default_password_hash'):
                    link_parent_accounts_to_student._default_password_hash = make_password(
                        'Welcome@123',
                    )
                parent_user.password = link_parent_accounts_to_student._default_password_hash
                parent_user.save()
                logger.info(
                    'Parent account created %s (tenant %s)',
                    parent_user.email,
                    tenant.id,
                )

        ParentStudentRelation.objects.get_or_create(
            parent=parent_user,
            student=student,
            defaults={
                'relation_type': p['role_type'],
                'is_primary': (p['role_type'] == 'FATHER'),
            },
        )
