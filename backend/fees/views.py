from datetime import date, timedelta
import logging
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
from django.db import transaction, models
from django.db.models import Sum, Q, F, ExpressionWrapper
from decimal import Decimal

logger = logging.getLogger(__name__)

from accounts.permissions import IsSchoolAdminOrAbove, IsBranchAdminOrAbove, IsAccountantOrAbove, normalize_role
from .approval_routing import fee_approval_queryset_for_user, user_can_act_on_fee_approval, user_can_access_fee_approval_api
from accounts.utils import (
    get_validated_branch_id,
    get_active_academic_year,
    log_audit_action,
    filter_queryset_for_user_tenant,
)
from students.models import Student, ClassSection
from .models import (
    FeeCategory, FeeStructure, FeeStructureItem, StudentWallet,
    FeeConcession, StudentConcession, LateFeeRule,
    FeeInvoice, FeeInvoiceItem, Payment,
    StudentFeeItem, FeeApprovalRequest,
)
from .serializers import (
    FeeCategorySerializer, FeeStructureSerializer, FeeStructureItemSerializer,
    FeeConcessionSerializer, StudentConcessionSerializer,
    LateFeeRuleSerializer, FeeInvoiceSerializer, FeeInvoiceListSerializer,
    PaymentSerializer, InvoiceGenerateSerializer, OfflinePaymentSerializer,
    StudentFeeItemSerializer, FeeApprovalRequestSerializer, InitialPaymentSerializer,
)
from .services import process_initial_payment, cleanup_after_fee_approval_rejection


class IsFeeApprovalReviewer(permissions.BasePermission):
    """List/retrieve only for tenant SUPER_ADMIN and ZONAL_ADMIN; mutating writes disallowed."""

    def has_permission(self, request, view):
        if view.action in ('create', 'update', 'partial_update', 'destroy'):
            return False
        return user_can_access_fee_approval_api(request.user)


class CanActOnFeeApproval(permissions.BasePermission):
    def has_permission(self, request, view):
        return user_can_access_fee_approval_api(request.user)


class FeeCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = FeeCategorySerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        qs = filter_queryset_for_user_tenant(
            FeeCategory.objects.all(), self.request.user, 'branch__tenant'
        )
        branch_id = get_validated_branch_id(self.request.user, self.request.query_params.get('branch') or self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class FeeStructureViewSet(viewsets.ModelViewSet):
    serializer_class = FeeStructureSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({'success': True, 'data': serializer.data})

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(user.role)
        qs = filter_queryset_for_user_tenant(
            FeeStructure.objects.all(), user, 'branch__tenant'
        ).prefetch_related('items')
        
        grade = self.request.query_params.get('grade')
        ay = self.request.query_params.get('academic_year_id')
        branch = self.request.query_params.get('branch') or self.request.query_params.get('branch_id')
        
        # Branch Isolation for multi-tenant roles
        if role not in ['OWNER', 'SUPER_ADMIN'] and user.branch:
            branch = user.branch.id

        if grade:
            qs = qs.filter(grade=grade)
        if ay:
            qs = qs.filter(academic_year_id=ay)
        if branch:
            qs = qs.filter(branch_id=branch)
            
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='items')
    def add_item(self, request, pk=None):
        structure = self.get_object()
        serializer = FeeStructureItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(structure=structure)
        return Response({'success': True, 'data': serializer.data}, status=status.HTTP_201_CREATED)


class FeeStructureItemViewSet(viewsets.ModelViewSet):
    serializer_class = FeeStructureItemSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        return filter_queryset_for_user_tenant(
            FeeStructureItem.objects.all(), self.request.user, 'structure__branch__tenant'
        )


class StudentFeeItemViewSet(viewsets.ModelViewSet):
    serializer_class = StudentFeeItemSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        return filter_queryset_for_user_tenant(
            StudentFeeItem.objects.all(), self.request.user, 'student__branch__tenant'
        )


