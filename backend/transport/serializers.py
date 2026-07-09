from rest_framework import serializers
from .models import TransportRateSlab, StudentTransport, TransportFeeEnrollment


class TransportRateSlabSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransportRateSlab
        fields = [
            'id', 'tenant', 'branch', 'min_km', 'max_km',
            'monthly_rate', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at']


class StudentTransportSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    class_section = serializers.CharField(source='student.class_section.display_name', read_only=True, default=None)
    admission_number = serializers.CharField(source='student.admission_number', read_only=True, default=None)

    class Meta:
        model = StudentTransport
        fields = [
            'id', 'student', 'student_name', 'admission_number', 'class_section',
            'distance_km', 'pickup_point', 'monthly_fee', 'is_active', 'opted_at',
        ]
        read_only_fields = ['id', 'monthly_fee', 'opted_at', 'student_name', 'class_section', 'admission_number']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"


class StudentTransportOptInSerializer(serializers.Serializer):
    """Used for the opt-in endpoint."""
    student_id = serializers.UUIDField()
    distance_km = serializers.DecimalField(max_digits=6, decimal_places=2)
    pickup_point = serializers.CharField(required=False, allow_blank=True, default='')


class TransportFeeEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    admission_number = serializers.CharField(source='student.admission_number', read_only=True, default=None)
    class_section = serializers.CharField(source='student.class_section.display_name', read_only=True, default=None)
    academic_year_name = serializers.CharField(source='academic_year.display_name', read_only=True, default=None)
    
    paid_amount = serializers.SerializerMethodField()
    balance_amount = serializers.SerializerMethodField()
    invoice_id = serializers.SerializerMethodField()
    invoice_number = serializers.SerializerMethodField()
    invoice_status = serializers.SerializerMethodField()

    class Meta:
        model = TransportFeeEnrollment
        fields = [
            'id', 'student', 'student_name', 'admission_number', 'class_section',
            'academic_year', 'academic_year_name', 'pickup_point', 'agreed_amount',
            'paid_amount', 'balance_amount', 'invoice_id', 'invoice_number',
            'invoice_status', 'is_active', 'enrolled_at'
        ]
        read_only_fields = ['id', 'enrolled_at']

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"

    def _get_invoice(self, obj):
        if not hasattr(obj, '_cached_invoice'):
            from fees.models import FeeInvoice
            # Look for any active transport invoice for this student and academic year.
            # Prioritize 'TRN-ANN-' but gracefully fall back to older 'TRN-*' invoices
            # if they contain the active payment data.
            invoices = FeeInvoice.objects.filter(
                student=obj.student,
                academic_year=obj.academic_year,
                invoice_number__startswith='TRN-'
            ).exclude(status='CANCELLED').order_by('-created_at')
            
            # Prefer TRN-ANN- if multiple exist
            invoice = next((inv for inv in invoices if inv.invoice_number.startswith('TRN-ANN-')), invoices.first() if invoices else None)
            
            obj._cached_invoice = invoice
        return obj._cached_invoice

    def get_paid_amount(self, obj):
        inv = self._get_invoice(obj)
        return float(inv.paid_amount) if inv else 0.0

    def get_balance_amount(self, obj):
        inv = self._get_invoice(obj)
        return float(inv.outstanding_amount) if inv else float(obj.agreed_amount)

    def get_invoice_id(self, obj):
        inv = self._get_invoice(obj)
        return inv.id if inv else None

    def get_invoice_number(self, obj):
        inv = self._get_invoice(obj)
        return inv.invoice_number if inv else None

    def get_invoice_status(self, obj):
        inv = self._get_invoice(obj)
        return inv.status if inv else None

