"""Parent Portal — scoped API endpoints per PRD §17.
All endpoints validate student belongs to authenticated parent via ParentStudentRelation."""

from django.db import models
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from accounts.permissions import normalize_role

class IsParent(BasePermission):
    """Only allow users with PARENT role."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and normalize_role(request.user.role) == 'PARENT'

from students.models import Student, ParentStudentRelation
from students.serializers import StudentSerializer
from attendance.models import AttendanceRecord
from fees.models import FeeInvoice, StudentFeeItem, FeeApprovalRequest
from fees.serializers import FeeInvoiceListSerializer
from django.db.models import Sum
from homework.models import Homework
from homework.serializers import HomeworkSerializer
from announcements.models import Announcement
from announcements.serializers import AnnouncementSerializer
from transport.models import StudentTransport
from academics.models import ExamResult

def get_parent_student(user, student_id):
    """Validates parent-student relationship. Returns student or raises 403."""
    relation = ParentStudentRelation.objects.filter(parent=user, student_id=student_id).first()
    if not relation:
        return None
    # Security check: Ensure student belongs to parent's tenant
    if user.tenant and relation.student.tenant != user.tenant:
        return None
    return relation.student


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_children(request):
    """GET /api/parent/children/ — list linked students"""
    relations = ParentStudentRelation.objects.filter(parent=request.user).select_related(
        'student', 'student__class_section', 'student__branch'
    )
    data = []
    for r in relations:
        s = r.student
        if request.user.tenant and s.tenant != request.user.tenant:
            continue
        
        # Calculate Committed Fee (Proposed/Locked)
        total = StudentFeeItem.objects.filter(student=s, academic_year=s.academic_year).aggregate(total=Sum('amount'))['total']
        if not total or total <= 0:
             pending = FeeApprovalRequest.objects.filter(student=s, status='PENDING').first()
             total = pending.offered_total if pending else 0
             
        # Transport info
        transport = StudentTransport.objects.filter(student=s, is_active=True).first()

        data.append({
            'id': str(s.id),
            'first_name': s.first_name,
            'last_name': s.last_name or '',
            'class_section': s.class_section.display_name if s.class_section else None,
            'branch_name': s.branch.name if s.branch else None,
            'enroll_no': s.admission_number,
            'committed_fee': float(total or 0),
            'transport_opted': transport is not None,
            'transport_fee': float(transport.monthly_fee) if transport else 0,
            'transport_route': None, # Route concept removed
            'photo_url': s.photo_url,
            'relation_type': r.relation_type,
        })
    return Response({'success': True, 'data': data})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_child_profile(request, student_id):
    student = get_parent_student(request.user, student_id)
    if not student:
        return Response({'detail': 'Permission denied'}, status=403)
    return Response({'success': True, 'data': StudentSerializer(student).data})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_child_invoices(request, student_id):
    student = get_parent_student(request.user, student_id)
    if not student:
        return Response({'detail': 'Permission denied'}, status=403)
    invoices = FeeInvoice.objects.filter(student=student).prefetch_related(
        'payments', 'items', 'items__category'
    ).order_by('-created_at')
    
    invoice_data = []
    for inv in invoices:
        # Payment history for this invoice
        payments = [{
            'id': str(p.id),
            'receipt_number': p.receipt_number,
            'amount': float(p.amount),
            'payment_mode': p.payment_mode,
            'payment_date': str(p.payment_date),
            'status': p.status,
            'reference_number': p.reference_number,
            'bank_name': p.bank_name,
            'created_at': p.created_at.isoformat(),
        } for p in inv.payments.filter(status='COMPLETED').order_by('-payment_date')]
        
        # Invoice line items
        items = [{
            'category': item.category.name if item.category else 'Fee',
            'original_amount': float(item.original_amount),
            'concession': float(item.concession),
            'final_amount': float(item.final_amount),
        } for item in inv.items.all()]
        
        invoice_data.append({
            'id': str(inv.id),
            'invoice_number': inv.invoice_number,
            'month': inv.month,
            'due_date': str(inv.due_date) if inv.due_date else None,
            'issued_date': str(inv.issued_date) if inv.issued_date else None,
            'gross_amount': float(inv.gross_amount),
            'concession_amount': float(inv.concession_amount),
            'late_fee_amount': float(inv.late_fee_amount),
            'net_amount': float(inv.net_amount),
            'paid_amount': float(inv.paid_amount),
            'outstanding_amount': float(inv.outstanding_amount),
            'status': inv.status,
            'payments': payments,
            'items': items,
        })
    
    return Response({'success': True, 'data': invoice_data})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_child_attendance(request, student_id):
    student = get_parent_student(request.user, student_id)
    if not student:
        return Response({'detail': 'Permission denied'}, status=403)
    month = request.query_params.get('month')
    qs = AttendanceRecord.objects.filter(student=student)
    if month:
        year, m = month.split('-')
        qs = qs.filter(date__year=int(year), date__month=int(m))
    data = [{'date': str(r.date), 'status': r.status} for r in qs.order_by('date')]
    return Response({'success': True, 'data': data})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_child_homework(request, student_id):
    student = get_parent_student(request.user, student_id)
    if not student:
        return Response({'detail': 'Permission denied'}, status=403)
    if not student.class_section:
        return Response({'success': True, 'data': []})

    from homework.models import HomeworkAcknowledgment
    import logging
    logger = logging.getLogger(__name__)

    # Tenant-scoped homework for this student's class section.
    # Prefer the parent user's own tenant; fall back to the class section's branch tenant
    # in case the parent record is missing the tenant FK (edge case in older imports).
    tenant = request.user.tenant or getattr(getattr(student.class_section, 'branch', None), 'tenant', None)
    hw_filter = dict(class_section=student.class_section, is_published=True)
    if tenant:
        hw_filter['tenant'] = tenant

    hw_list = Homework.objects.filter(**hw_filter).select_related('subject', 'posted_by').order_by('-due_date')[:50]
    logger.debug('parent_child_homework: student=%s class_section=%s tenant=%s hw_count=%d',
                 student_id, student.class_section_id, tenant, len(hw_list))

    # Safely fetch acknowledgments — guard against missing table on older deployments
    try:
        acked_ids = set(
            HomeworkAcknowledgment.objects.filter(
                parent=request.user, homework__in=hw_list
            ).values_list('homework_id', flat=True)
        )
    except Exception:
        acked_ids = set()
    
    data = []
    for hw in hw_list:
        ack = hw.id in acked_ids
        data.append({
            'id': str(hw.id),
            'title': hw.title,
            'description': hw.description,
            'subject_name': hw.subject.name if hw.subject else '',
            'due_date': str(hw.due_date),
            'activity_type': hw.activity_type,
            'is_published': hw.is_published,
            'created_at': hw.created_at.isoformat(),
            'posted_by': ' '.join(p for p in [hw.posted_by.first_name, hw.posted_by.last_name] if p) if hw.posted_by else None,
            'acknowledged': ack,
        })
    
    return Response({'success': True, 'data': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsParent])
def parent_acknowledge_homework(request, student_id, homework_id):
    """POST /api/parent/children/<id>/homework/<hw_id>/acknowledge/
    Toggles parent acknowledgment (diary signature) on a homework."""
    student = get_parent_student(request.user, student_id)
    if not student:
        return Response({'detail': 'Permission denied'}, status=403)
    
    from homework.models import HomeworkAcknowledgment
    
    hw = Homework.objects.filter(id=homework_id, class_section=student.class_section, is_published=True).first()
    if not hw:
        return Response({'detail': 'Homework not found'}, status=404)
    
    ack, created = HomeworkAcknowledgment.objects.get_or_create(
        homework=hw, parent=request.user
    )
    
    if not created:
        # Already acknowledged — toggle it off
        ack.delete()
        return Response({'success': True, 'acknowledged': False, 'message': 'Acknowledgment removed'})
    
    return Response({'success': True, 'acknowledged': True, 'message': 'Homework acknowledged'})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_child_timetable(request, student_id):
    student = get_parent_student(request.user, student_id)
    if not student:
        return Response({'detail': 'Permission denied'}, status=403)
    if not student.class_section:
        return Response({'success': True, 'data': {'timetable': {}}})
    from timetable.models import TimetableSlot, DAY_CHOICES
    from collections import defaultdict
    slots = TimetableSlot.objects.filter(class_section=student.class_section).select_related('period', 'subject', 'teacher').order_by('period__order')
    timetable = defaultdict(list)
    for slot in slots:
        timetable[slot.day_of_week].append({
            'period': {'name': slot.period.name, 'start_time': str(slot.period.start_time), 'end_time': str(slot.period.end_time)},
            'subject': slot.subject.name if slot.subject else None,
            'teacher': ' '.join(p for p in [slot.teacher.first_name, slot.teacher.last_name] if p) if slot.teacher else None,
        })
    return Response({'success': True, 'data': {'timetable': dict(timetable)}})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_announcements(request):
    relations = ParentStudentRelation.objects.filter(parent=request.user).select_related('student', 'student__class_section')
    class_ids = set()
    parent_branch_ids = set()
    for r in relations:
        if request.user.tenant and r.student.tenant != request.user.tenant:
            continue
        if r.student.class_section:
            class_ids.add(r.student.class_section_id)
        if r.student.branch_id:
            parent_branch_ids.add(r.student.branch_id)

    if not parent_branch_ids:
        return Response({'success': True, 'data': []})

    anns = Announcement.objects.filter(
        branch__tenant=request.user.tenant,
        branch_id__in=parent_branch_ids,
        is_published=True
    ).filter(
        models.Q(target_audience__in=['ALL', 'PARENTS']) | models.Q(target_classes__id__in=class_ids)
    ).distinct().order_by('-published_at')[:20]
    return Response({'success': True, 'data': AnnouncementSerializer(anns, many=True, context={'request': request}).data})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_child_transport(request, student_id):
    """GET /api/parent/children/<id>/transport/ — transport details for a child."""
    student = get_parent_student(request.user, student_id)
    if not student:
        return Response({'detail': 'Permission denied'}, status=403)
    transport = StudentTransport.objects.filter(student=student, is_active=True).first()
    if not transport:
        return Response({'success': True, 'data': None})
    return Response({'success': True, 'data': {
        'route_name': 'Distance-Based Transport', # Fallback string for UI
        'pickup_point': transport.pickup_point,
        'distance_km': float(transport.distance_km),
        'monthly_fee': float(transport.monthly_fee),
        'annual_fee': float(transport.monthly_fee * 12),
        'opted_at': transport.opted_at.isoformat() if transport.opted_at else None,
    }})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsParent])
def parent_child_marks(request, student_id):
    """GET /api/parent/children/<id>/marks/ — marks details for a child."""
    student = get_parent_student(request.user, student_id)
    if not student:
        return Response({'detail': 'Permission denied'}, status=403)
        
    results = ExamResult.objects.filter(student=student, is_published=True).select_related('exam_term', 'subject')
    
    # Group by exam_term
    grouped_data = {}
    for r in results:
        term_id = str(r.exam_term.id)
        if term_id not in grouped_data:
            grouped_data[term_id] = {
                'term_id': term_id,
                'term_name': r.exam_term.name,
                'results': []
            }
        grouped_data[term_id]['results'].append({
            'subject': r.subject.name,
            'marks_obtained': float(r.marks_obtained) if r.marks_obtained is not None else None,
            'is_absent': r.is_absent,
            'max_marks': float(r.max_marks),
            'percentage': float(r.percentage) if r.percentage else None,
            'grade': r.grade,
            'subject_rank': r.subject_rank,
            'remarks': r.remarks
        })
        
    return Response({'success': True, 'data': list(grouped_data.values())})
