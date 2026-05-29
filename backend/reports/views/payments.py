from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..permissions import ReportAccessPermission
from ..pagination import ReportPagination
from ..filters import BaseReportFilter
from ..services.payments import PaymentsService
from ..summary import (
    concession_totals,
    expense_amount_total,
    fee_invoice_totals,
    fees_paid_grand_total,
    footer_amount_column,
    footer_concession_columns,
    footer_fee_balance_amount_columns,
    footer_mismatch_amount_columns,
    footer_outstanding_column,
    footer_student_detailed_balance_columns,
    income_statement_total,
    mismatch_totals,
    payment_amount_total,
    transaction_ledger_totals,
    transaction_log_sum,
)

class PaymentsReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['get'], url_path='fee-balances')
    def fee_balances(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_fee_balances(filters)
        summary = fee_invoice_totals(qs)
        data = qs.values(
            'invoice_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'paid_amount', 'outstanding_amount',
            'due_date', 'status'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_fee_balance_amount_columns(qs)
        )

    @action(detail=False, methods=['get'], url_path='daily-collections')
    def daily_collections(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_daily_collections(filters)
        summary = payment_amount_total(qs)
        data = qs.values(
            'receipt_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='receipts')
    def receipts(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_receipts(filters, is_deleted=False)
        summary = payment_amount_total(qs)
        data = qs.values(
            'receipt_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='deleted-receipts')
    def deleted_receipts(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_receipts(filters, is_deleted=True)
        summary = payment_amount_total(qs)
        data = qs.values(
            'receipt_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='mismatch-detection')
    def mismatch_detection(self, request):
        filters = BaseReportFilter(request, request.user)
        data = PaymentsService.get_mismatch_detection(filters)
        summary = mismatch_totals(data)
        return ReportPagination().get_unpaginated_response(
            data, summary=summary, footer_totals=footer_mismatch_amount_columns(data)
        )

    @action(detail=False, methods=['get'], url_path='income-statement')
    def income_statement(self, request):
        filters = BaseReportFilter(request, request.user)
        data = list(PaymentsService.get_income_statement(filters))
        summary = income_statement_total(data)
        return ReportPagination().get_unpaginated_response(
            data,
            summary=summary,
            footer_totals={'total': summary['total_amount']},
        )

    @action(detail=False, methods=['get'], url_path='financial-dashboard')
    def financial_dashboard(self, request):
        """Cashbook income/expense by category and net — for the Financial Reports overview page."""
        filters = BaseReportFilter(request, request.user)
        payload = PaymentsService.get_financial_dashboard(filters)
        return Response({'success': True, 'data': payload})

    @action(detail=False, methods=['get'], url_path='expenses')
    def expenses(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_expenses(filters)
        summary = expense_amount_total(qs)
        data = qs.values(
            'id', 'voucher_number', 'title', 'amount', 'category__name',
            'vendor__name', 'expense_date', 'payment_mode', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='fee-balances-teachers')
    def fee_balances_teachers(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_fee_balances(filters)
        summary = fee_invoice_totals(qs)
        data = qs.values(
            'invoice_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'paid_amount', 'outstanding_amount',
            'due_date', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_outstanding_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='other-income')
    def other_income(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_other_income_ledger(filters)
        summary = transaction_log_sum(qs)
        data = qs.values(
            'category', 'amount', 'transaction_date', 'description',
            'reference_model', 'reference_id',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='deleted-other-income')
    def deleted_other_income(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_deleted_other_income_ledger(filters)
        summary = transaction_log_sum(qs)
        data = qs.values(
            'category', 'amount', 'transaction_date', 'description',
            'reference_model', 'reference_id',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='cheques')
    def cheques(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_bank_transactions(filters).filter(payment_mode='CHEQUE')
        summary = payment_amount_total(qs)
        data = qs.values(
            'receipt_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_date', 'reference_number', 'bank_name', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='concessions')
    def concessions(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_concessions(filters)
        summary = concession_totals(qs)
        data = qs.values(
            'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'concession_amount', 'concession_percent',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_concession_columns(qs)
        )

    @action(detail=False, methods=['get'], url_path='fees-paid')
    def fees_paid(self, request):
        filters = BaseReportFilter(request, request.user)
        data = list(PaymentsService.get_fees_paid_by_mode(filters))
        summary = fees_paid_grand_total(data)
        return ReportPagination().get_unpaginated_response(
            data,
            summary=summary,
            footer_totals={'total': summary['total_amount']},
        )

    @action(detail=False, methods=['get'], url_path='bank-transactions')
    def bank_transactions(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_bank_transactions(filters)
        summary = payment_amount_total(qs)
        data = qs.values(
            'receipt_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'reference_number', 'bank_name', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='bus-expenses')
    def bus_expenses(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_bus_expenses(filters)
        summary = expense_amount_total(qs)
        data = qs.values(
            'id', 'voucher_number', 'title', 'amount', 'category__name',
            'vendor__name', 'expense_date', 'payment_mode', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='fee-balances-no-concession')
    def fee_balances_no_concession(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_fee_balances(filters).filter(concession_amount=0)
        summary = fee_invoice_totals(qs)
        data = qs.values(
            'invoice_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'paid_amount', 'outstanding_amount',
            'due_date', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_outstanding_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='all-receipts')
    def all_receipts(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_all_receipts(filters)
        summary = payment_amount_total(qs)
        data = qs.values(
            'receipt_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='all-receipts-with-mismatch')
    def all_receipts_with_mismatch(self, request):
        filters = BaseReportFilter(request, request.user)
        data = PaymentsService.get_mismatch_detection(filters)
        summary = mismatch_totals(data)
        return ReportPagination().get_unpaginated_response(
            data, summary=summary, footer_totals=footer_mismatch_amount_columns(data)
        )

    @action(detail=False, methods=['get'], url_path='all-income-expenses')
    def all_income_expenses(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_transaction_ledger(filters)
        summary = transaction_ledger_totals(qs)
        data = qs.values(
            'transaction_type', 'category', 'amount', 'transaction_date', 'description',
            'reference_model', 'reference_id',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(
            page, summary=summary, footer_totals=footer_amount_column(qs)
        )

    @action(detail=False, methods=['get'], url_path='student-detailed-balances')
    def student_detailed_balances(self, request):
        filters = BaseReportFilter(request, request.user)
        base = PaymentsService.get_student_balance_base_invoices(filters)
        summary = fee_invoice_totals(base)

        # Query carry forward aggregates
        from fees.models import FeeCarryForward
        from django.db.models import Sum
        from decimal import Decimal
        
        cf_qs = FeeCarryForward.objects.filter(
            tenant=request.user.tenant,
            target_academic_year_id=filters.academic_year_id
        )
        if filters.branch_id:
            cf_qs = cf_qs.filter(branch_id=filters.branch_id)
        if filters.class_id:
            cf_qs = cf_qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            cf_qs = cf_qs.filter(student__class_section_id=filters.section_id)
            
        cf_totals = cf_qs.aggregate(
            total_due=Sum('carry_forward_amount'),
            total_paid=Sum('paid_amount'),
            total_written_off=Sum('written_off_amount'),
        )
        cf_due = cf_totals['total_due'] or Decimal('0.00')
        cf_paid = cf_totals['total_paid'] or Decimal('0.00')
        cf_written_off = cf_totals['total_written_off'] or Decimal('0.00')
        cf_outstanding = cf_due - cf_paid - cf_written_off
        
        # Merge carry forward totals into summary cards
        summary['old_due'] = str(cf_due)
        summary['old_collected'] = str(cf_paid)
        summary['old_outstanding'] = str(cf_outstanding)
        summary['grand_total_net'] = str(Decimal(summary.get('total_net', '0')) + cf_due)
        summary['grand_total_paid'] = str(Decimal(summary.get('total_paid', '0')) + cf_paid)
        summary['grand_total_outstanding'] = str(Decimal(summary.get('total_outstanding', '0')) + cf_outstanding)

        data = PaymentsService.get_student_balance_summary(filters)
        footer_totals = footer_student_detailed_balance_columns(data)
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary, footer_totals=footer_totals)
