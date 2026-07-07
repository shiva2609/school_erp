import uuid
from django.db import models
from django.conf import settings


GRADE_CHOICES = [
    ("NURSERY", "Nursery"), ("LKG", "LKG"), ("UKG", "UKG"),
    ("1", "Grade 1"), ("2", "Grade 2"), ("3", "Grade 3"),
    ("4", "Grade 4"), ("5", "Grade 5"), ("6", "Grade 6"),
    ("7", "Grade 7"), ("8", "Grade 8"), ("9", "Grade 9"),
    ("10", "Grade 10"),
    ("11_SCIENCE", "Grade 11 Science"), ("11_COMMERCE", "Grade 11 Commerce"), ("11_ARTS", "Grade 11 Arts"),
    ("12_SCIENCE", "Grade 12 Science"), ("12_COMMERCE", "Grade 12 Commerce"), ("12_ARTS", "Grade 12 Arts"),
]

GENDER_CHOICES = [("MALE", "Male"), ("FEMALE", "Female"), ("OTHER", "Other")]
BLOOD_GROUP_CHOICES = [
    ("A+", "A+"), ("A-", "A-"), ("B+", "B+"), ("B-", "B-"),
    ("AB+", "AB+"), ("AB-", "AB-"), ("O+", "O+"), ("O-", "O-"), ("UNKNOWN", "Unknown"),
]
CASTE_CHOICES = [("OC", "Open Category"), ("BC", "Backward Class"), ("SC", "Scheduled Caste"), ("ST", "Scheduled Tribe"), ("OTHER", "Other")]
INCOME_CHOICES = [
    ("BELOW_2L", "Below 2 Lakh"), ("2L_5L", "2-5 Lakh"), ("5L_10L", "5-10 Lakh"),
    ("10L_20L", "10-20 Lakh"), ("ABOVE_20L", "Above 20 Lakh"),
]
DOC_TYPES = [
    ("BIRTH_CERTIFICATE", "Birth Certificate"), ("PASSPORT_PHOTO", "Passport Photo"),
    ("AADHAR_CARD", "Aadhar Card"), ("PREVIOUS_MARKSHEET", "Previous Marksheet"),
    ("TRANSFER_CERTIFICATE", "Transfer Certificate"), ("INCOME_PROOF", "Income Proof"),
    ("CASTE_CERTIFICATE", "Caste Certificate"), ("MEDICAL_CERTIFICATE", "Medical Certificate"),
    ("OTHER", "Other"),
]
INQUIRY_STATUS = [("NEW", "New"), ("CONTACTED", "Contacted"), ("CONVERTED", "Converted"), ("LOST", "Lost")]
INQUIRY_SOURCE = [
    ("WALK_IN", "Walk In"), ("WEBSITE", "Website"), ("REFERRAL", "Referral"),
    ("SOCIAL_MEDIA", "Social Media"), ("OTHER", "Other"),
]
APPLICATION_STATUS = [
    ("DRAFT", "Draft"), ("SUBMITTED", "Submitted"), ("UNDER_REVIEW", "Under Review"),
    ("APPROVED", "Approved"), ("REJECTED", "Rejected"), ("ENROLLED", "Enrolled"),
]
STUDENT_STATUS = [
    ("ACTIVE", "Active"), ("PENDING_APPROVAL", "Pending Approval"), ("INACTIVE", "Inactive"),
    ("TRANSFERRED", "Transferred"), ("GRADUATED", "Graduated"), ("DETAINED", "Detained"),
    ("DROPOUT", "Dropout"),
    ("ARCHIVED", "Archived"),
]
RELATION_TYPE = [
    ("FATHER", "Father"), ("MOTHER", "Mother"), ("GUARDIAN", "Guardian"),
    ("SIBLING", "Sibling"), ("OTHER", "Other"),
]


