"""
Serializers for the Academic Year Transition system.
"""
from decimal import Decimal
from rest_framework import serializers
from students.models import StudentAcademicRecord, ClassPromotionMap
from fees.models import (
    FeeCarryForward, PaymentAllocation, FeeWriteOff, AcademicYearClosingLog,
)


# ─── StudentAcademicRecord ──────────────────────────────────────

class StudentAcademicRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    class_section_display = serializers.CharField(source='class_section.display_name', read_only=True, default=None)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    admission_number = serializers.CharField(source='student.admission_number', read_only=True)

    class Meta:
        model = StudentAcademicRecord
        fields = [
            'id', 'student', 'student_name', 'admission_number',
            'academic_year', 'academic_year_name',
            'class_section', 'class_section_display',
            'roll_number', 'status',
            'promoted_from', 'status_changed_at', 'status_reason',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'status_changed_at']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class StudentAcademicRecordListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views."""
    student_name = serializers.SerializerMethodField()
    class_section_display = serializers.CharField(source='class_section.display_name', read_only=True, default=None)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)

    class Meta:
        model = StudentAcademicRecord
        fields = [
            'id', 'student', 'student_name',
            'academic_year_name', 'class_section_display',
            'roll_number', 'status', 'created_at',
        ]

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


# ─── ClassPromotionMap ──────────────────────────────────────────

class ClassPromotionMapSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassPromotionMap
        fields = '__all__'
        read_only_fields = ['id', 'tenant']


# ─── FeeCarryForward ───────────────────────────────────────────

class FeeCarryForwardSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    admission_number = serializers.CharField(source='student.admission_number', read_only=True)
    source_year_name = serializers.CharField(source='source_academic_year.name', read_only=True)
    target_year_name = serializers.CharField(source='target_academic_year.name', read_only=True)
    remaining_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = FeeCarryForward
        fields = [
            'id', 'student', 'student_name', 'admission_number',
            'source_academic_year', 'source_year_name',
            'target_academic_year', 'target_year_name',
            'total_fee_amount', 'total_paid_amount', 'carry_forward_amount',
            'status', 'paid_amount', 'written_off_amount', 'remaining_amount',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


# ─── PaymentAllocation ─────────────────────────────────────────

class PaymentAllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True, default=None)
    carry_forward_source_year = serializers.CharField(
        source='carry_forward.source_academic_year.name', read_only=True, default=None
    )

    class Meta:
        model = PaymentAllocation
        fields = [
            'id', 'payment', 'invoice', 'invoice_number',
            'carry_forward', 'carry_forward_source_year',
            'allocated_amount', 'allocation_type', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# ─── FeeWriteOff ───────────────────────────────────────────────

class FeeWriteOffSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    admission_number = serializers.CharField(source='student.admission_number', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.email', read_only=True, default=None)
    approved_by_name = serializers.CharField(source='approved_by.email', read_only=True, default=None)

    class Meta:
        model = FeeWriteOff
        fields = [
            'id', 'tenant', 'branch', 'student', 'student_name', 'admission_number',
            'invoice', 'carry_forward',
            'amount', 'reason', 'status',
            'requested_by', 'requested_by_name', 'requested_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'executed_at', 'admin_remarks',
        ]
        read_only_fields = [
            'id', 'requested_at', 'approved_at', 'executed_at',
            'requested_by', 'approved_by', 'status',
        ]

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class FeeWriteOffCreateSerializer(serializers.Serializer):
    """Validated input for creating a write-off request."""
    student_id = serializers.UUIDField()
    target_type = serializers.ChoiceField(choices=['INVOICE', 'CARRY_FORWARD'])
    target_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    reason = serializers.CharField(min_length=10)


class FeeWriteOffApprovalSerializer(serializers.Serializer):
    """Validated input for approving/rejecting a write-off."""
    action = serializers.ChoiceField(choices=['APPROVE', 'REJECT'])
    remarks = serializers.CharField(required=False, allow_blank=True)


# ─── AcademicYearClosingLog ────────────────────────────────────

class AcademicYearClosingLogSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    target_year_name = serializers.CharField(source='target_academic_year.name', read_only=True)
    initiated_by_name = serializers.CharField(source='initiated_by.email', read_only=True, default=None)

    promoted_count = serializers.SerializerMethodField()
    detained_count = serializers.SerializerMethodField()
    dropout_count = serializers.SerializerMethodField()
    graduated_count = serializers.SerializerMethodField()

    class Meta:
        model = AcademicYearClosingLog
        fields = [
            'id', 'academic_year', 'academic_year_name',
            'target_academic_year', 'target_year_name',
            'status',
            'total_students', 'promoted_count', 'detained_count',
            'dropout_count', 'graduated_count',
            'carry_forwards_created', 'total_carry_forward_amount',
            'initiated_by', 'initiated_by_name', 'initiated_at',
            'completed_at', 'error_details',
        ]
        read_only_fields = ['id', 'initiated_at', 'completed_at']

    def _sar_row(self, obj):
        by_year = self.context.get('sar_counts_by_year')
        if by_year is None:
            return None
        return by_year.get(str(obj.academic_year_id))

    def get_promoted_count(self, obj):
        row = self._sar_row(obj)
        if row is not None:
            return row.get('promoted') or 0
        return obj.promoted_count

    def get_detained_count(self, obj):
        row = self._sar_row(obj)
        if row is not None:
            return row.get('detained') or 0
        return obj.detained_count

    def get_dropout_count(self, obj):
        row = self._sar_row(obj)
        if row is not None:
            return row.get('dropout') or 0
        return obj.dropout_count

    def get_graduated_count(self, obj):
        row = self._sar_row(obj)
        if row is not None:
            return row.get('graduated') or 0
        return obj.graduated_count


# ─── Promotion Input Serializers ────────────────────────────────

class PromotionOverrideSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    action = serializers.ChoiceField(choices=['PROMOTE', 'DETAIN', 'DROPOUT', 'TRANSFER', 'GRADUATE'])
    target_grade = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField(required=False, allow_blank=True)


class PromotionExecuteSerializer(serializers.Serializer):
    target_academic_year_id = serializers.UUIDField()
    scope = serializers.ChoiceField(choices=['BRANCH', 'CLASS'], default='BRANCH')
    branch_id = serializers.UUIDField()
    class_section_id = serializers.UUIDField(required=False, allow_null=True)
    overrides = PromotionOverrideSerializer(many=True, required=False)


class PromotionPreviewSerializer(serializers.Serializer):
    target_academic_year_id = serializers.UUIDField()
    branch_id = serializers.UUIDField()
    scope = serializers.ChoiceField(choices=['BRANCH', 'CLASS'], default='BRANCH')
    class_section_id = serializers.UUIDField(required=False, allow_null=True)


# ─── Payment Allocation Input ──────────────────────────────────

class PaymentAllocationInputSerializer(serializers.Serializer):
    target_type = serializers.ChoiceField(choices=['CARRY_FORWARD', 'INVOICE'])
    target_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))


class AllocatedPaymentSerializer(serializers.Serializer):
    """Input for creating a payment with explicit allocations."""
    student_id = serializers.UUIDField()
    total_amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    payment_mode = serializers.ChoiceField(choices=[
        'CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI', 'CARD', 'BANK_TRANSFER'
    ])
    payment_date = serializers.DateField()
    reference_number = serializers.CharField(required=False, allow_blank=True)
    auto_allocate = serializers.BooleanField(default=True)
    allocations = PaymentAllocationInputSerializer(many=True, required=False)


# ─── Dropout Input ──────────────────────────────────────────────

class DropoutSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5)
    effective_date = serializers.DateField(required=False)
    stop_future_fees = serializers.BooleanField(default=True)


# ─── Year Closing Input ────────────────────────────────────────

class InitiateClosingSerializer(serializers.Serializer):
    target_academic_year_id = serializers.UUIDField()


class SyncCarryForwardsSerializer(serializers.Serializer):
    source_academic_year_id = serializers.UUIDField()
    target_academic_year_id = serializers.UUIDField()
    branch_id = serializers.UUIDField(required=False, allow_null=True)


class ConfirmClosingSerializer(serializers.Serializer):
    closing_log_id = serializers.UUIDField()


class RollbackClosingSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=10)
