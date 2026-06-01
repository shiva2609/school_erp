import uuid
from django.db import models
from django.conf import settings


ATTENDANCE_STATUS = [
    ("PRESENT", "Present"), ("ABSENT", "Absent"), ("LATE", "Late"),
    ("HALF_DAY", "Half Day"), ("ON_LEAVE", "On Leave"),
]


class AttendanceRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='attendance_records')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='attendance_records')
    class_section = models.ForeignKey('students.ClassSection', on_delete=models.CASCADE, related_name='attendance_records')
    date = models.DateField()
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS)
    marked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='marked_attendance')
    marked_at = models.DateTimeField(auto_now_add=True)
    remarks = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        unique_together = ['student', 'date']
        ordering = ['-date', 'student__first_name']
        indexes = [
            models.Index(fields=['student', 'date']),
        ]

    def __str__(self):
        return f"{self.student} - {self.date} - {self.status}"

class StaffAttendanceRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='staff_attendance')
    staff = models.ForeignKey('staff.TeacherProfile', on_delete=models.CASCADE, related_name='attendance_records')
    date = models.DateField()
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS)
    marked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='marked_staff_attendance')
    marked_at = models.DateTimeField(auto_now_add=True)
    remarks = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        unique_together = ['staff', 'date']
        ordering = ['-date', 'staff__user__first_name']

    def __str__(self):
        return f"{self.staff} - {self.date} - {self.status}"
