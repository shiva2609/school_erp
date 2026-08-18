from django.db.models import Q
from fees.models import FeeInvoice, Payment
from reports.services.base import BaseReportService

class BusService:
    @staticmethod
    def get_bus_fee_balances(filters):
        # Find invoices that have transport items or TRN- prefix
        qs = FeeInvoice.objects.select_related('student', 'student__class_section').filter(
            outstanding_amount__gt=0
        ).filter(
            Q(invoice_number__startswith='TRN-') |
            Q(items__category__code__iexact='TRANSPORT')
        ).exclude(status='CANCELLED').distinct()
        
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
        
        return qs.order_by('student__class_section__grade', 'student__first_name', '-due_date')

    @staticmethod
    def get_daily_collections(filters):
        # Day-wise transport payments
        qs = Payment.objects.select_related(
            'student', 'student__class_section', 'invoice'
        ).filter(
            status='COMPLETED',
            invoice__invoice_number__startswith='TRN-'
        )
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        if getattr(filters, 'payment_mode', None):
            qs = qs.filter(payment_mode=filters.payment_mode)
        return qs.order_by('-payment_date', '-created_at')

