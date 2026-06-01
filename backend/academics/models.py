import uuid
from django.db import models
from django.conf import settings

class ExamTerm(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='exam_terms')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='exam_terms')
    academic_year = models.ForeignKey('tenants.AcademicYear', on_delete=models.CASCADE, related_name='exam_terms')
    name = models.CharField(max_length=100) # e.g. "Term 1", "Half Yearly", "Finals"
    start_date = models.DateField()
    end_date = models.DateField()
    weightage_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=100.0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_date']
        unique_together = ('branch', 'academic_year', 'name')

    def __str__(self):
        return f"{self.name} ({self.academic_year})"


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
    exam_term = models.ForeignKey(ExamTerm, on_delete=models.CASCADE, related_name='results')
    subject = models.ForeignKey('timetable.Subject', on_delete=models.CASCADE, related_name='exam_results')
    
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
        unique_together = ('student', 'exam_term', 'subject')
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
        return f"{self.student} - {self.subject} ({self.exam_term.name}): {self.marks_obtained}/{self.max_marks}"


class ExamSubjectConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='exam_configs')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, related_name='exam_configs')
    exam_term = models.ForeignKey(ExamTerm, on_delete=models.CASCADE, related_name='subject_configs')
    class_section = models.ForeignKey('students.ClassSection', on_delete=models.CASCADE, related_name='exam_configs')
    subject = models.ForeignKey('timetable.Subject', on_delete=models.CASCADE, related_name='exam_configs')
    max_marks = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        unique_together = ('exam_term', 'class_section', 'subject')
        
    def __str__(self):
        return f"{self.exam_term.name} - {self.class_section} - {self.subject} (Max: {self.max_marks})"
