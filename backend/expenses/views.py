from datetime import datetime
import uuid

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum, Max
from django.db import transaction
from decimal import Decimal

from accounts.permissions import IsAccountantOrAbove, has_min_role, normalize_role
from accounts.utils import (
    apply_scope_filter,
    get_validated_branch_id,
    log_audit_action,
    log_bulk_action,
    filter_queryset_for_user_tenant,
)
from tenants.models import Branch
from .approval import EXPENSE_AUTO_APPROVE_MAX, user_can_approve_submitted_expense
from .models import ExpenseCategory, Vendor, Expense, TransactionLog
from .other_income_presets import (
    MANUAL_OTHER_INCOME_CATEGORY_PRESETS,
    RESERVED_MANUAL_OTHER_INCOME_CATEGORIES,
)
from .serializers import ExpenseCategorySerializer, VendorSerializer, ExpenseSerializer, TransactionLogSerializer


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        qs = filter_queryset_for_user_tenant(
            ExpenseCategory.objects.all(), self.request.user, 'branch__tenant'
        )
        branch_id = get_validated_branch_id(self.request.user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class VendorViewSet(viewsets.ModelViewSet):
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        qs = filter_queryset_for_user_tenant(
            Vendor.objects.all(), self.request.user, 'branch__tenant'
        )
        branch_id = get_validated_branch_id(self.request.user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        qs = filter_queryset_for_user_tenant(
            Expense.objects.all(), self.request.user, 'branch__tenant'
        ).select_related('category', 'vendor', 'branch', 'submitted_by')
        branch_id = get_validated_branch_id(self.request.user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if normalize_role(getattr(self.request.user, 'role', None)) == 'ZONAL_ADMIN':
            qs = apply_scope_filter(
                qs,
                self.request.user,
                tenant_lookup='tenant_id',
                branch_lookup='branch_id',
                zone_lookup='branch__zone_id',
            )
        stat = self.request.query_params.get('status')
        if stat:
            qs = qs.filter(status=stat)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        role = normalize_role(user.role)
        from rest_framework.exceptions import PermissionDenied, ValidationError
        if role != 'ACCOUNTANT':
            raise PermissionDenied("Only accountants can log expenses.")
        branch = user.branch
        if not branch:
            raise ValidationError({"branch": "Your account has no branch assigned. Contact your administrator."})
            
        raw_expense_date = self.request.data.get('expense_date')
        if raw_expense_date:
            try:
                if isinstance(raw_expense_date, str):
                    expense_date = datetime.strptime(str(raw_expense_date)[:10], '%Y-%m-%d').date()
                else:
                    expense_date = raw_expense_date
            except ValueError:
                expense_date = timezone.now().date()
        else:
            expense_date = timezone.now().date()

        category_name = self.request.data.get('category_name')
        category_id = self.request.data.get('category')
        if category_id:
            category = ExpenseCategory.objects.get(id=category_id, tenant=user.tenant, branch=branch)
        elif category_name:
            category, _ = ExpenseCategory.objects.get_or_create(
                tenant=user.tenant, branch=branch, name=category_name,
                defaults={'code': category_name[:10].upper().replace(' ', '_')}
            )
        else:
            category, _ = ExpenseCategory.objects.get_or_create(
                tenant=user.tenant, branch=branch, name='General',
                defaults={'code': 'GEN'}
            )

        vendor_name = self.request.data.get('vendor_name')
        vendor_id = self.request.data.get('vendor')
        vendor_obj = None
        if vendor_id:
            vendor_obj = Vendor.objects.get(id=vendor_id, tenant=user.tenant, branch=branch)
        elif vendor_name:
            vendor_obj, _ = Vendor.objects.get_or_create(
                tenant=user.tenant, branch=branch, name=vendor_name
            )

        # Use manually provided voucher number, or auto-generate
        manual_voucher = self.request.data.get('voucher_number')
        if manual_voucher:
            try:
                voucher_number = int(manual_voucher)
            except ValueError:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"voucher_number": "Voucher number must be an integer."})
            
            if Expense.objects.filter(branch=branch, voucher_number=voucher_number).exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"voucher_number": "This voucher number already exists."})
        else:
            last_expense = Expense.objects.filter(branch=branch).order_by('-voucher_number').first()
            voucher_number = (last_expense.voucher_number + 1) if (last_expense and last_expense.voucher_number) else 1

        amount_val = Decimal(str(self.request.data.get('amount', 0)))
        
        # Smart routing: auto-approve if under threshold
        if amount_val <= EXPENSE_AUTO_APPROVE_MAX:
            initial_status = 'APPROVED'
            expense = serializer.save(
                tenant=user.tenant,
                branch=branch,
                expense_date=expense_date,
                category=category,
                vendor=vendor_obj,
                submitted_by=user,
                approved_by=user,
                approved_at=timezone.now(),
                status=initial_status,
                voucher_number=voucher_number
            )
            TransactionLog.objects.create(
                tenant=user.tenant, branch=branch,
                transaction_type='EXPENSE', category=category.name,
                reference_model='Expense', reference_id=expense.id,
                amount=expense.amount, description=expense.title,
                transaction_date=expense.expense_date,
            )
        else:
            initial_status = 'SUBMITTED'
            expense = serializer.save(
                tenant=user.tenant,
                branch=branch,
                expense_date=expense_date,
                category=category,
                vendor=vendor_obj,
                submitted_by=user,
                status=initial_status,
                voucher_number=voucher_number
            )

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        expense = self.get_object()
        new_status = request.data.get('status')
        
        if new_status == 'APPROVED' and expense.status == 'SUBMITTED':
            if not user_can_approve_submitted_expense(request.user, expense.amount):
                return Response(
                    {
                        'detail': 'You are not authorized to approve this expense amount. '
                        'Above ₹3,000 up to ₹5,000: zonal or chief accountant. Above ₹5,000: school super admin only.',
                    },
                    status=403,
                )
        if new_status == 'REJECTED' and expense.status == 'SUBMITTED':
            if not user_can_approve_submitted_expense(request.user, expense.amount):
                return Response(
                    {'detail': 'You are not authorized to reject this expense for the same routing rules as approval.'},
                    status=403,
                )

        VALID = {'DRAFT': ['SUBMITTED'], 'SUBMITTED': ['APPROVED', 'REJECTED'], 'REJECTED': ['DRAFT']}
        allowed = VALID.get(expense.status, [])
        if new_status not in allowed:
            return Response({'detail': f'Cannot transition from {expense.status} to {new_status}'}, status=400)

        expense.status = new_status
        if new_status == 'APPROVED':
            expense.approved_by = request.user
            expense.approved_at = timezone.now()
            TransactionLog.objects.create(
                tenant=expense.tenant, branch=expense.branch,
                transaction_type='EXPENSE', category=expense.category.name,
                reference_model='Expense', reference_id=expense.id,
                amount=expense.amount, description=expense.title,
                transaction_date=expense.expense_date,
            )
        if new_status == 'REJECTED':
            expense.rejection_reason = request.data.get('reason', '')
        expense.save()

        log_audit_action(
            user=request.user,
            action=f'EXPENSE_{new_status}',
            model_name='Expense',
            record_id=expense.id,
            details={
                'title': expense.title,
                'amount': float(expense.amount),
                'status': new_status
            },
            tenant=expense.tenant,
        )
        return Response({'success': True, 'data': ExpenseSerializer(expense).data})

    @action(detail=False, methods=['post'], url_path='bulk-approve')
    def bulk_approve(self, request):
        if not has_min_role(request.user, 'ZONAL_ADMIN'):
            return Response({'detail': 'Insufficient permission to bulk-approve expenses.'}, status=403)

        expense_ids = request.data.get('expense_ids', [])
        if not expense_ids:
            return Response({'detail': 'No expenses selected.'}, status=400)

        expenses_qs = filter_queryset_for_user_tenant(
            Expense.objects.filter(id__in=expense_ids, status='SUBMITTED').select_related('category', 'branch'),
            request.user,
            'branch__tenant',
        )
        if normalize_role(getattr(request.user, 'role', None)) == 'ZONAL_ADMIN':
            expenses_qs = apply_scope_filter(
                expenses_qs,
                request.user,
                tenant_lookup='tenant_id',
                branch_lookup='branch_id',
                zone_lookup='branch__zone_id',
            )

        approved_count = 0
        skipped = []
        tenant_for_log = request.user.tenant

        with transaction.atomic():
            for expense in expenses_qs:
                if not user_can_approve_submitted_expense(request.user, expense.amount):
                    skipped.append(
                        {
                            'id': str(expense.id),
                            'amount': str(expense.amount),
                            'detail': 'Not authorized for this amount tier.',
                        }
                    )
                    continue
                expense.status = 'APPROVED'
                expense.approved_by = request.user
                expense.approved_at = timezone.now()
                expense.save()

                TransactionLog.objects.create(
                    tenant=expense.tenant, branch=expense.branch,
                    transaction_type='EXPENSE', category=expense.category.name,
                    reference_model='Expense', reference_id=expense.id,
                    amount=expense.amount, description=expense.title,
                    transaction_date=expense.expense_date,
                )
                approved_count += 1
                if tenant_for_log is None:
                    tenant_for_log = expense.tenant

            if approved_count > 0:
                log_bulk_action(
                    user=request.user,
                    action_type='EXPENSE_APPROVAL',
                    record_count=approved_count,
                    details={'expense_ids': expense_ids, 'skipped': skipped},
                    tenant=tenant_for_log,
                )

        return Response({
            'success': True,
            'data': {
                'approved': approved_count,
                'skipped': skipped,
                'message': f'{approved_count} expense(s) approved successfully.'
                + (f' {len(skipped)} skipped (not authorized for amount).' if skipped else ''),
            }
        })

    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """
        Create multiple same-day expenses in one request.
        Payload:
          {
            "expense_date": "YYYY-MM-DD",
            "items": [
              {"title": "...", "amount": "123", "payment_mode": "CASH", "category_name": "...", "vendor_name": "...", "voucher_number": 10},
              ...
            ]
          }
        """
        user = request.user
        role = normalize_role(user.role)
        from rest_framework.exceptions import PermissionDenied, ValidationError

        if role != 'ACCOUNTANT':
            raise PermissionDenied("Only accountants can log expenses.")
        branch = user.branch
        if not branch:
            raise ValidationError({"branch": "Your account has no branch assigned. Contact your administrator."})

        items = request.data.get('items') or []
        if not isinstance(items, list) or not items:
            raise ValidationError({"items": "Provide at least one expense row."})

        raw_expense_date = request.data.get('expense_date')
        if raw_expense_date:
            try:
                if isinstance(raw_expense_date, str):
                    expense_date = datetime.strptime(str(raw_expense_date)[:10], '%Y-%m-%d').date()
                else:
                    expense_date = raw_expense_date
            except ValueError:
                raise ValidationError({"expense_date": "Date must be in YYYY-MM-DD format."})
        else:
            expense_date = timezone.now().date()

        max_rows = 100
        if len(items) > max_rows:
            raise ValidationError({"items": f"Max {max_rows} rows allowed per save."})

        created = []
        next_voucher = (Expense.objects.filter(branch=branch).aggregate(m=Max('voucher_number'))['m'] or 0) + 1
        seen_manual_vouchers = set()

        with transaction.atomic():
            for idx, row in enumerate(items, start=1):
                title = str((row or {}).get('title') or '').strip()
                if not title:
                    raise ValidationError({"items": f"Row {idx}: title is required."})

                amount_raw = (row or {}).get('amount')
                try:
                    amount_val = Decimal(str(amount_raw))
                except Exception:
                    raise ValidationError({"items": f"Row {idx}: amount is invalid."})
                if amount_val <= 0:
                    raise ValidationError({"items": f"Row {idx}: amount must be greater than zero."})

                payment_mode = str((row or {}).get('payment_mode') or 'CASH')
                allowed_modes = {'CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'NEFT', 'RTGS', 'CARD'}
                if payment_mode not in allowed_modes:
                    raise ValidationError({"items": f"Row {idx}: invalid payment_mode '{payment_mode}'."})

                category_name = str((row or {}).get('category_name') or '').strip() or 'General'
                category, _ = ExpenseCategory.objects.get_or_create(
                    tenant=user.tenant, branch=branch, name=category_name,
                    defaults={'code': category_name[:10].upper().replace(' ', '_') or 'GEN'}
                )

                vendor_obj = None
                vendor_name = str((row or {}).get('vendor_name') or '').strip()
                if vendor_name:
                    vendor_obj, _ = Vendor.objects.get_or_create(
                        tenant=user.tenant, branch=branch, name=vendor_name
                    )

                manual_voucher = (row or {}).get('voucher_number')
                if manual_voucher in (None, ''):
                    voucher_number = next_voucher
                    next_voucher += 1
                else:
                    try:
                        voucher_number = int(manual_voucher)
                    except Exception:
                        raise ValidationError({"items": f"Row {idx}: voucher_number must be an integer."})
                    if voucher_number in seen_manual_vouchers:
                        raise ValidationError({"items": f"Row {idx}: duplicate voucher_number in request."})
                    seen_manual_vouchers.add(voucher_number)
                    if Expense.objects.filter(branch=branch, voucher_number=voucher_number).exists():
                        raise ValidationError({"items": f"Row {idx}: voucher_number already exists."})

                status_value = 'APPROVED' if amount_val <= 3000 else 'SUBMITTED'
                expense = Expense.objects.create(
                    tenant=user.tenant,
                    branch=branch,
                    category=category,
                    vendor=vendor_obj,
                    title=title,
                    amount=amount_val,
                    expense_date=expense_date,
                    payment_mode=payment_mode,
                    voucher_number=voucher_number,
                    submitted_by=user,
                    approved_by=user if status_value == 'APPROVED' else None,
                    approved_at=timezone.now() if status_value == 'APPROVED' else None,
                    status=status_value,
                )
                if status_value == 'APPROVED':
                    TransactionLog.objects.create(
                        tenant=user.tenant, branch=branch,
                        transaction_type='EXPENSE', category=category.name,
                        reference_model='Expense', reference_id=expense.id,
                        amount=expense.amount, description=expense.title,
                        transaction_date=expense.expense_date,
                    )
                created.append(expense)

        return Response(
            {
                'success': True,
                'data': {
                    'count': len(created),
                    'items': ExpenseSerializer(created, many=True).data,
                },
            },
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        month = request.query_params.get('month')
        if not month:
            return Response({'detail': 'month is required (YYYY-MM)'}, status=status.HTTP_400_BAD_REQUEST)
        year, m = month.split('-')
        branch_id = get_validated_branch_id(request.user, request.query_params.get('branch_id'))
        base_qs = filter_queryset_for_user_tenant(
            Expense.objects.all(), request.user, 'branch__tenant'
        )
        if branch_id:
            base_qs = base_qs.filter(branch_id=branch_id)
        approved = base_qs.filter(
            status='APPROVED',
            expense_date__year=int(year), expense_date__month=int(m)
        )
        total = approved.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        by_cat = approved.values('category__name').annotate(amount=Sum('amount')).order_by('-amount')
        cats = [{'category': c['category__name'], 'amount': str(c['amount']),
                 'percentage': round(float(c['amount']) / float(total) * 100, 1) if total > 0 else 0}
                for c in by_cat]
        pending = base_qs.filter(
            status__in=['DRAFT', 'SUBMITTED'],
            expense_date__year=int(year), expense_date__month=int(m)
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        return Response({'success': True, 'data': {
            'month': month, 'total_approved': str(total), 'total_pending': str(pending), 'by_category': cats
        }})


class TransactionLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TransactionLogSerializer
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    def get_queryset(self):
        qs = filter_queryset_for_user_tenant(
            TransactionLog.objects.all(), self.request.user, 'branch__tenant'
        )
        branch_id = get_validated_branch_id(self.request.user, self.request.query_params.get('branch_id'))
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        start = self.request.query_params.get('start_date')
        end = self.request.query_params.get('end_date')
        if start:
            qs = qs.filter(transaction_date__gte=start)
        if end:
            qs = qs.filter(transaction_date__lte=end)
        ref_model = self.request.query_params.get('reference_model')
        if ref_model:
            qs = qs.filter(reference_model=ref_model)
        return qs

    @action(detail=False, methods=['get'], url_path='other-income-presets')
    def other_income_presets(self, request):
        """Preset category labels for uniforms, trips, events, books, etc. (non-fee cashbook income)."""
        return Response(
            {
                'success': True,
                'data': {
                    'presets': list(MANUAL_OTHER_INCOME_CATEGORY_PRESETS),
                },
            }
        )

    @action(detail=False, methods=['post'], url_path='record-other-income')
    def record_other_income(self, request):
        """
        Post a positive miscellaneous INCOME row to the cashbook (not fee/tuition).
        Appears in reports → Other Income Receipts and the transaction ledger.
        """
        user = request.user
        if not getattr(user, 'tenant', None):
            return Response({'error': 'Organization context required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = Decimal(str(request.data.get('amount', '0')))
        except Exception:
            return Response({'error': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'error': 'amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)

        category = (request.data.get('category') or '').strip()[:100]
        if not category:
            return Response({'error': 'category is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if category in RESERVED_MANUAL_OTHER_INCOME_CATEGORIES:
            return Response(
                {'error': 'Reserved category — use the Fees module for tuition and fee receipts.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        description = (request.data.get('description') or category)[:255]
        raw_date = request.data.get('transaction_date')
        if raw_date:
            try:
                if isinstance(raw_date, str):
                    transaction_date = datetime.strptime(raw_date[:10], '%Y-%m-%d').date()
                else:
                    transaction_date = raw_date
            except ValueError:
                return Response({'error': 'transaction_date must be YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            transaction_date = timezone.now().date()

        branch_id = get_validated_branch_id(user, request.data.get('branch_id'))
        if branch_id is None:
            if normalize_role(user.role) in ('OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT'):
                return Response({'error': 'branch_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
            branch_id = str(user.branch_id) if user.branch_id else None
        if not branch_id:
            return Response({'error': 'No branch assigned to this account.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            branch = Branch.objects.get(id=branch_id, tenant=user.tenant)
        except Branch.DoesNotExist:
            return Response({'error': 'Invalid branch.'}, status=status.HTTP_404_NOT_FOUND)

        ref_id = uuid.uuid4()
        log = TransactionLog.objects.create(
            tenant=user.tenant,
            branch=branch,
            transaction_type='INCOME',
            category=category,
            reference_model='MANUAL_OTHER_INCOME',
            reference_id=ref_id,
            amount=amount,
            description=description,
            transaction_date=transaction_date,
        )
        log_audit_action(
            user=user,
            action='RECORD_OTHER_INCOME',
            model_name='TransactionLog',
            record_id=log.id,
            details={'amount': str(amount), 'category': category, 'branch_id': str(branch.id)},
            tenant=user.tenant,
        )
        return Response({'success': True, 'data': TransactionLogSerializer(log).data}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='reverse-other-income')
    def reverse_other_income(self, request):
        """
        Reverse a positive MANUAL_OTHER_INCOME line (full remaining balance by default).
        Optional JSON `amount` reverses partially; cumulative reversals cannot exceed the original.
        Creates a negative INCOME line (reference_model=MANUAL_OTHER_INCOME_REVERSAL).
        """
        user = request.user
        if not getattr(user, 'tenant', None):
            return Response({'error': 'Organization context required.'}, status=status.HTTP_400_BAD_REQUEST)

        log_id = request.data.get('log_id')
        if not log_id:
            return Response({'error': 'log_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            original = TransactionLog.objects.get(
                id=log_id,
                tenant=user.tenant,
                transaction_type='INCOME',
                reference_model='MANUAL_OTHER_INCOME',
            )
        except TransactionLog.DoesNotExist:
            return Response(
                {'error': 'Entry not found or cannot be reversed from this action (fee income uses the Fees module).'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if original.amount <= 0:
            return Response({'error': 'Only positive manual other-income lines can be reversed.'}, status=status.HTTP_400_BAD_REQUEST)

        reversed_sum = TransactionLog.objects.filter(
            tenant=user.tenant,
            reference_model='MANUAL_OTHER_INCOME_REVERSAL',
            reference_id=original.id,
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0')
        # Reversal rows store negative amounts; already reversed (positive) = -reversed_sum
        already_reversed = -reversed_sum
        remaining = original.amount - already_reversed
        if remaining <= 0:
            return Response({'error': 'This entry has already been fully reversed.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_amt = request.data.get('amount')
        if raw_amt is None or raw_amt == '':
            reverse_amt = remaining
        else:
            try:
                reverse_amt = Decimal(str(raw_amt))
            except Exception:
                return Response({'error': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)
            if reverse_amt <= 0:
                return Response({'error': 'amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
            if reverse_amt > remaining:
                return Response(
                    {'error': f'Amount exceeds remaining balance ({remaining}).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        reason = (request.data.get('reason') or 'Reversal').strip()[:200]
        desc = f"[Reversal] {reason}: {original.description}"[:255]
        rev = TransactionLog.objects.create(
            tenant=original.tenant,
            branch=original.branch,
            transaction_type='INCOME',
            category=original.category,
            reference_model='MANUAL_OTHER_INCOME_REVERSAL',
            reference_id=original.id,
            amount=-reverse_amt,
            description=desc,
            transaction_date=timezone.now().date(),
        )
        log_audit_action(
            user=user,
            action='REVERSE_OTHER_INCOME',
            model_name='TransactionLog',
            record_id=rev.id,
            details={'original_log_id': str(original.id), 'amount': str(-reverse_amt), 'partial': str(reverse_amt != remaining)},
            tenant=user.tenant,
        )
        return Response({'success': True, 'data': TransactionLogSerializer(rev).data}, status=status.HTTP_201_CREATED)
