import uuid
from django.db import models
from django.conf import settings


PERIOD_TYPE_CHOICES = [
    ("CLASS", "Class"), ("BREAK", "Break"), ("ASSEMBLY", "Assembly"), ("SPORTS", "Sports"),
]
DAY_CHOICES = [
    ("MON", "Monday"), ("TUE", "Tuesday"), ("WED", "Wednesday"),
    ("THU", "Thursday"), ("FRI", "Friday"), ("SAT", "Saturday"),
]


class Period(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='periods')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='periods')
    name = models.CharField(max_length=50)
    period_type = models.CharField(max_length=10, choices=PERIOD_TYPE_CHOICES, default='CLASS')
    start_time = models.TimeField()
    end_time = models.TimeField()
    order = models.PositiveIntegerField()

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.name} ({self.start_time}-{self.end_time})"



class TimetableSlot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='timetable_slots')
    class_section = models.ForeignKey('students.ClassSection', on_delete=models.CASCADE, related_name='timetable_slots')
    period = models.ForeignKey(Period, on_delete=models.CASCADE, related_name='timetable_slots')
    day_of_week = models.CharField(max_length=3, choices=DAY_CHOICES)
    subject = models.ForeignKey('academics.AcademicSubject', on_delete=models.SET_NULL, null=True, blank=True, related_name='timetable_slots')
    teacher = models.ForeignKey('staff.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='timetable_slots')

    class Meta:
        unique_together = ['class_section', 'period', 'day_of_week']
        ordering = ['day_of_week', 'period__order']

    def __str__(self):
        return f"{self.class_section} - {self.day_of_week} - {self.period.name}"


class ClassSubjectDemand(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='subject_demands')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='subject_demands')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='subject_demands')
    class_section = models.ForeignKey('students.ClassSection', on_delete=models.CASCADE, related_name='subject_demands')
    subject = models.ForeignKey('academics.AcademicSubject', on_delete=models.CASCADE, related_name='demands')
    teacher = models.ForeignKey('staff.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='subject_demands')
    
    classes_per_week = models.PositiveIntegerField(default=5)
    priority = models.PositiveIntegerField(default=1, help_text="Higher number = higher priority")
    requires_double_period = models.BooleanField(default=False)

    class Meta:
        unique_together = ['class_section', 'subject', 'academic_year']

    def __str__(self):
        return f"{self.class_section} -> {self.subject} ({self.classes_per_week}/wk)"
