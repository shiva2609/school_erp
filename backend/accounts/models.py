import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'OWNER')
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = (
        ('OWNER', 'Owner (Platform Level)'),
        ('SUPER_ADMIN', 'Super Admin (Organization / Tenant)'),
        ('ZONAL_ADMIN', 'Zonal Admin'),
        ('CHIEF_ACCOUNTANT', 'Chief Accountant'),
        ('PRINCIPAL', 'Principal'),
        ('BRANCH_ADMIN', 'Branch Admin (School Level)'),
        ('ACCOUNTANT', 'Accountant'),
        ('TEACHER', 'Teacher'),
        ('STUDENT', 'Student'),
        ('PARENT', 'Parent'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, null=True, blank=True, related_name='users')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    zones = models.ManyToManyField('tenants.Zone', through='UserZoneAccess', blank=True, related_name='users')
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    email = models.EmailField(unique=True) 
    phone = models.CharField(max_length=15, blank=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    must_change_password = models.BooleanField(
        default=False,
        help_text='Forces the user to change their password on next login.'
    )
    mfa_totp_secret = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text='Base32 TOTP secret (empty until the user enrolls in MFA).',
    )
    mfa_enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name', 'role']

    def __str__(self):
        return f"{self.email} ({self.role})"


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='audit_logs')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=50)  # CREATE, UPDATE, DELETE, APPROVE, REJECT, REVERSE
    model_name = models.CharField(max_length=50)
    record_id = models.UUIDField()
    details = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class BulkActionLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='bulk_action_logs')
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='bulk_action_logs')
    action_type = models.CharField(max_length=50) # FEE_REMINDER, EXPENSE_APPROVAL
    record_count = models.IntegerField()
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class UserZoneAccess(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='zone_accesses')
    zone = models.ForeignKey('tenants.Zone', on_delete=models.CASCADE, related_name='user_accesses')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'zone')

    def __str__(self):
        return f"{self.user.email} -> {self.zone.name}"

