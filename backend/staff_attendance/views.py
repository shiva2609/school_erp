import hmac
import hashlib
import io
import secrets
import uuid as uuid_mod
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import CanUseStaffAttendance, IsAttendanceDevice, IsSchoolAdminOrAbove, IsAccountantOrAbove
from accounts.utils import log_audit_action
from django.contrib.auth import get_user_model

User = get_user_model()

from .models import StaffAttendanceTransaction, StaffAttendance
from .serializers import (
    QRValidateRequestSerializer,
)

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------
QR_TOKEN_EXPIRY_SECONDS = 15
HMAC_KEY = getattr(settings, 'STAFF_ATTENDANCE_HMAC_KEY', None) or settings.SECRET_KEY


def _generate_hmac(token: str) -> str:
    """Generate HMAC-SHA256 signature for a token."""
    return hmac.new(
        HMAC_KEY.encode('utf-8'),
        token.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()


def _verify_hmac(token: str, expected_hmac: str) -> bool:
    """Constant-time HMAC comparison to prevent timing attacks."""
    computed = _generate_hmac(token)
    return hmac.compare_digest(computed, expected_hmac)


# ------------------------------------------------------------------
# Staff-Side Endpoints
# ------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([CanUseStaffAttendance])
def qr_generate(request):
    """
    Generate a QR code token for attendance check-in/check-out.
    
    The staff member opens this on their phone. The QR code
    contains a token that the attendance device will scan.
    Token expires in 15 seconds.
    """
    user = request.user
    profile = user.staff_profile
    now = timezone.now()

    # Rate limit: prevent rapid-fire QR generation
    recent_cutoff = now - timedelta(seconds=5)
    recent = StaffAttendanceTransaction.objects.filter(
        staff=profile,
        created_at__gte=recent_cutoff,
    ).exists()
    if recent:
        return Response(
            {'error': 'Please wait a few seconds before generating a new QR code.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    # Invalidate any existing PENDING tokens for this staff
    StaffAttendanceTransaction.objects.filter(
        staff=profile,
        status='PENDING',
    ).update(status='EXPIRED')

    # Generate cryptographic token
    token = secrets.token_hex(32)  # 64-char hex string
    token_hmac = _generate_hmac(token)
    expires_at = now + timedelta(seconds=QR_TOKEN_EXPIRY_SECONDS)

    # Create transaction
    txn = StaffAttendanceTransaction.objects.create(
        tenant=user.tenant,
        staff=profile,
        user=user,
        branch=profile.branch,
        token=token,
        token_hmac=token_hmac,
        status='PENDING',
        expires_at=expires_at,
    )

    # Audit log
    log_audit_action(
        user=user,
        action='QR_GENERATED',
        model_name='StaffAttendanceTransaction',
        record_id=txn.id,
        details={'employee_id': profile.employee_id},
        tenant=user.tenant,
    )

    return Response({
        'qr_data': token,
        'expires_in': QR_TOKEN_EXPIRY_SECONDS,
        'transaction_id': str(txn.id),
    })


@api_view(['GET'])
@permission_classes([CanUseStaffAttendance])
def my_status(request):
    """
    Get the staff member's attendance status for today.
    Returns check-in/out times and whether they can generate a QR.
    """
    user = request.user
    profile = user.staff_profile
    today = timezone.localdate()

    attendance = StaffAttendance.objects.filter(
        staff=profile,
        date=today,
    ).first()

    if not attendance or (attendance.status == 'ABSENT' and not attendance.check_in_at):
        return Response({
            'date': today.isoformat(),
            'status': 'NOT_CHECKED_IN',
            'check_in_at': None,
            'check_out_at': None,
            'can_generate_qr': True,
            'message': 'You have not checked in today.',
        })

    can_generate = attendance.status == 'CHECKED_IN' and not attendance.check_out_at
    if attendance.status == 'CHECKED_OUT':
        local_time = timezone.localtime(attendance.check_out_at).strftime("%I:%M %p") if attendance.check_out_at else ''
        message = f'Checked out at {local_time}.'
        can_generate = False
    elif attendance.status == 'CHECKED_IN':
        local_time = timezone.localtime(attendance.check_in_at).strftime("%I:%M %p") if attendance.check_in_at else ''
        message = f'Checked in at {local_time}. Ready for check-out.'
        can_generate = True
    else:
        message = f'Status: {attendance.get_status_display()}'
        can_generate = False

    return Response({
        'date': today.isoformat(),
        'status': attendance.status,
        'check_in_at': attendance.check_in_at,
        'check_out_at': attendance.check_out_at,
        'can_generate_qr': can_generate,
        'message': message,
    })


@api_view(['GET'])
@permission_classes([CanUseStaffAttendance])
def my_history(request):
    """
    Get paginated attendance history for the authenticated staff member.
    Query params: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&page=1
    """
    user = request.user
    profile = user.staff_profile

    qs = StaffAttendance.objects.filter(staff=profile).order_by('-date')

    # Date range filters
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    if start_date:
        qs = qs.filter(date__gte=start_date)
    if end_date:
        qs = qs.filter(date__lte=end_date)

    # Simple pagination (20 per page)
    page = int(request.query_params.get('page', 1))
    page_size = 20
    offset = (page - 1) * page_size
    total = qs.count()
    records = qs[offset:offset + page_size]

    from .serializers import StaffAttendanceSerializer
    serializer = StaffAttendanceSerializer(records, many=True)

    return Response({
        'results': serializer.data,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size if total > 0 else 1,
    })


# ------------------------------------------------------------------
# Device-Side Endpoints
# ------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAttendanceDevice])
def qr_validate(request):
    """
    Validate a scanned QR token from the attendance device.
    
    The device scans a staff member's QR code and sends the token
    here for validation. On success, returns the staff info and
    the valid action (CHECK_IN or CHECK_OUT).
    
    Uses select_for_update() to prevent race conditions from
    concurrent scans of the same token.
    """
    serializer = QRValidateRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    token = serializer.validated_data['token']

    device_user = request.user
    now = timezone.now()

    # Rate limit: max 10 scans per minute per device
    recent_cutoff = now - timedelta(minutes=1)
    recent_scans = StaffAttendanceTransaction.objects.filter(
        validated_by_device=device_user,
        validated_at__gte=recent_cutoff
    ).count()
    if recent_scans >= 10:
        return Response(
            {'error': 'Too many scans. Please wait a moment.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    with transaction.atomic():
        # Lookup token with row-level lock
        try:
            txn = (
                StaffAttendanceTransaction.objects
                .select_for_update()
                .get(token=token, status='PENDING')
            )
        except StaffAttendanceTransaction.DoesNotExist:
            # Check if token exists but is in another state
            exists = StaffAttendanceTransaction.objects.filter(token=token).first()
            if exists:
                if exists.status == 'EXPIRED':
                    msg = 'QR code has expired. Ask the staff to generate a new one.'
                elif exists.status == 'USED':
                    msg = 'QR code has already been used.'
                elif exists.status == 'VALIDATED':
                    msg = 'QR code is already being processed.'
                else:
                    msg = 'Invalid QR code state.'
            else:
                msg = 'Invalid QR code.'

            log_audit_action(
                user=device_user,
                action='QR_REJECTED',
                model_name='StaffAttendanceTransaction',
                record_id=exists.id if exists else device_user.id,
                details={'reason': msg, 'token_prefix': token[:8]},
                tenant=device_user.tenant,
            )
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)

        # Check expiry
        if now > txn.expires_at:
            txn.status = 'EXPIRED'
            txn.save(update_fields=['status'])
            log_audit_action(
                user=device_user,
                action='TOKEN_EXPIRED',
                model_name='StaffAttendanceTransaction',
                record_id=txn.id,
                details={'expired_by_seconds': (now - txn.expires_at).total_seconds()},
                tenant=device_user.tenant,
            )
            return Response(
                {'error': 'QR code has expired. Ask the staff to generate a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Branch match: device must be in the same branch as the staff
        if txn.branch_id != device_user.branch_id:
            log_audit_action(
                user=device_user,
                action='BRANCH_MISMATCH',
                model_name='StaffAttendanceTransaction',
                record_id=txn.id,
                details={
                    'staff_branch': str(txn.branch_id),
                    'device_branch': str(device_user.branch_id),
                },
                tenant=device_user.tenant,
            )
            return Response(
                {'error': 'Branch mismatch. This QR code is not for this branch.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # HMAC integrity check
        if not _verify_hmac(token, txn.token_hmac):
            log_audit_action(
                user=device_user,
                action='HMAC_FAILED',
                model_name='StaffAttendanceTransaction',
                record_id=txn.id,
                details={'token_prefix': token[:8]},
                tenant=device_user.tenant,
            )
            return Response(
                {'error': 'Token integrity check failed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine action based on today's attendance
        today = timezone.localdate()
        attendance = StaffAttendance.objects.filter(
            staff=txn.staff,
            date=today,
        ).first()

        if not attendance or not attendance.check_in_at:
            action = 'CHECK_IN'
            message = 'Ready for check-in.'
        elif attendance.status == 'CHECKED_IN' and not attendance.check_out_at:
            action = 'CHECK_OUT'
            local_time = timezone.localtime(attendance.check_in_at).strftime("%I:%M %p") if attendance.check_in_at else ''
            message = f'Checked in at {local_time}. Ready for check-out.'
        else:
            action = 'COMPLETED'
            message = 'Attendance already completed for today.'

        # Transition: PENDING → VALIDATED
        txn.status = 'VALIDATED'
        txn.validated_by_device = device_user
        txn.validated_at = now
        txn.save(update_fields=['status', 'validated_by_device', 'validated_at'])

    # Build staff info for device display
    staff = txn.staff
    staff_user = staff.user
    designation = ''
    if hasattr(staff, 'designation') and staff.designation:
        designation = staff.designation.name if hasattr(staff.designation, 'name') else str(staff.designation)

    log_audit_action(
        user=device_user,
        action='QR_SCANNED',
        model_name='StaffAttendanceTransaction',
        record_id=txn.id,
        details={
            'employee_id': staff.employee_id,
            'action': action,
        },
        tenant=device_user.tenant,
    )

    return Response({
        'transaction_id': str(txn.id),
        'employee_id': staff.employee_id,
        'staff_name': f"{staff_user.first_name} {staff_user.last_name}".strip() if staff_user else '',
        'branch_name': txn.branch.name if txn.branch else '',
        'designation': designation,
        'action': action,
        'message': message,
    })


# ------------------------------------------------------------------
# Phase 3: Attendance Mark & Device Info
# ------------------------------------------------------------------

# Allowed photo MIME types and their magic byte signatures
ALLOWED_PHOTO_TYPES = {
    'image/jpeg': [b'\xff\xd8\xff'],
    'image/png': [b'\x89PNG'],
}
MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 10MB
MAX_PHOTO_DIMENSION = 800  # Max width/height after compression


def _validate_photo(photo_file):
    """
    Validate uploaded photo:
    - Size under 10MB
    - Content-type is jpeg or png
    - Magic bytes match declared content-type
    Returns (is_valid, error_message)
    """
    if photo_file.size > MAX_PHOTO_SIZE:
        return False, f'Photo too large ({photo_file.size // 1024}KB). Max is 10MB.'

    content_type = photo_file.content_type
    if content_type not in ALLOWED_PHOTO_TYPES:
        return False, f'Invalid photo type: {content_type}. Use JPEG or PNG.'

    # Magic byte check
    header = photo_file.read(8)
    photo_file.seek(0)
    signatures = ALLOWED_PHOTO_TYPES[content_type]
    if not any(header.startswith(sig) for sig in signatures):
        return False, 'File content does not match declared type (magic byte mismatch).'

    return True, None


def _compress_and_upload_photo(photo_file, s3_key):
    """
    Compress the photo to max 800x800 and upload to S3.
    Returns (s3_key, None) on success, or (None, error_msg) on failure.
    """
    try:
        try:
            from PIL import Image
            img = Image.open(photo_file)

            # Convert RGBA/palette to RGB for JPEG
            if img.mode in ('RGBA', 'P', 'LA'):
                img = img.convert('RGB')

            # Resize if larger than max dimension
            if img.width > MAX_PHOTO_DIMENSION or img.height > MAX_PHOTO_DIMENSION:
                img.thumbnail((MAX_PHOTO_DIMENSION, MAX_PHOTO_DIMENSION), Image.LANCZOS)

            # Save to buffer as JPEG
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=80, optimize=True)
            buffer.seek(0)
            
            from django.core.files.base import ContentFile
            photo_to_save = ContentFile(buffer.read())
        except ImportError:
            # Pillow not installed — upload raw file
            photo_to_save = photo_file

        from django.core.files.storage import default_storage
        saved_path = default_storage.save(s3_key, photo_to_save)
        return saved_path, None

    except Exception as e:
        import traceback
        return None, f"Storage error: {str(e)} | {traceback.format_exc()}"


@api_view(['POST'])
@permission_classes([IsAttendanceDevice])
def mark_attendance(request):
    """
    Mark attendance (CHECK_IN or CHECK_OUT) with photo evidence.
    
    Accepts multipart form data:
    - transaction_id: UUID of the validated transaction
    - action: CHECK_IN or CHECK_OUT
    - photo: JPEG/PNG file (max 2MB, compressed to 800x800)
    
    Creates/updates the StaffAttendance record with server timestamp.
    """
    try:
        device_user = request.user
        now = timezone.now()
        today = timezone.localdate()

        # Parse request
        transaction_id = request.data.get('transaction_id')
        action = request.data.get('action')
        photo = request.FILES.get('photo')

        # Validate required fields
        if not transaction_id:
            return Response({'error': 'transaction_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if action not in ('CHECK_IN', 'CHECK_OUT'):
            return Response({'error': 'action must be CHECK_IN or CHECK_OUT.'}, status=status.HTTP_400_BAD_REQUEST)
        if not photo:
            return Response({'error': 'photo is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate photo
        is_valid, error_msg = _validate_photo(photo)
        if not is_valid:
            return Response({'error': error_msg}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Fetch and lock the transaction
            try:
                txn = (
                    StaffAttendanceTransaction.objects
                    .select_for_update()
                    .get(id=transaction_id, status='VALIDATED', validated_by_device=device_user)
                )
            except StaffAttendanceTransaction.DoesNotExist:
                return Response(
                    {'error': 'Invalid or expired transaction. Please scan QR again.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except Exception as txn_err:
                return Response(
                    {'error': f'Transaction lookup error: {str(txn_err)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            staff = txn.staff

            # Server-side re-validation of attendance state
            attendance = StaffAttendance.objects.filter(
                staff=staff,
                date=today,
            ).order_by().select_for_update().first()

            if action == 'CHECK_IN':
                if attendance and attendance.check_in_at:
                    return Response(
                        {'error': 'Already checked in today.'},
                        status=status.HTTP_409_CONFLICT,
                    )
            elif action == 'CHECK_OUT':
                if not attendance or not attendance.check_in_at:
                    return Response(
                        {'error': 'Must check in before checking out.'},
                        status=status.HTTP_409_CONFLICT,
                    )
                if attendance.check_out_at:
                    return Response(
                        {'error': 'Already checked out today.'},
                        status=status.HTTP_409_CONFLICT,
                    )

            # Upload photo to S3
            timestamp_str = now.strftime('%Y%m%d_%H%M%S')
            s3_key = (
                f"attendance_photos/{txn.tenant_id}/{txn.branch_id}/"
                f"{today.isoformat()}/{staff.employee_id}_{action.lower()}_{timestamp_str}.jpg"
            )
            saved_key, storage_error = _compress_and_upload_photo(photo, s3_key)
            if not saved_key:
                return Response(
                    {'error': f'Failed to process photo: {storage_error or "Unknown error"}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Create or update attendance record
            if action == 'CHECK_IN':
                if not attendance:
                    attendance = StaffAttendance.objects.create(
                        tenant=txn.tenant,
                        staff=staff,
                        branch=txn.branch,
                        date=today,
                        check_in_at=now,
                        check_in_photo=saved_key,
                        check_in_device=device_user,
                        check_in_transaction=txn,
                        status='CHECKED_IN',
                        source='QR_DEVICE',
                    )
                else:
                    attendance.check_in_at = now
                    attendance.check_in_photo = saved_key
                    attendance.check_in_device = device_user
                    attendance.check_in_transaction = txn
                    attendance.status = 'CHECKED_IN'
                    attendance.source = 'QR_DEVICE'
                    attendance.save()
            else:  # CHECK_OUT
                attendance.check_out_at = now
                attendance.check_out_photo = saved_key
                attendance.check_out_device = device_user
                attendance.check_out_transaction = txn
                attendance.status = 'CHECKED_OUT'
                attendance.save()

            # Transition transaction: VALIDATED → USED
            txn.status = 'USED'
            txn.save(update_fields=['status'])

        # Audit log
        log_audit_action(
            user=device_user,
            action='ATTENDANCE_MARKED',
            model_name='StaffAttendance',
            record_id=attendance.id,
            details={
                'employee_id': staff.employee_id,
                'action': action,
                'photo_key': saved_key,
                'server_timestamp': now.isoformat(),
            },
            tenant=device_user.tenant,
        )

        return Response({
            'success': True,
            'action': action,
            'employee_id': staff.employee_id,
            'staff_name': f"{staff.user.first_name} {staff.user.last_name}".strip() if staff.user else '',
            'timestamp': now.isoformat(),
            'status': attendance.status,
            'message': f'{"Check-in" if action == "CHECK_IN" else "Check-out"} recorded successfully.',
        })
    except Exception as e:
        import traceback
        return Response({
            'error': f'Unhandled server error: {str(e)} | {traceback.format_exc()}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAttendanceDevice])
def device_info(request):
    """
    Return device and branch information for the kiosk display.
    Includes branch name, tenant name/logo, and today's stats.
    """
    device_user = request.user
    branch = device_user.branch
    tenant = device_user.tenant
    today = timezone.localdate()

    # Today's stats for this branch
    today_stats = StaffAttendance.objects.filter(
        branch=branch,
        date=today,
    )
    # 'Checked In' = everyone who has check_in_at set today (regardless of current status)
    checked_in = today_stats.filter(check_in_at__isnull=False).count()
    # 'Checked Out' = everyone who has check_out_at set today
    checked_out = today_stats.filter(check_out_at__isnull=False).count()
    total_marked = today_stats.count()

    return Response({
        'branch_name': branch.name if branch else '',
        'branch_code': branch.branch_code if branch else '',
        'tenant_name': tenant.name if tenant else '',
        'tenant_logo': tenant.logo_url if tenant else None,
        'device_email': device_user.email,
        'today': today.isoformat(),
        'stats': {
            'checked_in': checked_in,
            'checked_out': checked_out,
            'total_marked': total_marked,
        },
    })


# ------------------------------------------------------------------
# Phase 6: Admin Endpoints
# ------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAccountantOrAbove])
def admin_photo(request, pk, photo_type):
    """
    Returns a temporary presigned URL or directly serves the photo.
    photo_type is 'check_in' or 'check_out'.
    """
    from django.shortcuts import get_object_or_404
    from django.core.files.storage import default_storage
    
    attendance = get_object_or_404(StaffAttendance, pk=pk, tenant=request.user.tenant)
    if getattr(request.user, 'branch_id', None) and attendance.branch_id != request.user.branch_id:
        return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
    photo_key = attendance.check_in_photo if photo_type == 'check_in' else attendance.check_out_photo
    if not photo_key:
        return Response({'error': 'Photo not found'}, status=status.HTTP_404_NOT_FOUND)
        
    # Generate a presigned URL using the default storage backend
    try:
        url = default_storage.url(photo_key)
        return Response({'url': url})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAccountantOrAbove])
def admin_daily(request):
    """
    Get branch-wide daily summary (present/absent/late counts).
    Optional query param: ?date=YYYY-MM-DD (defaults to today).
    """
    user = request.user
    date_str = request.query_params.get('date')
    if date_str:
        from django.utils.dateparse import parse_date
        target_date = parse_date(date_str)
        if not target_date:
            return Response({'error': 'Invalid date format.'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        target_date = timezone.localdate()

    qs = StaffAttendance.objects.filter(tenant=user.tenant, date=target_date)
    if getattr(user, 'branch_id', None):
        qs = qs.filter(branch_id=user.branch_id)

    # Calculate stats
    checked_in = qs.filter(check_in_at__isnull=False).count()
    checked_out = qs.filter(check_out_at__isnull=False).count()
    on_leave = qs.filter(status='ON_LEAVE').count()
    absent = qs.filter(status='ABSENT').count()

    return Response({
        'date': target_date.isoformat(),
        'stats': {
            'checked_in': checked_in,
            'checked_out': checked_out,
            'on_leave': on_leave,
            'absent': absent,
            'total_marked': checked_in + checked_out + on_leave + absent,
        }
    })

@api_view(['GET'])
@permission_classes([IsAccountantOrAbove])
def admin_devices(request):
    """
    List all ATTENDANCE_DEVICE accounts for the tenant.
    """
    user = request.user
    devices = User.objects.filter(tenant=user.tenant, role='ATTENDANCE_DEVICE')
    if getattr(user, 'branch_id', None):
        devices = devices.filter(branch_id=user.branch_id)
        
    data = []
    for d in devices:
        data.append({
            'id': d.id,
            'email': d.email,
            'first_name': d.first_name,
            'last_name': d.last_name,
            'branch_name': d.branch.name if getattr(d, 'branch', None) else '',
            'is_active': d.is_active,
        })
        
    return Response(data)


def ensure_daily_staff_attendance(tenant, branch_id=None, target_date=None):
    """
    Ensure all active staff members have a StaffAttendance record for the given date.
    Staff who have not checked in or marked leave are automatically initialized as ABSENT.
    """
    from staff.models import StaffProfile
    target_date = target_date or timezone.localdate()

    staff_qs = StaffProfile.objects.filter(
        tenant=tenant,
        status='ACTIVE',
        is_active=True,
        branch__isnull=False,
    )
    if branch_id:
        staff_qs = staff_qs.filter(branch_id=branch_id)

    # Fetch existing attendance records for target_date
    existing_staff_ids = set(
        StaffAttendance.objects.filter(
            tenant=tenant,
            date=target_date,
            staff__in=staff_qs,
        ).values_list('staff_id', flat=True)
    )

    new_records = []
    for staff in staff_qs.select_related('branch'):
        if staff.id not in existing_staff_ids:
            new_records.append(
                StaffAttendance(
                    tenant=tenant,
                    staff=staff,
                    branch=staff.branch,
                    date=target_date,
                    status='ABSENT',
                    source='SYSTEM',
                    approval_status='PENDING',
                )
            )

    if new_records:
        StaffAttendance.objects.bulk_create(new_records, ignore_conflicts=True)


@api_view(['GET'])
@permission_classes([IsAccountantOrAbove])
def admin_attendance_list(request):
    """
    List all staff attendance records for the admin report page.
    Supports filtering by employee_id, date range, and time threshold.
    For super-admin/owner roles, accepts ?branch_id= to scope to a specific branch.
    """
    user = request.user
    qs = StaffAttendance.objects.select_related(
        'staff', 'staff__user', 'staff__designation', 'branch', 'approved_by'
    ).filter(tenant=user.tenant)

    # Branch scoping:
    # - Branch-scoped staff (ACCOUNTANT, PRINCIPAL, etc.) always see their own branch only.
    # - Global roles (SUPER_ADMIN, OWNER, etc.) see all branches unless ?branch_id= is provided.
    branch_id = getattr(user, 'branch_id', None)
    if branch_id:
        qs = qs.filter(branch_id=user.branch_id)
    else:
        # Global role — honour optional ?branch_id= query param from the top-bar selector
        qp_branch_id = request.query_params.get('branch_id', '').strip()
        if qp_branch_id:
            branch_id = qp_branch_id
            qs = qs.filter(branch_id=qp_branch_id)

    # Filter by employee_id (partial match)
    employee_id = request.query_params.get('employee_id', '').strip()
    if employee_id:
        qs = qs.filter(staff__employee_id__icontains=employee_id)

    # Filter by staff name (partial match)
    staff_name = request.query_params.get('staff_name', '').strip()
    if staff_name:
        from django.db.models import Q
        qs = qs.filter(
            Q(staff__user__first_name__icontains=staff_name) |
            Q(staff__user__last_name__icontains=staff_name)
        )

    # Filter by date range
    date_from = request.query_params.get('date_from')
    date_to = request.query_params.get('date_to')
    parsed_date_from = None
    parsed_date_to = None
    if date_from:
        from django.utils.dateparse import parse_date
        parsed_date_from = parse_date(date_from)
        if parsed_date_from:
            qs = qs.filter(date__gte=parsed_date_from)
    if date_to:
        from django.utils.dateparse import parse_date
        parsed_date_to = parse_date(date_to)
        if parsed_date_to:
            qs = qs.filter(date__lte=parsed_date_to)

    # If no date filters provided, default to today
    if not date_from and not date_to:
        today = timezone.localdate()
        parsed_date_from = today
        parsed_date_to = today
        qs = qs.filter(date=today)

    # Automatically ensure absent records exist for single-date queries or today
    if parsed_date_from and parsed_date_to and parsed_date_from == parsed_date_to:
        ensure_daily_staff_attendance(user.tenant, branch_id=branch_id, target_date=parsed_date_from)
    elif not date_from and not date_to:
        ensure_daily_staff_attendance(user.tenant, branch_id=branch_id, target_date=timezone.localdate())

    # Filter by check-in time threshold (e.g., 'after 8:00 AM')
    check_in_after = request.query_params.get('check_in_after', '').strip()
    if check_in_after:
        try:
            from datetime import datetime as dt
            threshold_time = dt.strptime(check_in_after, '%H:%M').time()
            # Combine with the date to create a datetime threshold
            from django.db.models.functions import TruncTime
            # We use __time lookup which extracts the time part
            qs = qs.filter(check_in_at__isnull=False)
            # Filter where the local time of check_in_at is after the threshold
            # Since check_in_at is stored in UTC, we need to use database functions
            from django.db.models.functions import Localtime
            from django.db.models.lookups import GreaterThanOrEqual
            qs = qs.annotate(
                local_check_in=Localtime('check_in_at')
            ).filter(
                local_check_in__time__gte=threshold_time
            )
        except (ValueError, TypeError):
            pass  # Ignore invalid time format

    # Filter by attendance status (CHECKED_IN, CHECKED_OUT, ON_LEAVE, ABSENT)
    att_status = request.query_params.get('status', '').strip()
    if att_status:
        qs = qs.filter(status=att_status)

    # Filter by approval status
    approval_status = request.query_params.get('approval_status', '').strip()
    if approval_status:
        qs = qs.filter(approval_status=approval_status)

    # Ordering
    qs = qs.order_by('-date', 'staff__employee_id')

    # Simple pagination
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 50))
    total = qs.count()
    start = (page - 1) * page_size
    end = start + page_size
    records = qs[start:end]

    from .serializers import StaffAttendanceSerializer
    serializer = StaffAttendanceSerializer(records, many=True)

    return Response({
        'results': serializer.data,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size if total > 0 else 1,
    })


@api_view(['POST'])
@permission_classes([IsAccountantOrAbove])
def admin_attendance_action(request, pk):
    """
    Approve or reject a staff attendance record.
    Body: { "action": "APPROVE" | "REJECT", "remarks": "optional" }
    """
    from django.shortcuts import get_object_or_404
    user = request.user
    
    attendance = get_object_or_404(
        StaffAttendance.objects.select_related('staff', 'staff__user'),
        pk=pk, tenant=user.tenant
    )
    
    # Branch scoping
    if getattr(user, 'branch_id', None) and attendance.branch_id != user.branch_id:
        return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
    
    action = request.data.get('action', '').strip().upper()
    if action not in ('APPROVE', 'REJECT'):
        return Response({'error': 'Invalid action. Must be APPROVE or REJECT.'}, status=status.HTTP_400_BAD_REQUEST)
    
    if action == 'APPROVE':
        attendance.approval_status = 'APPROVED'
    else:
        attendance.approval_status = 'REJECTED'
    
    attendance.approved_by = user
    attendance.approved_at = timezone.now()
    
    # Append remarks if provided
    remarks = request.data.get('remarks', '').strip()
    if remarks:
        if attendance.remarks:
            attendance.remarks += f'\n[{action}] {remarks}'
        else:
            attendance.remarks = f'[{action}] {remarks}'
    
    attendance.save(update_fields=['approval_status', 'approved_by', 'approved_at', 'remarks', 'updated_at'])
    
    from .serializers import StaffAttendanceSerializer
    return Response(StaffAttendanceSerializer(attendance).data)


@api_view(['GET'])
@permission_classes([IsAccountantOrAbove])
def admin_today_summary(request):
    """
    Return today's attendance summary for the report page header cards.
    Returns: total_staff, attended_today, on_leave_today, absent_today, date.

    For global roles (SUPER_ADMIN/OWNER) accepts ?branch_id= query param.
    Branch-scoped roles (ACCOUNTANT, PRINCIPAL, etc.) always see their own branch.
    """
    from staff.models import StaffProfile

    user = request.user
    today = timezone.localdate()

    # Determine branch scope
    branch_id = getattr(user, 'branch_id', None)
    if not branch_id:
        # Global role — honour optional ?branch_id= from the top-bar selector
        branch_id = request.query_params.get('branch_id', '').strip() or None

    # Automatically ensure daily attendance records exist for all active staff today
    ensure_daily_staff_attendance(user.tenant, branch_id=branch_id, target_date=today)

    # Count active staff
    staff_qs = StaffProfile.objects.filter(tenant=user.tenant, status='ACTIVE', is_active=True, branch__isnull=False)
    if branch_id:
        staff_qs = staff_qs.filter(branch_id=branch_id)
    total_staff = staff_qs.count()

    # Today's attendance records
    att_qs = StaffAttendance.objects.filter(tenant=user.tenant, date=today)
    if branch_id:
        att_qs = att_qs.filter(branch_id=branch_id)

    attended_today = att_qs.filter(check_in_at__isnull=False).count()
    on_leave_today = att_qs.filter(status='ON_LEAVE').count()
    absent_today = att_qs.filter(status='ABSENT').count()

    return Response({
        'date': today.isoformat(),
        'total_staff': total_staff,
        'attended_today': attended_today,
        'on_leave_today': on_leave_today,
        'absent_today': absent_today,
    })

