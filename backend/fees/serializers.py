from rest_framework import serializers
from .models import (
    FeeCategory, FeeStructure, FeeStructureItem, StudentWallet,
    WalletTransaction, FeeConcession, StudentConcession,
    LateFeeRule, FeeInvoice, FeeInvoiceItem, Payment,
    StudentFeeItem, FeeApprovalRequest, PAYMENT_MODE,
)


class FeeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeCategory
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'tenant']


class FeeStructureItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = FeeStructureItem
        fields = '__all__'
        read_only_fields = ['id', 'structure']

    def validate(self, attrs):
        amount = attrs.get('amount', getattr(self.instance, 'amount', None))
        locked_amount = attrs.get('locked_amount', getattr(self.instance, 'locked_amount', None))
        if amount is not None and locked_amount is not None and locked_amount > amount:
            raise serializers.ValidationError({'locked_amount': 'Locked fee cannot be greater than actual fee.'})
        return attrs

    def create(self, validated_data):
        if validated_data.get('locked_amount') is None:
            validated_data['locked_amount'] = validated_data.get('amount')
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'locked_amount' not in validated_data:
            validated_data['locked_amount'] = instance.locked_amount if instance.locked_amount is not None else instance.amount
        return super().update(instance, validated_data)


class FeeStructureSerializer(serializers.ModelSerializer):
    items = FeeStructureItemSerializer(many=True, read_only=True)

    class Meta:
        model = FeeStructure
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'tenant']


class StudentWalletSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentWallet
        fields = '__all__'
        read_only_fields = ['id', 'last_updated']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class FeeConcessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeConcession
        fields = '__all__'
        read_only_fields = ['id', 'tenant']


class StudentConcessionSerializer(serializers.ModelSerializer):
    concession_name = serializers.CharField(source='concession.name', read_only=True)

    class Meta:
        model = StudentConcession
        fields = '__all__'
        read_only_fields = ['id']


class LateFeeRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = LateFeeRule
        fields = '__all__'
        read_only_fields = ['id', 'tenant']


class FeeInvoiceItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = FeeInvoiceItem
        fields = '__all__'
        read_only_fields = ['id']


class FeeInvoiceSerializer(serializers.ModelSerializer):
    items = FeeInvoiceItemSerializer(many=True, read_only=True)
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = FeeInvoice
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'issued_date', 'tenant']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class FeeInvoiceListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views"""
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = FeeInvoice
        fields = [
            'id', 'invoice_number', 'student', 'student_name', 'month',
            'net_amount', 'paid_amount', 'outstanding_amount',
            'due_date', 'status',
        ]

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'tenant']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class InvoiceGenerateSerializer(serializers.Serializer):
    academic_year_id = serializers.UUIDField()
    month = serializers.CharField(max_length=7)
    target = serializers.ChoiceField(choices=['CLASS', 'BRANCH', 'STUDENT'])
    class_section_id = serializers.UUIDField(required=False)
    student_id = serializers.UUIDField(required=False)

    def validate(self, data):
        if data['target'] == 'CLASS' and not data.get('class_section_id'):
            raise serializers.ValidationError("class_section_id is required for CLASS target.")
        if data['target'] == 'STUDENT' and not data.get('student_id'):
            raise serializers.ValidationError("student_id is required for STUDENT target.")
        return data


class OfflinePaymentSerializer(serializers.Serializer):
    invoice_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    payment_mode = serializers.ChoiceField(choices=['CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI', 'DD'])
    payment_date = serializers.DateField()
    reference_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bank_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StudentFeeItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = StudentFeeItem
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class FeeApprovalRequestSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    reduction_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True, source='discount_amount'
    )

    class Meta:
        model = FeeApprovalRequest
        exclude = ('discount_amount',)
        read_only_fields = ['id', 'created_at', 'reviewed_at', 'reviewed_by', 'tenant', 'routing']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"

    def get_requested_by_name(self, obj):
        return f"{obj.requested_by.first_name} {obj.requested_by.last_name}"

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}"
        return None
class InitialPaymentSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    admission_fee = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    tuition_payment = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    payment_mode = serializers.ChoiceField(choices=[c[0] for c in PAYMENT_MODE])
    reference_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    payment_date = serializers.DateField()

    def validate(self, attrs):
        from decimal import Decimal

        a = Decimal(str(attrs.get('admission_fee') or 0))
        t = Decimal(str(attrs.get('tuition_payment') or 0))
        if a + t <= 0:
            raise serializers.ValidationError(
                'At least one of admission_fee or tuition_payment must be greater than zero.'
            )
        return attrs
