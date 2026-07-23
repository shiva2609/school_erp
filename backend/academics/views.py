import logging
from decimal import Decimal

from django.db import transaction, IntegrityError
from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import normalize_role, IsAccountantOrAbove
from academics.models import ExamResult, AcademicSubject, Assessment, AssessmentSubject
from academics.marks_access import can_enter_exam_marks
from academics.permissions import AcademicDomainPermission
from academics.serializers import (
    BulkExamMarksSerializer,
    AcademicSubjectSerializer, AssessmentSerializer, AssessmentSubjectSerializer,
)
from students.models import ClassSection, Student
from staff.models import TeacherProfile, TeacherAssignment
from timetable.models import TimetableSlot

logger = logging.getLogger(__name__)


def _collect_teaching_pairs(user):
    """Distinct (class_section, subject) the user may enter marks for as a teacher."""
    out = []
    seen = set()
    tp = TeacherProfile.objects.filter(user=user).first()
    if tp:
        qs = TeacherAssignment.objects.filter(staff=tp).select_related(
            'class_section', 'class_section__branch', 'subject'
        )
        for a in qs:
            key = (str(a.class_section_id), str(a.subject_id))
            if key in seen or a.subject is None:
                continue
            seen.add(key)
            cs = a.class_section
            out.append({
                'class_section_id': str(cs.id),
                'class_name': cs.display_name or str(cs),
                'subject_id': str(a.subject_id),
                'subject_name': a.subject.name,
                'branch_id': str(cs.branch_id),
                'academic_year_id': str(cs.academic_year_id),
            })
        
        slots = TimetableSlot.objects.filter(
            teacher=tp, subject__isnull=False
        ).select_related('class_section', 'class_section__branch', 'subject')
        for row in slots:
            cs = row.class_section
            sub = row.subject
            key = (str(cs.id), str(sub.id))
            if key in seen:
                continue
            seen.add(key)
            out.append({
                'class_section_id': str(cs.id),
                'class_name': cs.display_name or str(cs),
                'subject_id': str(sub.id),
                'subject_name': sub.name,
                'branch_id': str(cs.branch_id),
                'academic_year_id': str(cs.academic_year_id),
            })
    return out


def _assessments_for_branches(tenant, branch_ids):
    if not branch_ids:
        return []
    qs = Assessment.objects.filter(tenant=tenant, branch_id__in=branch_ids, is_active=True)
    return list(
        qs.order_by('start_date').values('id', 'name', 'start_date', 'end_date', 'branch_id', 'academic_year_id', 'grade')
    )





@api_view(['GET'])
@permission_classes([IsAuthenticated, AcademicDomainPermission])
def teacher_marks_context(request):
    """
    Teaching assignments (class + subject) and exam terms for those branches.
    """
    user = request.user
    assignments = _collect_teaching_pairs(user)
    branch_ids = list({a['branch_id'] for a in assignments})
    role = normalize_role(user.role)
    if not branch_ids and user.branch_id and role in (
        'PRINCIPAL', 'BRANCH_ADMIN', 'SUPER_ADMIN', 'OWNER', 'ZONAL_ADMIN',
    ):
        branch_ids = [str(user.branch_id)]
    assessments = _assessments_for_branches(user.tenant, branch_ids)
    if not assessments and role in ('SUPER_ADMIN', 'OWNER'):
        assessments = list(
            Assessment.objects.filter(tenant=user.tenant, is_active=True)
            .order_by('start_date')
            .values('id', 'name', 'start_date', 'end_date', 'branch_id', 'academic_year_id', 'grade')
        )
    return Response({
        'success': True,
        'data': {
            'assignments': assignments,
            'assessments': assessments,  # Kept as exam_terms to prevent frontend from breaking until we refactor it
        },
    })


