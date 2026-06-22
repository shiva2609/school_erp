from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from ..permissions import ReportAccessPermission
from ..models import ExportJob
from ..serializers import ExportJobSerializer
from ..tasks import generate_export_job

class ExportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        report_type = request.data.get('report_type')
        filters = request.data.get('filters', {})
        file_format = request.data.get('format', 'EXCEL')
        
        if not report_type:
            return Response({'error': 'report_type is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        job = ExportJob.objects.create(
            tenant=request.user.tenant,
            user=request.user,
            report_type=report_type,
            filters=filters,
            file_format=file_format
        )
        
        # Trigger export synchronously (no celery required)
        generate_export_job(job.id)
        
        return Response(ExportJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['get'], url_path='status')
    def job_status(self, request, pk=None):
        try:
            job = ExportJob.objects.get(pk=pk, tenant=request.user.tenant)
            return Response(ExportJobSerializer(job).data)
        except ExportJob.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
