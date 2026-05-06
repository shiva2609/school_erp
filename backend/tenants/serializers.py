from rest_framework import serializers
from .models import Tenant, Branch, AcademicYear, GlobalSetting, Zone, BranchAdmissionFee

class GlobalSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlobalSetting
        fields = ['id', 'key', 'value', 'description', 'is_public', 'updated_at']
        read_only_fields = ['id', 'updated_at']

class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'is_active', 'created_at', 'owner_email', 'owner_phone', 
            'logo_url', 'address', 'city', 'state', 'pincode', 'country',
            'admission_no_format', 'admission_no_prefix'
        ]
        read_only_fields = ['id', 'created_at', 'slug']

class BranchSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    zone_name = serializers.CharField(source='zone.name', read_only=True, default=None)

    class Meta:
        model = Branch
        fields = ['id', 'tenant', 'tenant_name', 'zone', 'zone_name', 'name', 'branch_code', 'address', 'is_active']
        read_only_fields = ['id', 'tenant']


class ZoneSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = Zone
        fields = ['id', 'tenant', 'tenant_name', 'name', 'is_active']
        # tenant is assigned in ZoneViewSet.perform_create based on logged-in user
        read_only_fields = ['id', 'tenant']

class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ['id', 'tenant', 'name', 'start_date', 'end_date', 'is_active']
        read_only_fields = ['id', 'tenant']


class BranchAdmissionFeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = BranchAdmissionFee
        fields = ['id', 'branch', 'academic_year', 'amount', 'updated_at']
        read_only_fields = ['id', 'updated_at']