# ─── ClassSection ────────────────────────────────────────────────
class ClassSection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='class_sections')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='class_sections')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='class_sections', db_index=True)
    grade = models.CharField(max_length=50, choices=GRADE_CHOICES, db_index=True)
    section = models.CharField(max_length=50)
    display_name = models.CharField(max_length=50, blank=True)
    class_teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='class_teacher_of'
    )
    max_capacity = models.PositiveIntegerField(default=40)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ['branch', 'academic_year', 'grade', 'section']
        ordering = ['grade', 'section']

    def save(self, *args, **kwargs):
        if not self.display_name:
            # get_grade_display already includes "Grade " as per choices
            self.display_name = f"{self.get_grade_display()} - Section {self.section}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.display_name


# ─── AdmissionInquiry ────────────────────────────────────────────
class AdmissionInquiry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='inquiries')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='inquiries')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='inquiries')
    student_first_name = models.CharField(max_length=100)
    student_last_name = models.CharField(max_length=100, blank=True, null=True)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    grade_applying_for = models.CharField(max_length=20, choices=GRADE_CHOICES)
    parent_name = models.CharField(max_length=200)
    parent_phone = models.CharField(max_length=15)
    parent_email = models.EmailField()
    source = models.CharField(max_length=20, choices=INQUIRY_SOURCE, default='WEBSITE')
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=INQUIRY_STATUS, default='NEW')
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_inquiries'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Inquiry: {self.student_first_name} {self.student_last_name} ({self.status})"


# ─── AdmissionApplication ───────────────────────────────────────
class AdmissionApplication(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='applications')
    inquiry = models.ForeignKey(AdmissionInquiry, on_delete=models.SET_NULL, null=True, blank=True, related_name='applications')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='applications')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='applications')
    status = models.CharField(max_length=20, choices=APPLICATION_STATUS, default='DRAFT')
    # Student Info
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    blood_group = models.CharField(max_length=10, choices=BLOOD_GROUP_CHOICES, default='UNKNOWN')
    nationality = models.CharField(max_length=100, default='Indian')
    religion = models.CharField(max_length=100, blank=True, null=True)
    caste_category = models.CharField(max_length=10, choices=CASTE_CHOICES, blank=True, null=True)
    aadhar_number = models.CharField(max_length=12, blank=True, null=True)
    grade_applying_for = models.CharField(max_length=20, choices=GRADE_CHOICES)
    # Student Extra Info
    mother_tongue = models.CharField(max_length=50, blank=True, null=True)
    identification_mark_1 = models.CharField(max_length=255, blank=True, null=True)
    identification_mark_2 = models.CharField(max_length=255, blank=True, null=True)
    health_status = models.TextField(blank=True, null=True)
    # Father Info
    father_name = models.CharField(max_length=200, blank=True, null=True)
    father_phone = models.CharField(max_length=15, blank=True, null=True)
    father_email = models.EmailField(blank=True, null=True)
    father_qualification = models.CharField(max_length=200, blank=True, null=True)
    father_occupation = models.CharField(max_length=200, blank=True, null=True)
    father_aadhaar = models.CharField(max_length=12, blank=True, null=True)
    father_annual_income = models.CharField(max_length=20, choices=INCOME_CHOICES, blank=True, null=True)
    # Mother Info
    mother_name = models.CharField(max_length=200, blank=True, null=True)
    mother_phone = models.CharField(max_length=15, blank=True, null=True)
    mother_email = models.EmailField(blank=True, null=True)
    mother_qualification = models.CharField(max_length=200, blank=True, null=True)
    mother_occupation = models.CharField(max_length=200, blank=True, null=True)
    mother_aadhaar = models.CharField(max_length=12, blank=True, null=True)
    # Guardian Info
    guardian_name = models.CharField(max_length=200, blank=True, null=True)
    guardian_phone = models.CharField(max_length=15, blank=True, null=True)
    guardian_relation = models.CharField(max_length=100, blank=True, null=True)
    # Address
    address_line1 = models.CharField(max_length=255) # Plot/House No
    apartment_name = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True) # Colony/Area
    landmark = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100) # City/Village
    mandal = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=6)
    # Previous School
    previous_school_name = models.CharField(max_length=200, blank=True, null=True)
    previous_class = models.CharField(max_length=20, blank=True, null=True)
    previous_school_ay = models.CharField(max_length=20, blank=True, null=True)
    reason_for_leaving = models.TextField(blank=True, null=True)
    # Document Checklist
    doc_tc_submitted = models.BooleanField(default=False)
    doc_bonafide_submitted = models.BooleanField(default=False)
    doc_birth_cert_submitted = models.BooleanField(default=False)
    doc_caste_cert_submitted = models.BooleanField(default=False)
    doc_aadhaar_submitted = models.BooleanField(default=False)
    # Admission Staff
    admission_staff_name = models.CharField(max_length=200, blank=True, null=True)
    admission_staff_phone = models.CharField(max_length=15, blank=True, null=True)
    # Existing Fields Preserved
    emergency_contact_name = models.CharField(max_length=200, blank=True, null=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True, null=True)
    emergency_contact_relation = models.CharField(max_length=100, blank=True, null=True)
    has_medical_condition = models.BooleanField(default=False)
    medical_details = models.TextField(blank=True, null=True)
    allergies = models.TextField(blank=True, null=True)
    doctor_name = models.CharField(max_length=200, blank=True, null=True)
    doctor_phone = models.CharField(max_length=15, blank=True, null=True)
    # Admin & Fees
    sibling_link = models.ForeignKey('Student', on_delete=models.SET_NULL, null=True, blank=True, related_name='sibling_applications')
    application_fee_paid = models.BooleanField(default=False)
    application_fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    source = models.CharField(max_length=20, choices=INQUIRY_SOURCE, default='WALK_IN')
    remarks = models.TextField(blank=True, null=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_applications')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        name = f"{self.first_name} {self.last_name}".strip() if self.last_name else self.first_name
        return f"Application: {name} ({self.status})"


# ─── ApplicationDocument ────────────────────────────────────────
class ApplicationDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(AdmissionApplication, on_delete=models.CASCADE, related_name='documents')
    doc_type = models.CharField(max_length=30, choices=DOC_TYPES)
    file_url = models.URLField()
    file_name = models.CharField(max_length=255)
    file_size_kb = models.PositiveIntegerField()
    expiry_date = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_verified = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.get_doc_type_display()} - {self.file_name}"


