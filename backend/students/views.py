import logging
from collections import defaultdict

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

logger = logging.getLogger(__name__)
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import AnonRateThrottle
from decimal import Decimal
from django.utils import timezone
from django.db import transaction, models
from django.db.models import Q

from accounts.permissions import (
    IsSchoolAdminOrAbove,
    IsTeacherOrAbove,
    IsAccountantOrAbove,
    IsBranchAdminOrAbove,
    normalize_role,
    can_access_domain,
    role_in,
)
from accounts.utils import log_audit_action
from .models import (
    ClassSection, AdmissionInquiry, AdmissionApplication,
    ApplicationDocument, Student, ParentStudentRelation,
)
from .serializers import (
    ClassSectionSerializer, AdmissionInquirySerializer,
    AdmissionApplicationSerializer, ApplicationStatusSerializer,
    ApplicationDocumentSerializer, StudentSerializer,
    StudentListSerializer, ParentStudentRelationSerializer,
)
from fees.models import FeeStructure, StudentFeeItem, FeeApprovalRequest
from fees.transition_services import sync_carry_forwards_from_invoices

from .services import (
    create_student_fees, link_parent_accounts_to_student,
    student_needs_promoted_year_fee_setup,
    request_post_enrollment_concession,
)






class ClassSectionViewSet(viewsets.ModelViewSet):
    serializer_class = ClassSectionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['grade', 'section', 'display_name']

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'students']:
            return [IsAuthenticated(), IsTeacherOrAbove()]
        return [IsAuthenticated(), IsSchoolAdminOrAbove()]

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({'success': True, 'data': serializer.data})

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(user.role)
        if role == 'OWNER':
            qs = ClassSection.objects.all()
        else:
            qs = ClassSection.objects.filter(branch__tenant=user.tenant)
            
        # Branch Isolation
        if role not in ['OWNER', 'SUPER_ADMIN'] and user.branch:
            qs = qs.filter(branch=user.branch)
            
        import uuid
        branch = self.request.query_params.get('branch_id')
        ay = self.request.query_params.get('academic_year_id')
        if branch and branch not in ('undefined', 'null', ''):
            try:
                uuid.UUID(str(branch))
                qs = qs.filter(branch_id=branch)
            except ValueError:
                pass
        if ay and ay not in ('undefined', 'null', ''):
            try:
                uuid.UUID(str(ay))
                qs = qs.filter(academic_year_id=ay)
            except ValueError:
                pass
        else:
            if role == 'TEACHER':
                qs = qs.filter(
                    models.Q(academic_year__is_active=True) |
                    models.Q(teacher_assignments__teacher__user=user, teacher_assignments__academic_year__is_active=True)
                ).distinct()
            
        # Filter for primary teacher only (used by Attendance)
        teacher_only = self.request.query_params.get('teacher_only')
        if teacher_only == 'true' and role == 'TEACHER':
            qs = qs.filter(
                models.Q(class_teacher=user) |
                models.Q(teacher_assignments__teacher__user=user, teacher_assignments__is_class_teacher=True)
            ).distinct()
            
        # Filter for any assigned teacher (used by Homework)
        assigned_only = self.request.query_params.get('assigned_only')
        if assigned_only == 'true' and role == 'TEACHER':
            qs = qs.filter(teacher_assignments__teacher__user=user).distinct()
            
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        try:
            try:
                section = self.get_object()
            except Exception as e:
                from students.models import ClassSection
                from staff.models import TeacherAssignment
                cs_all = ClassSection.objects.filter(id=pk)
                cs_exists = cs_all.exists()
                details = {
                    "error_msg": str(e),
                    "class_section_exists": cs_exists,
                }
                if cs_exists:
                    cs = cs_all.first()
                    details.update({
                        "display_name": cs.display_name,
                        "branch_id": str(cs.branch_id),
                        "academic_year_id": str(cs.academic_year_id),
                        "academic_year_active": cs.academic_year.is_active if cs.academic_year else None,
                        "tenant_id": str(cs.tenant_id),
                        "user_tenant_id": str(request.user.tenant_id),
                        "user_branch_id": str(request.user.branch_id) if request.user.branch_id else None,
                        "user_role": request.user.role,
                    })
                    assignments = TeacherAssignment.objects.filter(class_section=cs, teacher__user=request.user)
                    details["assignments_count"] = assignments.count()
                    if assignments.exists():
                        details["assignments"] = [
                            {
                                "is_class_teacher": a.is_class_teacher,
                                "academic_year_id": str(a.academic_year_id),
                                "academic_year_active": a.academic_year.is_active,
                            } for a in assignments
                        ]
                return Response({
                    "success": False,
                    "error": "Failed to get class section object",
                    "details": details
                }, status=400)

            students = Student.objects.filter(class_section=section, status='ACTIVE', academic_year__is_active=True)
            serializer = StudentListSerializer(students, many=True)
            return Response({'success': True, 'data': serializer.data})
        except Exception as outer_e:
            return Response({"success": False, "error": str(outer_e)}, status=500)

    @action(detail=True, methods=['post'], url_path='assign-students')
    def assign_students(self, request, pk=None):
        section = self.get_object()
        student_ids = request.data.get('student_ids', [])
        updated = Student.objects.filter(
            id__in=student_ids, branch__tenant=request.user.tenant
        ).update(class_section=section)
        return Response({'success': True, 'data': {'assigned': updated}})


