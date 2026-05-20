import logging
from django.utils import timezone
from celery import shared_task
from announcements.models import Announcement
from announcements.services import publish_announcement, AnnouncementPublishError

logger = logging.getLogger(__name__)


@shared_task
def publish_scheduled_announcements():
    """
    Finds all unpublished announcements where scheduled_for is in the past,
    and programmatically publishes them.
    """
    now = timezone.now()
    scheduled_anns = Announcement.objects.filter(
        is_published=False,
        scheduled_for__lte=now
    )

    stats = {'published': 0, 'errors': 0}
    for ann in scheduled_anns:
        try:
            publish_announcement(ann)
            stats['published'] += 1
            logger.info(f"Scheduled announcement '{ann.title}' ({ann.id}) published successfully.")
        except AnnouncementPublishError as e:
            stats['errors'] += 1
            logger.error(f"Failed to publish scheduled announcement '{ann.title}' ({ann.id}): {e}")

    return stats