# ─── Student ────────────────────────────────────────────────────
class Student(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='students')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='students')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='students', db_index=True)
    admission_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    # Preserves the number from a legacy CSV/SIS when the platform assigns admission_number per tenant format.
    legacy_admission_number = models.CharField(max_length=64, blank=True, default='')
    # Personal
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    blood_group = models.CharField(max_length=10, choices=BLOOD_GROUP_CHOICES, default='UNKNOWN')
    nationality = models.CharField(max_length=100, default='Indian')
    religion = models.CharField(max_length=100, blank=True, null=True)
    caste_category = models.CharField(max_length=10, choices=CASTE_CHOICES, blank=True, null=True)
    aadhar_number = models.CharField(max_length=12, blank=True, null=True)
    mother_tongue = models.CharField(max_length=50, blank=True, null=True)
    identification_mark_1 = models.CharField(max_length=255, blank=True, null=True)
    identification_mark_2 = models.CharField(max_length=255, blank=True, null=True)
    health_status = models.TextField(blank=True, null=True)
    # Previous School Details
    previous_school_name = models.CharField(max_length=200, blank=True, null=True)
    previous_class = models.CharField(max_length=20, blank=True, null=True)
    previous_school_ay = models.CharField(max_length=20, blank=True, null=True)
    # Emergency Contact
    emergency_contact_name = models.CharField(max_length=200, blank=True, null=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True, null=True)
    emergency_contact_relation = models.CharField(max_length=100, blank=True, null=True)
    # Document Checklist
    doc_tc_submitted = models.BooleanField(default=False)
    doc_bonafide_submitted = models.BooleanField(default=False)
    doc_birth_cert_submitted = models.BooleanField(default=False)
    doc_caste_cert_submitted = models.BooleanField(default=False)
    doc_aadhaar_submitted = models.BooleanField(default=False)
    # Father Info
    father_name = models.CharField(max_length=200, blank=True, null=True)
    father_phone = models.CharField(max_length=15, blank=True, null=True)
    father_email = models.EmailField(blank=True, null=True)
    father_qualification = models.CharField(max_length=200, blank=True, null=True)
    father_occupation = models.CharField(max_length=200, blank=True, null=True)
    father_aadhaar = models.CharField(max_length=12, blank=True, null=True)
    # Mother Info
    mother_name = models.CharField(max_length=200, blank=True, null=True)
    mother_phone = models.CharField(max_length=15, blank=True, null=True)
    mother_email = models.EmailField(blank=True, null=True)
    mother_qualification = models.CharField(max_length=200, blank=True, null=True)
    mother_occupation = models.CharField(max_length=200, blank=True, null=True)
    mother_aadhaar = models.CharField(max_length=12, blank=True, null=True)
    # Guardian Info
    guardian_name = models.CharField(max_length=200, blank=True, null=True)
    guardian_phone = models.CharField(max_length=15, blank=True, null=True)
    guardian_relation = models.CharField(max_length=100, blank=True, null=True)
    # Address
    address_line1 = models.CharField(max_length=255, blank=True, null=True)
    apartment_name = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    landmark = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    mandal = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    pincode = models.CharField(max_length=6, blank=True, null=True)
    # Admin Staff
    admission_staff_name = models.CharField(max_length=200, blank=True, null=True)
    admission_staff_phone = models.CharField(max_length=15, blank=True, null=True)
    # Photo
    photo_url = models.URLField(blank=True, null=True)
    # Academic
    class_section = models.ForeignKey(ClassSection, on_delete=models.SET_NULL, null=True, blank=True, related_name='students')
    roll_number = models.PositiveIntegerField(null=True, blank=True)
    # Status
    status = models.CharField(max_length=20, choices=STUDENT_STATUS, default='ACTIVE', db_index=True)
    enrollment_date = models.DateField(auto_now_add=True)
    leaving_date = models.DateField(null=True, blank=True)
    leaving_reason = models.TextField(blank=True, null=True)
    admission_fee_marked_paid_earlier = models.BooleanField(default=False)
    fixed_deposit_marked_paid_earlier = models.BooleanField(default=False)
    admission_fee_marked_paid_at = models.DateTimeField(null=True, blank=True)
    fixed_deposit_marked_paid_at = models.DateTimeField(null=True, blank=True)
    # Source
    application = models.ForeignKey(AdmissionApplication, on_delete=models.SET_NULL, null=True, blank=True, related_name='enrolled_student')
    # Audit
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_students')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['branch', 'academic_year', 'admission_number']
        ordering = ['class_section', 'roll_number', 'first_name']
        indexes = [
            models.Index(fields=['tenant', 'branch', 'academic_year', 'status']),
            models.Index(fields=['branch', 'class_section', 'status']),
        ]

    @staticmethod
    def generate_admission_number(branch, academic_year):
        from django.db import transaction
        
        tenant = branch.tenant
        fmt = tenant.admission_no_format
        prefix = tenant.admission_no_prefix or ""
        year_str = academic_year.name.split('-')[0]
        
        # Determine the prefix base for sequence searching
        if fmt == 'YEAR_BRANCH_SEQ':
            base = f"{year_str}/{branch.branch_code}/"
        elif fmt == 'BRANCH_YEAR_SEQ':
            base = f"{branch.branch_code}/{year_str}/"
        elif fmt == 'YEAR_SEQ':
            base = f"{year_str}/"
        elif fmt == 'PREFIX_SEQ':
            base = f"{prefix}-" if prefix else ""
        else:
            base = f"{year_str}-{branch.branch_code}-" # Fallback

        # GLOBAL SEARCH with row-level lock on the Tenant to prevent duplicate admission numbers
        # This strictly serializes admission number generation across all concurrent requests for this tenant.
        with transaction.atomic():
            _ = type(tenant).objects.select_for_update().get(id=tenant.id)
            
            students = Student.objects.filter(
                tenant=tenant,
                admission_number__startswith=base
            ).values_list('admission_number', flat=True)
            
            max_seq = 0
            import re
            for adm_num in students:
                match = re.search(r'(\d+)$', adm_num)
                if match:
                    seq = int(match.group(1))
                    if seq > max_seq:
                        max_seq = seq
        
        return f"{base}{max_seq + 1:03d}"

    def __str__(self):
        name = f"{self.first_name} {self.last_name}".strip() if self.last_name else self.first_name
        return f"{self.admission_number} - {name}"

    @property
    def primary_parent(self):
        rel = self.parent_relations.filter(is_primary=True).first()
        return rel.parent if rel else None

    @property
    def father(self):
        rel = self.parent_relations.filter(relation_type='FATHER').first()
        return rel.parent if rel else None

    @property
    def mother(self):
        rel = self.parent_relations.filter(relation_type='MOTHER').first()
        return rel.parent if rel else None


