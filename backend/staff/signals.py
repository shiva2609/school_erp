"""
Signals for the staff app.

Keeps ClassSection.class_teacher (the direct FK on ClassSection) in sync with
TeacherAssignment records of role CLASS_TEACHER.

WHY: There are two ways the primary class teacher is recorded:
  1. ClassSection.class_teacher  — a direct FK to the User model (legacy field)
  2. TeacherAssignment(role='CLASS_TEACHER') — the authoritative assignment record

Without a signal, these can drift out of sync when assignments are created or
deleted programmatically (e.g. via the admin panel or migrations), causing
inconsistent access control in attendance and other modules.

These signals ensure ClassSection.class_teacher is ALWAYS derived from the
active TeacherAssignment and never requires manual maintenance.
"""
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver


@receiver(post_save, sender='staff.TeacherAssignment')
def sync_class_teacher_on_assignment_save(sender, instance, created, **kwargs):
    """
    When a CLASS_TEACHER assignment is saved, mirror the staff user into
    ClassSection.class_teacher so both sources of truth agree.
    """
    if instance.role != 'CLASS_TEACHER':
        return
    try:
        from students.models import ClassSection
        staff_user = instance.staff.user if instance.staff else None
        if staff_user:
            ClassSection.objects.filter(id=instance.class_section_id).update(
                class_teacher=staff_user
            )
    except Exception:
        # Never let a signal crash the main request.
        pass


@receiver(post_delete, sender='staff.TeacherAssignment')
def clear_class_teacher_on_assignment_delete(sender, instance, **kwargs):
    """
    When a CLASS_TEACHER assignment is deleted, clear ClassSection.class_teacher
    so the section is no longer attributed to a removed teacher.
    Only clears the field if it currently points to the deleted assignment's staff
    user — prevents overwriting if a new assignment was already created.
    """
    if instance.role != 'CLASS_TEACHER':
        return
    try:
        from students.models import ClassSection
        staff_user = instance.staff.user if instance.staff else None
        if staff_user:
            ClassSection.objects.filter(
                id=instance.class_section_id,
                class_teacher=staff_user,
            ).update(class_teacher=None)
    except Exception:
        pass
