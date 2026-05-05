from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from accounts.permissions import IsBranchAdminOrAbove
from .models import Announcement, AnnouncementReadReceipt
from .serializers import AnnouncementSerializer, AnnouncementReadReceiptSerializer

class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'mark_read']:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsBranchAdminOrAbove()]

    def get_queryset(self):
        qs = Announcement.objects.filter(branch__tenant=self.request.user.tenant)
        # Parents and non-admin roles only see published notices (drafts are admin-only).
        if self.request.user.role not in (
            'SUPER_ADMIN', 'BRANCH_ADMIN',
        ):
            qs = qs.filter(is_published=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant, created_by=self.request.user)

    @action(detail=True, methods=['patch'], url_path='publish')
    def publish(self, request, pk=None):
        ann = self.get_object()
        
        if not ann.is_published:
            ann.is_published = True
            ann.published_at = timezone.now()
            ann.save()
            
            # Dispatch Push Notifications
            from accounts.models import User
            from notifications.dispatcher import dispatch_bulk_notifications
            
            users = User.objects.filter(tenant=ann.tenant, is_active=True)
            if ann.target_audience == 'PARENTS':
                users = users.filter(role='PARENT')
            elif ann.target_audience == 'TEACHERS':
                users = users.filter(role='TEACHER')
            elif ann.target_audience == 'CLASS':
                from students.models import ParentStudentRelation
                from staff.models import TeacherAssignment
                class_ids = ann.target_classes.values_list('id', flat=True)
                parent_ids = ParentStudentRelation.objects.filter(student__class_section__id__in=class_ids).values_list('parent_id', flat=True)
                teacher_ids = TeacherAssignment.objects.filter(class_section__id__in=class_ids).values_list('teacher__user_id', flat=True)
                users = users.filter(id__in=list(parent_ids) + list(teacher_ids))
            
            if ann.branch:
                users = users.filter(branch=ann.branch)
                
            dispatch_bulk_notifications(
                tenant=ann.tenant,
                branch=ann.branch,
                event_type='CUSTOM_ANNOUNCEMENT',
                recipient_users=users.distinct(),
                payload={'title': ann.title, 'message': ann.body},
                send_sms=ann.send_sms,
                send_email=ann.send_email,
                send_push=ann.send_push
            )

        return Response({'success': True, 'data': AnnouncementSerializer(ann).data})

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        ann = self.get_object()
        receipt, created = AnnouncementReadReceipt.objects.get_or_create(
            announcement=ann, user=request.user
        )
        return Response({'success': True, 'data': {'read': True, 'read_at': str(receipt.read_at)}})

    @action(detail=True, methods=['get'], url_path='read-receipts')
    def read_receipts(self, request, pk=None):
        ann = self.get_object()
        receipts = ann.read_receipts.all().select_related('user')
        data = [{'user': r.user.email, 'read_at': r.read_at} for r in receipts]
        return Response({'success': True, 'data': data})
