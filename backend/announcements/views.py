from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from accounts.permissions import IsAccountantOrAbove
from .models import Announcement, AnnouncementReadReceipt
from .serializers import AnnouncementSerializer, AnnouncementReadReceiptSerializer

# Roles that may see unpublished announcement drafts in the admin API.
ANNOUNCEMENT_ADMIN_ROLES = frozenset({
    'SUPER_ADMIN', 'BRANCH_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT',
})

STAFF_AUDIENCE_ROLES = (
    'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'PRINCIPAL',
    'BRANCH_ADMIN', 'ACCOUNTANT', 'TEACHER',
)


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'mark_read']:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAccountantOrAbove()]

    def get_queryset(self):
        qs = (
            Announcement.objects.filter(branch__tenant=self.request.user.tenant)
            .select_related('branch')
            .prefetch_related('target_classes')
        )
        if self.request.user.role not in ANNOUNCEMENT_ADMIN_ROLES:
            qs = qs.filter(is_published=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant, created_by=self.request.user)

    @action(detail=True, methods=['patch'], url_path='publish')
    def publish(self, request, pk=None):
        ann = self.get_object()

        if ann.is_published:
            return Response({'success': True, 'data': AnnouncementSerializer(ann).data})

        from accounts.models import User
        from notifications.dispatcher import dispatch_bulk_notifications

        users = User.objects.filter(tenant=ann.tenant, is_active=True)
        if ann.target_audience == 'PARENTS':
            users = users.filter(role='PARENT')
        elif ann.target_audience == 'TEACHERS':
            users = users.filter(role='TEACHER')
        elif ann.target_audience == 'STAFF':
            users = users.filter(role__in=STAFF_AUDIENCE_ROLES)
        elif ann.target_audience == 'CLASS':
            from students.models import ParentStudentRelation
            class_ids = list(ann.target_classes.values_list('id', flat=True))
            if not class_ids:
                return Response(
                    {'detail': 'Choose at least one class before publishing a class-scoped announcement.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            parent_ids = ParentStudentRelation.objects.filter(
                student__class_section_id__in=class_ids,
            ).values_list('parent_id', flat=True).distinct()
            users = users.filter(id__in=parent_ids, role='PARENT')
        elif ann.target_audience == 'INDIVIDUAL':
            email = (ann.recipient_email or '').strip()
            if not email:
                return Response(
                    {'detail': 'recipient_email is required for individual announcements.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            target = User.objects.filter(
                tenant=ann.tenant, email__iexact=email, is_active=True,
            ).first()
            if not target:
                return Response(
                    {'detail': f'No active user with email {email} in this organization.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            users = User.objects.filter(id=target.id)

        if ann.branch and ann.target_audience != 'INDIVIDUAL':
            users = users.filter(Q(branch=ann.branch) | Q(branch__isnull=True))

        users = users.distinct()
        if not users.exists():
            return Response(
                {'detail': 'No recipients match this announcement.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ann.is_published = True
        ann.published_at = timezone.now()
        if ann.target_audience == 'INDIVIDUAL' and not ann.send_email:
            ann.send_email = True
        ann.save()

        dispatch_bulk_notifications(
            tenant=ann.tenant,
            branch=ann.branch,
            event_type='CUSTOM_ANNOUNCEMENT',
            recipient_users=users,
            payload={'title': ann.title, 'message': ann.body},
            send_sms=ann.send_sms,
            send_email=ann.send_email,
            send_push=ann.send_push,
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
