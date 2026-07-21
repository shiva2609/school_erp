from django.db import transaction
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import UserSerializer
from accounts.permissions import normalize_role
from tenants.models import Branch

from .models import (
    StaffProfile, TeacherAssignment,
    StaffCategory, Department, Designation, Qualification, Specialization,
)

# ─────────────────────────────────────────
# Master Data Serializers
# ─────────────────────────────────────────

class StaffCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffCategory
        fields = ['id', 'tenant', 'branch', 'name', 'is_teaching_role', 'is_active', 'created_at']
        read_only_fields = ['id', 'tenant', 'created_at']


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'tenant', 'branch', 'name', 'is_active', 'created_at']
        read_only_fields = ['id', 'tenant', 'created_at']


class DesignationSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Designation
        fields = ['id', 'tenant', 'branch', 'category', 'category_name', 'name', 'is_active', 'created_at']
        read_only_fields = ['id', 'tenant', 'created_at']


class QualificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Qualification
        fields = ['id', 'tenant', 'branch', 'name', 'is_active']
        read_only_fields = ['id', 'tenant']


class SpecializationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Specialization
        fields = ['id', 'tenant', 'branch', 'name', 'is_active']
        read_only_fields = ['id', 'tenant']


# ─────────────────────────────────────────
# TeacherAssignment Serializer
# ─────────────────────────────────────────

class TeacherAssignmentSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()
    class_name = serializers.CharField(source='class_section.display_name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)

    class Meta:
        model = TeacherAssignment
        fields = [
            'id', 'tenant', 'staff', 'staff_name', 'class_section', 'class_name',
            'subject_name', 'subject', 'is_class_teacher', 'academic_year'
        ]
        read_only_fields = ['id', 'tenant']

    def get_staff_name(self, obj):
        if obj.staff and obj.staff.user:
            return f"{obj.staff.user.first_name} {obj.staff.user.last_name}".strip()
        return str(obj.staff.employee_id)




# ─────────────────────────────────────────
# Staff Profile Serializer
# ─────────────────────────────────────────

class StaffProfileSerializer(serializers.ModelSerializer):
    # Read-only nested
    user_details = UserSerializer(source='user', read_only=True)
    assignments = TeacherAssignmentSerializer(many=True, read_only=True)

    # FK label read-outs
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True, default=None)
    department_name = serializers.CharField(source='department.name', read_only=True, allow_null=True, default=None)
    designation_name = serializers.CharField(source='designation.name', read_only=True, allow_null=True, default=None)
    qualification_name = serializers.CharField(source='qualification_ref.name', read_only=True, allow_null=True, default=None)
    specialization_name = serializers.CharField(source='specialization_ref.name', read_only=True, allow_null=True, default=None)
    is_teaching_role = serializers.SerializerMethodField()

    # Portal-access toggle fields (write-only, optional)
    requires_portal_access = serializers.BooleanField(write_only=True, required=False, default=False)
    email = serializers.EmailField(write_only=True, required=False)
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False)
    user_role = serializers.CharField(write_only=True, required=False, default='TEACHER')

    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.none(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = StaffProfile
        fields = [
            # Core IDs
            'id', 'tenant', 'employee_id', 'branch',
            # Status / HR
            'status', 'employment_type', 'experience_years', 'joining_date',
            # FK relations
            'category', 'category_name', 'department', 'department_name',
            'designation', 'designation_name',
            'qualification_ref', 'qualification_name',
            'specialization_ref', 'specialization_name',
            'reporting_manager', 'is_teaching_role',
            # Legacy free-text
            'qualification', 'specialization', 'bio',
            # Personal
            'gender', 'date_of_birth', 'blood_group', 'photo_url',
            'marital_status', 'father_name', 'mother_name', 'spouse_name',
            # Govt IDs
            'aadhar_number', 'aadhaar_number', 'pan_number', 'pf_number', 'uan_number', 'esi_number',
            # Bank
            'bank_name', 'bank_account_number', 'ifsc_code',
            # Contact
            'mobile', 'alternate_mobile', 'personal_email', 'address',
            'current_address', 'permanent_address', 'city', 'state', 'pincode',
            'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_number',
            # Flags
            'is_active', 'created_at',
            # Nested / computed
            'user', 'user_details', 'assignments',
            # Write-only portal access
            'requires_portal_access', 'email', 'first_name', 'last_name',
            'phone', 'password', 'user_role',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'employee_id']
        extra_kwargs = {
            'user': {'required': False, 'read_only': False},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and request.user:
            if normalize_role(request.user.role) == 'OWNER':
                self.fields['branch'].queryset = Branch.objects.all()
            else:
                self.fields['branch'].queryset = Branch.objects.filter(tenant=request.user.tenant)

    def validate_email(self, value):
        email = User.objects.normalize_email(value)
        # On updates, allow the existing user's own email
        if self.instance and self.instance.user and self.instance.user.email == email:
            return email
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def create(self, validated_data):
        requires_portal = validated_data.pop('requires_portal_access', False)
        email = validated_data.pop('email', None)
        first_name = validated_data.pop('first_name', '')
        last_name = validated_data.pop('last_name', '')
        phone = validated_data.pop('phone', '')
        password = validated_data.pop('password', 'Password123!')
        user_role = validated_data.pop('user_role', 'TEACHER')
        branch = validated_data.pop('branch', None)
        tenant = validated_data.get('tenant')

        with transaction.atomic():
            # Always ensure a User is created to hold the name
            actual_email = email
            if not actual_email:
                import uuid
                actual_email = f"staff_{uuid.uuid4().hex[:8]}@noemail.local"

            user = User.objects.create_user(
                email=actual_email,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                role=user_role,
                tenant=tenant,
                branch=branch,
                password=password,
                must_change_password=True,
                is_active=bool(requires_portal)  # Only active if portal access is granted
            )
            validated_data['user'] = user
            validated_data['branch'] = branch
            return super().create(validated_data)

    def update(self, instance, validated_data):
        requires_portal = validated_data.pop('requires_portal_access', None)
        email = validated_data.pop('email', None)
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)
        phone = validated_data.pop('phone', None)
        password = validated_data.pop('password', None)
        validated_data.pop('user_role', None)
        branch = validated_data.pop('branch', None)

        with transaction.atomic():
            if instance.user:
                user = instance.user
                user_updated = False
                if email is not None:
                    user.email = email
                    user_updated = True
                if first_name is not None:
                    user.first_name = first_name
                    user_updated = True
                if last_name is not None:
                    user.last_name = last_name
                    user_updated = True
                if phone is not None:
                    user.phone = phone
                    user_updated = True
                if password:
                    user.set_password(password)
                    user_updated = True
                if branch is not None:
                    user.branch = branch
                    user_updated = True
                if requires_portal is True:
                    user.is_active = True
                    user_updated = True
                if user_updated:
                    user.save()
            else:
                # Fallback for staff created before this fix without a user object
                if first_name or last_name or email or requires_portal:
                    actual_email = email
                    if not actual_email:
                        import uuid
                        actual_email = f"staff_{uuid.uuid4().hex[:8]}@noemail.local"
                    
                    user = User.objects.create_user(
                        email=actual_email,
                        first_name=first_name or '',
                        last_name=last_name or '',
                        phone=phone or '',
                        role='TEACHER',
                        tenant=instance.tenant,
                        branch=branch or instance.branch,
                        password=password or 'Password123!',
                        must_change_password=True,
                        is_active=bool(requires_portal)
                    )
                    instance.user = user
                    instance.save(update_fields=['user'])

            if branch is not None:
                validated_data['branch'] = branch

            return super().update(instance, validated_data)


    def get_is_teaching_role(self, obj):
        if obj.category:
            return obj.category.is_teaching_role
        return False


# Backward-compat alias
TeacherProfileSerializer = StaffProfileSerializer