class AdmissionInquiryViewSet(viewsets.ModelViewSet):
    serializer_class = AdmissionInquirySerializer
    throttle_classes = [AnonRateThrottle]
    filter_backends = [filters.SearchFilter]
    search_fields = ['student_first_name', 'student_last_name', 'parent_name', 'parent_phone']

    def get_permissions(self):
        if self.action == 'create':
            return []  # Public endpoint per PRD
        return [IsAuthenticated(), IsBranchAdminOrAbove()]

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return AdmissionInquiry.objects.none()
        qs = AdmissionInquiry.objects.filter(branch__tenant=self.request.user.tenant)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        tenant = None
        if self.request.user.is_authenticated:
            tenant = self.request.user.tenant
        else:
            # For public inquiries, derive tenant from branch
            branch = serializer.validated_data.get('branch')
            if branch:
                tenant = branch.tenant
        serializer.save(tenant=tenant)

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        inquiry = self.get_object()
        new_status = request.data.get('status')
        if new_status:
            inquiry.status = new_status
            inquiry.save()
        return Response({'success': True, 'data': AdmissionInquirySerializer(inquiry).data})


class AdmissionApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = AdmissionApplicationSerializer
    permission_classes = [IsAuthenticated, IsBranchAdminOrAbove]
    filter_backends = [filters.SearchFilter]
    search_fields = ['first_name', 'last_name', 'father_name']

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(user.role)
        qs = AdmissionApplication.objects.filter(branch__tenant=user.tenant)
        
        # Branch Isolation
        if role not in ['OWNER', 'SUPER_ADMIN'] and user.branch:
            qs = qs.filter(branch=user.branch)
            
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        application = self.get_object()
        serializer = ApplicationStatusSerializer(
            data=request.data,
            context={'current_status': application.status}
        )
        serializer.is_valid(raise_exception=True)
        application.status = serializer.validated_data['status']
        if serializer.validated_data.get('remarks'):
            application.remarks = serializer.validated_data['remarks']
        if application.status in ['APPROVED', 'REJECTED']:
            application.reviewed_by = request.user
            application.reviewed_at = timezone.now()
        if application.status == 'SUBMITTED':
            application.submitted_at = timezone.now()
        application.save()
        return Response({'success': True, 'data': AdmissionApplicationSerializer(application).data})

    @transaction.atomic
    @action(detail=True, methods=['post'])
    def enroll(self, request, pk=None):
        try:
            application = self.get_object()
            if application.status != 'APPROVED':
                return Response(
                    {'detail': 'Only APPROVED applications can be enrolled.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Get params from request
            class_section_id = request.data.get('class_section_id')
            offered_total = request.data.get('offered_total')
            standard_total = request.data.get('standard_total')
            fee_reason = request.data.get('reason', '')

            if not class_section_id:
                return Response({'detail': 'Class Section is required for enrollment.'}, status=400)

            if offered_total is None:
                return Response({'detail': 'Agreed total fee (offered_total) is required for enrollment.'}, status=400)
            
            try:
                offered_total_val = Decimal(str(offered_total))
            except (ValueError, TypeError, ArithmeticError):
                return Response({'detail': 'Agreed total fee (offered_total) must be a valid number.'}, status=400)

            if offered_total_val <= 0:
                return Response({'detail': 'Agreed total fee (offered_total) must be greater than zero.'}, status=400)

            # Auto-generate admission number
            branch = application.branch
            ay = application.academic_year

            try:
                cs = ClassSection.objects.get(id=class_section_id)
            except ClassSection.DoesNotExist:
                return Response({'detail': 'Selected Class Section does not exist.'}, status=400)

            structure = FeeStructure.objects.filter(
                branch=branch, academic_year=ay, grade=cs.grade, is_active=True
            ).first()
            if not structure:
                return Response({
                    'detail': f"No active fee structure found for grade '{cs.grade}' in academic year '{ay.name}'."
                }, status=400)

            offered_total = offered_total_val
            if standard_total is not None:
                standard_total = Decimal(str(standard_total))

            admission_number = Student.generate_admission_number(branch, ay)

            student = Student.objects.create(
                tenant=application.tenant,
                branch=branch,
                academic_year=ay,
                class_section_id=class_section_id,
                admission_number=admission_number,
                first_name=application.first_name,
                last_name=application.last_name,
                date_of_birth=application.date_of_birth,
                gender=application.gender,
                blood_group=application.blood_group,
                nationality=application.nationality,
                religion=application.religion,
                caste_category=application.caste_category,
                aadhar_number=application.aadhar_number,
                mother_tongue=application.mother_tongue,
                identification_mark_1=application.identification_mark_1,
                identification_mark_2=application.identification_mark_2,
                health_status=application.health_status,
                previous_school_name=application.previous_school_name,
                previous_class=application.previous_class,
                previous_school_ay=application.previous_school_ay,
                emergency_contact_name=application.emergency_contact_name,
                emergency_contact_phone=application.emergency_contact_phone,
                emergency_contact_relation=application.emergency_contact_relation,
                # Documents
                doc_tc_submitted=application.doc_tc_submitted,
                doc_bonafide_submitted=application.doc_bonafide_submitted,
                doc_birth_cert_submitted=application.doc_birth_cert_submitted,
                doc_caste_cert_submitted=application.doc_caste_cert_submitted,
                doc_aadhaar_submitted=application.doc_aadhaar_submitted,
                # Father Info
                father_name=application.father_name,
                father_phone=application.father_phone,
                father_email=application.father_email,
                father_qualification=application.father_qualification,
                father_occupation=application.father_occupation,
                father_aadhaar=getattr(application, 'father_aadhaar', None),
                # Mother Info
                mother_name=application.mother_name,
                mother_phone=application.mother_phone,
                mother_email=application.mother_email,
                mother_qualification=application.mother_qualification,
                mother_occupation=application.mother_occupation,
                mother_aadhaar=getattr(application, 'mother_aadhaar', None),
                # Guardian Info
                guardian_name=application.guardian_name,
                guardian_phone=application.guardian_phone,
                guardian_relation=application.guardian_relation,
                # Address
                address_line1=application.address_line1,
                apartment_name=application.apartment_name,
                address_line2=application.address_line2,
                landmark=application.landmark,
                city=application.city,
                mandal=application.mandal,
                district=application.district,
                state=application.state,
                pincode=application.pincode,
                # Admin Staff
                admission_staff_name=application.admission_staff_name,
                admission_staff_phone=application.admission_staff_phone,
                # Link to application
                application=application,
                created_by=request.user,
            )

            # 2. Create/Link Parent accounts
            father_info = {'phone': application.father_phone, 'email': application.father_email, 'name': application.father_name}
            mother_info = {'phone': application.mother_phone, 'email': application.mother_email, 'name': application.mother_name}
            link_parent_accounts_to_student(
                student, father_info, mother_info, application.tenant, branch,
                strict_parent_email=False,
            )

            # Handle Fees
            create_student_fees(student, offered_total, standard_total, fee_reason, request.user)

            # Mark application as ENROLLED
            application.status = 'ENROLLED'
            application.save()

            from tenants.admission_fee import get_configured_admission_fee, student_requires_admission_payment

            return Response({
                'success': True,
                'message': f"Student {student.admission_number} enrolled successfully.",
                'student_id': str(student.id),
                'requires_admission_payment': student_requires_admission_payment(student),
                'admission_fee_config': str(
                    get_configured_admission_fee(student.branch_id, student.academic_year_id)
                ),
                'data': StudentSerializer(student).data,
            })
        except Exception as e:
            logger.error(f"Enrollment fatal error: {str(e)}")
            raise e

    @action(detail=True, methods=['get', 'post'], url_path='documents')
    def documents(self, request, pk=None):
        application = self.get_object()
        if request.method == 'GET':
            docs = application.documents.all()
            return Response({'success': True, 'data': ApplicationDocumentSerializer(docs, many=True).data})
        serializer = ApplicationDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(application=application)
        return Response({'success': True, 'data': serializer.data}, status=status.HTTP_201_CREATED)


class StudentViewSet(viewsets.ModelViewSet):
    filter_backends = [filters.SearchFilter]
    search_fields = [
        'first_name', 
        'last_name', 
        'admission_number',
        'father_phone',
        'mother_phone',
        'guardian_phone'
    ]

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), IsTeacherOrAbove()]
        # Accountants handle front-desk admissions and enrollment
        return [IsAuthenticated(), IsAccountantOrAbove()]

    def check_permissions(self, request):
        super().check_permissions(request)
        # Students endpoints are academic domain endpoints; finance-only roles are blocked.
        if not can_access_domain(request.user, 'academic'):
            raise PermissionDenied('You do not have access to academic data.')

    def get_serializer_class(self):
        if self.action == 'list':
            return StudentListSerializer
        return StudentSerializer

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(user.role)
        qs = Student.objects.filter(
            branch__tenant=user.tenant
        ).select_related(
            'class_section', 'academic_year', 'branch'
        ).prefetch_related(
            'parent_relations__parent',
            'fee_items',  # H1: eliminate N+1 for proposed_fee
        )
        
        # For detail views, prefetch invoices and payments too
        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                'invoices',          # H1: eliminate N+1 for fee_stats/invoices
                'invoices__payments', # H1: nested payment prefetch
                'payments',          # H1: eliminate N+1 for payments
                'academic_records',
            )
        
        # Teachers strictly see only students in their classes/sections
        if role == 'TEACHER':
            qs = qs.filter(
                models.Q(class_section__teacher_assignments__teacher__user=user, class_section__teacher_assignments__academic_year__is_active=True) |
                models.Q(class_section__class_teacher=user)
            ).distinct()
            
        # Branch Isolation: all roles except OWNER/SUPER_ADMIN/CHIEF_ACCOUNTANT/ZONAL_ADMIN
        # are scoped to their assigned branch. If a branch-scoped user has no branch set,
        # return empty queryset to prevent unintended cross-branch data exposure.
        GLOBAL_ROLES = ['OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN']
        if role not in GLOBAL_ROLES:
            if user.branch:
                qs = qs.filter(branch=user.branch)
            else:
                qs = qs.none()
        else:
            branch_id = self.request.query_params.get('branch_id')
            if branch_id and branch_id not in ('undefined', 'null', ''):
                try:
                    import uuid
                    uuid.UUID(str(branch_id))
                    qs = qs.filter(branch_id=branch_id)
                except ValueError:
                    pass
            
        status_filter = self.request.query_params.get('status')
        class_section = self.request.query_params.get('class_section_id')
        gender = self.request.query_params.get('gender')
        if status_filter:
            qs = qs.filter(status__in=status_filter.split(','))
        if class_section:
            qs = qs.filter(class_section_id=class_section)
        if gender:
            qs = qs.filter(gender=gender)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        student = serializer.instance
        from tenants.admission_fee import get_configured_admission_fee, student_requires_admission_payment

        out = dict(serializer.data)
        out['admission_fee_config'] = str(
            get_configured_admission_fee(student.branch_id, student.academic_year_id)
        )
        out['requires_admission_payment'] = student_requires_admission_payment(student)
        return Response({'success': True, 'data': out}, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def perform_create(self, serializer):
        user = self.request.user
        role = normalize_role(user.role)
        branch = serializer.validated_data.get('branch')
        
        if role == 'OWNER':
            tenant = branch.tenant if branch else None
        else:
            tenant = user.tenant
            if branch and branch.tenant != tenant:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can only assign students to branches within your school organization.")
                
            # ENFORCE BRANCH ISOLATION
            if role in ['PRINCIPAL', 'BRANCH_ADMIN'] and user.branch:
                branch = user.branch

        ay = serializer.validated_data.get('academic_year')
        if branch and ay:
            # Always generate on create so tenant format/prefix is consistently applied.
            serializer.validated_data['admission_number'] = Student.generate_admission_number(branch, ay)

        if not serializer.validated_data.get('roll_number'):
            class_section = serializer.validated_data.get('class_section')
            if class_section:
                max_roll = Student.objects.filter(class_section=class_section).aggregate(models.Max('roll_number'))['roll_number__max']
                serializer.validated_data['roll_number'] = (max_roll or 0) + 1

        # Fee locking and approval logic

        class_section = serializer.validated_data.get('class_section')
        if not class_section:
            raise ValidationError({'class_section': 'Class Section is required for enrollment.'})

        offered_total_val = serializer.validated_data.get('offered_total')
        if offered_total_val is None:
            raise ValidationError({'offered_total': 'Agreed total fee (offered_total) is required for enrollment.'})
        
        try:
            offered_total_decimal = Decimal(str(offered_total_val))
        except (ValueError, TypeError, ArithmeticError):
            raise ValidationError({'offered_total': 'Agreed total fee (offered_total) must be a valid number.'})

        if offered_total_decimal <= 0:
            raise ValidationError({'offered_total': 'Agreed total fee (offered_total) must be greater than zero.'})

        # Check fee structure exists
        if branch and ay:
            structure = FeeStructure.objects.filter(
                branch=branch, academic_year=ay, grade=class_section.grade, is_active=True
            ).first()
            if not structure:
                raise ValidationError({
                    'class_section': f"No active fee structure found for grade '{class_section.grade}' in academic year '{ay.name}'."
                })

        offered_total = serializer.validated_data.pop('offered_total', None)
        standard_total = serializer.validated_data.pop('standard_total', None)
        fee_reason = serializer.validated_data.pop('reason', '')
        
            
        try:
            student = serializer.save(tenant=tenant, branch=branch, created_by=user)
            logger.info(f"Student created: {student.admission_number} for tenant {tenant}")
            
            # Use shared fee creation logic
            create_student_fees(student, offered_total, standard_total, fee_reason, user)

            # Create/Link parent accounts
            father_info = {'phone': student.father_phone, 'email': student.father_email, 'name': student.father_name}
            mother_info = {'phone': student.mother_phone, 'email': student.mother_email, 'name': student.mother_name}
            link_parent_accounts_to_student(
                student, father_info, mother_info, tenant, branch,
                strict_parent_email=False,
            )
        except Exception as e:
            logger.error(f"Error creating student: {str(e)}")
            raise e

    @transaction.atomic
    def perform_update(self, serializer):
        student = serializer.save()
        tenant = student.tenant
        branch = student.branch
        father_info = {'phone': student.father_phone, 'email': student.father_email, 'name': student.father_name}
        mother_info = {'phone': student.mother_phone, 'email': student.mother_email, 'name': student.mother_name}
        link_parent_accounts_to_student(
            student, father_info, mother_info, tenant, branch,
            strict_parent_email=False,
        )

    def destroy(self, request, *args, **kwargs):
        """Soft-delete student by setting status to INACTIVE."""
        student = self.get_object()
        student.status = 'INACTIVE'
        student.save()
        return Response({'success': True, 'message': 'Student deactivated successfully.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['patch'], url_path='status')
    def update_status(self, request, pk=None):
        student = self.get_object()
        new_status = request.data.get('status')
        if new_status:
            if new_status == 'TRANSFERRED' and request.data.get('target_branch_id'):
                from tenants.models import Branch

                target_branch_id = request.data.get('target_branch_id')
                try:
                    target_branch = Branch.objects.get(id=target_branch_id, tenant=student.tenant)
                except Branch.DoesNotExist:
                    return Response({'detail': 'Target branch not found in this school.'}, status=400)

                if target_branch.id == student.branch_id:
                    return Response({'detail': 'Student is already in the selected branch.'}, status=400)

                conflict = Student.objects.filter(
                    branch=target_branch,
                    academic_year=student.academic_year,
                    admission_number=student.admission_number,
                ).exclude(id=student.id).exists()
                if conflict:
                    return Response(
                        {'detail': 'Admission number already exists in target branch for this academic year.'},
                        status=400
                    )

                old_branch_name = student.branch.name
                transfer_reason = (request.data.get('leaving_reason') or '').strip()
                student.branch = target_branch
                if student.class_section and student.class_section.branch_id != target_branch.id:
                    student.class_section = None
                    student.roll_number = None
                student.status = 'ACTIVE'  # Student continues in destination branch.
                student.leaving_date = request.data.get('leaving_date', timezone.now().date())
                student.leaving_reason = (
                    f"Transferred from {old_branch_name} to {target_branch.name}"
                    + (f". Reason: {transfer_reason}" if transfer_reason else '')
                )
                student.save()

                # ── Migrate outstanding dues to new branch ─────────────────
                # Re-assign unpaid/partially-paid invoices
                from fees.models import FeeInvoice, FeeCarryForward, Payment
                outstanding_invoices = FeeInvoice.objects.filter(
                    student=student,
                    status__in=['SENT', 'PARTIALLY_PAID', 'OVERDUE', 'DRAFT'],
                )
                invoice_ids = list(outstanding_invoices.values_list('id', flat=True))
                outstanding_invoices.update(branch=target_branch)

                # Re-assign carry-forwards not yet settled
                FeeCarryForward.objects.filter(
                    student=student,
                    status__in=['PENDING', 'PARTIALLY_PAID'],
                ).update(branch=target_branch)

                # Re-assign payments linked to those invoices
                if invoice_ids:
                    Payment.objects.filter(
                        student=student,
                        invoice_id__in=invoice_ids,
                    ).update(branch=target_branch)
                # ─────────────────────────────────────────────────────────

                log_audit_action(
                    user=request.user,
                    action='TRANSFER_STUDENT_BRANCH',
                    model_name='Student',
                    record_id=student.id,
                    details={
                        'admission_number': student.admission_number,
                        'from_branch': old_branch_name,
                        'to_branch': target_branch.name,
                        'reason': transfer_reason,
                        'invoices_migrated': len(invoice_ids),
                    },
                    tenant=student.tenant,
                )
            else:
                student.status = new_status
                if new_status == 'TRANSFERRED':
                    student.leaving_date = request.data.get('leaving_date', timezone.now().date())
                    student.leaving_reason = request.data.get('leaving_reason', '')
                student.save()
        return Response({'success': True, 'data': StudentSerializer(student).data})


    @action(detail=True, methods=['post'], url_path='mark-initial-payment-status')
    def mark_initial_payment_status(self, request, pk=None):
        student = self.get_object()
        if not role_in(request.user, {'ACCOUNTANT', 'SUPER_ADMIN'}):
            return Response(
                {'detail': 'Only branch accountant or super admin can change this status.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        target = (request.data.get('target') or '').strip().upper()
        paid_earlier = bool(request.data.get('paid_earlier', True))
        if target not in {'ADMISSION_FEE', 'FIXED_DEPOSIT'}:
            return Response({'detail': 'target must be ADMISSION_FEE or FIXED_DEPOSIT.'}, status=400)

        now = timezone.now()
        if target == 'ADMISSION_FEE':
            student.admission_fee_marked_paid_earlier = paid_earlier
            student.admission_fee_marked_paid_at = now if paid_earlier else None
        else:
            student.fixed_deposit_marked_paid_earlier = paid_earlier
            student.fixed_deposit_marked_paid_at = now if paid_earlier else None
        student.save(update_fields=[
            'admission_fee_marked_paid_earlier', 'admission_fee_marked_paid_at',
            'fixed_deposit_marked_paid_earlier', 'fixed_deposit_marked_paid_at',
            'updated_at',
        ])

        log_audit_action(
            user=request.user,
            action='MARK_INITIAL_PAYMENT_STATUS',
            model_name='Student',
            record_id=student.id,
            details={'target': target, 'paid_earlier': paid_earlier},
            tenant=student.tenant,
        )
        return Response({'success': True, 'data': StudentSerializer(student).data})

    @action(detail=True, methods=['post'], url_path='setup-promoted-year-fees')
    @transaction.atomic
    def setup_promoted_year_fees(self, request, pk=None):
        """
        After promotion: confirm academic-year fee like new enrollment (manual offered total,
        approval routing if below structure). Does not create admission (ADM-) invoices.
        """
        from decimal import InvalidOperation

        student = self.get_object()
        if not student_needs_promoted_year_fee_setup(student):
            raise ValidationError('Fees for this year are already set, or promotion fee setup is not required.')
        if not student.class_section_id:
            raise ValidationError('Student must have a class assigned.')
        structure = FeeStructure.objects.filter(
            branch_id=student.branch_id,
            academic_year_id=student.academic_year_id,
            grade=student.class_section.grade,
            is_active=True,
        ).first()
        if not structure:
            raise ValidationError('No active fee structure for this class and academic year. Configure it under Setup first.')
        offered_raw = request.data.get('offered_total')
        if offered_raw is None or str(offered_raw).strip() == '':
            raise ValidationError('offered_total is required.')
        try:
            offered_total = Decimal(str(offered_raw))
        except (InvalidOperation, TypeError, ValueError):
            raise ValidationError('Invalid offered_total value.')
        standard_raw = request.data.get('standard_total')
        standard_total = None
        if standard_raw not in (None, ''):
            try:
                standard_total = Decimal(str(standard_raw))
            except (InvalidOperation, TypeError, ValueError):
                raise ValidationError('Invalid standard_total value.')
        reason = (request.data.get('reason') or '').strip() or 'Promoted class — confirmed academic fee'
        try:
            create_student_fees(student, offered_total, standard_total, reason, request.user)
        except ValidationError as exc:
            # Re-raise with a flattened string detail so frontend always gets {'detail': 'string'}
            detail = exc.detail
            if isinstance(detail, dict):
                msg = ' | '.join(str(v[0] if isinstance(v, list) else v) for v in detail.values())
            elif isinstance(detail, list):
                msg = ' | '.join(str(m) for m in detail)
            else:
                msg = str(detail)
            raise ValidationError(msg)
        serializer = self.get_serializer(student)
        return Response({'success': True, 'data': serializer.data})

    @action(detail=True, methods=['post'], url_path='request-concession')
    @transaction.atomic
    def request_concession(self, request, pk=None):
        """
        Accountants and above: raise a post-enrollment fee concession request for an ACTIVE student.
        If the proposed fee is below the locked fee total, a FeeApprovalRequest
        (request_type='CONCESSION') is created and routed to Zonal/Super admin for approval.
        No invoices or payments are touched until the request is approved.
        """
        from accounts.permissions import IsAccountantOrAbove
        from fees.serializers import FeeApprovalRequestSerializer
        from decimal import Decimal, InvalidOperation

        user = self.request.user
        # Explicitly check permission (action doesn't inherit viewset default)
        if not IsAccountantOrAbove().has_permission(request, self):
            raise PermissionDenied('Only accountants and above can raise concession requests.')

        student = self.get_object()
        raw_offered = request.data.get('offered_total')
        reason = (request.data.get('reason') or '').strip()

        if raw_offered is None:
            return Response(
                {'detail': 'offered_total is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            offered_total = Decimal(str(raw_offered))
        except (InvalidOperation, ValueError, TypeError):
            return Response(
                {'detail': 'offered_total must be a valid number.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            approval = request_post_enrollment_concession(
                student=student,
                offered_total=offered_total,
                reason=reason,
                requested_by=user,
            )
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                msg = ' | '.join(str(v[0] if isinstance(v, list) else v) for v in detail.values())
            elif isinstance(detail, list):
                msg = ' | '.join(str(m) for m in detail)
            else:
                msg = str(detail)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'success': True,
            'message': 'Concession request submitted for approval.',
            'data': FeeApprovalRequestSerializer(approval).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='update-class-fees')
    @transaction.atomic
    def update_class_and_fees(self, request, pk=None):
        """
        Super Admin / Owner only: update a student's class and fees.
        Cancels the existing annual invoice (if unpaid/partially paid),
        removes the old StudentFeeItem rows, saves the new class,
        and generates the new FeeInvoice/StudentFeeItems.
        """
        user = self.request.user
        if not role_in(user, ['SUPER_ADMIN', 'OWNER']):
            raise PermissionDenied("Only Super Admins or School Owners can update a student's class and fees.")

        student = self.get_object()
        class_section_id = request.data.get('class_section_id')
        offered_total = request.data.get('offered_total')
        reason = (request.data.get('reason') or '').strip()

        if not class_section_id:
            raise ValidationError({'class_section_id': 'Class section is required.'})
        if offered_total is None or str(offered_total).strip() == '':
            raise ValidationError({'offered_total': 'Agreed total fee is required.'})
        if not reason:
            raise ValidationError({'reason': 'Reason for modification is required for audit logs.'})

        try:
            new_class_section = ClassSection.objects.get(id=class_section_id, tenant=student.tenant)
        except ClassSection.DoesNotExist:
            raise ValidationError({'class_section_id': 'Selected class section does not exist.'})

        # Ensure same branch as the student, unless we are owner in multitenant
        if new_class_section.branch_id != student.branch_id and role != 'OWNER':
            raise ValidationError({'class_section_id': 'New class section must belong to the same branch.'})

        # Try to parse offered_total
        try:
            offered_total_val = Decimal(str(offered_total))
        except (ValueError, TypeError, ArithmeticError):
            raise ValidationError({'offered_total': 'Agreed total fee must be a valid number.'})

        if offered_total_val <= 0:
            raise ValidationError({'offered_total': 'Agreed total fee must be greater than zero.'})

        # Verify a fee structure exists for the new grade
        from fees.models import FeeStructure, FeeInvoice, StudentFeeItem
        ay = student.academic_year
        structure = FeeStructure.objects.filter(
            branch=student.branch, academic_year=ay, grade=new_class_section.grade, is_active=True
        ).first()
        if not structure:
            raise ValidationError({
                'class_section_id': f"No active fee structure found for grade '{new_class_section.grade}' in academic year '{ay.name}'."
            })

        # Cancel existing ANNUAL invoice(s)
        # Note: Academic-year fees only — exclude one-time admission (ADM-), transport (TRN-), caution (FDP-), special (SPF-)
        # Cancel any invoices that are not CANCELLED
        old_invoices = FeeInvoice.objects.filter(
            student=student,
            academic_year=ay,
            month='ANNUAL'
        ).exclude(
            invoice_number__startswith='ADM-'
        ).exclude(
            invoice_number__startswith='TRN-'
        ).exclude(
            invoice_number__startswith='FDP-'
        ).exclude(
            invoice_number__startswith='SPF-'
        ).exclude(
            status='CANCELLED'
        )

        # Track old payments to transfer them
        old_payments_total = Decimal('0.00')
        old_allocations = []
        from fees.models import PaymentAllocation

        for invoice in old_invoices:
            if invoice.paid_amount > 0:
                old_payments_total += invoice.paid_amount
                allocs = list(PaymentAllocation.objects.filter(invoice=invoice))
                old_allocations.extend(allocs)
            
            invoice.status = 'CANCELLED'
            invoice.paid_amount = Decimal('0.00')
            invoice.outstanding_amount = Decimal('0.00')
            invoice.save(update_fields=['status', 'paid_amount', 'outstanding_amount'])

        # Delete existing StudentFeeItem rows for this student and academic year
        StudentFeeItem.objects.filter(student=student, academic_year=ay).delete()

        # Update student class
        old_class_name = student.class_section.display_name if student.class_section else 'None'
        student.class_section = new_class_section
        student.save(update_fields=['class_section', 'updated_at'])

        # Call create_student_fees to recreate fees
        create_student_fees(student, offered_total_val, None, reason, user)

        # Transfer payments to the new invoice
        if old_allocations:
            new_invoice = FeeInvoice.objects.filter(
                student=student, academic_year=ay, month='ANNUAL'
            ).exclude(status='CANCELLED').first()
            
            if new_invoice:
                for alloc in old_allocations:
                    alloc.invoice = new_invoice
                    alloc.save(update_fields=['invoice'])
                
                new_invoice.paid_amount = old_payments_total
                new_invoice.outstanding_amount = max(new_invoice.net_amount - new_invoice.paid_amount, Decimal('0.00'))
                new_invoice.status = 'PAID' if new_invoice.outstanding_amount <= 0 else 'PARTIALLY_PAID'
                new_invoice.save(update_fields=['paid_amount', 'outstanding_amount', 'status'])

        # Audit log the action
        log_audit_action(
            user=user,
            action='UPDATE_STUDENT_CLASS_AND_FEES',
            model_name='Student',
            record_id=student.id,
            details={
                'admission_number': student.admission_number,
                'old_class': old_class_name,
                'new_class': new_class_section.display_name,
                'offered_total': float(offered_total_val),
                'reason': reason
            },
            tenant=student.tenant
        )

        return Response({
            'success': True,
            'message': 'Student class and fees updated successfully.',
            'data': StudentSerializer(student).data
        })

    @action(detail=False, methods=['post'], url_path='promote')
    @transaction.atomic
    def promote_students(self, request):
        """MF1: Academic year student promotion/rollover system.
        NOTE: This is the legacy promote endpoint. For the new promotion engine
        with carry-forwards, academic records, and class mapping, use
        POST /api/promotions/execute/ instead.
        """
        student_ids = request.data.get('student_ids', [])
        target_academic_year_id = request.data.get('target_academic_year_id')
        target_class_section_id = request.data.get('target_class_section_id')

        if not all([student_ids, target_academic_year_id, target_class_section_id]):
            return Response({'error': 'student_ids, target_academic_year_id, and target_class_section_id are required'}, status=400)
            
        from tenants.models import AcademicYear
        from students.models import StudentAcademicRecord
        try:
            target_ay = AcademicYear.objects.get(id=target_academic_year_id, tenant=request.user.tenant)
            target_cs = ClassSection.objects.get(id=target_class_section_id, tenant=request.user.tenant)
        except (AcademicYear.DoesNotExist, ClassSection.DoesNotExist):
            return Response({'error': 'Invalid academic year or class section id.'}, status=400)

        students = list(Student.objects.filter(id__in=student_ids, tenant=request.user.tenant))
        by_source_year = defaultdict(list)
        for s in students:
            by_source_year[s.academic_year_id].append(s.pk)

        promoted_count = 0
        for student in students:
            # Dual-write: create academic record for source year (if not exists)
            old_record, _ = StudentAcademicRecord.objects.get_or_create(
                student=student,
                academic_year=student.academic_year,
                defaults={
                    'class_section': student.class_section,
                    'roll_number': student.roll_number,
                    'status': 'PROMOTED',
                    'status_changed_at': timezone.now(),
                    'status_changed_by': request.user,
                    'status_reason': f'Promoted to {target_cs.grade}',
                }
            )
            if old_record.status == 'ACTIVE':
                old_record.status = 'PROMOTED'
                old_record.status_changed_at = timezone.now()
                old_record.status_changed_by = request.user
                old_record.save()

            # Create new year record
            StudentAcademicRecord.objects.get_or_create(
                student=student,
                academic_year=target_ay,
                defaults={
                    'class_section': target_cs,
                    'roll_number': student.roll_number,
                    'status': 'ACTIVE',
                    'promoted_from': old_record,
                }
            )

            # Update mutable fields (backward compat)
            student.academic_year = target_ay
            student.class_section = target_cs
            student.save()
            promoted_count += 1

        for source_year_id, sids in by_source_year.items():
            if source_year_id == target_ay.id:
                continue
            try:
                source_ay = AcademicYear.objects.get(id=source_year_id, tenant=request.user.tenant)
            except AcademicYear.DoesNotExist:
                continue
            sync_carry_forwards_from_invoices(
                request.user.tenant,
                source_ay,
                target_ay,
                request.user,
                student_ids=sids,
            )

        return Response({
            'success': True,
            'message': (
                f'Successfully promoted {promoted_count} students. '
                'Set academic-year fees per student from their profile (Fees tab).'
            ),
            'promoted_count': promoted_count,
        })

    @action(detail=False, methods=['post'], url_path='import-csv')
    def import_csv(self, request):
        from .csv_import import handle_csv_import
        return handle_csv_import(request)

    @action(detail=False, methods=['get'], url_path='import-csv/status/(?P<job_id>[^/.]+)')
    def import_csv_status(self, request, job_id=None):
        from .models import CsvImportJob
        try:
            job = CsvImportJob.objects.get(id=job_id, tenant=request.user.tenant)
            return Response({
                'success': True,
                'data': {
                    'id': job.id,
                    'status': job.status,
                    'total_rows': job.total_rows,
                    'processed_rows': job.processed_rows,
                    'success_count': job.success_count,
                    'skipped_duplicates': job.skipped_duplicates,
                    'errors': job.error_log
                }
            })
        except CsvImportJob.DoesNotExist:
            return Response({'success': False, 'detail': 'Job not found'}, status=404)

    @action(
        detail=False,
        methods=['post'],
        url_path='bulk-archive',
        permission_classes=[IsAuthenticated, IsAccountantOrAbove],
    )
    @transaction.atomic
    def bulk_archive(self, request):
        """Mark students as ARCHIVED (directory only — fee history retained). Accountant and above."""
        student_ids = request.data.get('student_ids', [])
        reason = (request.data.get('reason') or 'Archived').strip()[:500]
        if not student_ids:
            return Response({'error': 'student_ids is required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        qs = Student.objects.filter(id__in=student_ids, branch__tenant=user.tenant)
        if normalize_role(user.role) not in ['OWNER', 'SUPER_ADMIN'] and user.branch:
            qs = qs.filter(branch=user.branch)

        archived_count = 0
        today = timezone.now().date()
        for student in qs.select_related('tenant', 'branch'):
            if student.status == 'ARCHIVED':
                continue
            student.status = 'ARCHIVED'
            student.leaving_date = today
            student.leaving_reason = reason
            student.save(update_fields=['status', 'leaving_date', 'leaving_reason', 'updated_at'])
            log_audit_action(
                user=user,
                action='ARCHIVE_STUDENT',
                model_name='Student',
                record_id=student.id,
                details={'reason': reason, 'admission_number': student.admission_number},
                tenant=student.tenant,
            )
            archived_count += 1

        return Response({'success': True, 'archived_count': archived_count})

class ParentStudentRelationViewSet(viewsets.ModelViewSet):
    serializer_class = ParentStudentRelationSerializer
    permission_classes = [IsAuthenticated, IsBranchAdminOrAbove]

    def get_queryset(self):
        qs = ParentStudentRelation.objects.filter(student__branch__tenant=self.request.user.tenant)
        student_id = self.request.query_params.get('student_id')
        if student_id:
            qs = qs.filter(student_id=student_id)
        return qs
