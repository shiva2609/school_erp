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
        # Get assigned classes (distinct) for display
        assignments = TeacherAssignment.objects.filter(
            staff=teacher_profile,
            academic_year__is_active=True,
            class_section__academic_year__is_active=True
        ).select_related('class_section').values(
            'class_section__id', 'class_section__display_name', 'role'
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
                'is_class_teacher': a['role'] == 'CLASS_TEACHER',
            })

        # Get classes where the teacher is Primary Class Teacher or Second Class Teacher
        from students.models import ClassSection, Student
        from attendance.models import AttendanceRecord
        
        attendance_classes = ClassSection.objects.filter(
            Q(class_teacher=user) |
            Q(teacher_assignments__staff=teacher_profile, teacher_assignments__role__in=['CLASS_TEACHER', 'SECOND_CLASS_TEACHER']),
            academic_year__is_active=True
        ).distinct()

        for cs in attendance_classes:
            sibling_cs_ids = ClassSection.objects.filter(
                tenant=cs.tenant,
                branch=cs.branch,
                grade=cs.grade,
                section=cs.section,
            ).values_list('id', flat=True)

            student_count = Student.objects.filter(
                class_section_id__in=sibling_cs_ids, status='ACTIVE'
            ).count()

            # Check if attendance marked today for any sibling section
            records = AttendanceRecord.objects.filter(
                class_section_id__in=sibling_cs_ids, date=today
            )
            marked_today = records.exists()

            present_count = 0
            absent_count = 0
            if marked_today:
                absent_count = records.filter(status='ABSENT').count()
                # 3B fix: LATE/HALF_DAY removed from UI — count PRESENT only.
                present_count = records.filter(status='PRESENT').count()

            attendance_status.append({
                'class_id': str(cs.id),
                'class_name': cs.display_name or str(cs),
                'marked_today': marked_today,
                'present_count': present_count,
                'absent_count': absent_count,
            })

    # 2. Today's timetable schedule
    today_schedule = []
    try:
        from timetable.models import TimetableSlot, Period
        if teacher_profile:
            slots = TimetableSlot.objects.filter(
                teacher=teacher_profile,
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

    # 4. Today's absentees — scoped to CLASS_TEACHER and SECOND_CLASS_TEACHER classes only.
    # 3B fix: previously used all assigned_classes (including SUBJECT_TEACHER assignments),
    # causing subject teachers to see absentees from every class they teach in.
    today_absentees = 0
    try:
        from attendance.models import AttendanceRecord
        # Re-use the attendance_status list which is already correctly scoped to form classes.
        attendance_class_ids = [a['class_id'] for a in attendance_status]
        if attendance_class_ids:
            today_absentees = AttendanceRecord.objects.filter(
                class_section_id__in=attendance_class_ids,
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
