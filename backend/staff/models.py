import uuid
from django.db import models, transaction
from django.conf import settings

class StaffCategory(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='staff_categories')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='staff_categories')
    name = models.CharField(max_length=150)
    is_teaching_role = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('branch', 'name')
    
    def __str__(self):
        return self.name

class Department(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='departments')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='departments')
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('branch', 'name')

    def __str__(self):
        return self.name

class Designation(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='designations')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='designations')
    category = models.ForeignKey(StaffCategory, on_delete=models.CASCADE, related_name='designations', null=True, blank=True)
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('branch', 'name')

    def __str__(self):
        return self.name

class Qualification(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='qualifications')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='qualifications')
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('branch', 'name')

    def __str__(self):
        return self.name

class Specialization(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='specializations')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='specializations')
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('branch', 'name')

    def __str__(self):
        return self.name

class StaffIdCounter(models.Model):
    branch = models.OneToOneField('tenants.Branch', on_delete=models.CASCADE, related_name='staff_id_counter')
    last_seq = models.PositiveIntegerField(default=0)


class StaffProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='staff_profiles')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='staff_profiles')
    
    # Nullable User!
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff_profile')
    
    employee_id = models.CharField(max_length=50, unique=True, blank=True)
    
    # Legacy fields
    qualification = models.CharField(max_length=200, blank=True)
    specialization = models.CharField(max_length=200, blank=True)
    
    # New HR Data
    status = models.CharField(
        max_length=20, 
        choices=[('ACTIVE','Active'), ('INACTIVE','Inactive'), ('RESIGNED','Resigned')], 
        default='ACTIVE'
    )
    photo_url = models.URLField(blank=True, null=True)
    
    # Work Info
    category = models.ForeignKey(StaffCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    designation = models.ForeignKey(Designation, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    qualification_ref = models.ForeignKey(Qualification, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    specialization_ref = models.ForeignKey(Specialization, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    
    employment_type = models.CharField(
        max_length=20, 
        choices=[('REGULAR','Regular'), ('CONTRACT','Contract'), ('TEMPORARY','Temporary')], 
        default='REGULAR'
    )
    experience_years = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    reporting_manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='reportees')
    
    # Personal & Govt
    gender = models.CharField(max_length=15, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    blood_group = models.CharField(max_length=10, blank=True)
    religion = models.CharField(max_length=50, blank=True)
    marital_status = models.CharField(
        max_length=20,
        choices=[('SINGLE','Single'), ('MARRIED','Married'), ('WIDOWED','Widowed'), ('DIVORCED','Divorced')],
        blank=True
    )
    father_name = models.CharField(max_length=200, blank=True)
    mother_name = models.CharField(max_length=200, blank=True)
    spouse_name = models.CharField(max_length=200, blank=True)

    # Govt IDs
    aadhar_number = models.CharField(max_length=12, blank=True)  # legacy spelling, kept for migration safety
    aadhaar_number = models.CharField(max_length=12, blank=True)  # canonical spelling from Phase-4 form
    pan_number = models.CharField(max_length=10, blank=True)
    pf_number = models.CharField(max_length=20, blank=True)
    uan_number = models.CharField(max_length=20, blank=True)
    esi_number = models.CharField(max_length=20, blank=True)
    
    # Bank Details
    bank_name = models.CharField(max_length=200, blank=True)
    bank_account_number = models.CharField(max_length=50, blank=True)
    ifsc_code = models.CharField(max_length=15, blank=True)
    
    # Contact
    mobile = models.CharField(max_length=15, blank=True)
    alternate_mobile = models.CharField(max_length=15, blank=True)
    personal_email = models.EmailField(blank=True)  # personal/contact email (separate from portal login email)
    address = models.TextField(blank=True)  # legacy single address field
    current_address = models.TextField(blank=True)
    permanent_address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=10, blank=True)
    emergency_contact_name = models.CharField(max_length=200, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)
    emergency_contact_number = models.CharField(max_length=15, blank=True)  # frontend sends this name
    
    joining_date = models.DateField(null=True, blank=True)
    bio = models.TextField(blank=True)
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.employee_id and self.branch:
            with transaction.atomic():
                counter, _ = StaffIdCounter.objects.select_for_update().get_or_create(branch=self.branch)
                counter.last_seq += 1
                counter.save()
                branch_code = self.branch.branch_code.strip().upper()
                staff_code = self.branch.staff_code.strip().upper() if self.branch.staff_code else '01'
                self.employee_id = f"{branch_code}{staff_code}{counter.last_seq:03d}"
                
        super().save(*args, **kwargs)

    def __str__(self):
        name = "Unknown"
        if self.user:
            name = f"{self.user.first_name} {self.user.last_name}"
        return f"{name} ({self.employee_id})"


class TeacherAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='teacher_assignments')
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='assignments')
    class_section = models.ForeignKey('students.ClassSection', on_delete=models.CASCADE, related_name='teacher_assignments')
    subject = models.ForeignKey('timetable.Subject', on_delete=models.CASCADE, related_name='teacher_assignments')
    is_class_teacher = models.BooleanField(default=False)
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='teacher_assignments')

    class Meta:
        unique_together = ('class_section', 'subject', 'academic_year') 

    def __str__(self):
        return f"{self.staff} -> {self.class_section} ({self.subject.name})"

# ALIAS for backwards compatibility
TeacherProfile = StaffProfile
