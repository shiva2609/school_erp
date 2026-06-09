from django.db.models import Q
from rest_framework import serializers
from .models import User, AuditLog
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # We accept either email or phone number in the 'email' payload field
        credentials = attrs.get(User.USERNAME_FIELD) or attrs.get('email')
        
        if credentials:
            # 1. Try resolving an exact 'email' match natively
            user = User.objects.filter(email=credentials).first()
            if not user:
                # 2. Try resolving via phone number fallback (must be unambiguous)
                cred = str(credentials).strip()
                digits = ''.join(c for c in cred if c.isdigit())
                phone_filter = Q(phone=cred)
                if digits:
                    phone_filter |= Q(phone=digits)
                phone_qs = User.objects.filter(phone_filter)
                if phone_qs.count() > 1:
                    raise serializers.ValidationError(
                        {'non_field_errors': ['Multiple accounts use this phone number. Sign in with your email address.']}
                    )
                user = phone_qs.first()
            
            if user:
                # Spoof the validated payload structure prior to authentication
                attrs[User.USERNAME_FIELD] = user.email
                
        return super().validate(attrs)

class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True, default=None)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ['id', 'tenant', 'tenant_name', 'user', 'user_email', 'action', 'model_name', 'record_id', 'details', 'ip_address', 'created_at']


class UserSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True, default=None)
    tenant_logo = serializers.CharField(source='tenant.logo_url', read_only=True, default=None)
    zone_ids = serializers.SerializerMethodField()
    branch_id = serializers.SerializerMethodField()
    tenant_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'phone', 'role', 'is_active',
            'password', 'tenant', 'branch', 'branch_id', 'tenant_id', 'branch_name',
            'tenant_name', 'tenant_logo', 'must_change_password', 'mfa_enabled', 'zone_ids',
        ]
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'tenant': {'read_only': True},
            'mfa_enabled': {'read_only': True},
        }

    def get_branch_id(self, obj):
        return str(obj.branch_id) if obj.branch_id else None

    def get_tenant_id(self, obj):
        return str(obj.tenant_id) if obj.tenant_id else None

    def validate(self, data):
        tenant = data.get('tenant') or (self.instance.tenant if self.instance else None)
        branch = data.get('branch')
        if branch and tenant and branch.tenant != tenant:
            raise serializers.ValidationError({"branch": "Branch must belong to the user's tenant."})
        return data

    def get_zone_ids(self, obj):
        return [str(z) for z in obj.zone_accesses.values_list('zone_id', flat=True)]

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, write_only=True)
    new_password_confirm = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'Passwords do not match.'})
        return attrs
