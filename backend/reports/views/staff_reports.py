from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from ..permissions import ReportAccessPermission
from ..pagination import ReportPagination
from ..filters import BaseReportFilter
from ..services.staff_reports import StaffReportsService
from ..summary import simple_count_summary

class StaffReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['get'], url_path='attendance')
    def attendance(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = StaffReportsService.get_staff_attendance(filters)
        summary = simple_count_summary(qs)

        data = qs.values(
            'date', 'status', 'staff__employee_id',
            'staff__user__first_name', 'staff__user__last_name',
            'staff__branch__name', 'remarks'
        )
        
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)
