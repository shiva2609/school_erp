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
    promotion/detention (promoted_from set) but no annual academic fee invoice/items yet.
    """
    from students.models import StudentAcademicRecord
    from fees.models import FeeInvoice

    if not student.academic_year_id or not student.class_section_id:
        return False
    promoted = StudentAcademicRecord.objects.filter(
        student=student,
        academic_year_id=student.academic_year_id,
        promoted_from__isnull=False,
    ).exists()
    if not promoted:
        return False
    has_annual = FeeInvoice.objects.filter(
        student=student,
        academic_year_id=student.academic_year_id,
        month='ANNUAL',
    ).exclude(invoice_number__startswith='ADM-').exclude(invoice_number__startswith='TRN-').exists()
    if has_annual:
        return False
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

    if FeeInvoice.objects.filter(
        student=student,
        academic_year=ay,
        month='ANNUAL',
    ).exclude(invoice_number__startswith='ADM-').exclude(invoice_number__startswith='TRN-').exists():
        raise ValidationError(
            'Academic fee for this academic year is already set for this student.'
        )

    # 1. Calculate REAL standard_total from FeeStructure
    actual_total = Decimal('0.00')
    locked_total = Decimal('0.00')
    structure = None
    
    if class_section:
        structure = FeeStructure.objects.filter(
            branch=student.branch, academic_year=ay, grade=class_section.grade, is_active=True
        ).first()
        
        if structure:
            actual_total = structure.items.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            locked_total = structure.items.aggregate(
                total=Sum(Coalesce('locked_amount', F('amount')))
            )['total'] or Decimal('0.00')

    # Defensive: ensure offered is Decimal
    if offered_total is not None and Decimal(str(offered_total)) > 0:
        offered_total = Decimal(str(offered_total))
    else:
        offered_total = actual_total

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


def link_parent_accounts_to_student(
    student, father_info, mother_info, tenant, branch, *, strict_parent_email=True,
):
    """Create or reuse parent User rows and link to the student.

    - No synthetic or random emails: every parent account uses a real address from the form/CSV.
    - When ``strict_parent_email`` is True (default for admin enroll), father/mother email is
      required whenever name or phone is provided, so parents can sign in with email **or** phone
      (see ``CustomTokenObtainPairSerializer``).
    - CSV import passes ``strict_parent_email=False`` and skips creating a parent row if email
      is missing (student record is still created).
    """
    from django.contrib.auth.base_user import BaseUserManager
    from django.contrib.auth.hashers import make_password
    from rest_framework.exceptions import ValidationError

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

    for p in parents_data:
        phone = (p['phone'] or '').strip()
        email = norm_email(p.get('email'))
        first_name = (p['first_name'] or '').strip()
        fk = p['field_key']
        role_label = 'Father' if p['role_type'] == 'FATHER' else 'Mother'

        if not phone and not email and not first_name:
            continue

        has_contact_intent = bool(phone or first_name)
        if has_contact_intent and not email:
            if strict_parent_email:
                raise ValidationError({
                    f'{fk}_email': (
                        f'{role_label} email is required for parent sign-in '
                        '(parents can log in with this email or mobile number).'
                    ),
                })
            logger.warning(
                'Skipping %s parent link for student %s: missing email',
                role_label,
                student.pk,
            )
            continue

        if not email:
            continue

        parent_user = None
        if phone:
            parent_user = User.objects.filter(
                phone=phone, tenant=tenant, role='PARENT',
            ).first()
        if not parent_user:
            parent_user = User.objects.filter(
                email=email, tenant=tenant, role='PARENT',
            ).first()

        if parent_user:
            if email and parent_user.email != email:
                if parent_user.email.endswith('@parent.local'):
                    if User.objects.filter(email=email).exclude(pk=parent_user.pk).exists():
                        raise ValidationError({
                            f'{fk}_email': f'This {role_label.lower()} email is already in use.',
                        })
                    parent_user.email = email
                    parent_user.save(update_fields=['email'])
                else:
                    raise ValidationError({
                        f'{fk}_email': (
                            f'This phone is already linked to {parent_user.email}. '
                            'Use that email or update the phone number.'
                        ),
                    })
            if phone and not parent_user.phone:
                parent_user.phone = phone
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
            existing = User.objects.filter(email=email).first()
            if existing:
                if existing.role != 'PARENT' or existing.tenant_id != tenant.id:
                    raise ValidationError({
                        f'{fk}_email': f'{role_label} email is already registered.',
                    })
                parent_user = existing
                if phone and not parent_user.phone:
                    parent_user.phone = phone
                    parent_user.save(update_fields=['phone'])
                if first_name and not parent_user.first_name:
                    parent_user.first_name = first_name
                    parent_user.save(update_fields=['first_name'])
            else:
                parent_user = User(
                    email=email,
                    first_name=first_name or '',
                    last_name='',
                    phone=phone or '',
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
