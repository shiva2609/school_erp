from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from collections import defaultdict

from accounts.permissions import IsSchoolAdminOrAbove, IsTeacherOrAbove, IsBranchAdminOrAbove, normalize_role
from .models import Period, TimetableSlot, DAY_CHOICES, ClassSubjectDemand
from .serializers import PeriodSerializer, TimetableSlotSerializer, ClassSubjectDemandSerializer
import random


class PeriodViewSet(viewsets.ModelViewSet):
    serializer_class = PeriodSerializer
    permission_classes = [IsAuthenticated, IsSchoolAdminOrAbove]

    def get_queryset(self):
        qs = Period.objects.filter(branch__tenant=self.request.user.tenant)
        branch = self.request.query_params.get('branch_id')
        if branch:
            qs = qs.filter(branch_id=branch)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)



class ClassSubjectDemandViewSet(viewsets.ModelViewSet):
    serializer_class = ClassSubjectDemandSerializer
    permission_classes = [IsAuthenticated, IsSchoolAdminOrAbove]

    def get_queryset(self):
        qs = ClassSubjectDemand.objects.filter(branch__tenant=self.request.user.tenant)
        branch = self.request.query_params.get('branch_id')
        cs = self.request.query_params.get('class_section_id')
        if branch:
            qs = qs.filter(branch_id=branch)
        if cs:
            qs = qs.filter(class_section_id=cs)
        return qs.select_related('subject', 'teacher', 'class_section').order_by('-priority')

    def perform_create(self, serializer):
        class_section = serializer.validated_data.get('class_section')
        serializer.save(
            tenant=self.request.user.tenant,
            branch=class_section.branch,
            academic_year=class_section.academic_year
        )


