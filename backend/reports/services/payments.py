from django.db import models
from django.db.models import Sum, DecimalField, F, Case, When, Value, ExpressionWrapper
from django.db.models.functions import Coalesce
from fees.models import FeeInvoice, Payment
from expenses.models import Expense, TransactionLog
from reports.services.base import BaseReportService
from decimal import Decimal

class PaymentsService:
    @staticmethod
    def get_fee_balances(filters):
        qs = FeeInvoice.objects.select_related('student', 'student__class_section').filter(outstanding_amount__gt=0).exclude(status='CANCELLED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
            
        return qs.order_by('-due_date')

    @staticmethod
    def get_daily_collections(filters):
        qs = Payment.objects.select_related('student', 'invoice').filter(status='COMPLETED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        return qs.order_by('-payment_date')

    @staticmethod
    def get_receipts(filters, is_deleted=False):
        qs = Payment.objects.select_related('student', 'invoice').filter(receipt_number__isnull=False)
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        
        if is_deleted:
            qs = qs.filter(status='REFUNDED')
        else:
            qs = qs.exclude(status='REFUNDED')
            
        return qs.order_by('-payment_date')

    @staticmethod
    def get_concessions(filters):
        qs = FeeInvoice.objects.select_related('student', 'student__class_section').exclude(status='CANCELLED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)

        qs = qs.filter(concession_amount__gt=0)
        qs = qs.annotate(
            concession_percent=Case(
                When(
                    gross_amount__gt=0,
                    then=ExpressionWrapper(
                        (F('concession_amount') * Value(100.0)) / F('gross_amount'),
                        output_field=DecimalField(max_digits=7, decimal_places=2),
                    ),
                ),
                default=Value(0),
                output_field=DecimalField(max_digits=7, decimal_places=2),
            )
        )
        return qs.order_by('-created_at')

    @staticmethod
    def get_fees_paid_by_mode(filters):
        qs = Payment.objects.filter(status='COMPLETED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        
        return qs.values('payment_mode').annotate(total=Sum('amount')).order_by('payment_mode')

    @staticmethod
    def get_bank_transactions(filters):
        qs = Payment.objects.select_related('student').filter(
            status='COMPLETED', 
            payment_mode__in=['CHEQUE', 'NEFT', 'RTGS', 'DD', 'UPI']
        )
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        
        return qs.order_by('-payment_date')

    @staticmethod
    def get_income_statement(filters):
        qs = TransactionLog.objects.filter(transaction_type='INCOME')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        
        return qs.values('category').annotate(total=Sum('amount')).order_by('-total')

    @staticmethod
    def get_expense_statement(filters):
        """Cashbook expenses (approved operational spend) grouped by category."""
        qs = TransactionLog.objects.filter(transaction_type='EXPENSE')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        return qs.values('category').annotate(total=Sum('amount')).order_by('-total')

    @staticmethod
    def get_financial_dashboard(filters):
        """
        Income and expense breakdown from the cashbook plus net totals for dashboard UIs.
        """
        income_rows = list(PaymentsService.get_income_statement(filters))
        expense_rows = list(PaymentsService.get_expense_statement(filters))
        stats = PaymentsService.get_income_vs_expenses(filters)
        ti = stats['total_income'] or Decimal('0')
        te = stats['total_expense'] or Decimal('0')
        return {
            'income_by_category': income_rows,
            'expense_by_category': expense_rows,
            'totals': {
                'total_income': str(ti),
                'total_expense': str(te),
                'net': str(ti - te),
            },
        }

    @staticmethod
    def get_expenses(filters):
        qs = Expense.objects.select_related('category', 'vendor')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'expense_date', filters.start_date, filters.end_date)
        
        if filters.status:
            qs = qs.filter(status=filters.status)
        if getattr(filters, 'expense_category_id', None):
            qs = qs.filter(category_id=filters.expense_category_id)
        elif getattr(filters, 'expense_type', None):
            qs = qs.filter(category__name__icontains=filters.expense_type)
        if getattr(filters, 'vendor_id', None):
            qs = qs.filter(vendor_id=filters.vendor_id)
        elif getattr(filters, 'vendor_name', None):
            qs = qs.filter(vendor__name__icontains=filters.vendor_name)

        return qs.order_by('-expense_date')

    @staticmethod
    def get_income_vs_expenses(filters):
        qs = TransactionLog.objects.all()
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        
        stats = qs.aggregate(
            total_income=Coalesce(Sum('amount', filter=models.Q(transaction_type='INCOME')), Decimal('0.00'), output_field=DecimalField()),
            total_expense=Coalesce(Sum('amount', filter=models.Q(transaction_type='EXPENSE')), Decimal('0.00'), output_field=DecimalField())
        )
        return stats

    @staticmethod
    def get_mismatch_detection(filters):
        qs = FeeInvoice.objects.select_related('student').exclude(status='CANCELLED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        
        drifts = []
        # In a real system, we might want to do this via annotation, but keeping it simple as per original
        for inv in qs.iterator():
            payment_sum = Payment.objects.filter(
                invoice=inv, status='COMPLETED'
            ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
            
            if inv.paid_amount != payment_sum:
                drifts.append({
                    'invoice_number': inv.invoice_number,
                    'student_admission_number': getattr(inv.student, 'admission_number', None) or '',
                    'student_name': f"{inv.student.first_name} {inv.student.last_name}",
                    'invoice_paid': float(inv.paid_amount),
                    'payment_sum': float(payment_sum),
                    'delta': float(inv.paid_amount - payment_sum),
                })
                
        return drifts

    @staticmethod
    def get_all_receipts(filters):
        """All payments with a receipt number in the date window (any status)."""
        qs = Payment.objects.select_related('student').filter(receipt_number__isnull=False)
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        if getattr(filters, 'payment_mode', None):
            qs = qs.filter(payment_mode=filters.payment_mode)
        return qs.order_by('-payment_date')

    @staticmethod
    def get_transaction_ledger(filters):
        qs = TransactionLog.objects.all()
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        return qs.order_by('-transaction_date')

    @staticmethod
    def get_student_balance_base_invoices(filters):
        """Same scope as student detailed balances, before grouping by student."""
        qs = FeeInvoice.objects.exclude(status='CANCELLED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
        return qs

    @staticmethod
    def get_student_balance_summary(filters):
        qs = PaymentsService.get_student_balance_base_invoices(filters)
        return qs.values(
            'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
        ).annotate(
            total_net=Sum('net_amount'),
            total_paid=Sum('paid_amount'),
            total_outstanding=Sum('outstanding_amount'),
        ).order_by('student__admission_number')

    @staticmethod
    def get_bus_expenses(filters):
        qs = PaymentsService.get_expenses(filters)
        return qs.filter(
            models.Q(category__name__icontains='transport')
            | models.Q(category__name__icontains='bus')
            | models.Q(title__icontains='transport')
            | models.Q(title__icontains='bus')
        )

    @staticmethod
    def get_other_income_ledger(filters):
        """
        Non–fee income from the cashbook (ledger rows not tied to fee payments).
        Fee tuition posts as reference_model=Payment / category Fee Payment.
        """
        qs = TransactionLog.objects.filter(transaction_type='INCOME', amount__gt=0)
        qs = qs.exclude(reference_model='Payment')
        qs = qs.exclude(category__in=['Fee Payment', 'Fee Reversal'])
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        return qs.order_by('-transaction_date')

    @staticmethod
    def get_deleted_other_income_ledger(filters):
        """
        Negative INCOME ledger rows excluding standard fee reversals (adjustments to misc income).
        """
        qs = TransactionLog.objects.filter(transaction_type='INCOME', amount__lt=0)
        qs = qs.exclude(reference_model='Payment')
        qs = qs.exclude(category='Fee Reversal')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        return qs.order_by('-transaction_date')
