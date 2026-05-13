from rest_framework import serializers
from decimal import Decimal

from .approval import EXPENSE_AUTO_APPROVE_MAX, EXPENSE_ZONAL_APPROVE_MAX
from .models import ExpenseCategory, Vendor, Expense, TransactionLog
from tenants.models import Branch

class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = '__all__'
        read_only_fields = ['id', 'tenant']

class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'tenant']

class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    vendor_display = serializers.CharField(source='vendor.name', read_only=True, default=None)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    approval_routing = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    
    # Make these optional/read-only for creation since perform_create auto-populates them
    category = serializers.PrimaryKeyRelatedField(read_only=True)
    vendor = serializers.PrimaryKeyRelatedField(read_only=True)
    expense_date = serializers.DateField(required=False)
    payment_mode = serializers.CharField(required=False, default='CASH')

    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'approved_at', 'tenant', 'branch', 'voucher_number', 'submitted_by', 'approved_by']

        validators = []  # Bypass implicit unique_together validation since perform_create handles this safely

    def get_submitted_by_name(self, obj):
        if obj.submitted_by:
            name = f"{obj.submitted_by.first_name} {obj.submitted_by.last_name}".strip()
            return name if name else obj.submitted_by.email
        return None

    def get_approval_routing(self, obj):
        """UI hint: who must approve a SUBMITTED expense (amount tiers)."""
        if obj.status != 'SUBMITTED':
            return None
        amt = obj.amount if obj.amount is not None else Decimal('0')
        if amt <= EXPENSE_AUTO_APPROVE_MAX:
            return 'AUTO'
        if amt > EXPENSE_ZONAL_APPROVE_MAX:
            return 'SUPER_ADMIN'
        return 'ZONAL_ADMIN'

class TransactionLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionLog
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'tenant']

