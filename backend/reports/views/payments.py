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

        # ── New grouped-report params ──────────────────────────────────────────
        report_type = (request.query_params.get('report_type') or 'student').lower()
        fee_cat_param = request.query_params.get('fee_categories', '')
        fee_category_ids = [c.strip() for c in fee_cat_param.split(',') if c.strip()] or None
        min_amount_str = request.query_params.get('min_amount', '')
        max_amount_str = request.query_params.get('max_amount', '')
        by_percentage = request.query_params.get('by_percentage', 'false').lower() == 'true'
        status_filter = request.query_params.get('status_filter', 'ALL').upper()

        min_amount = float(min_amount_str) if min_amount_str else None
        max_amount = float(max_amount_str) if max_amount_str else None

        rows, cat_ids, categories = PaymentsService.get_grouped_fee_balances(
            filters,
            report_type=report_type,
            fee_category_ids=fee_category_ids,
            min_amount=min_amount,
            max_amount=max_amount,
            by_percentage=by_percentage,
            status_filter=status_filter,
        )

        # ── Build summary ──────────────────────────────────────────────────────
        from decimal import Decimal
        total_net = sum(Decimal(str(r.get('net_amount') or 0)) for r in rows)
        total_paid = sum(Decimal(str(r.get('paid_amount') or 0)) for r in rows)
        total_outstanding = sum(Decimal(str(r.get('outstanding_amount') or 0)) for r in rows)
        pct_outstanding = (total_outstanding / total_net * 100) if total_net else Decimal('0')

        summary = {
            'total_net': str(total_net),
            'total_paid': str(total_paid),
            'total_outstanding': str(total_outstanding),
            'outstanding_pct': f'{round(float(pct_outstanding), 2)}',
            'student_count': str(sum(r.get('total_students', 1) for r in rows) if report_type != 'student' else len(rows)),
            'report_type': report_type,
            # Pass category metadata back so frontend can build column headers
            'categories': [{'id': str(c.id), 'name': c.name, 'code': c.code} for c in categories],
        }


        file_format = request.query_params.get('file', '').lower()
        if file_format in ('csv', 'pdf'):
            from django.http import HttpResponse
            from reports.export_utils import generate_csv_bytes, generate_pdf_bytes

            serialized = [self._serialize_row(r, report_type, categories) for r in rows]
            cat_headers = [c.name.upper() for c in categories]
            cat_keys = [f'cat_{str(c.id).replace("-", "_")}' for c in categories]
            
            if report_type == 'class':
                headers = ['CLASS', 'TOTAL STUDENTS'] + cat_headers + ['OLD DUES', 'CONCESSION', 'TOTAL AMOUNT', 'AMOUNT PAID', 'BALANCE']
                data_rows = []
                for r in serialized:
                    row = [r.get('class', ''), r.get('total_students', 0)]
                    row.extend([r.get(k, '0.00') for k in cat_keys])
                    row.extend([r.get('old_dues', '0.00'), r.get('concession_amount', '0.00'), r.get('net_amount', '0.00'), r.get('paid_amount', '0.00'), r.get('outstanding_amount', '0.00')])
                    data_rows.append(row)
            elif report_type == 'section':
                headers = ['CLASS', 'SECTION', 'TOTAL STUDENTS'] + cat_headers + ['OLD DUES', 'CONCESSION', 'TOTAL AMOUNT', 'AMOUNT PAID', 'BALANCE']
                data_rows = []
                for r in serialized:
                    row = [r.get('class', ''), r.get('section', ''), r.get('total_students', 0)]
                    row.extend([r.get(k, '0.00') for k in cat_keys])
                    row.extend([r.get('old_dues', '0.00'), r.get('concession_amount', '0.00'), r.get('net_amount', '0.00'), r.get('paid_amount', '0.00'), r.get('outstanding_amount', '0.00')])
                    data_rows.append(row)
            else:
                headers = ['ADMISSION NO.', 'STUDENT NAME', 'CLASS', 'SECTION', 'CATEGORY', 'PARENT NAME', 'PARENT MOBILE'] + cat_headers + ['OLD DUES', 'CONCESSION', 'TOTAL AMOUNT', 'AMOUNT PAID', 'BALANCE', 'STATUS', 'INACTIVE REASON']
                data_rows = []
                for r in serialized:
                    row = [r.get('admission_number', ''), r.get('student_name', ''), r.get('class', ''), r.get('section', ''), r.get('category', ''), r.get('parent_name', ''), r.get('parent_mobile', '')]
                    row.extend([r.get(k, '0.00') for k in cat_keys])
                    row.extend([r.get('old_dues', '0.00'), r.get('concession_amount', '0.00'), r.get('net_amount', '0.00'), r.get('paid_amount', '0.00'), r.get('outstanding_amount', '0.00'), r.get('status', ''), r.get('inactive_reason', '')])
                    data_rows.append(row)

            try:
                if file_format == 'csv':
                    buffer, file_name, content_type = generate_csv_bytes(f'fee_balances_{report_type}', headers, data_rows)
                    file_bytes = buffer.read()
                else:
                    file_bytes, file_name, content_type = generate_pdf_bytes(f'fee_balances_{report_type}', headers, data_rows)
            except Exception as exc:
                from rest_framework.response import Response
                from rest_framework import status
                return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
            response = HttpResponse(file_bytes, content_type=content_type)
            response['Content-Disposition'] = f'attachment; filename="{file_name}"'
            response['Content-Length'] = len(file_bytes)
            response['Access-Control-Expose-Headers'] = 'Content-Disposition'
            return response

        # ── Paginate ───────────────────────────────────────────────────────────
        # For grouped (class/section) the row count is small — serve unpaginated.
        # For student rows use standard pagination.
        if report_type in ('class', 'section'):
            return ReportPagination.get_unpaginated_response(
                [self._serialize_row(r, report_type, categories) for r in rows],
                summary=summary,
                footer_totals=self._footer(rows, categories),
            )
        else:
            paginator = ReportPagination()
            serialized = [self._serialize_row(r, report_type, categories) for r in rows]
            page = paginator.paginate_queryset(serialized, request, view=self)
            return paginator.get_paginated_response(
                page,
                summary=summary,
                footer_totals=self._footer(rows, categories),
            )

    def _serialize_row(self, row, report_type, categories):
        """Convert a raw dict row into a clean JSON-safe dict."""
        from decimal import Decimal

        def fmt(v):
            if v is None:
                return '0.00'
            return str(round(Decimal(str(v)), 2))

        cat_total = sum(Decimal(str(row.get(f'cat_{str(cat.id).replace("-", "_")}') or 0)) for cat in categories)
        old_dues = Decimal(str(row.get('old_dues') or 0))
        concession = Decimal(str(row.get('concession_amount') or 0))
        paid = Decimal(str(row.get('paid_amount') or 0))
        
        computed_net = cat_total + old_dues - concession
        computed_outstanding = computed_net - paid

        base = {
            'net_amount': fmt(computed_net),
            'paid_amount': fmt(paid),
            'outstanding_amount': fmt(computed_outstanding),
            'concession_amount': fmt(concession),
            'gross_amount': fmt(row.get('gross_amount')),
            'old_dues': fmt(old_dues),
        }

        if report_type == 'class':
            base['class'] = row.get('class_section__grade', '')
            base['total_students'] = row.get('total_students', 0)
        elif report_type == 'section':
            base['class'] = row.get('class_section__grade', '')
            base['section'] = row.get('class_section__section', '')
            base['total_students'] = row.get('total_students', 0)
        else:
            base['admission_number'] = row.get('student__admission_number', '')
            base['student_name'] = f"{row.get('student__first_name', '')} {row.get('student__last_name', '')}".strip()
            base['class'] = row.get('student__class_section__grade', '')
            base['section'] = row.get('student__class_section__section', '')
            base['category'] = row.get('student__caste_category', '')
            base['parent_name'] = row.get('student__father_name', '')
            base['parent_mobile'] = row.get('student__father_phone', '')
            base['status'] = row.get('status', '')
            base['inactive_reason'] = row.get('student__leaving_reason', '')
            base['student_status'] = row.get('student__status', '')
            base['due_date'] = str(row.get('due_date', '') or '')

        for cat in categories:
            safe_key = f'cat_{str(cat.id).replace("-", "_")}'
            base[safe_key] = fmt(row.get(safe_key))

        return base

    def _footer(self, rows, categories):
        """Compute footer totals across all rows (not just current page)."""
        from decimal import Decimal
        result = {
            'paid_amount': str(sum(Decimal(str(r.get('paid_amount') or 0)) for r in rows)),
            'concession_amount': str(sum(Decimal(str(r.get('concession_amount') or 0)) for r in rows)),
            'gross_amount': str(sum(Decimal(str(r.get('gross_amount') or 0)) for r in rows)),
            'old_dues': str(sum(Decimal(str(r.get('old_dues') or 0)) for r in rows)),
        }
        for cat in categories:
            safe_key = f'cat_{str(cat.id).replace("-", "_")}'
            result[safe_key] = str(sum(Decimal(str(r.get(safe_key) or 0)) for r in rows))

        cat_total = sum(Decimal(result[f'cat_{str(cat.id).replace("-", "_")}']) for cat in categories)
        result['net_amount'] = str(cat_total + Decimal(result['old_dues']) - Decimal(result['concession_amount']))
        result['outstanding_amount'] = str(Decimal(result['net_amount']) - Decimal(result['paid_amount']))

        return result

    @action(detail=False, methods=['get'], url_path='uncommitted-fee-students')
    def uncommitted_fee_students(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PaymentsService.get_uncommitted_fee_students(filters)
        
        data = qs.values(
            'admission_number', 'first_name', 'last_name',
            'class_section__grade', 'class_section__section',
            'father_name', 'father_phone', 'status'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        
        summary = {
            'card1': {'label': 'Total Uncommitted Students', 'value': str(qs.count()), 'type': 'numeric'}
        }
        
        return paginator.get_paginated_response(page, summary=summary)

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
