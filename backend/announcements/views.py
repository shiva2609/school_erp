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
        user = self.request.user
        qs = (
            Announcement.objects.filter(branch__tenant=user.tenant)
            .select_related('branch')
            .prefetch_related('target_classes')
        )

        from accounts.permissions import get_user_scope
        scope = get_user_scope(user)

        if user.role in ANNOUNCEMENT_ADMIN_ROLES:
            # Enforce Branch Isolation for Admins
            if scope.get('level') == 'branch':
                qs = qs.filter(branch_id=scope['branch_id'])
            return qs

        # Non-admins: can only see published announcements
        qs = qs.filter(is_published=True)

        # Enforce strict audience filtering
        if user.role == 'TEACHER':
            qs = qs.filter(
                Q(target_audience__in=['ALL', 'TEACHERS', 'STAFF']) |
                Q(target_audience='INDIVIDUAL', recipient_email__iexact=user.email)
            )
            if getattr(user, 'branch_id', None):
                qs = qs.filter(Q(branch_id=user.branch_id) | Q(branch__isnull=True))
        elif user.role == 'PARENT':
            from students.models import ParentStudentRelation
            class_ids = ParentStudentRelation.objects.filter(
                parent=user
            ).values_list('student__class_section_id', flat=True).distinct()
            qs = qs.filter(
                Q(target_audience__in=['ALL', 'PARENTS']) |
                Q(target_audience='CLASS', target_classes__id__in=class_ids) |
                Q(target_audience='INDIVIDUAL', recipient_email__iexact=user.email)
            )
            parent_branch_ids = ParentStudentRelation.objects.filter(
                parent=user
            ).values_list('student__branch_id', flat=True).distinct()
            if parent_branch_ids:
                qs = qs.filter(Q(branch_id__in=parent_branch_ids) | Q(branch__isnull=True))
            else:
                qs = qs.none()
        else:
            # Fallback security clamp: other roles only see ALL targeted to their branch
            qs = qs.filter(target_audience='ALL')
            if getattr(user, 'branch_id', None):
                qs = qs.filter(Q(branch_id=user.branch_id) | Q(branch__isnull=True))

        return qs.distinct()

    def perform_create(self, serializer):
        user = self.request.user
        from accounts.permissions import get_user_scope
        scope = get_user_scope(user)
        if scope.get('level') == 'branch':
            branch = serializer.validated_data.get('branch')
            if branch and str(branch.id) != str(scope['branch_id']):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You do not have permission to create announcements for this branch.")
            serializer.save(tenant=user.tenant, branch_id=scope['branch_id'], created_by=user)
        else:
            serializer.save(tenant=user.tenant, created_by=user)

    @action(detail=True, methods=['patch'], url_path='publish')
    def publish(self, request, pk=None):
        ann = self.get_object()
        from .services import publish_announcement, AnnouncementPublishError
        try:
            published_ann = publish_announcement(ann)
            return Response({'success': True, 'data': AnnouncementSerializer(published_ann).data})
        except AnnouncementPublishError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

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

    @action(detail=False, methods=['get'], url_path='teacher')
    def teacher_notices(self, request):
        if request.user.role != 'TEACHER':
            return Response({'detail': 'Only teachers can access this endpoint.'}, status=403)
        qs = self.get_queryset()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response({'success': True, 'data': serializer.data})
