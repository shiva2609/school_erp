"""
Views for the Academic Year Transition system.
Endpoints for year closing, promotion, carry-forwards, write-offs, payment allocation, and dropouts.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone

from accounts.permissions import (
    IsSchoolAdminOrAbove,
    IsBranchAdminOrAbove,
    IsAccountantOrAbove,
    IsSuperAdmin,
    normalize_role,
)
from accounts.utils import get_validated_branch_id, log_audit_action

from students.models import StudentAcademicRecord, ClassPromotionMap, Student
from fees.models import (
    FeeCarryForward, PaymentAllocation, FeeWriteOff,
    AcademicYearClosingLog, FeeStructure, FeeInvoice,
)
from tenants.models import AcademicYear, Branch

from fees.transition_serializers import (
    StudentAcademicRecordSerializer, StudentAcademicRecordListSerializer,
    ClassPromotionMapSerializer,
    FeeCarryForwardSerializer,
    PaymentAllocationSerializer,
    FeeWriteOffSerializer, FeeWriteOffCreateSerializer, FeeWriteOffApprovalSerializer,
    AcademicYearClosingLogSerializer,
    PromotionExecuteSerializer, PromotionPreviewSerializer,
    AllocatedPaymentSerializer,
    DropoutSerializer,
    InitiateClosingSerializer, ConfirmClosingSerializer, RollbackClosingSerializer,
    SyncCarryForwardsSerializer,
)

from fees.transition_services import (
    initiate_year_closing, confirm_year_closing, rollback_year_closing,
    aggregate_sar_status_counts_by_academic_year,
    execute_promotion, preview_promotion,
    allocate_payment,
    execute_write_off, handle_dropout,
    finalize_fee_structure,
    sync_carry_forwards_from_invoices,
)


# ─── Academic Year Closing ──────────────────────────────────────

class AcademicYearClosingViewSet(viewsets.GenericViewSet):
    """Endpoints for academic year closing lifecycle."""
    permission_classes = [IsAuthenticated, IsSchoolAdminOrAbove]

    @action(detail=False, methods=['post'], url_path='initiate')
    def initiate_closing(self, request):
        """POST /api/academic-year-closing/initiate/"""
        serializer = InitiateClosingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        source_year_id = request.data.get('source_academic_year_id')
        target_year_id = serializer.validated_data['target_academic_year_id']

        try:
            # If source not specified, use the currently active year
            if source_year_id:
                source_year = AcademicYear.objects.get(id=source_year_id, tenant=request.user.tenant)
            else:
                source_year = AcademicYear.objects.get(tenant=request.user.tenant, is_active=True)

            target_year = AcademicYear.objects.get(id=target_year_id, tenant=request.user.tenant)
        except AcademicYear.DoesNotExist:
            return Response({'success': False, 'error': 'Academic year not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = initiate_year_closing(
                tenant=request.user.tenant,
                source_year=source_year,
                target_year=target_year,
                user=request.user,
            )
            return Response({'success': True, 'data': result})
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='confirm')
    def confirm_closing(self, request):
        """POST /api/academic-year-closing/confirm/"""
        serializer = ConfirmClosingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            closing_log = AcademicYearClosingLog.objects.get(
                id=serializer.validated_data['closing_log_id'],
                tenant=request.user.tenant,
            )
            source_year = closing_log.academic_year
        except AcademicYearClosingLog.DoesNotExist:
            return Response({'success': False, 'error': 'Closing log not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = confirm_year_closing(
                tenant=request.user.tenant,
                source_year=source_year,
                closing_log=closing_log,
                user=request.user,
            )
            return Response({'success': True, 'data': result})
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='rollback')
    def rollback_closing(self, request):
        """POST /api/academic-year-closing/rollback/ — SUPER_ADMIN only"""
        if normalize_role(request.user.role) != 'SUPER_ADMIN':
            return Response({'success': False, 'error': 'Only SUPER_ADMIN can rollback.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = RollbackClosingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        source_year_id = request.data.get('source_academic_year_id')
        try:
            source_year = AcademicYear.objects.get(id=source_year_id, tenant=request.user.tenant)
        except AcademicYear.DoesNotExist:
            return Response({'success': False, 'error': 'Academic year not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = rollback_year_closing(
                tenant=request.user.tenant,
                source_year=source_year,
                user=request.user,
                reason=serializer.validated_data['reason'],
            )
            return Response({'success': True, 'data': result})
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='logs')
    def closing_logs(self, request):
        """GET /api/academic-year-closing/logs/ — history of all closings."""
        logs = list(
            AcademicYearClosingLog.objects.filter(
                tenant=request.user.tenant
            ).select_related('academic_year', 'target_academic_year', 'initiated_by')
        )
        year_ids = [log.academic_year_id for log in logs]
        sar_counts = aggregate_sar_status_counts_by_academic_year(request.user.tenant, year_ids)
        serializer = AcademicYearClosingLogSerializer(
            logs, many=True, context={'sar_counts_by_year': sar_counts},
        )
        return Response({'success': True, 'data': serializer.data})

    @action(detail=False, methods=['post'], url_path='sync-carry-forwards')
    def sync_carry_forwards(self, request):
        """POST /api/academic-year-closing/sync-carry-forwards/ — backfill FeeCarryForward from invoices."""
        serializer = SyncCarryForwardsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            source_year = AcademicYear.objects.get(
                id=data['source_academic_year_id'], tenant=request.user.tenant
            )
            target_year = AcademicYear.objects.get(
                id=data['target_academic_year_id'], tenant=request.user.tenant
            )
        except AcademicYear.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Academic year not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        branch = None
        branch_id = get_validated_branch_id(
            request.user,
            str(data['branch_id']) if data.get('branch_id') else None,
        )
        if branch_id:
            try:
                branch = Branch.objects.get(id=branch_id, tenant=request.user.tenant)
            except Branch.DoesNotExist:
                return Response(
                    {'success': False, 'error': 'Branch not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

        result = sync_carry_forwards_from_invoices(
            tenant=request.user.tenant,
            source_year=source_year,
            target_year=target_year,
            user=request.user,
            branch=branch,
            student_ids=None,
        )
        log_audit_action(
            user=request.user,
            action='SYNC_CARRY_FORWARDS',
            model_name='FeeCarryForward',
            record_id=source_year.id,
            details={
                'source_year': source_year.name,
                'target_year': target_year.name,
                'branch_id': str(branch.id) if branch else None,
                'created': result['created'],
                'total_amount': result['total_amount'],
            },
        )
        return Response({'success': True, 'data': result})


# ─── Promotion ──────────────────────────────────────────────────

class PromotionViewSet(viewsets.GenericViewSet):
    """Endpoints for student promotion workflow."""
    permission_classes = [IsAuthenticated, IsSchoolAdminOrAbove]

    @action(detail=False, methods=['post'], url_path='preview')
    def preview(self, request):
        """POST /api/promotions/preview/ — Dry-run preview."""
        serializer = PromotionPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            source_year = AcademicYear.objects.get(
                tenant=request.user.tenant, is_active=True
            )
            target_year = AcademicYear.objects.get(
                id=data['target_academic_year_id'], tenant=request.user.tenant
            )
            branch = Branch.objects.get(id=data['branch_id'], tenant=request.user.tenant)
        except (AcademicYear.DoesNotExist, Branch.DoesNotExist):
            return Response({'success': False, 'error': 'Resource not found.'}, status=status.HTTP_404_NOT_FOUND)

        result = preview_promotion(
            tenant=request.user.tenant,
            source_year=source_year,
            target_year=target_year,
            branch=branch,
            scope=data.get('scope', 'BRANCH'),
            class_section_id=data.get('class_section_id'),
        )
        return Response({'success': True, 'data': result})

    @action(detail=False, methods=['post'], url_path='execute')
    def execute(self, request):
        """POST /api/promotions/execute/ — Execute promotions."""
        serializer = PromotionExecuteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            source_year = AcademicYear.objects.get(
                tenant=request.user.tenant, status__in=['ACTIVE', 'CLOSING']
            )
            target_year = AcademicYear.objects.get(
                id=data['target_academic_year_id'], tenant=request.user.tenant
            )
            branch = Branch.objects.get(id=data['branch_id'], tenant=request.user.tenant)
        except (AcademicYear.DoesNotExist, Branch.DoesNotExist):
            return Response({'success': False, 'error': 'Resource not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = execute_promotion(
                tenant=request.user.tenant,
                source_year=source_year,
                target_year=target_year,
                branch=branch,
                user=request.user,
                overrides=data.get('overrides', []),
                scope=data.get('scope', 'BRANCH'),
                class_section_id=data.get('class_section_id'),
            )
            return Response({'success': True, 'data': result})
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ─── Class Promotion Map ───────────────────────────────────────

class ClassPromotionMapViewSet(viewsets.ModelViewSet):
    """CRUD for class-to-class promotion mappings."""
    serializer_class = ClassPromotionMapSerializer
    permission_classes = [IsAuthenticated, IsBranchAdminOrAbove]

    def get_queryset(self):
        user = self.request.user
        qs = ClassPromotionMap.objects.filter(tenant=user.tenant)

        branch_id = get_validated_branch_id(user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        ay_id = self.request.query_params.get('academic_year_id')
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)

        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({'success': True, 'data': serializer.data})


# ─── Student Academic Record ───────────────────────────────────

class StudentAcademicRecordViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only history of student academic records across years."""
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_serializer_class(self):
        if self.action == 'list':
            return StudentAcademicRecordListSerializer
        return StudentAcademicRecordSerializer

    def get_queryset(self):
        user = self.request.user
        qs = StudentAcademicRecord.objects.filter(
            student__tenant=user.tenant
        ).select_related('student', 'academic_year', 'class_section')

        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student_id=student_id)

        ay_id = self.request.query_params.get('academic_year_id')
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)

        branch_id = get_validated_branch_id(user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(student__branch_id=branch_id)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({'success': True, 'data': serializer.data})


# ─── Fee Carry-Forward ─────────────────────────────────────────

class FeeCarryForwardViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only access to carry-forward records."""
    serializer_class = FeeCarryForwardSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        user = self.request.user
        qs = FeeCarryForward.objects.filter(
            tenant=user.tenant
        ).select_related(
            'student', 'source_academic_year', 'target_academic_year'
        )

        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student_id=student_id)

        branch_id = get_validated_branch_id(user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        ay_id = self.request.query_params.get('target_academic_year_id')
        if ay_id:
            qs = qs.filter(target_academic_year_id=ay_id)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({'success': True, 'data': serializer.data})


# ─── Payment Allocation ────────────────────────────────────────

class AllocatedPaymentViewSet(viewsets.GenericViewSet):
    """Create payments with explicit allocation across invoices and carry-forwards."""
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    @action(detail=False, methods=['post'], url_path='allocate')
    def create_allocated_payment(self, request):
        """POST /api/allocated-payments/allocate/"""
        serializer = AllocatedPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            student = Student.objects.get(id=data['student_id'], tenant=request.user.tenant)
        except Student.DoesNotExist:
            return Response({'success': False, 'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = allocate_payment(
                user=request.user,
                student=student,
                total_amount=data['total_amount'],
                payment_mode=data['payment_mode'],
                payment_date=data['payment_date'],
                allocations=data.get('allocations'),
                reference_number=data.get('reference_number'),
                auto_mode=data.get('auto_allocate', True),
            )
            return Response({'success': True, 'data': result}, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='student/(?P<student_id>[^/.]+)')
    def student_allocations(self, request, student_id=None):
        """GET /api/allocated-payments/student/{id}/ — all allocations for a student."""
        allocations = PaymentAllocation.objects.filter(
            payment__student_id=student_id,
            payment__tenant=request.user.tenant,
        ).select_related('payment', 'invoice', 'carry_forward').order_by('-created_at')

        serializer = PaymentAllocationSerializer(allocations, many=True)
        return Response({'success': True, 'data': serializer.data})


# ─── Fee Write-Off ──────────────────────────────────────────────

class FeeWriteOffViewSet(viewsets.ModelViewSet):
    """CRUD + approval workflow for fee write-offs."""
    serializer_class = FeeWriteOffSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        user = self.request.user
        qs = FeeWriteOff.objects.filter(
            tenant=user.tenant
        ).select_related('student', 'invoice', 'carry_forward', 'requested_by', 'approved_by')

        branch_id = get_validated_branch_id(user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({'success': True, 'data': serializer.data})

    def create(self, request, *args, **kwargs):
        """POST /api/write-offs/ — Create a write-off request."""
        input_serializer = FeeWriteOffCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        try:
            student = Student.objects.get(id=data['student_id'], tenant=request.user.tenant)
        except Student.DoesNotExist:
            return Response({'success': False, 'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        write_off = FeeWriteOff(
            tenant=request.user.tenant,
            branch=student.branch,
            student=student,
            amount=data['amount'],
            reason=data['reason'],
            requested_by=request.user,
            status='PENDING',
        )

        if data['target_type'] == 'INVOICE':
            try:
                write_off.invoice = FeeInvoice.objects.get(id=data['target_id'], student=student)
            except FeeInvoice.DoesNotExist:
                return Response({'success': False, 'error': 'Invoice not found.'}, status=status.HTTP_404_NOT_FOUND)
        elif data['target_type'] == 'CARRY_FORWARD':
            try:
                write_off.carry_forward = FeeCarryForward.objects.get(id=data['target_id'], student=student)
            except FeeCarryForward.DoesNotExist:
                return Response({'success': False, 'error': 'Carry-forward not found.'}, status=status.HTTP_404_NOT_FOUND)

        write_off.save()

        log_audit_action(
            user=request.user,
            action='CREATE_WRITE_OFF_REQUEST',
            model_name='FeeWriteOff',
            record_id=write_off.id,
            details={'amount': float(data['amount']), 'reason': data['reason']}
        )

        serializer = FeeWriteOffSerializer(write_off)
        return Response({'success': True, 'data': serializer.data}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='review')
    def review(self, request, pk=None):
        """POST /api/write-offs/{id}/review/ — Approve or reject."""
        from accounts.permissions import has_min_role
        if not has_min_role(request.user, 'SUPER_ADMIN'):
            return Response(
                {'success': False, 'error': 'Only School Admin or above can review write-offs.'},
                status=status.HTTP_403_FORBIDDEN
            )

        write_off = self.get_object()
        if write_off.status != 'PENDING':
            return Response(
                {'success': False, 'error': f"Cannot review a write-off in '{write_off.status}' status."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = FeeWriteOffApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action_type = serializer.validated_data['action']
        remarks = serializer.validated_data.get('remarks', '')

        if action_type == 'APPROVE':
            write_off.status = 'APPROVED'
            write_off.approved_by = request.user
            write_off.approved_at = timezone.now()
            write_off.admin_remarks = remarks
            write_off.save()

            # Auto-execute on approval
            result = execute_write_off(write_off, request.user)
            return Response({'success': True, 'data': result})

        elif action_type == 'REJECT':
            write_off.status = 'REJECTED'
            write_off.approved_by = request.user
            write_off.approved_at = timezone.now()
            write_off.admin_remarks = remarks
            write_off.save()

            log_audit_action(
                user=request.user,
                action='REJECT_WRITE_OFF',
                model_name='FeeWriteOff',
                record_id=write_off.id,
                details={'remarks': remarks}
            )

            return Response({'success': True, 'data': {'status': 'REJECTED'}})


# ─── Fee Structure Finalization ─────────────────────────────────

class FeeStructureFinalizeViewSet(viewsets.GenericViewSet):
    """Endpoint to finalize fee structures."""
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    @action(detail=True, methods=['post'], url_path='finalize')
    def finalize(self, request, pk=None):
        """POST /api/fee-finalize/{id}/finalize/"""
        try:
            structure = FeeStructure.objects.get(id=pk, tenant=request.user.tenant)
        except FeeStructure.DoesNotExist:
            return Response({'success': False, 'error': 'Fee structure not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = finalize_fee_structure(structure, request.user)
            return Response({'success': True, 'data': result})
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ─── Student Dropout ────────────────────────────────────────────

class StudentDropoutViewSet(viewsets.GenericViewSet):
    """Endpoint for managing student dropouts."""
    permission_classes = [IsAuthenticated, IsBranchAdminOrAbove]

    @action(detail=True, methods=['post'], url_path='dropout')
    def mark_dropout(self, request, pk=None):
        """POST /api/student-lifecycle/{id}/dropout/"""
        try:
            student = Student.objects.get(id=pk, tenant=request.user.tenant)
        except Student.DoesNotExist:
            return Response({'success': False, 'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        if student.status == 'DROPOUT':
            return Response(
                {'success': False, 'error': 'Student is already marked as dropout.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DropoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = handle_dropout(
                student=student,
                user=request.user,
                reason=serializer.validated_data['reason'],
                effective_date=serializer.validated_data.get('effective_date'),
                stop_future_fees=serializer.validated_data.get('stop_future_fees', True),
            )
            return Response({'success': True, 'data': result})
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='reinstate')
    def reinstate(self, request, pk=None):
        """POST /api/student-lifecycle/{id}/reinstate/ — tenant super admin and above."""
        from accounts.permissions import has_min_role
        if not has_min_role(request.user, 'SUPER_ADMIN'):
            return Response(
                {'success': False, 'error': 'Only School Admin can reinstate students.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            student = Student.objects.get(id=pk, tenant=request.user.tenant)
        except Student.DoesNotExist:
            return Response({'success': False, 'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        if student.status != 'DROPOUT':
            return Response(
                {'success': False, 'error': 'Only dropout students can be reinstated.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Reinstate the student
        student.status = 'ACTIVE'
        student.leaving_date = None
        student.leaving_reason = ''
        student.save()

        # Update academic record
        current_record = StudentAcademicRecord.objects.filter(
            student=student, status='DROPOUT'
        ).order_by('-academic_year__start_date').first()

        if current_record:
            current_record.status = 'ACTIVE'
            current_record.status_changed_at = timezone.now()
            current_record.status_changed_by = request.user
            current_record.status_reason = f'Reinstated: {request.data.get("reason", "")}'
            current_record.save()

        log_audit_action(
            user=request.user,
            action='REINSTATE_STUDENT',
            model_name='Student',
            record_id=student.id,
            details={'reason': request.data.get('reason', '')}
        )

        return Response({
            'success': True,
            'data': {'student_id': str(student.id), 'status': 'ACTIVE'},
        })
