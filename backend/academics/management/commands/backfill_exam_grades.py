"""
Management command: backfill_exam_grades

Populates the `grade` and `grade_point` fields on ExamResult rows that
have marks recorded but an empty grade — caused by a bug where
`teacher_marks_publish` used `update_fields` that bypassed the model's
`save()` hook and therefore never triggered the GradeScale lookup.

Usage:
    python manage.py backfill_exam_grades
    python manage.py backfill_exam_grades --dry-run          # preview only
    python manage.py backfill_exam_grades --branch <branch_id>  # single branch
"""

from django.core.management.base import BaseCommand
from academics.models import ExamResult, GradeScale


class Command(BaseCommand):
    help = 'Backfill missing grade/grade_point on published ExamResult records.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would be changed without writing to the database.',
        )
        parser.add_argument(
            '--branch',
            type=str,
            default=None,
            help='Limit backfill to a specific branch UUID.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        branch_id = options['branch']

        qs = ExamResult.objects.filter(
            grade='',
            is_absent=False,
            marks_obtained__isnull=False,
        ).only('id', 'branch_id', 'marks_obtained', 'max_marks', 'percentage')

        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        total = qs.count()
        self.stdout.write(f"Found {total} ExamResult record(s) with missing grades.")

        if total == 0:
            self.stdout.write(self.style.SUCCESS("Nothing to do."))
            return

        updated = 0
        no_scale = 0
        skipped = 0

        for r in qs:
            if r.max_marks is None or r.max_marks <= 0 or r.percentage is None:
                skipped += 1
                continue

            scale = GradeScale.objects.filter(
                branch_id=r.branch_id,
                min_marks_percent__lte=r.percentage,
                max_marks_percent__gte=r.percentage,
            ).first()

            if scale:
                if dry_run:
                    self.stdout.write(
                        f"  [DRY-RUN] ExamResult {r.id}: "
                        f"percentage={r.percentage} → grade={scale.grade}"
                    )
                else:
                    r.grade = scale.grade
                    r.grade_point = scale.grade_point
                    r.save(update_fields=['grade', 'grade_point'])
                updated += 1
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"  No GradeScale match for ExamResult {r.id} "
                        f"(branch={r.branch_id}, percentage={r.percentage})"
                    )
                )
                no_scale += 1

        action = "Would update" if dry_run else "Updated"
        self.stdout.write(self.style.SUCCESS(
            f"{action} {updated} record(s) with grades. "
            f"No-scale: {no_scale}. Skipped: {skipped}."
        ))
