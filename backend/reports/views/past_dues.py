from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from ..permissions import ReportAccessPermission
from ..pagination import ReportPagination
from ..filters import BaseReportFilter
from ..services.past_dues import PastDuesService
from ..summary import fee_invoice_totals

class PastDuesReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['get'], url_path='list')
    def list_past_dues(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = PastDuesService.get_past_dues(filters)
        summary = fee_invoice_totals(qs)

        # days_overdue is a DurationField annotation — extract .days in Python
        # Use values on regular fields, then annotate days manually
        data = qs.values(
            'invoice_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'outstanding_amount', 'due_date', 'days_overdue'
        )
        
        # Convert timedelta to integer days for JSON serialization
        results = []
        for row in data:
            row_copy = dict(row)
            overdue = row_copy.get('days_overdue')
            if overdue and hasattr(overdue, 'days'):
                row_copy['days_overdue'] = overdue.days
            elif overdue is None:
                row_copy['days_overdue'] = 0
            results.append(row_copy)
        
        paginator = ReportPagination()
        page = paginator.paginate_queryset(results, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)
