from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q

from accounts.permissions import IsTeacherOrAbove, normalize_role
from students.models import ClassSection, Student
from .models import AttendanceRecord
from .serializers import (
    AttendanceRecordSerializer, BulkAttendanceSerializer,
    AttendanceSummarySerializer,
)


class AttendanceViewSet(viewsets.ModelViewSet):
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAbove]

    def get_queryset(self):
        role = normalize_role(self.request.user.role)
        qs = AttendanceRecord.objects.filter(
            class_section__branch__tenant=self.request.user.tenant
        ).select_related('student', 'class_section')
        cs = self.request.query_params.get('class_section_id')
        date = self.request.query_params.get('date')
        student = self.request.query_params.get('student_id')
        if cs:
            qs = qs.filter(class_section_id=cs)
        if date:
            qs = qs.filter(date=date)
        if student:
            qs = qs.filter(student_id=student)
            
        # Teacher visibility restriction
        if role == 'TEACHER':
            qs = qs.filter(
                class_section__branch=self.request.user.branch
            ).filter(
                Q(class_section__class_teacher=self.request.user) |
                Q(
                    class_section__teacher_assignments__staff__user=self.request.user,
                    class_section__teacher_assignments__role__in=['CLASS_TEACHER', 'SECOND_CLASS_TEACHER']
                )
            ).distinct()
            
        return qs

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_mark(self, request):
        serializer = BulkAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        cs_qs = ClassSection.objects.filter(id=data['class_section_id'])
        role = normalize_role(request.user.role)
        if request.user.tenant:
            cs_qs = cs_qs.filter(tenant=request.user.tenant)
        elif role != 'OWNER':
            return Response({
                "success": False,
                "error": "Invalid class section.",
            }, status=status.HTTP_403_FORBIDDEN)
        try:
            class_section = cs_qs.get()
        except ClassSection.DoesNotExist:
            return Response({
                "success": False,
                "error": "Class section not found.",
            }, status=status.HTTP_404_NOT_FOUND)

        # Primary Teacher Restriction & Branch Isolation
        if role == 'TEACHER':
            if request.user.branch and class_section.branch != request.user.branch:
                return Response({
                    "success": False,
                    "error": "You cannot mark attendance for another branch."
                }, status=status.HTTP_403_FORBIDDEN)
            sibling_cs_ids = ClassSection.objects.filter(
                tenant=class_section.tenant,
                branch=class_section.branch,
                grade=class_section.grade,
                section=class_section.section,
            ).values_list('id', flat=True)

            from staff.models import TeacherAssignment
            is_class_teacher = (
                ClassSection.objects.filter(id__in=sibling_cs_ids, class_teacher=request.user).exists() or
                TeacherAssignment.objects.filter(
                    staff__user=request.user,
                    class_section_id__in=sibling_cs_ids,
                    role__in=['CLASS_TEACHER', 'SECOND_CLASS_TEACHER']
                ).exists()
            )
            if not is_class_teacher:
                return Response({
                    "success": False, 
                    "error": "Only the assigned Class Teacher or Second Class Teacher can mark attendance for this class."
                }, status=status.HTTP_403_FORBIDDEN)

        date = data['date']
        saved = 0
        errors = []

        for record in data['records']:
            try:
                obj, created = AttendanceRecord.objects.update_or_create(
                    student_id=record['student_id'],
                    date=date,
                    defaults={
                        'tenant': request.user.tenant,
                        'class_section': class_section,
                        'status': record['status'],
                        'remarks': record.get('remarks', ''),
                        'marked_by': request.user,
                    }
                )
                saved += 1

                if record['status'] == 'ABSENT':
                    from notifications.dispatcher import dispatch_notification
                    from students.models import Student
                    try:
                        student = Student.objects.get(id=record['student_id'])
                        parent = student.primary_parent
                        if parent:
                            dispatch_notification(
                                tenant=request.user.tenant,
                                branch=class_section.branch,
                                event_type='ABSENCE_ALERT',
                                recipient_user=parent,
                                payload={
                                    'student_name': f"{student.first_name} {student.last_name}".strip(),
                                    'date': str(date)
                                },
                                send_sms=False,
                                send_email=False,
                                send_push=True,
                            )
                    except Exception:
                        pass
            except Exception as e:
                errors.append({'student_id': str(record['student_id']), 'error': str(e)})

        return Response({
            'success': True,
            'data': {'saved': saved, 'errors': errors}
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        student_id = request.query_params.get('student_id')
        month = request.query_params.get('month')  # YYYY-MM
        if not student_id or not month:
            return Response({'detail': 'student_id and month are required.'}, status=400)

        year, m = month.split('-')
        records = AttendanceRecord.objects.filter(
            tenant=request.user.tenant,
            student_id=student_id,
            date__year=int(year),
            date__month=int(m),
        )
        total = records.count()
        present = records.filter(status='PRESENT').count()
        absent = records.filter(status='ABSENT').count()
        late = records.filter(status='LATE').count()
        half = records.filter(status='HALF_DAY').count()
        pct = round((present + late + half * 0.5) / total * 100, 1) if total > 0 else 0

        return Response({
            'success': True,
            'data': {
                'total_days': total,
                'present_days': present,
                'absent_days': absent,
                'late_days': late,
                'half_days': half,
                'attendance_percentage': pct,
            }
        })

    @action(detail=False, methods=['get'], url_path='class-summary')
    def class_summary(self, request):
        cs_id = request.query_params.get('class_section_id')
        month = request.query_params.get('month')
        if not cs_id or not month:
            return Response({'detail': 'class_section_id and month are required.'}, status=400)

        year, m = month.split('-')

        # H3: Single aggregated query instead of N+1 per-student loop
        students = Student.objects.filter(
            class_section_id=cs_id, status='ACTIVE'
        ).annotate(
            total_days=Count(
                'attendance_records',
                filter=Q(attendance_records__date__year=int(year), attendance_records__date__month=int(m))
            ),
            present=Count(
                'attendance_records',
                filter=Q(attendance_records__date__year=int(year), attendance_records__date__month=int(m), attendance_records__status='PRESENT')
            ),
            late=Count(
                'attendance_records',
                filter=Q(attendance_records__date__year=int(year), attendance_records__date__month=int(m), attendance_records__status='LATE')
            ),
            half=Count(
                'attendance_records',
                filter=Q(attendance_records__date__year=int(year), attendance_records__date__month=int(m), attendance_records__status='HALF_DAY')
            ),
        )

        result = []
        for s in students:
            pct = round((s.present + s.late + s.half * 0.5) / s.total_days * 100, 1) if s.total_days > 0 else 0
            result.append({
                'student_id': str(s.id),
                'student_name': f"{s.first_name} {s.last_name}",
                'attendance_percentage': pct,
                'total_days': s.total_days,
                'present': s.present,
            })

        return Response({'success': True, 'data': result})