class TimetableSlotViewSet(viewsets.ModelViewSet):
    serializer_class = TimetableSlotSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAbove]

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'auto_generate'):
            return [IsAuthenticated(), IsBranchAdminOrAbove()]
        return [IsAuthenticated(), IsTeacherOrAbove()]

    def get_queryset(self):
        qs = TimetableSlot.objects.filter(
            class_section__branch__tenant=self.request.user.tenant
        ).select_related('period', 'subject', 'teacher')
        cs = self.request.query_params.get('class_section_id')
        teacher = self.request.query_params.get('teacher_id')
        if cs:
            qs = qs.filter(class_section_id=cs)
        if teacher:
            qs = qs.filter(teacher_id=teacher)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)

    @action(detail=False, methods=['post'], url_path='auto-generate')
    def auto_generate(self, request):
        branch_id = request.data.get('branch_id')
        if not branch_id:
            return Response({'detail': 'branch_id is required'}, status=400)
            
        tenant = request.user.tenant
        
        # 1. Clear existing slots
        TimetableSlot.objects.filter(class_section__branch_id=branch_id, tenant=tenant).delete()
        
        # 2. Fetch Base Configuration
        days = [d[0] for d in DAY_CHOICES]
        periods = list(Period.objects.filter(branch_id=branch_id, tenant=tenant, period_type='CLASS').order_by('order'))
        
        if not periods:
            return Response({'detail': 'No CLASS periods defined for this branch.'}, status=400)
            
        demands = ClassSubjectDemand.objects.filter(branch_id=branch_id, tenant=tenant).order_by('-priority')
        
        if not demands.exists():
            return Response({'detail': 'No Class Subject demands correctly configured.'}, status=400)

        slots_to_create = []
        teacher_schedule = defaultdict(set) # key: teacher_id, val: set of (day, period_id)
        
        # Group demands by class_section
        demands_by_class = defaultdict(list)
        for d in demands:
            demands_by_class[d.class_section_id].append(d)

        # 3. Allocation Algorithm
        for cs_id, class_demands in demands_by_class.items():
            class_schedule = defaultdict(set) # key: day, val: set of period_id
            
            for demand in class_demands:
                periods_scheduled = 0
                max_attempts = 1000
                attempts = 0
                
                while periods_scheduled < demand.classes_per_week and attempts < max_attempts:
                    attempts += 1
                    day = random.choice(days)
                    period_index = random.randint(0, len(periods) - 1)
                    p1 = periods[period_index]
                    
                    # Hard constraints
                    # A. Is class free in this period?
                    if p1.id in class_schedule[day]:
                        continue
                        
                    # B. Is teacher free in this period?
                    if demand.teacher_id and (day, p1.id) in teacher_schedule[demand.teacher_id]:
                        continue
                        
                    # Handle double periods if required
                    if demand.requires_double_period:
                        if period_index >= len(periods) - 1:
                            continue # Needs another period after this
                        p2 = periods[period_index + 1]
                        
                        if p2.id in class_schedule[day]:
                            continue
                        if demand.teacher_id and (day, p2.id) in teacher_schedule[demand.teacher_id]:
                            continue
                            
                        # Book both
                        slots_to_create.append(TimetableSlot(
                            tenant=tenant, class_section_id=cs_id, period=p1, day_of_week=day,
                            subject=demand.subject, teacher=demand.teacher
                        ))
                        slots_to_create.append(TimetableSlot(
                            tenant=tenant, class_section_id=cs_id, period=p2, day_of_week=day,
                            subject=demand.subject, teacher=demand.teacher
                        ))
                        class_schedule[day].update([p1.id, p2.id])
                        if demand.teacher_id:
                            teacher_schedule[demand.teacher_id].update([(day, p1.id), (day, p2.id)])
                            
                        periods_scheduled += 2
                    else:
                        # Book single
                        slots_to_create.append(TimetableSlot(
                            tenant=tenant, class_section_id=cs_id, period=p1, day_of_week=day,
                            subject=demand.subject, teacher=demand.teacher
                        ))
                        class_schedule[day].add(p1.id)
                        if demand.teacher_id:
                            teacher_schedule[demand.teacher_id].add((day, p1.id))
                            
                        periods_scheduled += 1

        if slots_to_create:
            TimetableSlot.objects.bulk_create(slots_to_create)
            
        return Response({
            'success': True, 
            'message': f'Timetable generated successfully. Allocated {len(slots_to_create)} slots.'
        })

    @action(detail=False, methods=['get'], url_path='weekly')
    def weekly_view(self, request):
        """Returns timetable grouped by day of week for a class section."""
        cs_id = request.query_params.get('class_section_id')
        if not cs_id:
            return Response({'detail': 'class_section_id is required.'}, status=400)

        slots = TimetableSlot.objects.filter(
            class_section_id=cs_id
        ).select_related('period', 'subject', 'teacher').order_by('period__order')

        timetable = defaultdict(list)
        for slot in slots:
            timetable[slot.day_of_week].append({
                'period': {
                    'name': slot.period.name,
                    'start_time': str(slot.period.start_time),
                    'end_time': str(slot.period.end_time),
                    'type': slot.period.period_type,
                },
                'subject': slot.subject.name if slot.subject else None,
                'teacher': f"{slot.teacher.user.first_name} {slot.teacher.user.last_name}" if slot.teacher and slot.teacher.user else None,
            })

        # Ensure all days are present
        for day_code, _ in DAY_CHOICES:
            if day_code not in timetable:
                timetable[day_code] = []

        return Response({'success': True, 'data': {'timetable': dict(timetable)}})

    @action(detail=False, methods=['get'], url_path='teacher-view')
    def teacher_view(self, request):
        """Returns timetable for a specific teacher grouped by day."""
        teacher_id = request.query_params.get('teacher_id')
        if not teacher_id:
            return Response({'detail': 'teacher_id is required.'}, status=400)

        user = request.user
        role = normalize_role(user.role)
        if role == 'TEACHER':
            from staff.models import StaffProfile
            try:
                staff = StaffProfile.objects.get(id=teacher_id)
                if str(user.id) != str(staff.user_id):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('You can only view your own timetable.')
            except StaffProfile.DoesNotExist:
                return Response({'detail': 'Teacher not found.'}, status=404)

        slots = TimetableSlot.objects.filter(
            teacher_id=teacher_id,
            class_section__branch__tenant=user.tenant
        ).select_related('period', 'subject', 'class_section').order_by('period__order')

        timetable = defaultdict(list)
        for slot in slots:
            timetable[slot.day_of_week].append({
                'period': {
                    'name': slot.period.name,
                    'start_time': str(slot.period.start_time),
                    'end_time': str(slot.period.end_time),
                },
                'subject': slot.subject.name if slot.subject else None,
                'class_section': slot.class_section.display_name,
            })

        return Response({'success': True, 'data': {'timetable': dict(timetable)}})
