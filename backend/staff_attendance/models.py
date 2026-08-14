import uuid
from django.db import models
from django.conf import settings


class StaffAttendanceTransaction(models.Model):
    """
    Ephemeral QR token for the staff attendance workflow.
    
    Lifecycle: PENDING → VALIDATED → USED
                 ↓
              EXPIRED (via Celery cleanup)
    
    A staff member generates a QR code which creates a PENDING transaction.
    The attendance device scans and validates it (PENDING → VALIDATED).
    After photo capture and confirmation, it's marked as USED.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('VALIDATED', 'Validated'),
        ('EXPIRED', 'Expired'),
        ('USED', 'Used'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE,
        related_name='staff_attendance_transactions'
    )
    staff = models.ForeignKey(
        'staff.StaffProfile', on_delete=models.CASCADE,
        related_name='attendance_transactions'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='attendance_transactions',
        help_text='The user who generated the QR code'
    )
    branch = models.ForeignKey(
        'tenants.Branch', on_delete=models.CASCADE,
        related_name='staff_attendance_transactions'
    )

    # Token fields
    token = models.CharField(
        max_length=64, unique=True, db_index=True,
        help_text='Random hex token encoded in the QR code'
    )
    token_hmac = models.CharField(
        max_length=64,
        help_text='HMAC-SHA256 of the token for integrity verification'
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    expires_at = models.DateTimeField(help_text='Token expiry time (15 seconds from creation)')

    # Device validation fields (populated when device scans the QR)
    validated_by_device = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='validated_attendance_transactions',
        help_text='The ATTENDANCE_DEVICE user that scanned the QR'
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['token', 'status']),
            models.Index(fields=['staff', 'status']),
            models.Index(fields=['expires_at']),
        ]
        constraints = [
            # At most one PENDING token per staff member at any time
            models.UniqueConstraint(
                fields=['staff'],
                condition=models.Q(status='PENDING'),
                name='unique_pending_token_per_staff'
            ),
        ]

    def __str__(self):
        return f"Transaction {self.token[:8]}... ({self.status}) for {self.staff}"


class StaffAttendance(models.Model):
    """
    Daily attendance record for a staff member.
    
    One record per staff per day. Supports check-in, check-out,
    photo evidence, and links back to the QR transactions.
    """
    STATUS_CHOICES = [
        ('CHECKED_IN', 'Checked In'),
        ('CHECKED_OUT', 'Checked Out'),
        ('ON_LEAVE', 'On Leave'),
        ('ABSENT', 'Absent'),
    ]

    SOURCE_CHOICES = [
        ('QR_DEVICE', 'QR Device Scan'),
        ('MANUAL_ADMIN', 'Manual Admin Entry'),
        ('SYSTEM', 'System Generated'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE,
        related_name='staff_attendances'
    )
    staff = models.ForeignKey(
        'staff.StaffProfile', on_delete=models.CASCADE,
        related_name='staff_attendances'
    )
    branch = models.ForeignKey(
        'tenants.Branch', on_delete=models.CASCADE,
        related_name='staff_attendances'
    )
    date = models.DateField(help_text='Attendance date')

    # Check-in fields
    check_in_at = models.DateTimeField(null=True, blank=True)
    check_in_photo = models.CharField(
        max_length=500, blank=True, default='',
        help_text='S3 key for check-in photo'
    )
    check_in_device = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='staff_checkins_recorded',
        help_text='The ATTENDANCE_DEVICE user that recorded check-in'
    )
    check_in_transaction = models.ForeignKey(
        StaffAttendanceTransaction, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='check_in_attendance',
        help_text='The QR transaction used for check-in'
    )

    # Check-out fields
    check_out_at = models.DateTimeField(null=True, blank=True)
    check_out_photo = models.CharField(
        max_length=500, blank=True, default='',
        help_text='S3 key for check-out photo'
    )
    check_out_device = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='staff_checkouts_recorded',
        help_text='The ATTENDANCE_DEVICE user that recorded check-out'
    )
    check_out_transaction = models.ForeignKey(
        StaffAttendanceTransaction, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='check_out_attendance',
        help_text='The QR transaction used for check-out'
    )

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='ABSENT')
    APPROVAL_CHOICES = [
        ('PENDING', 'Pending Review'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    source = models.CharField(max_length=15, choices=SOURCE_CHOICES, default='QR_DEVICE')
    approval_status = models.CharField(max_length=10, choices=APPROVAL_CHOICES, default='PENDING')
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='approved_attendances',
        help_text='Admin who approved/rejected this record'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        constraints = [
            # One attendance record per staff per day
            models.UniqueConstraint(
                fields=['staff', 'date'],
                name='unique_staff_attendance_per_day'
            ),
        ]
        indexes = [
            models.Index(fields=['staff', 'date']),
            models.Index(fields=['branch', 'date']),
            models.Index(fields=['tenant', 'date', 'status']),
        ]

    def __str__(self):
        return f"{self.staff} - {self.date} - {self.status}"
