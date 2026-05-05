import logging
from decimal import Decimal

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsSchoolAdminOrAbove, has_min_role, normalize_role

logger = logging.getLogger(__name__)

from .models import DocumentTemplate
from .serializers import DocumentTemplateSerializer
from .services import (
    absolute_media_url,
    build_fee_receipt_context,
    extract_body_html,
    generate_pdf_from_template,
    rupee_amount_in_words,
)

class DocumentTemplateViewSet(viewsets.ModelViewSet):
    """
    CRUD API for storing dynamic HTML and configuration-based templates.
    """
    serializer_class = DocumentTemplateSerializer
    permission_classes = [IsAuthenticated, IsSchoolAdminOrAbove]

    def get_queryset(self):
        user = self.request.user
        qs = DocumentTemplate.objects.filter(tenant=user.tenant)
        
        template_type = self.request.query_params.get('type')
        if template_type:
            qs = qs.filter(type=template_type)
            
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        branch = None
        if normalize_role(user.role) != 'OWNER':
            branch = user.branch if getattr(user, 'branch', None) else None
        serializer.save(tenant=user.tenant, branch=branch, created_by=user)

    @action(detail=False, methods=['get'], url_path='generate/student/(?P<student_id>[^/.]+)')
    def generate_id_card(self, request, student_id=None):
        """
        Generates PDF for a student ID Card using the default ID_CARD template.
        """
        from students.models import Student
        try:
            student = Student.objects.get(id=student_id, tenant=request.user.tenant)
        except Student.DoesNotExist:
            return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        template = DocumentTemplate.objects.filter(
            tenant=request.user.tenant, type='ID_CARD', is_active=True
        ).order_by('-is_default', '-created_at').first()

        if not template:
            return Response({'error': 'No active ID Card template found.'}, status=status.HTTP_400_BAD_REQUEST)

        context = {
            'tenant_name': student.tenant.name,
            'tenant_logo': student.tenant.logo_url or '',
            'tenant_address': student.tenant.address or '',
            'tenant_city': student.tenant.city or '',
            'tenant_state': student.tenant.state or '',
            'branch_name': student.branch.name if student.branch else '',
            'student': {
                'first_name': student.first_name,
                'last_name': student.last_name,
                'admission_number': student.admission_number or '',
                'date_of_birth': str(student.date_of_birth) if student.date_of_birth else '',
                'class_section': str(student.class_section) if student.class_section else '',
                'guardian_name': student.guardian_name if hasattr(student, 'guardian_name') and student.guardian_name else '',
                'contact': student.phone if hasattr(student, 'phone') and student.phone else '',
                'blood_group': student.blood_group if hasattr(student, 'blood_group') and student.blood_group else '',
            }
        }
        
        try:
            pdf_bytes = generate_pdf_from_template(template, context)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="ID_CARD_{student.admission_number}.pdf"'
            return response
        except Exception:
            logger.exception('ID card PDF generation failed')
            return Response(
                {'error': 'Could not generate PDF. Please try again or contact support.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['get'], url_path='generate/transfer-certificate/(?P<student_id>[^/.]+)')
    def generate_transfer_certificate(self, request, student_id=None):
        """PDF transfer / school leaving certificate using TRANSFER_CERTIFICATE template."""
        from django.utils import timezone
        from students.models import Student

        try:
            student = Student.objects.select_related('tenant', 'branch', 'class_section', 'academic_year').get(
                id=student_id, tenant=request.user.tenant,
            )
        except Student.DoesNotExist:
            return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        template = DocumentTemplate.objects.filter(
            tenant=request.user.tenant, type='TRANSFER_CERTIFICATE', is_active=True,
        ).order_by('-is_default', '-created_at').first()

        if not template:
            return Response({'error': 'No active Transfer Certificate template found.'}, status=status.HTTP_400_BAD_REQUEST)

        qp = request.query_params
        ay = str(student.academic_year) if student.academic_year_id else ''
        context = {
            'tenant_name': student.tenant.name,
            'tenant_logo': student.tenant.logo_url or '',
            'tenant_address': student.tenant.address or '',
            'tenant_city': student.tenant.city or '',
            'tenant_state': student.tenant.state or '',
            'branch_name': student.branch.name if student.branch else '',
            'student': {
                'first_name': student.first_name,
                'last_name': student.last_name or '',
                'admission_number': student.admission_number or '',
                'date_of_birth': str(student.date_of_birth) if student.date_of_birth else '',
                'class_section': str(student.class_section) if student.class_section else '',
                'father_name': student.father_name or '',
                'mother_name': student.mother_name or '',
            },
            'tc': {
                'certificate_no': qp.get('certificate_no', ''),
                'issue_date': qp.get('issue_date') or str(timezone.now().date()),
                'last_class_studied': qp.get('last_class_studied') or (
                    str(student.class_section) if student.class_section else ''
                ),
                'academic_session': qp.get('academic_session', ay),
                'date_of_leaving': qp.get('date_of_leaving', ''),
                'reason_for_leaving': qp.get('reason_for_leaving', ''),
                'conduct': qp.get('conduct', 'Good'),
                'promotion_remark': qp.get('promotion_remark', 'Eligible for promotion to the next higher class.'),
            },
        }

        try:
            pdf_bytes = generate_pdf_from_template(template, context)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            safe_adm = student.admission_number or str(student.id)[:8]
            response['Content-Disposition'] = f'attachment; filename="TC_{safe_adm}.pdf"'
            return response
        except Exception:
            logger.exception('Transfer certificate PDF generation failed')
            return Response(
                {'error': 'Could not generate PDF. Please try again or contact support.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['get'], url_path='generate/receipt/(?P<payment_id>[^/.]+)', permission_classes=[IsAuthenticated])
    def generate_receipt(self, request, payment_id=None):
        """
        Generates PDF for a Fee Receipt using the default FEE_RECEIPT template.
        Allowed: finance roles (accountant+), super admin, or parent of the paying student.
        """
        from fees.models import Payment
        from students.models import ParentStudentRelation

        pay_qs = Payment.objects.filter(id=payment_id)
        role = normalize_role(request.user.role)
        if request.user.tenant:
            pay_qs = pay_qs.filter(tenant=request.user.tenant)
        elif role != 'OWNER':
            return Response({'error': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            payment = pay_qs.get()
        except Payment.DoesNotExist:
            return Response({'error': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if role == 'PARENT':
            if not ParentStudentRelation.objects.filter(
                parent=request.user, student_id=payment.student_id
            ).exists():
                return Response({'error': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)
        elif role != 'OWNER' and not has_min_role(request.user, 'ACCOUNTANT'):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        tenant = payment.tenant
        template = DocumentTemplate.objects.filter(
            tenant=tenant, type='FEE_RECEIPT', is_active=True
        ).order_by('-is_default', '-created_at').first()

        if not template:
            return Response({'error': 'No active Fee Receipt template found.'}, status=status.HTTP_400_BAD_REQUEST)

        context = build_fee_receipt_context(payment, request=request)
        
        try:
            pdf_bytes = generate_pdf_from_template(template, context)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="RECEIPT_{payment.receipt_number}.pdf"'
            return response
        except Exception:
            logger.exception('Fee receipt PDF generation failed')
            return Response(
                {'error': 'Could not generate PDF. Please try again or contact support.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['post'], url_path='preview')
    def preview_template(self, request):
        """
        Generates a preview PDF from an unsaved template payload.
        """
        data = request.data
        mode = data.get('mode', 'CONFIG')
        template_type = data.get('type', 'ID_CARD')
        
        # Create an unsaved dummy template object
        dummy_template = DocumentTemplate(
            name="Preview",
            type=template_type,
            mode=mode,
            config_data=data.get('config_data', {}),
            raw_html=data.get('raw_html', ''),
            tenant=request.user.tenant
        )

        demo_payment_amount = Decimal('10000.00')
        context = {
            'tenant_name': request.user.tenant.name or "Demo School",
            'tenant_logo': absolute_media_url(request, request.user.tenant.logo_url or ''),
            'tenant_address': request.user.tenant.address or '123 School Road',
            'tenant_city': request.user.tenant.city or 'City',
            'tenant_state': request.user.tenant.state or 'State',
            'tenant_pincode': getattr(request.user.tenant, 'pincode', '') or '',
            'tenant_phone': getattr(request.user.tenant, 'owner_phone', '') or '',
            'branch_name': 'Main Branch',
            'student': {
                'first_name': 'John',
                'last_name': 'Doe',
                'full_name': 'John Doe',
                'admission_number': 'STD-2026-001',
                'date_of_birth': '2010-05-15',
                'class_section': 'Grade 5 - A',
                'class_name': 'Grade 5 - A',
                'class_grade': 'G5',
                'class_section_code': 'A',
                'roll_number': '12',
                'gender': 'MALE',
                'photo_url': '',
                'guardian_name': 'Jane Doe',
                'guardian_phone': '9876543211',
                'contact': '9876543210',
                'father_name': 'Robert Doe',
                'mother_name': 'Jane Doe',
                'father_phone': '9876543210',
                'mother_phone': '9876543212',
            },
            'tc': {
                'certificate_no': 'TC/2026/042',
                'issue_date': '2026-05-01',
                'last_class_studied': 'Grade 5 - A',
                'academic_session': '2025-2026',
                'date_of_leaving': '2026-04-30',
                'reason_for_leaving': 'Family relocation',
                'conduct': 'Good',
                'promotion_remark': 'Eligible for promotion to the next higher class.',
            },
            'exam': {
                'name': 'Half-Yearly Examination',
                'start_date': '2026-09-01',
                'end_date': '2026-09-08',
                'academic_year': '2025-2026',
            },
            'subjects': [
                {
                    'name': 'English',
                    'marks_obtained': '78',
                    'max_marks': '100',
                    'percentage': '78.00',
                    'grade': 'B1',
                    'remarks': '',
                },
                {
                    'name': 'Mathematics',
                    'marks_obtained': '92',
                    'max_marks': '100',
                    'percentage': '92.00',
                    'grade': 'A1',
                    'remarks': '',
                },
            ],
            'aggregate': {'total_marks': '170', 'max_marks': '200', 'percentage': '85.00'},
            'students': [
                {
                    'student': {
                        'first_name': 'John',
                        'last_name': 'Doe',
                        'admission_number': 'STD-2026-001',
                        'class_section': 'Grade 5 - A',
                    },
                    'subjects': [],
                    'aggregate': {'total_marks': '170', 'max_marks': '200', 'percentage': '85.00'},
                },
                {
                    'student': {
                        'first_name': 'Priya',
                        'last_name': 'Singh',
                        'admission_number': 'STD-2026-002',
                        'class_section': 'Grade 5 - A',
                    },
                    'subjects': [],
                    'aggregate': {'total_marks': '182', 'max_marks': '200', 'percentage': '91.00'},
                },
            ],
            'invoice': {
                'invoice_number': 'INV-MAIN-2026-04-0001',
                'month': '2026-04',
                'net_amount': '15000.00',
                'outstanding_amount': '5000.00',
                'academic_year': '2025-2026',
            },
            'payment': {
                'receipt_number': 'REC-9999',
                'amount': str(demo_payment_amount),
                'total_amount': str(demo_payment_amount),
                'payment_date': '2026-04-28',
                'date': '2026-04-28',
                'printed_date': str(timezone.now().date()),
                'payment_mode': 'UPI',
                'mode': 'UPI',
                'payment_mode_display': 'UPI',
                'reference_number': 'TXN-ABC123456',
                'collected_by': 'Office Staff',
                'amount_in_words': rupee_amount_in_words(demo_payment_amount),
                'balance': '5000.00',
            }
        }

        try:
            pdf_bytes = generate_pdf_from_template(dummy_template, context)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = 'inline; filename="PREVIEW.pdf"'
            return response
        except Exception:
            logger.exception('Template preview PDF failed')
            return Response(
                {'error': 'Could not generate preview PDF.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['post'], url_path='generate/bulk-id-cards')
    def bulk_id_cards(self, request):
        """
        Generates a multi-page PDF containing ID cards for multiple students.
        Accepts: { student_ids: [...] } OR { class_section_id: "..." } OR { branch_id: "..." }
        """
        from students.models import Student

        student_ids = request.data.get('student_ids', [])
        class_section_id = request.data.get('class_section_id')
        branch_id = request.data.get('branch_id')

        students = Student.objects.filter(tenant=request.user.tenant, status='ACTIVE')
        if student_ids:
            students = students.filter(id__in=student_ids)
        elif class_section_id:
            students = students.filter(class_section_id=class_section_id)
        elif branch_id:
            students = students.filter(branch_id=branch_id)
        else:
            return Response({'error': 'Provide student_ids, class_section_id, or branch_id.'}, status=400)

        if not students.exists():
            return Response({'error': 'No active students found for the given filter.'}, status=404)

        template = DocumentTemplate.objects.filter(
            tenant=request.user.tenant, type='ID_CARD', is_active=True
        ).order_by('-is_default', '-created_at').first()

        if not template:
            return Response({'error': 'No active ID Card template found. Create one in System Settings → Templates.'}, status=400)

        try:
            from weasyprint import HTML
        except (ImportError, OSError, Exception):
            logger.exception('WeasyPrint import failed for bulk ID cards')
            return Response(
                {'error': 'PDF engine is not available on this server.'},
                status=500,
            )

        from .services import _build_id_card_html

        html_pages = []
        cfg = template.config_data or {}
        primary = cfg.get('primary_color', '#1a56db')
        bg = cfg.get('background_color', '#ffffff')
        text = cfg.get('text_color', '#1e293b')

        for student in students.select_related('tenant', 'branch', 'class_section'):
            school_name = cfg.get('school_name') or student.tenant.name
            logo_url = student.tenant.logo_url or ''
            branch_name = student.branch.name if student.branch else ''

            ctx = {
                'tenant_name': school_name,
                'tenant_logo': logo_url,
                'branch_name': branch_name,
                'student': {
                    'first_name': student.first_name,
                    'last_name': student.last_name,
                    'admission_number': student.admission_number or '',
                    'date_of_birth': str(student.date_of_birth) if student.date_of_birth else '',
                    'class_section': str(student.class_section) if student.class_section else '',
                    'guardian_name': student.guardian_name if hasattr(student, 'guardian_name') and student.guardian_name else '',
                    'contact': student.phone if hasattr(student, 'phone') and student.phone else '',
                    'blood_group': student.blood_group if hasattr(student, 'blood_group') and student.blood_group else '',
                }
            }
            page_html = _build_id_card_html(ctx, cfg, school_name, logo_url, primary, bg, text, branch_name)
            html_pages.append(page_html)

        # Merge all pages into one HTML document
        combined_html = f"""
        <html>
        <head>
        <style>
            @page {{ size: 85.6mm 53.98mm; margin: 0; }}
            .page-break {{ page-break-after: always; }}
        </style>
        </head>
        <body>
        {''.join(f'<div class="page-break">{extract_body_html(page)}</div>' for page in html_pages)}
        </body>
        </html>
        """

        try:
            pdf_bytes = HTML(string=combined_html).write_pdf()
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="ID_Cards_Bulk_{len(html_pages)}.pdf"'
            return response
        except Exception:
            logger.exception('Bulk ID card PDF generation failed')
            return Response(
                {'error': 'Could not generate PDF. Please try again or contact support.'},
                status=500,
            )

