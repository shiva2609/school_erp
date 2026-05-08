import uuid
from django.db import models
from django.conf import settings

FREQUENCY_CHOICES = [
    ("ONE_TIME", "One Time"), ("MONTHLY", "Monthly"), ("QUARTERLY", "Quarterly"),
    ("HALF_YEARLY", "Half Yearly"), ("ANNUALLY", "Annually"),
]
DISCOUNT_TYPE = [("FLAT", "Flat"), ("PERCENTAGE", "Percentage")]
CONCESSION_TYPE = [
    ("SIBLING", "Sibling"), ("STAFF_WARD", "Staff Ward"), ("SCHOLARSHIP", "Scholarship"),
    ("NEED_BASED", "Need Based"), ("OTHER", "Other"),
]
CONCESSION_STATUS = [("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected")]
INVOICE_STATUS = [
    ("DRAFT", "Draft"), ("SENT", "Sent"), ("PARTIALLY_PAID", "Partially Paid"),
    ("PAID", "Paid"), ("OVERDUE", "Overdue"), ("WAIVED", "Waived"), ("CANCELLED", "Cancelled"),
]
PAYMENT_MODE = [
    ("ONLINE", "Online"), ("CASH", "Cash"), ("CHEQUE", "Cheque"),
    ("NEFT", "NEFT"), ("RTGS", "RTGS"), ("DD", "DD"), ("UPI", "UPI"),
]
PAYMENT_STATUS = [
    ("PENDING", "Pending"), ("COMPLETED", "Completed"), ("FAILED", "Failed"), ("REFUNDED", "Refunded"),
]
GENERATED_BY = [("AUTO", "Auto"), ("MANUAL", "Manual")]
WALLET_TX_TYPE = [("CREDIT", "Credit"), ("DEBIT", "Debit")]


# ─── DocumentSequence (Safe Number Generation) ─────────────────
class DocumentSequence(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE)
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE)
    document_type = models.CharField(max_length=20) # 'RECEIPT', 'INVOICE'
    prefix = models.CharField(max_length=20) # e.g., 'RCP-202403'
    last_sequence = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['branch', 'document_type', 'prefix']

    @classmethod
    def get_next_sequence(cls, branch, document_type, prefix):
        """Generates a safe sequence with atomic row lock."""
        from django.db import transaction
        with transaction.atomic():
            seq, created = cls.objects.select_for_update().get_or_create(
                tenant=branch.tenant,
                branch=branch,
                document_type=document_type,
                prefix=prefix,
                defaults={'last_sequence': 0}
            )
            
            if created:
                # If newly created, attempt to synchronize with existing highest number
                # by looking at existing payments/invoices to prevent constraint errors
                if document_type == 'RECEIPT':
                    from .models import Payment
                    count = Payment.objects.filter(branch=branch, receipt_number__startswith=prefix).count()
                    seq.last_sequence = count
                elif document_type == 'INVOICE':
                    from .models import FeeInvoice
                    count = FeeInvoice.objects.filter(branch=branch, invoice_number__startswith=prefix).count()
                    seq.last_sequence = count

            seq.last_sequence += 1
            
            # Ensure the generated sequence doesn't conflict with manually created records
            while True:
                candidate = f"{prefix}-{seq.last_sequence:04d}"
                if document_type == 'INVOICE':
                    from .models import FeeInvoice
                    if not FeeInvoice.objects.filter(branch=branch, invoice_number=candidate).exists():
                        break
                elif document_type == 'RECEIPT':
                    from .models import Payment
                    if not Payment.objects.filter(branch=branch, receipt_number=candidate).exists():
                        break
                else:
                    break
                seq.last_sequence += 1

            seq.save()
            return f"{prefix}-{seq.last_sequence:04d}"


# ─── FeeCategory ────────────────────────────────────────────────
class FeeCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='fee_categories')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='fee_categories')
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['branch', 'code']
        ordering = ['order']

    def __str__(self):
        return f"{self.code} - {self.name}"


