from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsTeacherOrAbove, normalize_role
from .models import Homework, HomeworkAttachment
from .serializers import HomeworkSerializer, HomeworkAttachmentSerializer

class HomeworkViewSet(viewsets.ModelViewSet):
    serializer_class = HomeworkSerializer
    permission_classes = [IsAuthenticated, IsTeacherOrAbove]

    def get_queryset(self):
        qs = Homework.objects.filter(class_section__branch__tenant=self.request.user.tenant).select_related('class_section', 'subject')
        user = self.request.user
        if normalize_role(user.role) == 'TEACHER':
            qs = qs.filter(class_section__branch=user.branch)
        
        cs = self.request.query_params.get('class_section_id')
        if cs:
            qs = qs.filter(class_section_id=cs)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if normalize_role(user.role) == 'TEACHER':
            from staff.models import TeacherAssignment
            cls_sec = serializer.validated_data.get('class_section')
            subj = serializer.validated_data.get('subject')
            if cls_sec and subj:
                exists = TeacherAssignment.objects.filter(
                    teacher__user=user, 
                    class_section=cls_sec, 
                    subject=subj
                ).exists()
                if not exists:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('You are not assigned to teach this subject in this class.')
                    
        instance = serializer.save(tenant=self.request.user.tenant, posted_by=self.request.user)
        if instance.is_published:
            from students.models import Student, ParentStudentRelation
            from notifications.dispatcher import dispatch_notification

            student_ids = Student.objects.filter(
                class_section=instance.class_section,
                status='ACTIVE',
                tenant=instance.tenant,
            ).values_list('id', flat=True)
            parent_ids = (
                ParentStudentRelation.objects.filter(student_id__in=student_ids)
                .values_list('parent_id', flat=True)
                .distinct()
            )
            from accounts.models import User

            subj_name = instance.subject.name if instance.subject_id else 'a subject'
            due_s = instance.due_date.isoformat() if instance.due_date else ''
            branch = instance.class_section.branch
            for parent in User.objects.filter(id__in=parent_ids, is_active=True):
                dispatch_notification(
                    tenant=instance.tenant,
                    branch=branch,
                    event_type='HOMEWORK_POSTED',
                    recipient_user=parent,
                    payload={
                        'subject': subj_name,
                        'due_date': due_s,
                        'homework_title': instance.title,
                    },
                    send_sms=False,
                    send_email=False,
                    send_push=True,
                )

    def perform_update(self, serializer):
        user = self.request.user
        if normalize_role(user.role) == 'TEACHER':
            from staff.models import TeacherAssignment
            # For update, fallback to existing instance values if not provided in request
            cls_sec = serializer.validated_data.get('class_section', getattr(serializer.instance, 'class_section', None))
            subj = serializer.validated_data.get('subject', getattr(serializer.instance, 'subject', None))
            if cls_sec and subj:
                exists = TeacherAssignment.objects.filter(
                    teacher__user=user, 
                    class_section=cls_sec, 
                    subject=subj
                ).exists()
                if not exists:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('You are not assigned to teach this subject in this class.')
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        role = normalize_role(user.role)
        if role == 'TEACHER' and instance.posted_by != user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You can only delete your own homework.')
        instance.delete()

    @action(detail=True, methods=['get', 'post'], url_path='attachments')
    def attachments(self, request, pk=None):
        hw = self.get_object()
        if request.method == 'GET':
            return Response({'success': True, 'data': HomeworkAttachmentSerializer(hw.attachments.all(), many=True).data})
        if hw.attachments.count() >= 5:
            return Response({'detail': 'Maximum 5 attachments per homework.'}, status=400)
        ser = HomeworkAttachmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(homework=hw)
        return Response({'success': True, 'data': ser.data}, status=201)

    @action(detail=False, methods=['get'], url_path='tracking')
    def tracking(self, request):
        """GET /api/homework/tracking/?class_section_id=<id>
        Returns homework list for a class section with per-student acknowledgment status."""
        from students.models import Student, ParentStudentRelation
        from homework.models import HomeworkAcknowledgment
        
        cs_id = request.query_params.get('class_section_id')
        if not cs_id:
            return Response({'detail': 'class_section_id is required'}, status=400)

        if normalize_role(request.user.role) == 'TEACHER':
            from staff.models import TeacherAssignment
            if not TeacherAssignment.objects.filter(
                teacher__user=request.user,
                class_section_id=cs_id,
            ).exists():
                return Response({'detail': 'You are not assigned to this class.'}, status=403)
        
        # All homework for this class, latest first
        homeworks = Homework.objects.filter(
            class_section_id=cs_id,
            class_section__branch__tenant=request.user.tenant,
            is_published=True,
        ).select_related('subject', 'posted_by').order_by('-due_date')[:50]
        
        # All active students in this class (tenant-scoped — same as homework)
        students = Student.objects.filter(
            class_section_id=cs_id,
            status='ACTIVE',
            tenant=request.user.tenant,
        ).order_by('first_name', 'last_name')
        
        # Build parent → student mapping
        parent_student_map = {}  # parent_id → [student_ids]
        relations = ParentStudentRelation.objects.filter(
            student__in=students
        ).select_related('parent')
        for r in relations:
            parent_student_map.setdefault(r.parent_id, set()).add(r.student_id)
        
        # All acknowledgments for these homeworks
        acks = HomeworkAcknowledgment.objects.filter(
            homework__in=homeworks
        ).values_list('homework_id', 'parent_id')
        
        # Build hw_id → set of acknowledged student_ids (via their parents)
        hw_acked_students = {}
        for hw_id, parent_id in acks:
            student_ids = parent_student_map.get(parent_id, set())
            hw_acked_students.setdefault(hw_id, set()).update(student_ids)
        
        # Student list
        student_list = [{
            'id': str(s.id),
            'name': f"{s.first_name} {s.last_name}",
            'admission_number': s.admission_number,
        } for s in students]
        
        # Homework list with per-student ack status
        homework_data = []
        for hw in homeworks:
            acked_set = hw_acked_students.get(hw.id, set())
            acked_count = len(acked_set)
            total = len(student_list)
            
            student_statuses = [{
                'student_id': str(s.id),
                'acknowledged': s.id in acked_set,
            } for s in students]
            
            homework_data.append({
                'id': str(hw.id),
                'title': hw.title,
                'description': hw.description,
                'subject_name': hw.subject.name if hw.subject else '',
                'due_date': str(hw.due_date),
                'activity_type': hw.activity_type,
                'posted_by': f"{hw.posted_by.first_name} {hw.posted_by.last_name}" if hw.posted_by else None,
                'created_at': hw.created_at.isoformat(),
                'acked_count': acked_count,
                'total_students': total,
                'ack_percentage': round((acked_count / total * 100)) if total > 0 else 0,
                'student_statuses': student_statuses,
            })
        
        return Response({
            'success': True,
            'data': {
                'students': student_list,
                'homework': homework_data,
            }
        })
