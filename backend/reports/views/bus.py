from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from ..permissions import ReportAccessPermission
from ..pagination import ReportPagination
from ..filters import BaseReportFilter
from ..services.bus import BusService
from ..summary import fee_invoice_totals

class BusReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['get'], url_path='bus-fee-balances')
    def bus_fee_balances(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = BusService.get_bus_fee_balances(filters)
        summary = fee_invoice_totals(qs)

        data = qs.values(
            'invoice_number', 'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'outstanding_amount', 'due_date'
        )
        
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)