# ─── FeeStructure ───────────────────────────────────────────────
class FeeStructure(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='fee_structures')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='fee_structures')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='fee_structures', db_index=True)
    grade = models.CharField(max_length=20, db_index=True)
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    is_finalized = models.BooleanField(default=False)
    finalized_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='finalized_fee_structures'
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_fee_structures')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['branch', 'academic_year', 'grade']

    def __str__(self):
        return self.name


class FeeStructureItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    structure = models.ForeignKey(FeeStructure, on_delete=models.CASCADE, related_name='items')
    category = models.ForeignKey(FeeCategory, on_delete=models.CASCADE, related_name='structure_items')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    locked_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    frequency = models.CharField(max_length=15, choices=FREQUENCY_CHOICES)
    due_day = models.PositiveIntegerField(null=True, blank=True)
    is_optional = models.BooleanField(default=False)

    class Meta:
        unique_together = ['structure', 'category']

    def __str__(self):
        return f"{self.category.name}: ₹{self.amount} ({self.frequency})"


# ─── StudentWallet ──────────────────────────────────────────────
class StudentWallet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.OneToOneField('students.Student', on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Wallet: {self.student} (₹{self.balance})"


class WalletTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(StudentWallet, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=10, choices=WALLET_TX_TYPE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reference_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


# ─── FeeConcession ──────────────────────────────────────────────
class FeeConcession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='fee_concessions')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='fee_concessions')
    name = models.CharField(max_length=200)
    concession_type = models.CharField(max_length=20, choices=CONCESSION_TYPE)
    discount_type = models.CharField(max_length=15, choices=DISCOUNT_TYPE)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    applies_to_categories = models.ManyToManyField(FeeCategory, blank=True, related_name='concessions')
    requires_approval = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class StudentConcession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='concessions')
    concession = models.ForeignKey(FeeConcession, on_delete=models.CASCADE, related_name='student_concessions')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    valid_from = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=CONCESSION_STATUS, default='PENDING')
    notes = models.TextField(blank=True, null=True)


# ─── LateFeeRule ────────────────────────────────────────────────
class LateFeeRule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='late_fee_rules')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='late_fee_rules')
    fee_category = models.ForeignKey(FeeCategory, on_delete=models.CASCADE, null=True, blank=True)
    grace_period_days = models.PositiveIntegerField(default=5)
    penalty_type = models.CharField(max_length=15, choices=DISCOUNT_TYPE)
    penalty_value = models.DecimalField(max_digits=10, decimal_places=2)
    max_penalty = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Late Fee: {self.penalty_value} ({self.penalty_type})"


# ─── FeeInvoice ─────────────────────────────────────────────────
class FeeInvoice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='fee_invoices')
    invoice_number = models.CharField(max_length=30)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='invoices')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='invoices')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='invoices', db_index=True)
    month = models.CharField(max_length=7, blank=True, null=True, db_index=True)
    # Amounts
    gross_amount = models.DecimalField(max_digits=10, decimal_places=2)
    concession_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    late_fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=10, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    outstanding_amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Dates
    due_date = models.DateField()
    issued_date = models.DateField(auto_now_add=True)
    # Status
    status = models.CharField(max_length=20, choices=INVOICE_STATUS, default='DRAFT', db_index=True)
    # Admin
    generated_by = models.CharField(max_length=10, choices=GENERATED_BY, default='AUTO')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_invoices')
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='cancelled_invoices')
    cancellation_reason = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['branch', 'invoice_number']
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['student', 'month']),
            models.Index(fields=['branch', 'status', 'due_date']),
            models.Index(fields=['tenant', 'status', 'outstanding_amount']),
        ]
    def __str__(self):
        return f"{self.invoice_number} - {self.student}"


class FeeInvoiceItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(FeeInvoice, on_delete=models.CASCADE, related_name='items')
    category = models.ForeignKey(FeeCategory, on_delete=models.CASCADE, related_name='invoice_items')
    original_amount = models.DecimalField(max_digits=10, decimal_places=2)
    concession = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    final_amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=200, blank=True, null=True)


