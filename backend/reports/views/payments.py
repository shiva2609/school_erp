from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..permissions import ReportAccessPermission
from ..pagination import ReportPagination
from ..filters import BaseReportFilter
from ..services.payments import PaymentsService

class PaymentsReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['get'], url_path='fee-balances')
    def fee_balances(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_fee_balances(filters)
        
        data = qs.values(
            'invoice_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'paid_amount', 'outstanding_amount',
            'due_date', 'status'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='daily-collections')
    def daily_collections(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_daily_collections(filters)
        
        data = qs.values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='receipts')
    def receipts(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_receipts(filters, is_deleted=False)
        
        data = qs.values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)
        
    @action(detail=False, methods=['get'], url_path='deleted-receipts')
    def deleted_receipts(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_receipts(filters, is_deleted=True)
        
        data = qs.values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='mismatch-detection')
    def mismatch_detection(self, request):
        filters = BaseReportFilter(request, request.user)
        data = PaymentsService.get_mismatch_detection(filters)
        # Returns list of dicts, no queryset pagination — use unpaginated wrapper
        return ReportPagination().get_unpaginated_response(data)

    @action(detail=False, methods=['get'], url_path='income-statement')
    def income_statement(self, request):
        filters = BaseReportFilter(request, request.user)
        data = PaymentsService.get_income_statement(filters)
        return ReportPagination().get_unpaginated_response(list(data))

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
        data = qs.values(
            'id', 'voucher_number', 'title', 'amount', 'category__name',
            'vendor__name', 'expense_date', 'payment_mode', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='fee-balances-teachers')
    def fee_balances_teachers(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_fee_balances(filters)
        data = qs.values(
            'invoice_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'paid_amount', 'outstanding_amount',
            'due_date', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='other-income')
    def other_income(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_other_income_ledger(filters)
        data = qs.values(
            'category', 'amount', 'transaction_date', 'description',
            'reference_model', 'reference_id',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='deleted-other-income')
    def deleted_other_income(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_deleted_other_income_ledger(filters)
        data = qs.values(
            'category', 'amount', 'transaction_date', 'description',
            'reference_model', 'reference_id',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='cheques')
    def cheques(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_bank_transactions(filters).filter(payment_mode='CHEQUE')
        data = qs.values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_date', 'reference_number', 'bank_name', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='concessions')
    def concessions(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_concessions(filters)
        data = qs.values(
            'student__admission_number', 'student__first_name', 'student__last_name',
            'concession__name', 'status', 'valid_from', 'valid_until', 'notes',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='fees-paid')
    def fees_paid(self, request):
        filters = BaseReportFilter(request, request.user)
        data = PaymentsService.get_fees_paid_by_mode(filters)
        return ReportPagination().get_unpaginated_response(list(data))

    @action(detail=False, methods=['get'], url_path='bank-transactions')
    def bank_transactions(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_bank_transactions(filters)
        data = qs.values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'reference_number', 'bank_name', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='bus-expenses')
    def bus_expenses(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_bus_expenses(filters)
        data = qs.values(
            'id', 'voucher_number', 'title', 'amount', 'category__name',
            'vendor__name', 'expense_date', 'payment_mode', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='fee-balances-no-concession')
    def fee_balances_no_concession(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_fee_balances(filters).filter(concession_amount=0)
        data = qs.values(
            'invoice_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'gross_amount', 'net_amount', 'paid_amount', 'outstanding_amount',
            'due_date', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='all-receipts')
    def all_receipts(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_all_receipts(filters)
        data = qs.values(
            'receipt_number', 'student__first_name', 'student__last_name',
            'amount', 'payment_mode', 'payment_date', 'status',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='all-receipts-with-mismatch')
    def all_receipts_with_mismatch(self, request):
        filters = BaseReportFilter(request, request.user)
        data = PaymentsService.get_mismatch_detection(filters)
        return ReportPagination().get_unpaginated_response(data)

    @action(detail=False, methods=['get'], url_path='all-income-expenses')
    def all_income_expenses(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_transaction_ledger(filters)
        data = qs.values(
            'transaction_type', 'category', 'amount', 'transaction_date', 'description',
            'reference_model', 'reference_id',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)

    @action(detail=False, methods=['get'], url_path='student-detailed-balances')
    def student_detailed_balances(self, request):
        filters = BaseReportFilter(request, request.user)
        data = PaymentsService.get_student_balance_summary(filters)
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page)
