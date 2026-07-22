import uuid
from django.db import models
from django.conf import settings
from students.models import GRADE_CHOICES

class GradeScale(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='grade_scales')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='grade_scales')
    name = models.CharField(max_length=100) # e.g. "CBSE 8-Point Scale"
    min_marks_percent = models.DecimalField(max_digits=5, decimal_places=2)
    max_marks_percent = models.DecimalField(max_digits=5, decimal_places=2)
    grade = models.CharField(max_length=10) # 'A1', 'A2', 'B1', etc.
    grade_point = models.DecimalField(max_digits=4, decimal_places=2) # e.g. 10.0, 9.0
    remarks = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['-min_marks_percent']
        unique_together = ('branch', 'name', 'grade')

    def __str__(self):
        return f"{self.name}: {self.grade} ({self.min_marks_percent}% - {self.max_marks_percent}%)"


class ExamResult(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='exam_results')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='exam_results')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='exam_results')
    assessment = models.ForeignKey('Assessment', on_delete=models.CASCADE, related_name='results')
    subject = models.ForeignKey('academics.AcademicSubject', on_delete=models.CASCADE, related_name='exam_results')
    
    marks_obtained = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    is_absent = models.BooleanField(default=False)
    max_marks = models.DecimalField(max_digits=5, decimal_places=2)
    
    # Auto-calculated fields
    percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    grade = models.CharField(max_length=10, blank=True)
    grade_point = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    subject_rank = models.IntegerField(null=True, blank=True)
    is_published = models.BooleanField(default=False)
    
    evaluator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='evaluated_results')
    evaluated_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    remarks = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ('student', 'assessment', 'subject')
        ordering = ['student', 'subject']
        
    def save(self, *args, **kwargs):
        if self.is_absent:
            self.marks_obtained = None
            self.percentage = None
            self.grade = ''
            self.grade_point = None
        elif self.marks_obtained is not None and self.max_marks > 0:
            self.percentage = (self.marks_obtained / self.max_marks) * 100
            
            # Auto-calculate grade based on GradeScale
            scale = GradeScale.objects.filter(
                branch=self.branch,
                min_marks_percent__lte=self.percentage,
                max_marks_percent__gte=self.percentage
            ).first()
            if scale:
                self.grade = scale.grade
                self.grade_point = scale.grade_point
                
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.student} - {self.subject} ({self.assessment.name}): {self.marks_obtained}/{self.max_marks}"





# ─────────────────────────────────────────────────────────────────────────────
# NEW: Academic Subjects & Assessments modules
# These are ADDITIVE — they do not modify any existing model above.
# ─────────────────────────────────────────────────────────────────────────────

class AcademicSubject(models.Model):
    """
    Branch-specific subject master for the Academics module.
    Separate from timetable.Subject (which serves timetable/ExamMarks workflows).
    Each branch maintains its own subject list independently.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='academic_subjects'
    )
    branch = models.ForeignKey(
        'tenants.Branch', on_delete=models.CASCADE, related_name='academic_subjects'
    )
    name = models.CharField(max_length=150)
    is_optional = models.BooleanField(
        default=False,
        help_text='If True, subject appears in the Optional Subjects section of assessments.'
    )
    is_first_language = models.BooleanField(default=False)
    is_second_language = models.BooleanField(default=False)
    is_third_language = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('branch', 'name')
        ordering = ['display_order', 'name']

    def __str__(self):
        return f"{self.name} ({self.branch})"


class Assessment(models.Model):
    """
    Exam header created by an accountant for a specific grade and academic year.
    Subjects are linked via AssessmentSubject.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='assessments'
    )
    branch = models.ForeignKey(
        'tenants.Branch', on_delete=models.CASCADE, related_name='assessments'
    )
    academic_year = models.ForeignKey(
        'tenants.AcademicYear', on_delete=models.CASCADE, related_name='assessments'
    )
    grade = models.CharField(max_length=50, choices=GRADE_CHOICES, db_index=True)
    name = models.CharField(max_length=150)  # e.g. "Mid Term", "Annual Exam"
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_assessments'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('branch', 'academic_year', 'grade', 'name')
        ordering = ['start_date']

    def __str__(self):
        return f"{self.name} — {self.grade} ({self.academic_year})"


class AssessmentSubject(models.Model):
    """
    A subject selected for a specific Assessment, along with its exam configuration.
    Uses PROTECT so that deleting an AcademicSubject that is referenced here is blocked
    at the DB level — the API converts ProtectedError into a 409 with a helpful message.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name='assessment_subjects'
    )
    subject = models.ForeignKey(
        AcademicSubject, on_delete=models.PROTECT, related_name='assessment_subjects'
    )
    max_marks = models.DecimalField(max_digits=6, decimal_places=2)
    min_marks = models.DecimalField(max_digits=6, decimal_places=2)
    exam_date = models.DateField(null=True, blank=True)
    exam_time = models.TimeField(null=True, blank=True)

    class Meta:
        unique_together = ('assessment', 'subject')
        ordering = ['subject__display_order', 'subject__name']

    def __str__(self):
        return f"{self.assessment.name} — {self.subject.name}"