def _resolve_assessment_class_subject(user, assessment_id, class_section_id, subject_id):
    exam = Assessment.objects.filter(pk=assessment_id, tenant=user.tenant).first()
    if not exam:
        return None, Response(
            {'success': False, 'error': 'Assessment not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    cs = ClassSection.objects.filter(pk=class_section_id, tenant=user.tenant).select_related('branch').first()
    if not cs:
        return None, Response(
            {'success': False, 'error': 'Class section not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    sub = AcademicSubject.objects.filter(pk=subject_id, tenant=user.tenant).first()
    if not sub:
        return None, Response(
            {'success': False, 'error': 'Subject not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    if str(exam.branch_id) != str(cs.branch_id):
        return None, Response(
            {'success': False, 'error': 'Assessment and class section must belong to the same branch.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if str(cs.academic_year_id) != str(exam.academic_year_id):
        return None, Response(
            {'success': False, 'error': 'Assessment must match the class academic year.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if cs.grade != exam.grade:
        return None, Response(
            {'success': False, 'error': 'Assessment grade must match class section grade.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not can_enter_exam_marks(user, cs, sub):
        return None, Response(
            {'success': False, 'error': 'You are not allowed to enter marks for this class and subject.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return (exam, cs, sub), None


@api_view(['GET'])
@permission_classes([IsAuthenticated, AcademicDomainPermission])
def teacher_marks_grid(request):
    exam_term_id = request.query_params.get('assessment_id') or request.query_params.get('exam_term_id')
    class_section_id = request.query_params.get('class_section_id')
    subject_id = request.query_params.get('subject_id')
    if not exam_term_id or not class_section_id or not subject_id:
        return Response(
            {'success': False, 'error': 'exam_term_id, class_section_id, and subject_id are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    resolved, err = _resolve_assessment_class_subject(request.user, exam_term_id, class_section_id, subject_id)
    if err:
        return err
    exam, cs, sub = resolved

    students = Student.objects.filter(class_section=cs, status='ACTIVE').order_by('roll_number', 'first_name')
    results = {
        str(r.student_id): r
        for r in ExamResult.objects.filter(assessment=exam, subject=sub, student__class_section=cs).select_related(
            'student'
        )
    }
    config = AssessmentSubject.objects.filter(
        assessment=exam, subject=sub
    ).first()
    
    if not config:
        return Response(
            {'success': False, 'error': 'Accountant has not configured max marks for this subject yet.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
        
    default_max = config.max_marks

    rows = []
    for st in students:
        r = results.get(str(st.id))
        rows.append({
            'student_id': str(st.id),
            'admission_number': st.admission_number or '',
            'first_name': st.first_name,
            'last_name': st.last_name or '',
            'roll_number': st.roll_number,
            'result_id': str(r.id) if r else None,
            'marks_obtained': str(r.marks_obtained) if r and r.marks_obtained is not None else '',
            'is_absent': r.is_absent if r else False,
            'max_marks': str(r.max_marks) if r else str(default_max),
            'percentage': str(r.percentage) if r and r.percentage is not None else '',
            'grade': r.grade if r else '',
            'remarks': r.remarks if r else '',
        })

    return Response({
        'success': True,
        'data': {
            'exam_term': {'id': str(exam.id), 'name': exam.name, 'academic_year_id': str(exam.academic_year_id)},
            'class_section': {
                'id': str(cs.id),
                'display_name': cs.display_name,
                'grade': cs.grade,
                'section': cs.section,
            },
            'subject': {'id': str(sub.id), 'name': sub.name, 'code': ''},
            'default_max_marks': str(default_max),
            'students': rows,
        },
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, AcademicDomainPermission])
def teacher_marks_bulk_save(request):
    ser = BulkExamMarksSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    exam_term_id = str(ser.validated_data['assessment_id'])
    class_section_id = str(ser.validated_data['class_section_id'])
    subject_id = str(ser.validated_data['subject_id'])
    rows_in = ser.validated_data['rows']

    resolved, err = _resolve_assessment_class_subject(request.user, exam_term_id, class_section_id, subject_id)
    if err:
        return err
    exam, cs, sub = resolved

    config = AssessmentSubject.objects.filter(
        assessment=exam, subject=sub
    ).first()
    
    if not config:
        return Response(
            {'success': False, 'error': 'Accountant has not configured max marks for this subject yet.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    default_max = config.max_marks

    student_ids = {str(s.id) for s in Student.objects.filter(class_section=cs, status='ACTIVE')}
    errors = []
    saved = 0

    with transaction.atomic():
        for i, row in enumerate(rows_in):
            sid = str(row['student_id'])
            if sid not in student_ids:
                errors.append({'index': i, 'student_id': sid, 'error': 'Student not in this class or not active.'})
                continue
            marks = row.get('marks_obtained')
            is_absent = row.get('is_absent', False)
            max_m = default_max
            if max_m <= 0:
                errors.append({'index': i, 'student_id': sid, 'error': 'max_marks must be greater than zero.'})
                continue
            if not is_absent and marks is None:
                errors.append({'index': i, 'student_id': sid, 'error': 'Marks must be provided unless student is absent.'})
                continue
            if not is_absent and (marks < 0 or marks > max_m):
                errors.append({
                    'index': i,
                    'student_id': sid,
                    'error': f'Marks must be between 0 and {max_m}.',
                })
                continue
            remarks = row.get('remarks') or ''
            ExamResult.objects.update_or_create(
                student_id=sid,
                assessment_id=exam.id,
                subject_id=sub.id,
                defaults={
                    'tenant_id': cs.tenant_id,
                    'branch_id': cs.branch_id,
                    'marks_obtained': None if is_absent else marks,
                    'is_absent': is_absent,
                    'max_marks': max_m,
                    'remarks': remarks[:200],
                    'evaluator': request.user,
                },
            )
            saved += 1

    return Response({
        'success': True,
        'data': {'saved': saved, 'errors': errors},
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, AcademicDomainPermission])
def teacher_marks_publish(request):
    exam_term_id = request.data.get('exam_term_id')
    class_section_id = request.data.get('class_section_id')
    subject_id = request.data.get('subject_id')
    
    if not exam_term_id or not class_section_id:
        return Response({'success': False, 'error': 'exam_term_id and class_section_id are required.'}, status=400)
        
    if subject_id:
        resolved, err = _resolve_assessment_class_subject(request.user, exam_term_id, class_section_id, subject_id)
        if err: return err
        exam, cs, subjects = resolved[0], resolved[1], [resolved[2]]
    else:
        # Publish all subjects for class
        exam = Assessment.objects.filter(pk=exam_term_id, tenant=request.user.tenant).first()
        cs = ClassSection.objects.filter(pk=class_section_id, tenant=request.user.tenant).first()
        if not exam or not cs:
            return Response({'success': False, 'error': 'Assessment or class section not found.'}, status=404)
        subjects = AcademicSubject.objects.filter(exam_results__assessment=exam, exam_results__student__class_section=cs).distinct()

    published_count = 0
    from students.models import ParentStudentRelation
    from notifications.dispatcher import dispatch_notification
    from accounts.models import User
    
    for sub in subjects:
        # Calculate ranks for this subject
        results = list(ExamResult.objects.filter(
            assessment=exam, 
            student__class_section=cs, 
            subject=sub,
        ).exclude(
            marks_obtained__isnull=True, 
            is_absent=False
        ).order_by('-percentage'))
        
        current_rank = 1
        for i, r in enumerate(results):
            if i > 0 and r.percentage == results[i-1].percentage:
                r.subject_rank = results[i-1].subject_rank
            else:
                r.subject_rank = current_rank
            current_rank += 1
            
            r.is_published = True
            r.save(update_fields=['subject_rank', 'is_published'])
            published_count += 1
            
        # Send notifications
        student_ids = [r.student_id for r in results]
        parent_ids = ParentStudentRelation.objects.filter(student_id__in=student_ids).values_list('parent_id', flat=True).distinct()
        parents = User.objects.filter(id__in=parent_ids, is_active=True)
        for parent in parents:
            dispatch_notification(
                tenant=request.user.tenant,
                branch=cs.branch,
                event_type='EXAM_RESULTS_PUBLISHED',
                recipient_user=parent,
                payload={
                    'exam_name': exam.name,
                    'subject': sub.name,
                },
                send_push=True,
                send_sms=False,
                send_email=False
            )

    return Response({
        'success': True,
        'message': f'Published {published_count} results and notified parents.',
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated, AcademicDomainPermission])
def report_card(request):
    student_id = request.query_params.get('student_id')
    exam_term_id = request.query_params.get('exam_term_id')
    
    if not student_id or not exam_term_id:
        return Response({'success': False, 'error': 'student_id and exam_term_id are required.'}, status=400)
        
    student = Student.objects.filter(id=student_id, tenant=request.user.tenant).first()
    exam_term = Assessment.objects.filter(id=exam_term_id, tenant=request.user.tenant).first()
    
    if not student or not exam_term:
        return Response({'success': False, 'error': 'Student or Assessment not found.'}, status=404)
        
    results = ExamResult.objects.filter(
        student=student, 
        assessment=exam_term, 
        is_published=True
    ).select_related('subject')
    
    subject_results = []
    total_obtained = 0
    total_max = 0
    
    for r in results:
        subject_results.append({
            'subject_name': r.subject.name,
            'marks_obtained': float(r.marks_obtained) if r.marks_obtained is not None else None,
            'is_absent': r.is_absent,
            'max_marks': float(r.max_marks),
            'percentage': float(r.percentage) if r.percentage else None,
            'grade': r.grade,
            'subject_rank': r.subject_rank,
            'remarks': r.remarks
        })
        if not r.is_absent and r.marks_obtained is not None:
            total_obtained += r.marks_obtained
        total_max += r.max_marks
        
    overall_percentage = (total_obtained / total_max * 100) if total_max > 0 else 0
    
    # Get attendance during exam term
    from attendance.models import AttendanceRecord
    total_days = AttendanceRecord.objects.filter(
        student=student, 
        date__gte=exam_term.start_date, 
        date__lte=exam_term.end_date
    ).count()
    
    present_days = AttendanceRecord.objects.filter(
        student=student, 
        date__gte=exam_term.start_date, 
        date__lte=exam_term.end_date,
        status='PRESENT'
    ).count()

    from academics.models import GradeScale
    overall_grade = ''
    if total_max > 0:
        scale = GradeScale.objects.filter(
            branch=student.branch,
            min_marks_percent__lte=overall_percentage,
            max_marks_percent__gte=overall_percentage
        ).first()
        if scale:
            overall_grade = scale.grade
    
    data = {
        'student': {
            'id': str(student.id),
            'name': f"{student.first_name} {student.last_name}",
            'admission_number': student.admission_number,
            'class_section': student.class_section.display_name if student.class_section else ''
        },
        'exam_term': {
            'id': str(exam_term.id),
            'name': exam_term.name,
        },
        'results': subject_results,
        'aggregate': {
            'total_obtained': float(total_obtained),
            'total_max': float(total_max),
            'overall_percentage': float(overall_percentage),
            'overall_grade': overall_grade,
            'attendance': {
                'total_days': total_days,
                'present_days': present_days
            }
        }
    }
    
    return Response({'success': True, 'data': data})


# ─────────────────────────────────────────────────────────────────────────────
# NEW: Academic Subjects & Assessments views
# ─────────────────────────────────────────────────────────────────────────────

class AcademicSubjectViewSet(viewsets.ModelViewSet):
    """
    CRUD for branch-specific AcademicSubject master.
    Branch-scoped roles (ACCOUNTANT, PRINCIPAL, BRANCH_ADMIN) always operate on
    their own branch. Global roles may pass ?branch_id= to filter.
    """
    serializer_class = AcademicSubjectSerializer
    permission_classes = [IsAuthenticated, AcademicDomainPermission, IsAccountantOrAbove]

    def get_queryset(self):
        user = self.request.user
        qs = AcademicSubject.objects.filter(tenant=user.tenant)
        role = normalize_role(user.role)
        if role in ('PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT') and user.branch_id:
            qs = qs.filter(branch_id=user.branch_id)
        else:
            branch_id = self.request.query_params.get('branch_id')
            if branch_id and branch_id not in ('undefined', 'null', ''):
                qs = qs.filter(branch_id=branch_id)
        is_active = self.request.query_params.get('is_active')
        if is_active == 'true':
            qs = qs.filter(is_active=True)
        elif is_active == 'false':
            qs = qs.filter(is_active=False)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        branch_id = getattr(user, 'branch_id', None) or getattr(user, 'branch', None)
        try:
            serializer.save(tenant=user.tenant, branch_id=branch_id)
        except IntegrityError:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'name': 'An academic subject with this name already exists in this branch.'})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.delete()
            return Response({'success': True, 'message': 'Subject deleted.'}, status=status.HTTP_200_OK)
        except ProtectedError:
            return Response(
                {
                    'success': False,
                    'error': f"'{instance.name}' is used in existing assessments. Deactivate it instead of deleting.",
                },
                status=status.HTTP_409_CONFLICT,
            )

    @action(detail=True, methods=['post'], url_path='toggle_status')
    def toggle_status(self, request, pk=None):
        subject = self.get_object()
        subject.is_active = not subject.is_active
        subject.save(update_fields=['is_active'])
        return Response({
            'success': True,
            'data': {'id': str(subject.id), 'is_active': subject.is_active},
        })


class AssessmentViewSet(viewsets.ModelViewSet):
    """
    CRUD for Assessments (exam header per class).
    AssessmentSubjects are managed via the /subjects/ nested action.
    """
    serializer_class = AssessmentSerializer
    permission_classes = [IsAuthenticated, AcademicDomainPermission, IsAccountantOrAbove]

    def get_queryset(self):
        user = self.request.user
        qs = Assessment.objects.filter(tenant=user.tenant)
        role = normalize_role(user.role)
        if role in ('PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT') and user.branch_id:
            qs = qs.filter(branch_id=user.branch_id)
        else:
            branch_id = self.request.query_params.get('branch_id')
            if branch_id and branch_id not in ('undefined', 'null', ''):
                qs = qs.filter(branch_id=branch_id)
        ay_id = self.request.query_params.get('academic_year_id')
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)
        grade = self.request.query_params.get('grade')
        if grade:
            qs = qs.filter(grade=grade)
        return qs.select_related('academic_year').prefetch_related('assessment_subjects')

    def perform_create(self, serializer):
        user = self.request.user
        role = normalize_role(user.role)
        branch_attr = getattr(user, 'branch_id', None) or getattr(user, 'branch', None)
        branch_id = branch_attr.id if hasattr(branch_attr, 'id') else branch_attr
        
        req_branch = self.request.data.get('branch_id')
        effective_branch_id = branch_id if branch_id else req_branch

        if not effective_branch_id:
            raise ValidationError({'branch_id': 'Branch is required for global roles.'})

        try:
            serializer.save(
                tenant=user.tenant,
                branch_id=effective_branch_id,
                created_by=user,
            )
        except IntegrityError:
            raise ValidationError({'name': 'An assessment with this name already exists for this grade.'})

    @action(detail=True, methods=['get', 'post'], url_path='subjects')
    def subjects(self, request, pk=None):
        """GET: list selected subjects. POST: bulk save subjects for this assessment."""
        assessment = self.get_object()

        if request.method == 'GET':
            subs = assessment.assessment_subjects.select_related('subject').all()
            return Response({'success': True, 'data': AssessmentSubjectSerializer(subs, many=True).data})

        # POST — bulk save subject configurations
        subjects_data = request.data.get('subjects', [])
        if not subjects_data:
            return Response(
                {'success': False, 'error': 'At least one subject must be provided.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        errors = []
        saved = 0
        valid_subject_ids = []
        with transaction.atomic():
            for item in subjects_data:
                subject_id = item.get('subject')
                max_marks = item.get('max_marks')
                min_marks = item.get('min_marks')
                exam_date = item.get('exam_date') or None
                exam_time = item.get('exam_time') or None
                if not subject_id or max_marks is None or min_marks is None:
                    errors.append({'subject': subject_id, 'error': 'subject, max_marks, and min_marks are required.'})
                    continue
                # Verify subject belongs to same branch and is active
                sub = AcademicSubject.objects.filter(
                    id=subject_id, tenant=request.user.tenant, branch=assessment.branch
                ).first()
                if not sub:
                    errors.append({'subject': subject_id, 'error': 'Subject not found in this branch.'})
                    continue
                
                AssessmentSubject.objects.update_or_create(
                    assessment=assessment,
                    subject=sub,
                    defaults={
                        'max_marks': max_marks,
                        'min_marks': min_marks,
                        'exam_date': exam_date,
                        'exam_time': exam_time,
                    }
                )
                valid_subject_ids.append(sub.id)
                saved += 1
                
            # Remove any subjects that were unchecked/removed
            AssessmentSubject.objects.filter(assessment=assessment).exclude(subject_id__in=valid_subject_ids).delete()
            
        return Response({'success': True, 'data': {'saved': saved, 'errors': errors}})

    @action(detail=True, methods=['delete'], url_path='subjects/(?P<subject_pk>[^/.]+)')
    def remove_subject(self, request, pk=None, subject_pk=None):
        """Remove a single subject from this assessment."""
        assessment = self.get_object()
        deleted, _ = AssessmentSubject.objects.filter(
            assessment=assessment, id=subject_pk
        ).delete()
        if deleted:
            return Response({'success': True, 'message': 'Subject removed from assessment.'})
        return Response(
            {'success': False, 'error': 'Assessment subject not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, AcademicDomainPermission, IsAccountantOrAbove])
def subjects_for_class(request):
    """
    Returns active AcademicSubjects for the branch, split into:
      - subjects: is_optional=False
      - optional_subjects: is_optional=True
    Used by the Add Exam form to auto-load the subject table.
    """
    user = request.user
    branch_id = request.query_params.get('branch_id') or getattr(user, 'branch_id', None)
    if not branch_id:
        return Response(
            {'success': False, 'error': 'branch_id is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    qs = AcademicSubject.objects.filter(
        tenant=user.tenant, branch_id=branch_id, is_active=True
    ).order_by('display_order', 'name')
    all_subjects = AcademicSubjectSerializer(qs, many=True).data
    return Response({
        'success': True,
        'data': {
            'subjects': [s for s in all_subjects if not s['is_optional']],
            'optional_subjects': [s for s in all_subjects if s['is_optional']],
        },
    })
