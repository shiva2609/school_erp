from rest_framework import serializers
from django.utils import timezone
from django.db.models import Q
from .models import (
    ClassSection, AdmissionInquiry, AdmissionApplication,
    ApplicationDocument, Student, ParentStudentRelation,
    APPLICATION_STATUS,
)


class ClassSectionSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = ClassSection
        fields = [
            'id', 'branch', 'academic_year', 'grade', 'section',
            'display_name', 'class_teacher', 'max_capacity', 'is_active', 'student_count',
        ]
        read_only_fields = ['id', 'display_name', 'student_count']

    def get_student_count(self, obj):
        return obj.students.filter(status='ACTIVE').count()


class AdmissionInquirySerializer(serializers.ModelSerializer):
    class Meta:
        model = AdmissionInquiry
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'tenant']

    def validate(self, data):
        # Duplicate inquiry check: same phone + grade + academic year
        branch = data.get('branch')
        phone = data.get('parent_phone')
        grade = data.get('grade_applying_for')
        ay = data.get('academic_year')
        qs = AdmissionInquiry.objects.filter(
            branch=branch, parent_phone=phone,
            grade_applying_for=grade, academic_year=ay,
        )
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({
                'detail': 'Duplicate inquiry exists.',
                'existing_id': str(qs.first().id),
            })
        return data


class ApplicationDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationDocument
        fields = '__all__'
        read_only_fields = ['id', 'uploaded_at']


class AdmissionApplicationSerializer(serializers.ModelSerializer):
    documents = ApplicationDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = AdmissionApplication
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'reviewed_at', 'submitted_at', 'tenant']


class ApplicationStatusSerializer(serializers.Serializer):
    """Validates status transitions per PRD §7.1.2"""
    status = serializers.ChoiceField(choices=[s[0] for s in APPLICATION_STATUS])
    remarks = serializers.CharField(required=False, allow_blank=True)

    VALID_TRANSITIONS = {
        'DRAFT': ['SUBMITTED'],
        'SUBMITTED': ['UNDER_REVIEW'],
        'UNDER_REVIEW': ['APPROVED', 'REJECTED'],
        'APPROVED': ['ENROLLED'],
    }

    def validate(self, data):
        current_status = self.context.get('current_status')
        new_status = data['status']
        allowed = self.VALID_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise serializers.ValidationError(
                f"Cannot transition from {current_status} to {new_status}. Allowed: {allowed}"
            )
        if new_status == 'REJECTED' and not data.get('remarks'):
            raise serializers.ValidationError("Remarks are required when rejecting an application.")
        return data


