from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsAccountantOrAbove, IsSuperAdmin, normalize_role
from accounts.utils import get_validated_branch_id, get_active_academic_year
from django.contrib.auth import get_user_model
User = get_user_model()
from django.db.models import Sum, Count, Q, F, ExpressionWrapper
from django.db import models
from django.utils import timezone
from datetime import timedelta
from expenses.models import TransactionLog
from fees.models import FeeInvoice, FeeApprovalRequest, Payment
from fees.approval_routing import fee_approval_queryset_for_user
from attendance.models import AttendanceRecord
from students.models import Student, AdmissionInquiry, AdmissionApplication
from tenants.models import Branch, Tenant
from decimal import Decimal


class ReportingViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsAccountantOrAbove]

    # ─── Helpers ────────────────────────────────────────────────
    def _get_branch_id(self, request):
        """Validated branch_id — prevents cross-branch data leakage."""
        return get_validated_branch_id(
            request.user,
            request.query_params.get('branch_id')
        )

    def _get_academic_year_id(self, request):
        """Returns academic_year_id from query params or defaults to active AY."""
        ay_id = request.query_params.get('academic_year_id')
        if not ay_id:
            active_ay = get_active_academic_year(request.user.tenant)
            if active_ay:
                ay_id = str(active_ay.id)
        return ay_id

    def _branch_and_zone_scope(self, request):
        """
        branch_id from get_validated_branch_id; when zonal admin omits branch,
        restrict to branches in assigned zones (not the whole tenant).
        """
        branch_id = self._get_branch_id(request)
        zone_ids = None
        if normalize_role(request.user.role) == 'ZONAL_ADMIN' and not branch_id:
            zone_ids = list(
                request.user.zone_accesses.values_list('zone_id', flat=True)
            )
        return branch_id, zone_ids

    def _filter_fee_invoice_qs(self, qs, branch_id, zone_ids):
        if branch_id:
            return qs.filter(branch_id=branch_id)
        if zone_ids is not None:
            return qs.filter(branch__zone_id__in=zone_ids)
        return qs

    def _filter_payment_qs(self, qs, branch_id, zone_ids):
        if branch_id:
            return qs.filter(branch_id=branch_id)
        if zone_ids is not None:
            return qs.filter(branch__zone_id__in=zone_ids)
        return qs

    # ─── Finance Summary (Charts) ──────────────────────────────
    @action(detail=False, methods=['get'], url_path='finance/summary')
    def finance_summary(self, request):
        """Income vs Expense summary for charts — filtered by branch and date range."""
        branch_id = self._get_branch_id(request)
        days = int(request.query_params.get('days', 30))
        start_date = timezone.now().date() - timedelta(days=days)

        qs = TransactionLog.objects.filter(
            tenant=request.user.tenant,
            transaction_date__gte=start_date
        )
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        # Aggregate by date and type
        data = qs.values('transaction_date', 'transaction_type').annotate(
            total_amount=Sum('amount')
        ).order_by('transaction_date')

        # Format for charts: { date: 'YYYY-MM-DD', income: X, expense: Y }
        formatted = {}
        for item in data:
            date_str = item['transaction_date'].isoformat()
            if date_str not in formatted:
                formatted[date_str] = {'date': date_str, 'income': 0, 'expense': 0}
            
            if item['transaction_type'] == 'INCOME':
                formatted[date_str]['income'] = float(item['total_amount'])
            else:
                formatted[date_str]['expense'] = float(item['total_amount'])

        return Response({
            'success': True,
            'data': sorted(formatted.values(), key=lambda x: x['date'])
        })

    # ─── Fee Stats (Dashboard Cards) ───────────────────────────
    @action(detail=False, methods=['get'], url_path='fees/stats')
    def fee_stats(self, request):
        """Fee collection vs outstanding — filtered by branch AND academic year."""
        branch_id, zone_ids = self._branch_and_zone_scope(request)
        ay_id = self._get_academic_year_id(request)

        qs = FeeInvoice.objects.filter(tenant=request.user.tenant)
        qs = self._filter_fee_invoice_qs(qs, branch_id, zone_ids)
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)

        stats = qs.aggregate(
            total_gross=Sum('gross_amount'),
            total_paid=Sum('paid_amount'),
            total_outstanding=Sum('outstanding_amount'),
            count=Count('id')
        )

        # Student count (active only, filtered by branch and AY)
        student_qs = Student.objects.filter(tenant=request.user.tenant, status='ACTIVE')
        if branch_id:
            student_qs = student_qs.filter(branch_id=branch_id)
        elif zone_ids is not None:
            student_qs = student_qs.filter(branch__zone_id__in=zone_ids)
        if ay_id:
            student_qs = student_qs.filter(academic_year_id=ay_id)
        total_students = student_qs.count()

        # Branch count (for admin dashboard)
        br_q = Branch.objects.filter(tenant=request.user.tenant, is_active=True)
        if branch_id:
            br_q = br_q.filter(id=branch_id)
        elif zone_ids is not None:
            br_q = br_q.filter(zone_id__in=zone_ids)
        active_branches = br_q.count()

        # Pending fee reduction approvals (zonal vs school admin routing)
        approval_qs = fee_approval_queryset_for_user(
            request.user,
            FeeApprovalRequest.objects.filter(status='PENDING'),
        )
        if branch_id:
            approval_qs = approval_qs.filter(branch_id=branch_id)
        elif zone_ids is not None:
            approval_qs = approval_qs.filter(branch__zone_id__in=zone_ids)
        pending_approvals = approval_qs.count()

        # Today's collection
        today_payments = Payment.objects.filter(
            tenant=request.user.tenant,
            payment_date=timezone.now().date(),
            status='COMPLETED',
        )
        today_payments = self._filter_payment_qs(today_payments, branch_id, zone_ids)
        if ay_id:
            today_payments = today_payments.filter(invoice__academic_year_id=ay_id)
        today_collection = today_payments.aggregate(total=Sum('amount'))['total'] or 0

        # Revenue received to date (completed payments only — source of truth for cash-in)
        revenue_qs = Payment.objects.filter(tenant=request.user.tenant, status='COMPLETED')
        revenue_qs = self._filter_payment_qs(revenue_qs, branch_id, zone_ids)
        if ay_id:
            revenue_qs = revenue_qs.filter(invoice__academic_year_id=ay_id)
        revenue_collected = revenue_qs.aggregate(total=Sum('amount'))['total'] or 0
        academic_revenue_collected = revenue_qs.exclude(
            invoice__invoice_number__startswith='ADM-'
        ).exclude(
            invoice__invoice_number__startswith='TRN-'
        ).aggregate(total=Sum('amount'))['total'] or 0
        transport_revenue_collected = revenue_qs.filter(
            invoice__invoice_number__startswith='TRN-'
        ).aggregate(total=Sum('amount'))['total'] or 0

        return Response({
            'success': True,
            'data': {
                'total_gross': float(stats['total_gross'] or 0),
                'total_paid': float(stats['total_paid'] or 0),
                'revenue_collected': float(revenue_collected),
                'academic_revenue_collected': float(academic_revenue_collected),
                'transport_revenue_collected': float(transport_revenue_collected),
                'today_collection': float(today_collection),
                'total_outstanding': float(stats['total_outstanding'] or 0),
                'invoice_count': stats['count'],
                'total_students': total_students,
                'active_branches': active_branches,
                'pending_approvals': pending_approvals,
            }
        })

    # ─── Fee Defaulters ────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='fees/defaulters')
    def fee_defaulters(self, request):
        """List of students with outstanding fees — optimized, branch-safe, AY-filtered."""
        branch_id = self._get_branch_id(request)
        ay_id = self._get_academic_year_id(request)

        qs = FeeInvoice.objects.filter(
            tenant=request.user.tenant, 
            outstanding_amount__gt=0
        ).select_related('student', 'student__class_section')
        
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)

        # Optimized: use .values() to avoid Python-level serialization loop
        data = []
        for inv in qs[:500]:  # Cap at 500 to prevent OOM on large datasets
            data.append({
                'invoice_number': inv.invoice_number,
                'student_id': str(inv.student_id),
                'student_name': f"{inv.student.first_name} {inv.student.last_name}",
                'class_name': inv.student.class_section.display_name if inv.student.class_section else "N/A",
                'due_date': inv.due_date,
                'outstanding': float(inv.outstanding_amount),
                'net_amount': float(inv.net_amount)
            })

        return Response({'success': True, 'data': data})

    # ─── Attendance Stats ──────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='attendance/stats')
    def attendance_stats(self, request):
        """Attendance % by class — CORRECTED: LATE counts as present, HALF_DAY as 0.5."""
        branch_id = self._get_branch_id(request)
        days = int(request.query_params.get('days', 7))
        start_date = timezone.now().date() - timedelta(days=days)

        qs = AttendanceRecord.objects.filter(
            tenant=request.user.tenant,
            date__gte=start_date
        ).select_related('class_section')

        if branch_id:
            qs = qs.filter(class_section__branch_id=branch_id)

        # Aggregate with CORRECT attendance formula
        stats = qs.values('class_section__display_name').annotate(
            total=Count('id'),
            present=Count('id', filter=Q(status='PRESENT')),
            late=Count('id', filter=Q(status='LATE')),
            half_day=Count('id', filter=Q(status='HALF_DAY')),
            absent=Count('id', filter=Q(status='ABSENT')),
            on_leave=Count('id', filter=Q(status='ON_LEAVE')),
        )

        data = []
        for s in stats:
            # CORRECT formula: PRESENT + LATE count fully, HALF_DAY counts as 0.5
            effective_present = s['present'] + s['late'] + s['half_day'] * 0.5
            pct = (effective_present / s['total'] * 100) if s['total'] > 0 else 0
            data.append({
                'class_name': s['class_section__display_name'],
                'present': s['present'],
                'late': s['late'],
                'half_day': s['half_day'],
                'absent': s['absent'],
                'on_leave': s['on_leave'],
                'total': s['total'],
                'percentage': round(pct, 2)
            })

        return Response({'success': True, 'data': data})

    # ─── Financial Reconciliation (Diagnostic) ─────────────────
    @action(detail=False, methods=['get'], url_path='fees/reconcile')
    def fee_reconcile(self, request):
        """Cross-check invoice.paid_amount against sum of completed payments."""
        branch_id = self._get_branch_id(request)
        ay_id = self._get_academic_year_id(request)

        qs = FeeInvoice.objects.filter(tenant=request.user.tenant).exclude(status='CANCELLED')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)

        drifts = []
        for inv in qs[:1000]:
            payment_sum = Payment.objects.filter(
                invoice=inv, status='COMPLETED'
            ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
            if inv.paid_amount != payment_sum:
                drifts.append({
                    'invoice_number': inv.invoice_number,
                    'invoice_paid': float(inv.paid_amount),
                    'payment_sum': float(payment_sum),
                    'delta': float(inv.paid_amount - payment_sum),
                })

        return Response({
            'success': True,
            'data': {
                'total_checked': qs.count(),
                'drifts_found': len(drifts),
                'drifts': drifts[:50],  # Cap output
            }
        })

    # ─── Analytics Endpoints (Phase 7) ─────────────────────────
    @action(detail=False, methods=['get'], url_path='analytics/branch-distribution')
    def branch_distribution(self, request):
        """Students per branch for the current AY"""
        ay_id = self._get_academic_year_id(request)
        
        qs = Student.objects.filter(tenant=request.user.tenant, status='ACTIVE')
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)
            
        data = qs.values('branch__name').annotate(count=Count('id')).order_by('-count')
        return Response({'success': True, 'data': list(data)})

    @action(detail=False, methods=['get'], url_path='analytics/fee-collection-by-branch')  
    def fee_collection_by_branch(self, request):
        """Collected (completed payments) vs outstanding per branch."""
        ay_id = self._get_academic_year_id(request)
        branch_id, zone_ids = self._branch_and_zone_scope(request)

        inv_qs = FeeInvoice.objects.filter(tenant=request.user.tenant)
        inv_qs = self._filter_fee_invoice_qs(inv_qs, branch_id, zone_ids)
        if ay_id:
            inv_qs = inv_qs.filter(academic_year_id=ay_id)

        pay_qs = Payment.objects.filter(tenant=request.user.tenant, status='COMPLETED')
        pay_qs = self._filter_payment_qs(pay_qs, branch_id, zone_ids)
        if ay_id:
            pay_qs = pay_qs.filter(invoice__academic_year_id=ay_id)

        collected_rows = pay_qs.values('branch_id', 'branch__name').annotate(
            collected=Sum('amount')
        )
        out_rows = inv_qs.values('branch_id', 'branch__name').annotate(
            outstanding=Sum('outstanding_amount')
        )
        merged = {}
        for r in collected_rows:
            bid = r['branch_id']
            merged[bid] = {
                'branch__name': r['branch__name'],
                'collected': float(r['collected'] or 0),
                'outstanding': 0.0,
            }
        for r in out_rows:
            bid = r['branch_id']
            if bid not in merged:
                merged[bid] = {
                    'branch__name': r['branch__name'],
                    'collected': 0.0,
                    'outstanding': float(r['outstanding'] or 0),
                }
            else:
                merged[bid]['outstanding'] = float(r['outstanding'] or 0)
                if not merged[bid]['branch__name']:
                    merged[bid]['branch__name'] = r['branch__name']

        data = sorted(merged.values(), key=lambda x: (x['branch__name'] or ''))
        return Response({'success': True, 'data': data})

    @action(detail=False, methods=['get'], url_path='analytics/expense-breakdown')
    def expense_breakdown(self, request):
        """Category-wise expense pie chart data"""
        branch_id = self._get_branch_id(request)
        days = int(request.query_params.get('days', 30))
        start_date = timezone.now().date() - timedelta(days=days)
        
        qs = TransactionLog.objects.filter(
            tenant=request.user.tenant,
            transaction_type='EXPENSE',
            transaction_date__gte=start_date
        )
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
            
        data = qs.values('category').annotate(total=Sum('amount')).order_by('-total')
        return Response({'success': True, 'data': list(data)})

    @action(detail=False, methods=['get'], url_path='analytics/profit-loss')
    def profit_loss(self, request):
        """Income - Expense for the period"""
        branch_id = self._get_branch_id(request)
        days = int(request.query_params.get('days', 30))
        start_date = timezone.now().date() - timedelta(days=days)
        
        qs = TransactionLog.objects.filter(
            tenant=request.user.tenant,
            transaction_date__gte=start_date
        )
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
            
        stats = qs.aggregate(
            income=Sum('amount', filter=Q(transaction_type='INCOME')),
            expense=Sum('amount', filter=Q(transaction_type='EXPENSE'))
        )
        income = stats['income'] or Decimal('0.00')
        expense = stats['expense'] or Decimal('0.00')
        
        return Response({'success': True, 'data': {
            'income': float(income),
            'expense': float(expense),
            'profit': float(income - expense)
        }})

    @action(detail=False, methods=['get'], url_path='analytics/admission-funnel')
    def admission_funnel(self, request):
        """Inquiry → Application → Approved → Enrolled conversion"""
        branch_id = self._get_branch_id(request)
        ay_id = self._get_academic_year_id(request)
        
        inq_qs = AdmissionInquiry.objects.filter(tenant=request.user.tenant)
        app_qs = AdmissionApplication.objects.filter(tenant=request.user.tenant)
        
        if branch_id:
            inq_qs = inq_qs.filter(branch_id=branch_id)
            app_qs = app_qs.filter(branch_id=branch_id)
        if ay_id:
            inq_qs = inq_qs.filter(academic_year_id=ay_id)
            app_qs = app_qs.filter(academic_year_id=ay_id)
            
        inquiries = inq_qs.count()
        applications = app_qs.count()
        approved = app_qs.filter(status__in=['APPROVED', 'ENROLLED']).count()
        enrolled = app_qs.filter(status='ENROLLED').count()
        
        return Response({'success': True, 'data': [
            {'stage': 'Inquiries', 'value': inquiries},
            {'stage': 'Applications', 'value': applications},
            {'stage': 'Approved', 'value': approved},
            {'stage': 'Enrolled', 'value': enrolled},
        ]})

    @action(detail=False, methods=['get'], url_path='analytics/attendance-trend')
    def attendance_trend(self, request):
        """Daily attendance % over last 30 days"""
        branch_id = self._get_branch_id(request)
        days = int(request.query_params.get('days', 30))
        start_date = timezone.now().date() - timedelta(days=days)
        
        qs = AttendanceRecord.objects.filter(
            tenant=request.user.tenant,
            date__gte=start_date
        )
        if branch_id:
            qs = qs.filter(class_section__branch_id=branch_id)
            
        stats = qs.values('date').annotate(
            total=Count('id'),
            present=Count('id', filter=Q(status='PRESENT')),
            late=Count('id', filter=Q(status='LATE')),
            half_day=Count('id', filter=Q(status='HALF_DAY')),
        ).order_by('date')
        
        data = []
        for s in stats:
            effective_present = s['present'] + s['late'] + s['half_day'] * 0.5
            pct = (effective_present / s['total'] * 100) if s['total'] > 0 else 0
            data.append({
                'date': s['date'].isoformat(),
                'percentage': round(pct, 2)
            })
            
        return Response({'success': True, 'data': data})

    @action(detail=False, methods=['get'], url_path='analytics/fee-aging')
    def fee_aging(self, request):
        """Fee aging report: 0-30, 31-60, 61-90, 90+ days overdue"""
        branch_id = self._get_branch_id(request)
        ay_id = self._get_academic_year_id(request)
        
        today = timezone.now().date()
        qs = FeeInvoice.objects.filter(
            tenant=request.user.tenant, 
            outstanding_amount__gt=0,
            due_date__lt=today
        ).exclude(status='CANCELLED')
        
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)
            
        aging = qs.annotate(
            days_overdue=ExpressionWrapper(today - F('due_date'), output_field=models.DurationField())
        )
        
        buckets = {
            '0_30': Decimal('0.00'),
            '31_60': Decimal('0.00'),
            '61_90': Decimal('0.00'),
            '90_plus': Decimal('0.00')
        }
        
        for inv in aging:
            days = inv.days_overdue.days if inv.days_overdue else 0
            amt = inv.outstanding_amount
            if days <= 30:
                buckets['0_30'] += amt
            elif days <= 60:
                buckets['31_60'] += amt
            elif days <= 90:
                buckets['61_90'] += amt
            else:
                buckets['90_plus'] += amt
                
        return Response({'success': True, 'data': {k: float(v) for k, v in buckets.items()}})