class FeeApprovalRequestViewSet(viewsets.ModelViewSet):
    serializer_class = FeeApprovalRequestSerializer
    permission_classes = [IsAuthenticated, IsFeeApprovalReviewer]

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [IsAuthenticated(), CanActOnFeeApproval()]
        return [IsAuthenticated(), IsFeeApprovalReviewer()]

    def get_queryset(self):
        user = self.request.user
        base = FeeApprovalRequest.objects.select_related(
            'branch',
            'branch__zone',
            'student',
            'student__academic_year',
            'student__class_section',
            'requested_by',
            'reviewed_by',
        )
        qs = fee_approval_queryset_for_user(user, base)
        branch_id = get_validated_branch_id(user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        stat = self.request.query_params.get('status')
        if stat:
            qs = qs.filter(status=stat)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(
            tenant=self.request.user.tenant,
            requested_by=self.request.user
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        approval = self.get_object()
        if not user_can_act_on_fee_approval(request.user, approval):
            raise PermissionDenied('You cannot approve this request.')
        approval.status = 'APPROVED'
        approval.reviewed_by = request.user
        approval.reviewed_at = timezone.now()
        approval.admin_remarks = request.data.get('remarks', '')
        approval.save()
        
        # After approval, update student status if applicable
        student = approval.student
        if student.status in ['PENDING_APPROVAL', 'INACTIVE']:
            student.status = 'ACTIVE'
            student.save()
        
        return Response({'success': True, 'message': 'Fee reduction approved.'})

    @transaction.atomic
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        approval = self.get_object()
        if not user_can_act_on_fee_approval(request.user, approval):
            raise PermissionDenied('You cannot reject this request.')

        approval.status = 'REJECTED'
        approval.reviewed_by = request.user
        approval.reviewed_at = timezone.now()
        approval.admin_remarks = request.data.get('remarks', '')
        approval.save()

        student = approval.student
        cleanup = cleanup_after_fee_approval_rejection(
            student,
            request.user,
            remarks=approval.admin_remarks or '',
        )
        refund_total = cleanup['refund_total']
        reversed_receipts = cleanup['reversed_receipts']

        if student.status == 'PENDING_APPROVAL':
            student.status = 'INACTIVE'
            student.save(update_fields=['status'])

        return Response({
            'success': True,
            'message': (
                f"Fee reduction rejected. Refund required: ₹{float(refund_total):.2f}"
                if refund_total > 0 else 'Fee reduction rejected. Academic fee request cancelled.'
            ),
            'data': {
                'refund_total': float(refund_total),
                'reversed_receipts': reversed_receipts,
            },
        })


class FeeConcessionViewSet(viewsets.ModelViewSet):
    serializer_class = FeeConcessionSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        return filter_queryset_for_user_tenant(
            FeeConcession.objects.all(), self.request.user, 'branch__tenant'
        )

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class LateFeeRuleViewSet(viewsets.ModelViewSet):
    serializer_class = LateFeeRuleSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        return filter_queryset_for_user_tenant(
            LateFeeRule.objects.all(), self.request.user, 'branch__tenant'
        )

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class FeeInvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_serializer_class(self):
        if self.action == 'list':
            return FeeInvoiceListSerializer
        return FeeInvoiceSerializer

    def get_queryset(self):
        user = self.request.user
        qs = filter_queryset_for_user_tenant(
            FeeInvoice.objects.all(), user, 'branch__tenant'
        ).select_related('student')
        # Branch isolation
        branch_id = get_validated_branch_id(user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        status_filter = self.request.query_params.get('status')
        student = self.request.query_params.get('student_id')
        month = self.request.query_params.get('month')
        if status_filter:
            qs = qs.filter(status=status_filter)
        if student:
            qs = qs.filter(student_id=student)
        if month:
            qs = qs.filter(month=month)
        return qs

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        serializer = InvoiceGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from .services import generate_monthly_invoices
        role = normalize_role(request.user.role)
        
        # Tenant SUPER_ADMIN may have branch=None; accept branch_id from request data
        branch = request.user.branch
        if not branch and data.get('branch_id'):
            from tenants.models import Branch
            try:
                if role == 'OWNER':
                    branch = Branch.objects.get(id=data['branch_id'])
                else:
                    branch = Branch.objects.get(id=data['branch_id'], tenant=request.user.tenant)
            except Branch.DoesNotExist:
                return Response({'detail': 'Invalid branch_id.'}, status=400)
        
        if not branch:
            return Response({'detail': 'branch_id is required for school-level admins.'}, status=400)

        if role != 'OWNER' and request.user.tenant_id and branch.tenant_id != request.user.tenant_id:
            return Response({'detail': 'Invalid branch_id.'}, status=400)

        result = generate_monthly_invoices(
            tenant=branch.tenant,
            branch=branch,
            academic_year_id=data['academic_year_id'],
            month=data['month'],
            target=data['target'],
            class_section_id=data.get('class_section_id'),
            student_id=data.get('student_id'),
            user=request.user
        )

        return Response({
            'success': True,
            'data': result
        })

    @action(detail=False, methods=['post'], url_path='generate-transport')
    def generate_transport(self, request):
        """Generate ONLY a transport invoice for a specific student."""
        student_id = request.data.get('student_id')
        academic_year_id = request.data.get('academic_year_id')
        month = request.data.get('month')

        if not all([student_id, academic_year_id, month]):
            return Response({'detail': 'student_id, academic_year_id, and month are required.'}, status=400)

        from .services import generate_transport_invoice_only
        result = generate_transport_invoice_only(student_id, academic_year_id, month)

        if result.get('error'):
            return Response({'detail': result['error']}, status=400)

        return Response({'success': True, 'data': result})

    @action(detail=True, methods=['patch'], url_path='cancel')
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        reason = request.data.get('reason', '')
        if not reason:
            return Response({'detail': 'Cancellation reason is required.'}, status=400)
        if invoice.status in ['PAID', 'CANCELLED']:
            return Response({'detail': f'Cannot cancel a {invoice.status} invoice.'}, status=400)
        if invoice.paid_amount > 0:
            return Response({'detail': 'Cannot cancel an invoice with recorded payments. Reverse payments first.'}, status=400)
        invoice.status = 'CANCELLED'
        invoice.cancelled_by = request.user
        invoice.cancellation_reason = reason
        invoice.save()
        return Response({'success': True, 'data': FeeInvoiceSerializer(invoice).data})

    @action(detail=True, methods=['patch'], url_path='waive')
    def waive(self, request, pk=None):
        invoice = self.get_object()
        reason = request.data.get('reason', '')
        if not reason:
            return Response({'detail': 'Waive reason is required.'}, status=400)
        if invoice.status in ['PAID', 'CANCELLED', 'WAIVED']:
            return Response({'detail': f'Cannot waive a {invoice.status} invoice.'}, status=400)
        invoice.status = 'WAIVED'
        invoice.outstanding_amount = Decimal('0.00')
        invoice.cancellation_reason = reason
        invoice.save()
        return Response({'success': True, 'data': FeeInvoiceSerializer(invoice).data})

    @action(detail=False, methods=['post'], url_path='bulk-remind')
    def bulk_remind(self, request):
        """Send fee reminders to selected invoices."""
        invoice_ids = request.data.get('invoice_ids', [])
        if not invoice_ids:
            return Response({'detail': 'No invoices selected.'}, status=400)

        inv_base = FeeInvoice.objects.filter(
            id__in=invoice_ids,
            status__in=['SENT', 'OVERDUE', 'PARTIALLY_PAID'],
        )
        invoices = filter_queryset_for_user_tenant(
            inv_base, request.user, 'branch__tenant'
        ).select_related('student', 'branch')

        from notifications.dispatcher import dispatch_notification
        from notifications.in_app_helpers import fee_invoice_parent_payload

        reminded = 0
        skipped_no_parent = 0
        today = timezone.now().date()
        for inv in invoices:
            parent = inv.student.primary_parent
            if not parent:
                skipped_no_parent += 1
                continue
            event_type = 'PAYMENT_OVERDUE' if inv.due_date and inv.due_date < today else 'FEE_REMINDER'
            payload = fee_invoice_parent_payload(inv)
            log = dispatch_notification(
                tenant=inv.branch.tenant,
                branch=inv.branch,
                event_type=event_type,
                recipient_user=parent,
                payload=payload,
            )
            if log:
                reminded += 1

        return Response({
            'success': True,
            'data': {
                'reminded': reminded,
                'skipped_no_parent': skipped_no_parent,
                'message': f'{reminded} in-app reminder(s) sent.'
                + (f' {skipped_no_parent} skipped (no linked parent user).' if skipped_no_parent else ''),
            }
        })

    @action(detail=False, methods=['get'], url_path='defaulters')
    def defaulters(self, request):
        aging = request.query_params.get('aging', '30')
        today = timezone.now().date()

        base_qs = filter_queryset_for_user_tenant(
            FeeInvoice.objects.all(), request.user, 'branch__tenant'
        )
        # 1. Calculate Date Thresholds
        filters = Q(status__in=['SENT', 'OVERDUE', 'PARTIALLY_PAID']) & Q(outstanding_amount__gt=0)

        if aging == '30':
            filters &= Q(due_date__gte=today - timedelta(days=30), due_date__lt=today)
        elif aging == '60':
            filters &= Q(due_date__gte=today - timedelta(days=60), due_date__lt=today - timedelta(days=30))
        elif aging == '90':
            filters &= Q(due_date__gte=today - timedelta(days=90), due_date__lt=today - timedelta(days=60))
        elif aging == '90_plus':
            filters &= Q(due_date__lt=today - timedelta(days=90))
        else:
            filters &= Q(due_date__lt=today) # Default: all overdue

        overdue_invoices = list(base_qs.filter(filters).values(
            'student__id',
            'student__first_name',
            'student__last_name',
            'student__admission_number',
            'student__class_section__grade',
            'outstanding_amount',
            'due_date',
            'invoice_number'
        ).order_by('due_date'))

        # 2. Map results (Highly efficient without object instantiation)
        records = [{
            'student_id': str(inv['student__id']),
            'student_name': f"{inv['student__first_name']} {inv['student__last_name']}",
            'admission_number': inv['student__admission_number'],
            'grade': inv['student__class_section__grade'],
            'outstanding_amount': str(inv['outstanding_amount']),
            'overdue_since': str(inv['due_date']),
            'days_overdue': (today - inv['due_date']).days,
            'invoice_number': inv['invoice_number'],
        } for inv in overdue_invoices]

        total_outstanding = sum(Decimal(r['outstanding_amount']) for r in records)
        return Response({
            'success': True,
            'data': {
                'summary': {'total_students': len(records), 'total_outstanding': str(total_outstanding)},
                'records': records,
            }
        })


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        qs = filter_queryset_for_user_tenant(
            Payment.objects.all(), self.request.user, 'branch__tenant'
        ).select_related('student', 'invoice')
        branch_id = get_validated_branch_id(self.request.user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    @transaction.atomic
    @action(detail=False, methods=['post'], url_path='offline')
    def record_offline(self, request):
        serializer = OfflinePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Lock the invoice row to prevent concurrent payment race conditions (tenant-scoped)
        inv_qs = FeeInvoice.objects.select_for_update().filter(id=data['invoice_id'])
        role = normalize_role(request.user.role)
        if request.user.tenant:
            inv_qs = inv_qs.filter(tenant=request.user.tenant)
        elif role != 'OWNER':
            return Response({'detail': 'Invoice not found.'}, status=404)
        try:
            invoice = inv_qs.get()
        except FeeInvoice.DoesNotExist:
            return Response({'detail': 'Invoice not found.'}, status=404)

        amount = data['amount']

        # Validate invoice is payable
        if invoice.status in ['PAID', 'CANCELLED', 'WAIVED']:
            return Response({
                'detail': f'Cannot pay a {invoice.status} invoice.'
            }, status=400)

        # Validate amount doesn't exceed outstanding
        if amount > invoice.outstanding_amount:
            return Response({
                'detail': f'Amount exceeds outstanding balance of ₹{invoice.outstanding_amount}'
            }, status=400)

        # Create payment safely
        from .models import DocumentSequence
        receipt_number = DocumentSequence.get_next_sequence(
            branch=invoice.branch,
            document_type='RECEIPT',
            prefix=f"RCP-{invoice.branch.branch_code}-{timezone.now().strftime('%Y%m')}"
        )

        payment = Payment.objects.create(
            tenant=invoice.tenant,
            invoice=invoice,
            student=invoice.student,
            branch=invoice.branch,
            amount=amount,
            payment_mode=data['payment_mode'],
            payment_date=data['payment_date'],
            reference_number=data.get('reference_number'),
            bank_name=data.get('bank_name'),
            status='COMPLETED',
            collected_by=request.user,
            requires_approval=False,
            receipt_number=receipt_number,
        )

        # Update invoice amounts — safe because row is locked
        if payment.status == 'COMPLETED':
            invoice.paid_amount += amount
            invoice.outstanding_amount = max(invoice.net_amount - invoice.paid_amount, Decimal('0.00'))
            if invoice.outstanding_amount <= 0:
                invoice.status = 'PAID'
                invoice.outstanding_amount = Decimal('0.00')
            else:
                invoice.status = 'PARTIALLY_PAID'
            invoice.save()

            # Create TransactionLog INCOME entry — NO try/except!
            # If this fails, @transaction.atomic rolls back the payment too,
            # guaranteeing ledger consistency.
            from expenses.models import TransactionLog
            TransactionLog.objects.create(
                tenant=invoice.tenant,
                branch=invoice.branch,
                transaction_type='INCOME',
                category='Fee Payment',
                reference_model='Payment',
                reference_id=payment.id,
                amount=amount,
                description=f"Payment for {invoice.invoice_number}",
                transaction_date=data['payment_date'],
            )

            log_audit_action(
                user=request.user,
                action='CREATE_OFFLINE_PAYMENT',
                model_name='Payment',
                record_id=payment.id,
                details={
                    'invoice_number': invoice.invoice_number,
                    'amount': float(amount),
                    'receipt_number': receipt_number
                },
                tenant=invoice.tenant,
            )

            # Auto-populate receipt download URL
            payment.receipt_url = f"/api/templates/generate/receipt/{payment.id}/"
            payment.save(update_fields=['receipt_url'])

        return Response({
            'success': True,
            'data': PaymentSerializer(payment).data,
            'receipt_url': payment.receipt_url,
        }, status=status.HTTP_201_CREATED)

    @transaction.atomic
    @action(detail=False, methods=['post'], url_path='initial-payment')
    def initial_payment(self, request):
        serializer = InitialPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        stu_qs = Student.objects.filter(id=data['student_id'])
        role = normalize_role(request.user.role)
        if request.user.tenant:
            stu_qs = stu_qs.filter(tenant=request.user.tenant)
        elif role != 'OWNER':
            return Response({'detail': 'Student not found.'}, status=404)
        try:
            student = stu_qs.get()
        except Student.DoesNotExist:
            return Response({'detail': 'Student not found.'}, status=404)

        from rest_framework.exceptions import ValidationError as DRFValidationError

        try:
            result = process_initial_payment(
                user=request.user,
                student=student,
                admission_fee=data['admission_fee'],
                tuition_payment=data['tuition_payment'],
                fixed_deposit=data.get('fixed_deposit', 0),
                payment_mode=data['payment_mode'],
                payment_date=data['payment_date'],
                reference_number=data.get('reference_number'),
            )
        except DRFValidationError as e:
            return Response({'detail': e.detail}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception('Initial payment failed for student %s by user %s', student.id, request.user.id)
            return Response(
                {'detail': 'Initial payment failed. Please verify invoice balances and try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({'success': True, 'data': result}, status=status.HTTP_201_CREATED)

    @transaction.atomic
    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse_payment(self, request, pk=None):
        """Reverse a completed payment — updates invoice and creates negative ledger entry."""
        reason = request.data.get('reason', '')
        if not reason:
            return Response({'detail': 'Reversal reason is required.'}, status=400)

        pay_qs = Payment.objects.select_for_update().filter(id=pk)
        role = normalize_role(request.user.role)
        if request.user.tenant:
            pay_qs = pay_qs.filter(tenant=request.user.tenant)
        elif role != 'OWNER':
            return Response({'detail': 'Payment not found.'}, status=404)
        try:
            payment = pay_qs.get()
        except Payment.DoesNotExist:
            return Response({'detail': 'Payment not found.'}, status=404)

        if payment.status != 'COMPLETED':
            return Response({'detail': f'Only completed payments can be reversed. Current status: {payment.status}'}, status=400)

        # Lock and update the invoice
        inv_qs = FeeInvoice.objects.select_for_update().filter(id=payment.invoice_id)
        if request.user.tenant:
            inv_qs = inv_qs.filter(tenant=request.user.tenant)
        elif role != 'OWNER':
            return Response({'detail': 'Payment not found.'}, status=404)
        try:
            invoice = inv_qs.get()
        except FeeInvoice.DoesNotExist:
            return Response({'detail': 'Invoice not found.'}, status=404)

        invoice.paid_amount = max(invoice.paid_amount - payment.amount, Decimal('0.00'))
        invoice.outstanding_amount = invoice.net_amount - invoice.paid_amount
        if invoice.paid_amount > 0:
            invoice.status = 'PARTIALLY_PAID'
        else:
            invoice.status = 'SENT'
        invoice.save()

        # Mark payment as refunded
        payment.status = 'REFUNDED'
        payment.save()

        # Create a negative ledger entry for the reversal
        from expenses.models import TransactionLog
        TransactionLog.objects.create(
            tenant=payment.tenant,
            branch=payment.branch,
            transaction_type='INCOME',
            category='Fee Reversal',
            reference_model='Payment',
            reference_id=payment.id,
            amount=-payment.amount,  # Negative entry
            description=f"Reversal: {reason} (Receipt: {payment.receipt_number})",
            transaction_date=timezone.now().date(),
        )

        log_audit_action(
            user=request.user,
            action='REVERSE_PAYMENT',
            model_name='Payment',
            record_id=payment.id,
            details={
                'reason': reason,
                'amount': float(payment.amount),
                'receipt_number': payment.receipt_number,
                'invoice_number': invoice.invoice_number
            },
            tenant=payment.tenant,
        )

        logger.info(f"Payment {payment.receipt_number} reversed by {request.user.email}. Reason: {reason}")

        return Response({
            'success': True, 
            'message': f'Payment {payment.receipt_number} reversed successfully.',
            'data': PaymentSerializer(payment).data
        })