class StudentSerializer(serializers.ModelSerializer):
    class_section_display = serializers.CharField(source='class_section.display_name', read_only=True, default=None)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True, default=None)
    
    # Extra fields for enrollment fee locking
    offered_total = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    standard_total = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    reason = serializers.CharField(required=False, write_only=True, allow_blank=True)
    proposed_fee = serializers.SerializerMethodField()
    fee_stats = serializers.SerializerMethodField()
    invoices = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    is_csv_imported = serializers.SerializerMethodField()
    requires_initial_payment = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = '__all__'
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'enrollment_date', 'tenant', 'proposed_fee',
            'fee_stats', 'invoices', 'payments', 'transport_info', 'is_csv_imported',
            'requires_initial_payment',
        ]
        extra_kwargs = {
            'admission_number': {'required': False, 'allow_blank': True}
        }

    def get_proposed_fee(self, obj):
        from django.db.models import Sum
        return obj.fee_items.aggregate(total=Sum('amount'))['total'] or 0

    def get_fee_stats(self, obj):
        from fees.models import FeeInvoice, StudentFeeItem
        from decimal import Decimal
        from django.db.models import Sum
        
        # Academic-year fees only — exclude one-time admission (ADM-) and transport (TRN-) from structure totals
        invoices = FeeInvoice.objects.filter(
            student=obj, academic_year=obj.academic_year
        ).exclude(invoice_number__startswith='ADM-').exclude(invoice_number__startswith='TRN-')
        total_fee_invoiced = invoices.aggregate(Sum('net_amount'))['net_amount__sum'] or Decimal('0.00')
        total_paid = invoices.aggregate(Sum('paid_amount'))['paid_amount__sum'] or Decimal('0.00')
        
        # Fallback to promised fee items if no invoices generated yet
        if total_fee_invoiced == 0:
            total_fee = StudentFeeItem.objects.filter(
                student=obj, 
                academic_year=obj.academic_year
            ).aggregate(Sum('amount'))['amount__sum'] or Decimal('0.00')
        else:
            total_fee = total_fee_invoiced
            
        return {
            'total_fee': float(total_fee),
            'total_paid': float(total_paid),
            'balance': float(total_fee - total_paid)
        }

    transport_info = serializers.SerializerMethodField()

    def get_transport_info(self, obj):
        from transport.models import StudentTransport
        active_transport = StudentTransport.objects.filter(student=obj, is_active=True).first()
        if active_transport:
            return {
                'opted': True,
                'monthly_fee': float(active_transport.monthly_fee),
                'distance_km': float(active_transport.distance_km),
                'pickup_point': active_transport.pickup_point
            }
        return {'opted': False}

    def get_invoices(self, obj):
        from fees.models import FeeInvoice
        from fees.serializers import FeeInvoiceListSerializer
        invoices = FeeInvoice.objects.filter(student=obj).order_by('-created_at')
        return FeeInvoiceListSerializer(invoices, many=True).data

    def get_payments(self, obj):
        from fees.models import Payment
        from fees.serializers import PaymentSerializer
        payments = Payment.objects.filter(student=obj).order_by('-payment_date', '-created_at')
        return PaymentSerializer(payments, many=True).data

    def get_is_csv_imported(self, obj):
        # CSV imports preserve source admission number in legacy_admission_number.
        return bool((obj.legacy_admission_number or '').strip())

    def get_requires_initial_payment(self, obj):
        """
        For normal admissions (non-CSV), ensure at least one completed admission
        or academic payment exists before allowing regular invoice payments.
        """
        if self.get_is_csv_imported(obj):
            return False

        from fees.models import Payment
        has_initial_payment = Payment.objects.filter(
            student=obj,
            status='COMPLETED',
        ).filter(
            Q(invoice__invoice_number__startswith='ADM-') |
            (~Q(invoice__invoice_number__startswith='ADM-') & ~Q(invoice__invoice_number__startswith='TRN-'))
        ).exists()
        return not has_initial_payment


class StudentListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views"""
    class_section_display = serializers.CharField(source='class_section.display_name', read_only=True, default=None)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True, default=None)
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)
    proposed_fee = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id', 'admission_number', 'legacy_admission_number', 'first_name', 'last_name', 'gender',
            'date_of_birth', 'class_section', 'class_section_display',
            'branch_name', 'status', 'photo_url', 'roll_number', 'proposed_fee',
            'academic_year_name',
        ]

    def get_proposed_fee(self, obj):
        from django.db.models import Sum
        # Check actual locked fee items first
        total = obj.fee_items.aggregate(total=Sum('amount'))['total']
        if total and total > 0:
            return total
        
        # If not found, check if there's a pending approval request
        from fees.models import FeeApprovalRequest
        pending = FeeApprovalRequest.objects.filter(student=obj, status='PENDING').first()
        if pending:
            return pending.offered_total
            
        return 0


class ParentStudentRelationSerializer(serializers.ModelSerializer):
    parent_email = serializers.EmailField(source='parent.email', read_only=True)
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = ParentStudentRelation
        fields = '__all__'
        read_only_fields = ['id', 'created_at']

    def get_student_name(self, obj):
        name_parts = [obj.student.first_name, obj.student.last_name]
        return ' '.join(p for p in name_parts if p)
