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

        # Resolve sibling class sections — same physical class, scoped to the
        # ACTIVE academic year only (3D fix). Without this scope, a stale assignment
        # from a previous year could allow marking attendance on the current year's class.
        sibling_cs_ids = list(
            ClassSection.objects.filter(
                tenant=class_section.tenant,
                branch=class_section.branch,
                grade=class_section.grade,
                section=class_section.section,
                academic_year__is_active=True,
            ).values_list('id', flat=True)
        )
        # Always include the requested section itself in case it's the only record
        if class_section.id not in sibling_cs_ids:
            sibling_cs_ids.append(class_section.id)

        # Primary Teacher Restriction & Branch Isolation
        if role == 'TEACHER':
            if request.user.branch and class_section.branch != request.user.branch:
                return Response({
                    "success": False,
                    "error": "You cannot mark attendance for another branch."
                }, status=status.HTTP_403_FORBIDDEN)

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

        # Security: pre-fetch the set of valid student IDs for this physical class.
        # This prevents a teacher (or a buggy client) from submitting attendance for
        # students belonging to a completely different class or branch.
        valid_student_ids = set(
            str(sid) for sid in Student.objects.filter(
                class_section_id__in=sibling_cs_ids,
                status='ACTIVE',
            ).values_list('id', flat=True)
        )

        date = data['date']
        saved = 0
        errors = []

        # 3A fix: pre-fetch existing attendance statuses for today in a single query
        # so we can detect status changes and avoid duplicate absence notifications.
        prev_statuses = {
            str(r['student_id']): r['status']
            for r in AttendanceRecord.objects.filter(
                class_section_id__in=sibling_cs_ids, date=date
            ).values('student_id', 'status')
        }

        # 3A fix: pre-fetch Student objects needed for notifications in bulk
        # (avoids N+1 queries — previously one Student.objects.get() per absent student).
        from notifications.dispatcher import dispatch_notification
        absent_student_ids = [
            str(r['student_id'])
            for r in data['records']
            if r['status'] == 'ABSENT' and str(r['student_id']) in valid_student_ids
        ]
        students_map = {}
        if absent_student_ids:
            students_map = {
                str(s.id): s
                for s in Student.objects.filter(
                    id__in=absent_student_ids
                ).select_related('primary_parent')
            }

        for record in data['records']:
            try:
                # Ownership check: reject student IDs that don't belong to this class.
                if str(record['student_id']) not in valid_student_ids:
                    errors.append({
                        'student_id': str(record['student_id']),
                        'error': 'Student does not belong to this class section.',
                    })
                    continue

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

                # 3A fix: only dispatch absence notification if this is a NEW absence
                # (record just created) or the status just changed TO absent.
                # Previously, re-saving already-absent students sent duplicate alerts.
                prev_status = prev_statuses.get(str(record['student_id']))
                is_newly_absent = record['status'] == 'ABSENT' and (
                    created or prev_status != 'ABSENT'
                )
                if is_newly_absent:
                    try:
                        student = students_map.get(str(record['student_id']))
                        parent = student.primary_parent if student else None
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

        # 3E fix: guard against bad month format (e.g. "2023", "invalid") that
        # previously caused an uncaught ValueError → 500 Internal Server Error.
        try:
            year, m = month.split('-')
            year, m = int(year), int(m)
            if not (1 <= m <= 12):
                raise ValueError
        except (ValueError, AttributeError):
            return Response(
                {'detail': 'month must be in YYYY-MM format (e.g. 2026-07).'},
                status=400
            )

        records = AttendanceRecord.objects.filter(
            tenant=request.user.tenant,
            student_id=student_id,
            date__year=year,
            date__month=m,
        )
        total = records.count()
        present = records.filter(status='PRESENT').count()
        absent = records.filter(status='ABSENT').count()
        # Attendance % is PRESENT-only; LATE/HALF_DAY no longer used in the UI.
        pct = round(present / total * 100, 1) if total > 0 else 0

        return Response({
            'success': True,
            'data': {
                'total_days': total,
                'present_days': present,
                'absent_days': absent,
                'attendance_percentage': pct,
            }
        })

    @action(detail=False, methods=['get'], url_path='class-summary')
    def class_summary(self, request):
        cs_id = request.query_params.get('class_section_id')
        month = request.query_params.get('month')
        if not cs_id or not month:
            return Response({'detail': 'class_section_id and month are required.'}, status=400)

        # 3E fix: safe date parsing (same guard as summary action).
        try:
            year, m = month.split('-')
            year, m = int(year), int(m)
            if not (1 <= m <= 12):
                raise ValueError
        except (ValueError, AttributeError):
            return Response(
                {'detail': 'month must be in YYYY-MM format (e.g. 2026-07).'},
                status=400
            )

        # 3C fix: resolve sibling class sections so students enrolled under a
        # different academic-year ClassSection UUID are included in the summary.
        try:
            cs = ClassSection.objects.get(id=cs_id, tenant=request.user.tenant)
        except ClassSection.DoesNotExist:
            return Response({'detail': 'Class section not found.'}, status=404)

        sibling_cs_ids = list(
            ClassSection.objects.filter(
                tenant=cs.tenant,
                branch=cs.branch,
                grade=cs.grade,
                section=cs.section,
                academic_year__is_active=True,
            ).values_list('id', flat=True)
        )
        if cs.id not in sibling_cs_ids:
            sibling_cs_ids.append(cs.id)

        # Single aggregated query — no N+1 per-student loop.
        # Attendance % is PRESENT-only (LATE/HALF_DAY retired from UI).
        students = Student.objects.filter(
            class_section_id__in=sibling_cs_ids, status='ACTIVE'
        ).annotate(
            total_days=Count(
                'attendance_records',
                filter=Q(
                    attendance_records__date__year=year,
                    attendance_records__date__month=m,
                )
            ),
            present=Count(
                'attendance_records',
                filter=Q(
                    attendance_records__date__year=year,
                    attendance_records__date__month=m,
                    attendance_records__status='PRESENT',
                )
            ),
        )

        result = []
        for s in students:
            pct = round(s.present / s.total_days * 100, 1) if s.total_days > 0 else 0
            result.append({
                'student_id': str(s.id),
                'student_name': f"{s.first_name} {s.last_name}",
                'attendance_percentage': pct,
                'total_days': s.total_days,
                'present': s.present,
            })

        return Response({'success': True, 'data': result})