# ─── Payment ────────────────────────────────────────────────────
class Payment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='payments')
    invoice = models.ForeignKey(FeeInvoice, on_delete=models.CASCADE, related_name='payments')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='payments')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_mode = models.CharField(max_length=10, choices=PAYMENT_MODE)
    payment_date = models.DateField()
    # Online Payment
    razorpay_order_id = models.CharField(max_length=100, blank=True, null=True)
    razorpay_payment_id = models.CharField(max_length=100, blank=True, null=True)
    razorpay_signature = models.CharField(max_length=255, blank=True, null=True)
    # Offline Payment
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    bank_name = models.CharField(max_length=100, blank=True, null=True)
    # Status
    status = models.CharField(max_length=10, choices=PAYMENT_STATUS, default='PENDING')
    collected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='collected_payments')
    # Approval
    requires_approval = models.BooleanField(default=False)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_payments')
    approved_at = models.DateTimeField(null=True, blank=True)
    # Receipt
    receipt_number = models.CharField(max_length=30, blank=True, null=True, unique=True)
    receipt_url = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Preventing Double Processing
    idempotency_key = models.CharField(max_length=255, blank=True, null=True, help_text="Ensures exactly-once payment processing.")

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['invoice', 'status']),
            models.Index(fields=['branch', 'payment_date']),
            models.Index(fields=['idempotency_key']),
        ]
        unique_together = [['tenant', 'idempotency_key']]
        constraints = [
            models.UniqueConstraint(
                fields=['razorpay_payment_id'],
                name='unique_razorpay_payment_id',
                condition=models.Q(razorpay_payment_id__isnull=False),
            ),
        ]

    def __str__(self):
        return f"Payment {self.receipt_number}: ₹{self.amount} ({self.status})"


