from django.apps import AppConfig


class StaffConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'staff'

    def ready(self):
        # Register signals that keep ClassSection.class_teacher in sync with
        # TeacherAssignment records. Import here (not at module level) to avoid
        # circular imports during app startup.
        import staff.signals  # noqa: F401
