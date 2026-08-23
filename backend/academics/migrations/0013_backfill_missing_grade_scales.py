"""
Migration: backfill GradeScale for branches that were created after migration
0012 and therefore never got their grade scale seeded.
Also patches remarks='' on existing GradeScale rows so the Final Remark
column in PDF report cards is populated correctly.
"""
from django.db import migrations


SCALES = [
    ('A1', 91.0, 100.0,  10.0, 'Outstanding'),
    ('A2', 81.0,  90.99,  9.0, 'Excellent'),
    ('B1', 71.0,  80.99,  8.0, 'Very Good'),
    ('B2', 61.0,  70.99,  7.0, 'Good'),
    ('C1', 51.0,  60.99,  6.0, 'Above Average'),
    ('C2', 41.0,  50.99,  5.0, 'Satisfactory'),
    ('D1', 33.0,  40.99,  4.0, 'Needs Improvement'),
    ('D2', 21.0,  32.99,  0.0, 'Requires Significant Improvement'),
    ('E',   0.0,  20.99,  0.0, 'Unsatisfactory'),
]

# grade → remark lookup for patching existing rows
GRADE_REMARK = {grade: remark for grade, _min, _max, _pt, remark in SCALES}


def seed_missing_grade_scales(apps, schema_editor):
    Branch = apps.get_model('tenants', 'Branch')
    GradeScale = apps.get_model('academics', 'GradeScale')

    for branch in Branch.objects.all():
        if GradeScale.objects.filter(branch=branch).exists():
            # Already has a scale — just patch any missing remarks (e.g. seeded
            # by migration 0012 or by the old _seed_grade_scale which had no
            # remarks field).
            for gs in GradeScale.objects.filter(branch=branch, name='Standard Indian Scale', remarks=''):
                remark = GRADE_REMARK.get(gs.grade, '')
                if remark:
                    gs.remarks = remark
                    gs.save(update_fields=['remarks'])
        else:
            # Branch never got a scale — create it now with remarks.
            for grade, min_p, max_p, point, remark in SCALES:
                GradeScale.objects.get_or_create(
                    branch=branch,
                    name='Standard Indian Scale',
                    grade=grade,
                    defaults={
                        'tenant': branch.tenant,
                        'min_marks_percent': min_p,
                        'max_marks_percent': max_p,
                        'grade_point': point,
                        'remarks': remark,
                    },
                )

    # Backfill the grade field on ExamResult rows that have marks but no grade
    # (missed due to the update_fields bug in teacher_marks_publish).
    ExamResult = apps.get_model('academics', 'ExamResult')
    for result in ExamResult.objects.filter(grade='').exclude(marks_obtained__isnull=True):
        if not result.max_marks or result.max_marks <= 0:
            continue
        percentage = (result.marks_obtained / result.max_marks) * 100
        scale = GradeScale.objects.filter(
            branch_id=result.branch_id,
            min_marks_percent__lte=percentage,
            max_marks_percent__gte=percentage,
        ).first()
        if scale:
            result.grade = scale.grade
            result.grade_point = scale.grade_point
            result.save(update_fields=['grade', 'grade_point'])


def reverse_migration(apps, schema_editor):
    pass  # non-destructive — no reverse needed


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0012_seed_indian_gradescale'),
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_missing_grade_scales, reverse_migration),
    ]
