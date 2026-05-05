import logging
from decimal import Decimal

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import normalize_role
from academics.models import ExamResult, ExamTerm
from academics.marks_access import can_enter_exam_marks
from academics.permissions import AcademicDomainPermission
from academics.serializers import BulkExamMarksSerializer
from students.models import ClassSection, Student
from staff.models import TeacherProfile, TeacherAssignment
from timetable.models import Subject, TimetableSlot

logger = logging.getLogger(__name__)


def _collect_teaching_pairs(user):
    """Distinct (class_section, subject) the user may enter marks for as a teacher."""
    out = []
    seen = set()
    tp = TeacherProfile.objects.filter(user=user).first()
    if tp:
        qs = TeacherAssignment.objects.filter(teacher=tp).select_related(
            'class_section', 'class_section__branch', 'subject'
        )
        for a in qs:
            key = (str(a.class_section_id), str(a.subject_id))
            if key in seen:
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
        teacher=user, subject__isnull=False
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


def _exam_terms_for_branches(tenant, branch_ids):
    if not branch_ids:
        return []
    qs = ExamTerm.objects.filter(tenant=tenant, branch_id__in=branch_ids, is_active=True)
    return list(
        qs.order_by('start_date').values('id', 'name', 'start_date', 'end_date', 'branch_id', 'academic_year_id')
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
    exam_terms = _exam_terms_for_branches(user.tenant, branch_ids)
    if not exam_terms and role in ('SUPER_ADMIN', 'OWNER'):
        exam_terms = list(
            ExamTerm.objects.filter(tenant=user.tenant, is_active=True)
            .order_by('start_date')
            .values('id', 'name', 'start_date', 'end_date', 'branch_id', 'academic_year_id')
        )
    return Response({
        'success': True,
        'data': {
            'assignments': assignments,
            'exam_terms': exam_terms,
        },
    })


def _resolve_exam_class_subject(user, exam_term_id, class_section_id, subject_id):
    exam = ExamTerm.objects.filter(pk=exam_term_id, tenant=user.tenant).first()
    if not exam:
        return None, Response(
            {'success': False, 'error': 'Exam term not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    cs = ClassSection.objects.filter(pk=class_section_id, tenant=user.tenant).select_related('branch').first()
    if not cs:
        return None, Response(
            {'success': False, 'error': 'Class section not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    sub = Subject.objects.filter(pk=subject_id, tenant=user.tenant).first()
    if not sub:
        return None, Response(
            {'success': False, 'error': 'Subject not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    if str(exam.branch_id) != str(cs.branch_id):
        return None, Response(
            {'success': False, 'error': 'Exam term and class section must belong to the same branch.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if str(cs.academic_year_id) != str(exam.academic_year_id):
        return None, Response(
            {'success': False, 'error': 'Exam term must match the class academic year.'},
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
    exam_term_id = request.query_params.get('exam_term_id')
    class_section_id = request.query_params.get('class_section_id')
    subject_id = request.query_params.get('subject_id')
    if not exam_term_id or not class_section_id or not subject_id:
        return Response(
            {'success': False, 'error': 'exam_term_id, class_section_id, and subject_id are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    resolved, err = _resolve_exam_class_subject(request.user, exam_term_id, class_section_id, subject_id)
    if err:
        return err
    exam, cs, sub = resolved

    students = Student.objects.filter(class_section=cs, status='ACTIVE').order_by('roll_number', 'first_name')
    results = {
        str(r.student_id): r
        for r in ExamResult.objects.filter(exam_term=exam, subject=sub, student__class_section=cs).select_related(
            'student'
        )
    }
    latest = (
        ExamResult.objects.filter(exam_term=exam, subject=sub, student__class_section=cs)
        .order_by('-updated_at')
        .values_list('max_marks', flat=True)
        .first()
    )
    default_max = latest if latest is not None else Decimal('100')

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
            'marks_obtained': str(r.marks_obtained) if r else '',
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
            'subject': {'id': str(sub.id), 'name': sub.name, 'code': sub.code or ''},
            'default_max_marks': str(default_max),
            'students': rows,
        },
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, AcademicDomainPermission])
def teacher_marks_bulk_save(request):
    ser = BulkExamMarksSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    exam_term_id = str(ser.validated_data['exam_term_id'])
    class_section_id = str(ser.validated_data['class_section_id'])
    subject_id = str(ser.validated_data['subject_id'])
    default_max = ser.validated_data.get('default_max_marks') or Decimal('100')
    rows_in = ser.validated_data['rows']

    resolved, err = _resolve_exam_class_subject(request.user, exam_term_id, class_section_id, subject_id)
    if err:
        return err
    exam, cs, sub = resolved

    student_ids = {str(s.id) for s in Student.objects.filter(class_section=cs, status='ACTIVE')}
    errors = []
    saved = 0

    with transaction.atomic():
        for i, row in enumerate(rows_in):
            sid = str(row['student_id'])
            if sid not in student_ids:
                errors.append({'index': i, 'student_id': sid, 'error': 'Student not in this class or not active.'})
                continue
            marks = row['marks_obtained']
            max_m = row.get('max_marks') or default_max
            if max_m <= 0:
                errors.append({'index': i, 'student_id': sid, 'error': 'max_marks must be greater than zero.'})
                continue
            if marks < 0 or marks > max_m:
                errors.append({
                    'index': i,
                    'student_id': sid,
                    'error': f'Marks must be between 0 and {max_m}.',
                })
                continue
            remarks = row.get('remarks') or ''
            ExamResult.objects.update_or_create(
                student_id=sid,
                exam_term_id=exam.id,
                subject_id=sub.id,
                defaults={
                    'tenant_id': cs.tenant_id,
                    'branch_id': cs.branch_id,
                    'marks_obtained': marks,
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
