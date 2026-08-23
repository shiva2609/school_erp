"""
One-time backfill script: populate grade & grade_point on ExamResult records
that have marks but an empty grade field (e.g. results published before the
teacher_marks_publish bug-fix was deployed).

Run via:
    python backfill_grades.py
from the backend/ directory with the virtualenv activated.
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from academics.models import ExamResult, GradeScale

qs = ExamResult.objects.filter(
    grade='',
    is_absent=False,
    marks_obtained__isnull=False,
)

print(f"Found {qs.count()} ExamResult records with missing grades.")

updated = 0
no_scale = 0

for r in qs.only('id', 'branch_id', 'marks_obtained', 'max_marks', 'percentage', 'is_absent'):
    if r.max_marks <= 0 or r.percentage is None:
        continue
    scale = GradeScale.objects.filter(
        branch_id=r.branch_id,
        min_marks_percent__lte=r.percentage,
        max_marks_percent__gte=r.percentage,
    ).first()
    if scale:
        r.grade = scale.grade
        r.grade_point = scale.grade_point
        r.save(update_fields=['grade', 'grade_point'])
        updated += 1
    else:
        no_scale += 1

print(f"Updated {updated} records with grades.")
if no_scale:
    print(f"Warning: {no_scale} records had no matching GradeScale entry for their percentage.")
print("Backfill complete.")
