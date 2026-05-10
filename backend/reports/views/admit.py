from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from ..permissions import ReportAccessPermission
from ..pagination import ReportPagination
from ..filters import BaseReportFilter
from ..services.admit import AdmitService
from ..summary import applicant_count_rollups, applicant_fee_totals

class AdmitReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['get'], url_path='applicants')
    def applicants(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = AdmitService.get_applicants(filters)
        summary = {**applicant_fee_totals(qs), 'record_count': str(qs.count())}
        data = qs.values(
            'id', 'first_name', 'last_name', 'grade_applying_for', 'source',
            'status', 'created_at', 'father_phone', 'application_fee_paid', 'application_fee_amount'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    @action(detail=False, methods=['get'], url_path='fee-allocations')
    def fee_allocations(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = AdmitService.get_applicants(filters)
        summary = {**applicant_fee_totals(qs), 'record_count': str(qs.count())}
        data = qs.values(
            'id', 'first_name', 'last_name', 'grade_applying_for', 'source',
            'status', 'created_at', 'application_fee_paid', 'application_fee_amount'
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    @action(detail=False, methods=['get'], url_path='applicant-counts')
    def applicant_counts(self, request):
        filters = BaseReportFilter(request, request.user)
        data = list(AdmitService.get_applicant_counts_by_class(filters))
        summary = applicant_count_rollups(data)
        return ReportPagination().get_unpaginated_response(data, summary=summary)

    @action(detail=False, methods=['get'], url_path='applicant-monthly-counts')
    def applicant_monthly_counts(self, request):
        filters = BaseReportFilter(request, request.user)
        data = list(AdmitService.get_applicant_counts_by_month(filters))
        summary = applicant_count_rollups(data)
        return ReportPagination().get_unpaginated_response(data, summary=summary)