# ─── ParentStudentRelation ──────────────────────────────────────
class ParentStudentRelation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='children_relations')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='parent_relations')
    relation_type = models.CharField(max_length=20, choices=RELATION_TYPE)
    is_primary = models.BooleanField(default=False)
    can_pickup = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['parent', 'student']

    def save(self, *args, **kwargs):
        # Auto-set as primary if no primary exists for this student
        if not self.is_primary:
            existing_primary = ParentStudentRelation.objects.filter(
                student=self.student, is_primary=True
            ).exclude(pk=self.pk).exists()
            if not existing_primary:
                self.is_primary = True
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.parent.email} → {self.student.first_name} ({self.relation_type})"


# ─── StudentAcademicRecord ───────────────────────────────────────
class StudentAcademicRecord(models.Model):
    """Per-year snapshot of a student's academic placement. Never overwritten."""
    RECORD_STATUS = [
        ('ACTIVE', 'Active'),
        ('PROMOTED', 'Promoted'),
        ('DETAINED', 'Detained'),
        ('DROPOUT', 'Dropout'),
        ('TRANSFERRED', 'Transferred'),
        ('GRADUATED', 'Graduated'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='academic_records')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.PROTECT, related_name='student_records')
    class_section = models.ForeignKey(ClassSection, on_delete=models.PROTECT, null=True, blank=True, related_name='academic_records')
    roll_number = models.PositiveIntegerField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=RECORD_STATUS, default='ACTIVE')

    # Promotion chain — links to the record this was promoted FROM
    promoted_from = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='promoted_to'
    )

    # Audit
    status_changed_at = models.DateTimeField(null=True, blank=True)
    status_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='status_changes'
    )
    status_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['student', 'academic_year']
        ordering = ['-academic_year__start_date']
        indexes = [
            models.Index(fields=['academic_year', 'status']),
            models.Index(fields=['class_section', 'status']),
            models.Index(fields=['student', 'academic_year']),
        ]

    def __str__(self):
        cs = self.class_section.display_name if self.class_section else 'Unassigned'
        return f"{self.student.admission_number} — {self.academic_year.name} — {cs} ({self.status})"


