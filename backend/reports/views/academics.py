import logging
import re

from academics.models import ExamTerm
from django.http import HttpResponse
from document_templates.models import DocumentTemplate
from document_templates.services import generate_bulk_pdf_from_template, generate_pdf_from_template
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..permissions import ReportAccessPermission
from ..pagination import ReportPagination
from ..filters import BaseReportFilter
from ..services.academics import AcademicsService
from ..summary import (
    list_len_summary,
    simple_count_summary,
    strength_total_students,
    student_list_totals,
    year_transition_rollups,
)

logger = logging.getLogger(__name__)


def _pick_document_template(tenant, doc_type: str, branch_id=None):
    qs = DocumentTemplate.objects.filter(tenant=tenant, type=doc_type, is_active=True)
    if branch_id:
        match = qs.filter(branch_id=branch_id).order_by('-is_default', '-created_at').first()
        if match:
            return match
    return qs.order_by('-is_default', '-created_at').first()


class AcademicsReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ReportAccessPermission]

    @action(detail=False, methods=['get'], url_path='exam-terms')
    def exam_terms(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = ExamTerm.objects.filter(tenant=filters.user.tenant)
        if filters.branch_id:
            qs = qs.filter(branch_id=filters.branch_id)
        if filters.academic_year_id:
            qs = qs.filter(academic_year_id=filters.academic_year_id)
        data = list(qs.order_by('start_date').values('id', 'name', 'start_date', 'end_date'))
        return Response({'success': True, 'data': data})

    @action(detail=False, methods=['get'], url_path='students-list')
    def students_list(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = AcademicsService.get_students(filters)
        summary = student_list_totals(qs)

        data = qs.values(
            'id', 'admission_number', 'first_name', 'last_name', 
            'class_section__grade', 'class_section__section', 
            'status', 'gender', 'caste_category',
            'admission_fee_paid', 'fixed_deposit_paid',
            'admission_fee_collected', 'fixed_deposit_collected',
            'total_initial_income',
        )
        
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    @action(detail=False, methods=['get'], url_path='student-strength')
    def student_strength(self, request):
        filters = BaseReportFilter(request, request.user)
        data = list(AcademicsService.get_student_strength(filters))
        summary = strength_total_students(data)
        return ReportPagination().get_unpaginated_response(data, summary=summary)

    @action(detail=False, methods=['get'], url_path='year-transition-summary')
    def year_transition_summary(self, request):
        filters = BaseReportFilter(request, request.user)
        try:
            data = AcademicsService.get_year_transition_summary(filters)
        except ValueError as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        summary = year_transition_rollups(data)
        return ReportPagination.get_unpaginated_response(data, summary=summary)

    @action(detail=False, methods=['get'], url_path='student-attendance-daily')
    def student_attendance_daily(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = AcademicsService.get_student_attendance_daily(filters)
        summary = simple_count_summary(qs)

        data = qs.values(
            'date', 'status', 'student__admission_number', 'student__first_name', 'student__last_name',
            'class_section__grade', 'class_section__section'
        )
        
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    @action(detail=False, methods=['get'], url_path='student-notes')
    def student_notes(self, request):
        filters = BaseReportFilter(request, request.user)
        data = AcademicsService.get_student_notes(filters)
        summary = list_len_summary(data)
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    @action(detail=False, methods=['get'], url_path='hall-tickets')
    def hall_tickets(self, request):
        filters = BaseReportFilter(request, request.user)
        if request.query_params.get('file') == 'pdf':
            return self._hall_tickets_pdf(filters)
        if not filters.exam_id:
            return Response(
                {'success': False, 'error': 'exam_id is required. Choose an exam term and generate the report.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        term = AcademicsService.get_exam_term_for_print(filters)
        if not term:
            return Response({'success': False, 'error': 'Exam not found for this school.'}, status=404)
        qs = AcademicsService.get_students_for_exam_print(filters)
        summary = simple_count_summary(qs)
        data = qs.values(
            'id', 'admission_number', 'first_name', 'last_name',
            'class_section__grade', 'class_section__section',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        enriched = [{**row, 'exam_term__name': term.name} for row in page]
        return paginator.get_paginated_response(enriched, summary=summary)

    @action(detail=False, methods=['get'], url_path='consolidated-marks')
    def consolidated_marks(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = AcademicsService.get_consolidated_marks_flat(filters)
        summary = simple_count_summary(qs)
        data = qs.values(
            'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
            'exam_term__name', 'subject__name', 'marks_obtained', 'max_marks', 'percentage', 'grade',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    @action(detail=False, methods=['get'], url_path='section-report-cards')
    def section_report_cards(self, request):
        filters = BaseReportFilter(request, request.user)
        if request.query_params.get('file') == 'pdf':
            return self._section_report_cards_pdf(filters)
        if not filters.exam_id:
            return Response(
                {'success': False, 'error': 'exam_id is required. Choose an exam term and generate the report.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        term = AcademicsService.get_exam_term_for_print(filters)
        if not term:
            return Response({'success': False, 'error': 'Exam not found for this school.'}, status=404)
        qs = AcademicsService.get_students_for_exam_print(filters)
        summary = simple_count_summary(qs)
        data = qs.values(
            'id', 'admission_number', 'first_name', 'last_name',
            'class_section__grade', 'class_section__section',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        enriched = [{**row, 'exam_term__name': term.name} for row in page]
        return paginator.get_paginated_response(enriched, summary=summary)

    @action(detail=False, methods=['get'], url_path='section-report-cards-summary')
    def section_report_cards_summary(self, request):
        filters = BaseReportFilter(request, request.user)
        if request.query_params.get('file') == 'pdf':
            return self._report_card_summary_pdf(filters)
        if not filters.exam_id:
            return Response(
                {'success': False, 'error': 'exam_id is required. Choose an exam term and generate the report.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        term = AcademicsService.get_exam_term_for_print(filters)
        if not term:
            return Response({'success': False, 'error': 'Exam not found for this school.'}, status=404)
        data = AcademicsService.get_report_card_summary_preview_rows(filters)
        summary = list_len_summary(data)
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    def _hall_tickets_pdf(self, filters):
        if not filters.exam_id:
            return Response({'error': 'exam_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        term = AcademicsService.get_exam_term_for_print(filters)
        if not term:
            return Response({'error': 'Exam not found.'}, status=404)
        template = _pick_document_template(filters.user.tenant, 'HALL_TICKET', filters.branch_id)
        if not template:
            return Response(
                {
                    'error': 'No active Hall Ticket template. Add one under System Settings → Document Templates '
                    '(type: Hall Ticket). Use HTML mode for full custom layouts.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        students = list(AcademicsService.get_students_for_exam_print(filters))
        if not students:
            return Response({'error': 'No students match the selected filters.'}, status=404)
        contexts = [AcademicsService.build_hall_ticket_context(s, term) for s in students]
        try:
            pdf = generate_bulk_pdf_from_template(template, contexts)
        except Exception as exc:
            logger.exception('Hall ticket PDF failed')
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', term.name)[:80] or 'hall_tickets'
        resp = HttpResponse(pdf, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="Hall_Tickets_{safe}.pdf"'
        return resp

    def _section_report_cards_pdf(self, filters):
        if not filters.exam_id:
            return Response({'error': 'exam_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        term = AcademicsService.get_exam_term_for_print(filters)
        if not term:
            return Response({'error': 'Exam not found.'}, status=404)
        template = _pick_document_template(filters.user.tenant, 'REPORT_CARD', filters.branch_id)
        if not template:
            return Response(
                {
                    'error': 'No active Report Card template. Add one under System Settings → Document Templates '
                    '(type: Report Card (per student)).',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        students = list(AcademicsService.get_students_for_exam_print(filters))
        if not students:
            return Response({'error': 'No students match the selected filters.'}, status=404)
        contexts = [AcademicsService.build_report_card_context(s, term) for s in students]
        try:
            pdf = generate_bulk_pdf_from_template(template, contexts)
        except Exception as exc:
            logger.exception('Report cards PDF failed')
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', term.name)[:80] or 'report_cards'
        resp = HttpResponse(pdf, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="Report_Cards_{safe}.pdf"'
        return resp

    def _report_card_summary_pdf(self, filters):
        if not filters.exam_id:
            return Response({'error': 'exam_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        term = AcademicsService.get_exam_term_for_print(filters)
        if not term:
            return Response({'error': 'Exam not found.'}, status=404)
        template = _pick_document_template(filters.user.tenant, 'REPORT_CARD_SUMMARY', filters.branch_id)
        if not template:
            return Response(
                {
                    'error': 'No active Report Card Summary template. Add one under System Settings → Document Templates.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        students = AcademicsService.get_students_for_exam_print(filters)
        if not students.exists():
            return Response({'error': 'No students match the selected filters.'}, status=404)
        context = AcademicsService.build_report_card_summary_context(students, term)
        try:
            pdf = generate_pdf_from_template(template, context)
        except Exception as exc:
            logger.exception('Report card summary PDF failed')
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', term.name)[:80] or 'summary'
        resp = HttpResponse(pdf, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="Report_Card_Summary_{safe}.pdf"'
        return resp
        
    @action(detail=False, methods=['get'], url_path='student-ranks')
    def student_ranks(self, request):
        filters = BaseReportFilter(request, request.user)
        data = AcademicsService.get_student_ranks(filters)
        summary = list_len_summary(data)
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    @action(detail=False, methods=['get'], url_path='missing-parent-logins')
    def missing_parent_logins(self, request):
        filters = BaseReportFilter(request, request.user)
        qs = AcademicsService.get_students_missing_parent_login(filters)
        summary = simple_count_summary(qs)
        data = qs.values(
            'admission_number', 'first_name', 'last_name',
            'class_section__grade', 'class_section__section',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)
        
    @action(detail=False, methods=['get'], url_path='student-id-cards')
    def student_id_cards(self, request):
        filters = BaseReportFilter(request, request.user)
        if request.query_params.get('file') == 'pdf':
            return self._student_id_cards_pdf(filters)
        qs = AcademicsService.get_students(filters)
        summary = simple_count_summary(qs)
        data = qs.values(
            'id', 'admission_number', 'first_name', 'last_name',
            'class_section__grade', 'class_section__section',
            'status', 'gender',
        )
        paginator = ReportPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        return paginator.get_paginated_response(page, summary=summary)

    def _student_id_cards_pdf(self, filters):
        template = _pick_document_template(filters.user.tenant, 'ID_CARD', filters.branch_id)
        if not template:
            return Response(
                {
                    'error': 'No active ID Card template. Create one under System Settings → Document Templates.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        students = list(AcademicsService.get_students(filters))
        if not students:
            return Response({'error': 'No students match the selected filters.'}, status=404)
        contexts = [AcademicsService.build_id_card_context(s) for s in students]
        try:
            pdf = generate_bulk_pdf_from_template(template, contexts)
        except Exception as exc:
            logger.exception('Bulk ID card PDF failed')
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        resp = HttpResponse(pdf, content_type='application/pdf')
        resp['Content-Disposition'] = 'attachment; filename="Student_ID_Cards.pdf"'
        return resp
