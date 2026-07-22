import uuid
from django.db import models
from django.conf import settings

ACTIVITY_TYPE = [
    ("HOMEWORK", "Homework"), ("CLASSWORK", "Classwork"), ("PROJECT", "Project"),
    ("REVISION", "Revision"), ("READING", "Reading"),
]
FILE_TYPE = [("PDF", "PDF"), ("IMAGE", "Image"), ("DOCUMENT", "Document"), ("OTHER", "Other")]


class Homework(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='homework')
    class_section = models.ForeignKey('students.ClassSection', on_delete=models.CASCADE, related_name='homework')
    subject = models.ForeignKey('academics.AcademicSubject', on_delete=models.CASCADE, related_name='homework')
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='homework_posted')
    title = models.CharField(max_length=200)
    description = models.TextField()
    due_date = models.DateField()
    estimated_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    activity_type = models.CharField(max_length=10, choices=ACTIVITY_TYPE, default='HOMEWORK')
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-due_date']

    def __str__(self):
        return f"{self.title} ({self.class_section})"


class HomeworkAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    homework = models.ForeignKey(Homework, on_delete=models.CASCADE, related_name='attachments')
    file_url = models.URLField()
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=10, choices=FILE_TYPE, default='OTHER')
    file_size_kb = models.PositiveIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.file_name


class HomeworkAcknowledgment(models.Model):
    """Tracks parent acknowledgment of homework — like a diary signature."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    homework = models.ForeignKey(Homework, on_delete=models.CASCADE, related_name='acknowledgments')
    parent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='homework_acknowledgments')
    acknowledged_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        unique_together = ['homework', 'parent']
        ordering = ['-acknowledged_at']

    def __str__(self):
        return f"{self.parent.email} ack → {self.homework.title}"
