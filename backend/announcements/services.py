from django.utils import timezone
from django.db.models import Q
from accounts.models import User
from notifications.dispatcher import dispatch_bulk_notifications

STAFF_AUDIENCE_ROLES = (
    'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'PRINCIPAL',
    'BRANCH_ADMIN', 'ACCOUNTANT', 'TEACHER',
)


class AnnouncementPublishError(Exception):
    """Custom exception raised during announcement publishing errors."""
    pass


def publish_announcement(ann):
    """
    Publishes the announcement and dispatches bulk notifications to target recipients.
    Raises AnnouncementPublishError on validation issues.
    """
    if ann.is_published:
        return ann

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
            raise AnnouncementPublishError(
                'Choose at least one class before publishing a class-scoped announcement.'
            )
        parent_ids = ParentStudentRelation.objects.filter(
            student__class_section_id__in=class_ids,
        ).values_list('parent_id', flat=True).distinct()
        users = users.filter(id__in=parent_ids, role='PARENT')
    elif ann.target_audience == 'INDIVIDUAL':
        email = (ann.recipient_email or '').strip()
        if not email:
            raise AnnouncementPublishError(
                'recipient_email is required for individual announcements.'
            )
        target = User.objects.filter(
            tenant=ann.tenant, email__iexact=email, is_active=True,
        ).first()
        if not target:
            raise AnnouncementPublishError(
                f'No active user with email {email} in this organization.'
            )
        users = User.objects.filter(id=target.id)

    if ann.branch and ann.target_audience != 'INDIVIDUAL':
        users = users.filter(Q(branch=ann.branch) | Q(branch__isnull=True))

    users = users.distinct()
    if not users.exists():
        raise AnnouncementPublishError(
            'No recipients match this announcement.'
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

    return ann