# ─── StudentFeeItem ─────────────────────────────────────────────
class StudentFeeItem(models.Model):
    """Locks the agreed fee amount for a student for the academic year."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='fee_items')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE)
    category = models.ForeignKey(FeeCategory, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    is_locked = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['student', 'academic_year', 'category']

    def __str__(self):
        return f"{self.student} - {self.category.name}: ₹{self.amount}"


# ─── FeeApprovalRequest ─────────────────────────────────────────
class FeeApprovalRequest(models.Model):
    """Workflow for fee reductions reviewed by zonal admin (small discount) or tenant super admin."""
    APPROVAL_STATUS = [("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected")]
    ROUTING_ZONAL = 'ZONAL'
    ROUTING_TENANT_SUPER = 'TENANT_SUPER'
    ROUTING_CHOICES = [
        (ROUTING_ZONAL, 'Zonal admin'),
        (ROUTING_TENANT_SUPER, 'Tenant super admin'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE)
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='fee_approvals')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='requested_fee_approvals')
    
    standard_total = models.DecimalField(max_digits=10, decimal_places=2)
    offered_total = models.DecimalField(max_digits=10, decimal_places=2)
    discount_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='standard_total − offered_total at request time',
    )
    routing = models.CharField(
        max_length=20,
        choices=ROUTING_CHOICES,
        default=ROUTING_TENANT_SUPER,
    )
    reason = models.TextField(blank=True)
    
    status = models.CharField(max_length=15, choices=APPROVAL_STATUS, default='PENDING')
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_fee_approvals')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Fee Approval: {self.student} (₹{self.offered_total} < ₹{self.standard_total})"


# ─── FeeCarryForward ────────────────────────────────────────────
class FeeCarryForward(models.Model):
    """Immutable record of dues carried from one academic year to the next."""
    CARRY_FORWARD_STATUS = [
        ('PENDING', 'Pending'), ('PARTIALLY_PAID', 'Partially Paid'),
        ('PAID', 'Paid'), ('WRITTEN_OFF', 'Written Off'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='fee_carry_forwards')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='fee_carry_forwards')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='carry_forwards')
    source_academic_year = models.ForeignKey(
        'tenants.AcademicYear', on_delete=models.PROTECT, related_name='outgoing_carry_forwards'
    )
    target_academic_year = models.ForeignKey(
        'tenants.AcademicYear', on_delete=models.PROTECT, related_name='incoming_carry_forwards'
    )
    source_record = models.ForeignKey(
        'students.StudentAcademicRecord', on_delete=models.PROTECT,
        related_name='carry_forwards', null=True, blank=True
    )

    # Financial snapshot — immutable after creation
    total_fee_amount = models.DecimalField(max_digits=12, decimal_places=2)
    total_paid_amount = models.DecimalField(max_digits=12, decimal_places=2)
    carry_forward_amount = models.DecimalField(max_digits=12, decimal_places=2)

    # Resolution tracking
    status = models.CharField(max_length=20, choices=CARRY_FORWARD_STATUS, default='PENDING')
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    written_off_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='created_carry_forwards'
    )

    class Meta:
        unique_together = ['student', 'source_academic_year', 'target_academic_year']
        ordering = ['source_academic_year__start_date']
        indexes = [
            models.Index(fields=['student', 'status']),
            models.Index(fields=['target_academic_year', 'status']),
        ]

    def __str__(self):
        return f"CF: {self.student} {self.source_academic_year} → {self.target_academic_year} (₹{self.carry_forward_amount})"

    @property
    def remaining_amount(self):
        return self.carry_forward_amount - self.paid_amount - self.written_off_amount


# ─── PaymentAllocation ──────────────────────────────────────────
class PaymentAllocation(models.Model):
    """Tracks exactly where each rupee of a payment was allocated."""
    ALLOCATION_TYPE = [
        ('CURRENT_YEAR', 'Current Year Fee'),
        ('PREVIOUS_YEAR_DUES', 'Previous Year Dues'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='allocations')
    invoice = models.ForeignKey(FeeInvoice, on_delete=models.CASCADE, null=True, blank=True, related_name='payment_allocations')
    carry_forward = models.ForeignKey(FeeCarryForward, on_delete=models.CASCADE, null=True, blank=True, related_name='payment_allocations')
    allocated_amount = models.DecimalField(max_digits=10, decimal_places=2)
    allocation_type = models.CharField(max_length=25, choices=ALLOCATION_TYPE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['payment']),
            models.Index(fields=['invoice']),
            models.Index(fields=['carry_forward']),
        ]

    def __str__(self):
        target = self.invoice or self.carry_forward
        return f"Alloc: ₹{self.allocated_amount} → {target}"


# ─── FeeWriteOff ────────────────────────────────────────────────
class FeeWriteOff(models.Model):
    """Tracked, approved write-off of unpaid fees — never silently removed."""
    WRITEOFF_STATUS = [
        ('PENDING', 'Pending Approval'), ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'), ('EXECUTED', 'Executed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='fee_write_offs')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='fee_write_offs')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='write_offs')
    invoice = models.ForeignKey(FeeInvoice, on_delete=models.CASCADE, null=True, blank=True, related_name='write_offs')
    carry_forward = models.ForeignKey(FeeCarryForward, on_delete=models.CASCADE, null=True, blank=True, related_name='write_offs')

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.TextField()

    status = models.CharField(max_length=15, choices=WRITEOFF_STATUS, default='PENDING')
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='requested_writeoffs'
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approved_writeoffs'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    executed_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"WriteOff: {self.student} ₹{self.amount} ({self.status})"


# ─── AcademicYearClosingLog ─────────────────────────────────────
class AcademicYearClosingLog(models.Model):
    """Audit trail for academic year closing process."""
    CLOSING_STATUS = [
        ('IN_PROGRESS', 'In Progress'), ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'), ('ROLLED_BACK', 'Rolled Back'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='closing_logs')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='closing_logs')
    target_academic_year = models.ForeignKey(
        'tenants.AcademicYear', on_delete=models.CASCADE, related_name='incoming_closing_logs'
    )

    status = models.CharField(max_length=20, choices=CLOSING_STATUS, default='IN_PROGRESS')

    # Statistics
    total_students = models.IntegerField(default=0)
    promoted_count = models.IntegerField(default=0)
    detained_count = models.IntegerField(default=0)
    dropout_count = models.IntegerField(default=0)
    graduated_count = models.IntegerField(default=0)
    carry_forwards_created = models.IntegerField(default=0)
    total_carry_forward_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='initiated_closings'
    )
    initiated_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_details = models.JSONField(default=dict)

    class Meta:
        ordering = ['-initiated_at']

    def __str__(self):
        return f"Closing: {self.academic_year} ({self.status})"
