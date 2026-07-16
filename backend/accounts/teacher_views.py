"""
Teacher-specific API endpoints.
Provides dashboard data aggregated from assignments, timetable, attendance, and homework.
"""
import logging
from datetime import date
from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import normalize_role
logger = logging.getLogger(__name__)

WEEKDAY_MAP = {0: 'MON', 1: 'TUE', 2: 'WED', 3: 'THU', 4: 'FRI', 5: 'SAT', 6: 'SUN'}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def teacher_dashboard(request):
    """
    GET /api/teacher/dashboard/
    Returns aggregated dashboard data for the logged-in teacher.
    """
    user = request.user
    if normalize_role(user.role) != 'TEACHER':
        return Response({'detail': 'Only teachers can access this endpoint.'}, status=403)

    today = date.today()
    day_of_week = WEEKDAY_MAP.get(today.weekday(), 'MON')

    # 1. Get assigned classes via TeacherAssignment (staff app)
    from staff.models import TeacherProfile, TeacherAssignment
    teacher_profile = TeacherProfile.objects.filter(user=user).first()

    assigned_classes = []
    attendance_status = []

    if teacher_profile:
        assignments = TeacherAssignment.objects.filter(
                staff=teacher_profile,
            academic_year__is_active=True,
            class_section__academic_year__is_active=True
        ).select_related('class_section').values(
            'class_section__id', 'class_section__display_name', 'is_class_teacher'
        ).distinct()

        for a in assignments:
            cs_id = a['class_section__id']
            cs_name = a['class_section__display_name']

            # Count students in this class
            from students.models import Student
            student_count = Student.objects.filter(
                class_section_id=cs_id, status='ACTIVE'
            ).count()

            assigned_classes.append({
                'id': str(cs_id),
                'display_name': cs_name,
                'student_count': student_count,
                'is_class_teacher': a['is_class_teacher'],
            })

            # Check if attendance marked today for this class
            from attendance.models import AttendanceRecord
            marked_today = False
            if student_count > 0:
                marked_today = AttendanceRecord.objects.filter(
                    class_section_id=cs_id, date=today
                ).exists()

                attendance_status.append({
                    'class_id': str(cs_id),
                    'class_name': cs_name,
                    'marked_today': marked_today,
                })

    # 2. Today's timetable schedule
    today_schedule = []
    try:
        from timetable.models import TimetableSlot, Period
        slots = TimetableSlot.objects.filter(
            teacher=user,
            day_of_week=day_of_week,
            class_section__academic_year__is_active=True
        ).select_related('period', 'subject', 'class_section').order_by('period__order')

        for slot in slots:
            today_schedule.append({
                'period': slot.period.name,
                'start_time': slot.period.start_time.strftime('%I:%M %p') if slot.period.start_time else '',
                'end_time': slot.period.end_time.strftime('%I:%M %p') if slot.period.end_time else '',
                'subject': slot.subject.name if slot.subject else 'Free',
                'class_name': slot.class_section.display_name if slot.class_section else '',
            })
    except Exception as e:
        logger.warning(f"Timetable query failed for teacher {user.email}: {e}")

    # 3. Pending homework (posted by this teacher, due today or later)
    pending_homework = 0
    try:
        from homework.models import Homework
        pending_homework = Homework.objects.filter(
            posted_by=user, due_date__gte=today
        ).count()
    except Exception as e:
        logger.warning(f"Homework query failed: {e}")

    # 4. Today's absentees across assigned classes
    today_absentees = 0
    try:
        from attendance.models import AttendanceRecord
        class_ids = [c['id'] for c in assigned_classes]
        today_absentees = AttendanceRecord.objects.filter(
            student__class_section_id__in=class_ids,
            date=today,
            status='ABSENT'
        ).count()
    except Exception as e:
        logger.warning(f"Absentee query failed: {e}")

    return Response({
        'data': {
            'assigned_classes': assigned_classes,
            'today_schedule': today_schedule,
            'attendance_status': attendance_status,
            'pending_homework': pending_homework,
            'today_absentees': today_absentees,
        }
    })