# ─── ClassPromotionMap ─────────────────────────────────────────
class ClassPromotionMap(models.Model):
    """Defines grade-to-grade promotion mapping for a branch and year."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='promotion_maps')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='promotion_maps')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='promotion_maps')
    from_grade = models.CharField(max_length=50, choices=GRADE_CHOICES)
    to_grade = models.CharField(max_length=50, choices=GRADE_CHOICES)

    class Meta:
        unique_together = ['branch', 'academic_year', 'from_grade']
        ordering = ['from_grade']

    def __str__(self):
        return f"{self.from_grade} → {self.to_grade} ({self.academic_year.name})"


# ─── CsvImportJob ──────────────────────────────────────────────
class CsvImportJob(models.Model):
    """Tracks background CSV import jobs via Celery."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='csv_import_jobs')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='csv_import_jobs', null=True, blank=True)
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='csv_import_jobs', null=True, blank=True)
    
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed')
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    file = models.FileField(upload_to='csv_imports/')
    
    total_rows = models.PositiveIntegerField(default=0)
    processed_rows = models.PositiveIntegerField(default=0)
    success_count = models.PositiveIntegerField(default=0)
    skipped_duplicates = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    
    update_student_details = models.BooleanField(default=False)
    update_fee_details = models.BooleanField(default=False)
    
    error_log = models.JSONField(default=list, blank=True)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='csv_import_jobs')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"CSV Import Job {self.id} ({self.status})"
