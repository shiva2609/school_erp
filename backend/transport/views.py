from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction

from accounts.permissions import IsAccountantOrAbove
from accounts.utils import get_validated_branch_id
from students.models import Student

from .models import TransportRateSlab, StudentTransport
from .serializers import (
    TransportRateSlabSerializer,
    StudentTransportSerializer, StudentTransportOptInSerializer,
)


class TransportRateSlabViewSet(viewsets.ModelViewSet):
    serializer_class = TransportRateSlabSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        qs = TransportRateSlab.objects.filter(branch__tenant=self.request.user.tenant)
        branch_id = get_validated_branch_id(
            self.request.user,
            self.request.query_params.get('branch') or self.request.query_params.get('branch_id')
        )
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class StudentTransportViewSet(viewsets.ModelViewSet):
    serializer_class = StudentTransportSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        qs = StudentTransport.objects.filter(
            student__tenant=self.request.user.tenant
        ).select_related('student', 'student__class_section')
        branch_id = get_validated_branch_id(
            self.request.user,
            self.request.query_params.get('branch') or self.request.query_params.get('branch_id')
        )
        if branch_id:
            qs = qs.filter(student__branch_id=branch_id)
        return qs

    @transaction.atomic
    def perform_update(self, serializer):
        """On distance change, just recalculate the monthly_fee on the subscription record.
        The invoice generator picks up the current monthly_fee at billing time."""
        st = serializer.save()
        monthly_rate = TransportRateSlab.get_rate_for_distance(st.student.branch, st.distance_km)
        if monthly_rate is not None and st.monthly_fee != monthly_rate:
            st.monthly_fee = monthly_rate
            st.save(update_fields=['monthly_fee'])


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAccountantOrAbove])
def student_transport_opt_in(request):
    """Opt a student into transport based on distance.
    
    Creates a StudentTransport subscription record. The monthly fee is resolved
    from the branch's distance-based rate slabs. No StudentFeeItem is created;
    the invoice generator dynamically injects the transport line item each month.
    """
    serializer = StudentTransportOptInSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    student = Student.objects.filter(
        id=data['student_id'], tenant=request.user.tenant
    ).first()
    if not student:
        return Response({'detail': 'Student not found.'}, status=404)

    # Check if already opted in
    existing = StudentTransport.objects.filter(student=student, is_active=True).first()
    if existing:
        return Response({'detail': 'Student already opted into transport. Deactivate first.'}, status=400)

    # Resolve monthly rate from slabs
    monthly_rate = TransportRateSlab.get_rate_for_distance(student.branch, data['distance_km'])
    if monthly_rate is None:
        return Response({
            'detail': f"No rate slab found for {data['distance_km']} km in this branch. "
                      f"Please configure transport rate slabs first."
        }, status=400)

    with transaction.atomic():
        st = StudentTransport.objects.create(
            student=student,
            distance_km=data['distance_km'],
            pickup_point=data.get('pickup_point', ''),
            monthly_fee=monthly_rate,
            opted_by=request.user,
        )

    return Response({
        'success': True,
        'data': StudentTransportSerializer(st).data,
        'message': f'Student opted into transport. Monthly fee: ₹{monthly_rate}'
    }, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAccountantOrAbove])
def student_transport_opt_out(request):
    """Opt a student out of transport.
    
    Simply deactivates the StudentTransport record. Future invoices will no
    longer include a transport line item. No financial records are deleted.
    """
    student_id = request.data.get('student_id')
    if not student_id:
        return Response({'detail': 'student_id is required.'}, status=400)

    st = StudentTransport.objects.filter(
        student_id=student_id, is_active=True,
        student__tenant=request.user.tenant
    ).first()
    if not st:
        return Response({'detail': 'No active transport opt-in found.'}, status=404)

    st.is_active = False
    st.save(update_fields=['is_active'])

    return Response({'success': True, 'message': 'Student opted out of transport. Future invoices will not include transport fees.'})


from datetime import date
from decimal import Decimal
from django.utils import timezone
from .models import TransportFeeEnrollment
from .serializers import TransportFeeEnrollmentSerializer

class TransportFeeEnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = TransportFeeEnrollmentSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        user = self.request.user
        qs = TransportFeeEnrollment.objects.filter(tenant=user.tenant).select_related(
            'student', 'student__class_section', 'academic_year'
        )
        branch_id = get_validated_branch_id(
            user,
            self.request.query_params.get('branch') or self.request.query_params.get('branch_id')
        )
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        
        academic_year_id = self.request.query_params.get('academic_year') or self.request.query_params.get('academic_year_id')
        if academic_year_id:
            qs = qs.filter(academic_year_id=academic_year_id)
        
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(student__first_name__icontains=search) |
                Q(student__last_name__icontains=search) |
                Q(student__admission_number__icontains=search)
            )
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        from students.models import Student
        from tenants.models import AcademicYear
        from fees.models import FeeCategory, FeeInvoice, FeeInvoiceItem, DocumentSequence

        student_id = request.data.get('student') or request.data.get('student_id')
        academic_year_id = request.data.get('academic_year') or request.data.get('academic_year_id')
        agreed_amount_val = request.data.get('agreed_amount')
        pickup_point = request.data.get('pickup_point', '')

        if not all([student_id, academic_year_id, agreed_amount_val]):
            return Response({'detail': 'student_id, academic_year_id, and agreed_amount are required.'}, status=400)

        try:
            agreed_amount = Decimal(str(agreed_amount_val))
        except Exception:
            return Response({'detail': 'Invalid agreed_amount.'}, status=400)

        student = Student.objects.filter(id=student_id, tenant=request.user.tenant).first()
        if not student:
            return Response({'detail': 'Student not found.'}, status=404)

        academic_year = AcademicYear.objects.filter(id=academic_year_id, tenant=request.user.tenant).first()
        if not academic_year:
            return Response({'detail': 'Academic year not found.'}, status=404)

        # Check existing enrollment
        existing = TransportFeeEnrollment.objects.filter(
            student=student,
            academic_year=academic_year
        ).first()
        if existing:
            return Response({'detail': 'Student is already enrolled in transport for this academic year.'}, status=400)

        # Create enrollment
        enrollment = TransportFeeEnrollment.objects.create(
            tenant=request.user.tenant,
            branch=student.branch,
            student=student,
            academic_year=academic_year,
            pickup_point=pickup_point,
            agreed_amount=agreed_amount,
            enrolled_by=request.user
        )

        # Get or create transport category
        transport_cat, _ = FeeCategory.objects.get_or_create(
            branch=student.branch,
            code='TRANSPORT',
            defaults={
                'tenant': student.tenant,
                'name': 'Transport Fee',
                'description': 'School transport fee',
                'is_active': True,
                'order': 99,
            }
        )

        # Generate invoice sequence number
        prefix = f"TRN-ANN-{student.branch.branch_code}-{academic_year.start_date.year}"
        invoice_number = DocumentSequence.get_next_sequence(
            branch=student.branch,
            document_type='INVOICE',
            prefix=prefix
        )

        # Create invoice
        invoice = FeeInvoice.objects.create(
            tenant=student.tenant,
            branch=student.branch,
            academic_year=academic_year,
            student=student,
            month=None,
            invoice_number=invoice_number,
            due_date=date.today(),
            gross_amount=agreed_amount,
            concession_amount=Decimal('0.00'),
            net_amount=agreed_amount,
            outstanding_amount=agreed_amount,
            status='SENT',
            generated_by='MANUAL',
            created_by=request.user
        )

        # Create Invoice Item
        FeeInvoiceItem.objects.create(
            invoice=invoice,
            category=transport_cat,
            original_amount=agreed_amount,
            concession=Decimal('0.00'),
            final_amount=agreed_amount,
            description=f"Annual Transport Fee - Pickup: {pickup_point}"
        )

        serializer = self.get_serializer(enrollment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        from fees.models import FeeInvoice
        instance = self.get_object()
        
        # Check if invoice exists and has payments
        invoice = FeeInvoice.objects.filter(
            student=instance.student,
            academic_year=instance.academic_year,
            invoice_number__startswith='TRN-ANN-'
        ).first()

        if invoice:
            if invoice.paid_amount > 0 or invoice.payments.filter(status='COMPLETED').exists():
                return Response({
                    'detail': 'Cannot cancel enrollment. Payments have already been recorded for this transport invoice. Please void payments first.'
                }, status=400)
            
            # Delete invoice
            invoice.delete()

        # Delete enrollment
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

