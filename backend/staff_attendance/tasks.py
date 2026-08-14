from celery import shared_task
from django.utils import timezone

from .models import StaffAttendanceTransaction


@shared_task(name='staff_attendance.tasks.cleanup_expired_tokens')
def cleanup_expired_tokens():
    """
    Periodic task to expire PENDING tokens that have passed their expiry time.
    Runs every 5 minutes via Celery Beat.
    """
    now = timezone.now()
    expired_count = (
        StaffAttendanceTransaction.objects
        .filter(status='PENDING', expires_at__lt=now)
        .update(status='EXPIRED')
    )
    if expired_count:
        print(f'[staff_attendance] Expired {expired_count} pending token(s).')
    return expired_count
