"""
Export view — streams files directly to the HTTP response.

Files are generated entirely in-memory (no disk writes) so this works
correctly on ephemeral cloud environments (DigitalOcean App Platform,
Heroku, etc.) where the local /media/ directory is never reliably served.
"""
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..permissions import ReportAccessPermission
from ..export_filters import ExportFilterBundle
from ..export_rows import build_export_rows
from ..export_utils import generate_excel_bytes, generate_pdf_bytes

# Keep ExportJob imports for the legacy status endpoint
from ..models import ExportJob
from ..serializers import ExportJobSerializer
from ..tasks import generate_export_job


class ExportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        """
        Generate a report export and stream it back as a file download.

        Request body:
          { report_type: str, filters: dict, format: 'EXCEL'|'PDF' }

        Response:
          The raw file bytes with appropriate Content-Type and
          Content-Disposition headers — the browser will download it.
        """
        report_type = request.data.get('report_type')
        filters = request.data.get('filters', {})
        file_format = request.data.get('format', 'EXCEL')

        if not report_type:
            return Response(
                {'error': 'report_type is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build a lightweight filter bundle from the raw request payload
        # (reuses the same ExportFilterBundle logic used by async jobs)
        class _FakeJob:
            """Minimal duck-type so ExportFilterBundle.from_job() works inline."""
            def __init__(self, report_type, filters, tenant, user):
                self.report_type = report_type
                self.filters = filters
                self.tenant = tenant
                self.user = user

        fake_job = _FakeJob(report_type, filters, request.user.tenant, request.user)
        bundle = ExportFilterBundle.from_job(fake_job)
        built = build_export_rows(report_type, bundle)

        if not built:
            return Response(
                {'error': f'Unsupported report_type: {report_type}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        headers, data_rows = built

        if not headers:
            return Response(
                {'error': f'Report "{report_type}" produced no columns.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate file in memory
        if file_format == 'PDF':
            try:
                file_bytes, file_name, content_type = generate_pdf_bytes(
                    report_type, headers, data_rows
                )
            except RuntimeError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        else:
            buffer, file_name, content_type = generate_excel_bytes(
                report_type, headers, data_rows
            )
            file_bytes = buffer.read()

        # Stream response — never writes to disk
        response = HttpResponse(file_bytes, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{file_name}"'
        response['Content-Length'] = len(file_bytes)
        # Allow the frontend to read Content-Disposition from JS
        response['Access-Control-Expose-Headers'] = 'Content-Disposition'
        return response

    # ── Legacy polling endpoints (kept for backward compat) ───────────────────

    @action(detail=True, methods=['get'], url_path='status')
    def job_status(self, request, pk=None):
        try:
            job = ExportJob.objects.get(pk=pk, tenant=request.user.tenant)
            return Response(ExportJobSerializer(job).data)
        except ExportJob.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