class SuperAdminReportingViewSet(viewsets.ViewSet):
    """
    Global platform-level analytics restricted strictly to developers/owners.
    Bypasses tenant-level isolation to give a birds-eye view of the SaaS.
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    @action(detail=False, methods=['get'], url_path='summary')
    def platform_summary(self, request):
        active_tenants = Tenant.objects.filter(is_active=True).count()
        total_branches = Branch.objects.count()
        total_users = User.objects.count()
        total_students = Student.objects.count()

        return Response({
            'success': True,
            'data': {
                'active_tenants': active_tenants,
                'total_branches': total_branches,
                'total_users': total_users,
                'total_students': total_students,
            }
        })

    @action(detail=False, methods=['get'], url_path='growth')
    def tenant_growth(self, request):
        from django.db.models.functions import TruncMonth
        
        # Group tenants by creation month
        growth = Tenant.objects.annotate(
            month=TruncMonth('created_at')
        ).values('month').annotate(
            count=Count('id')
        ).order_by('month')

        data = []
        for g in growth:
            if g['month']:
                data.append({
                    'month': g['month'].strftime('%Y-%m'),
                    'count': g['count']
                })
                
        return Response({'success': True, 'data': data})

    @action(detail=False, methods=['get'], url_path='roles')
    def role_breakdown(self, request):
        roles = User.objects.values('role').annotate(count=Count('id')).order_by('-count')
        return Response({'success': True, 'data': list(roles)})

