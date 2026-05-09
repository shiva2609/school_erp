import re

from django.core.management.base import BaseCommand
from django.db import transaction

from students.models import Student


class Command(BaseCommand):
    help = "Normalize malformed student admission numbers to tenant format."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-id", dest="tenant_id", help="Filter by tenant UUID")
        parser.add_argument("--branch-id", dest="branch_id", help="Filter by branch UUID")
        parser.add_argument("--academic-year-id", dest="academic_year_id", help="Filter by academic year UUID")
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            help="Include non-active students (default: ACTIVE and PENDING_APPROVAL only).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist generated admission numbers. Without this flag, command runs as dry-run.",
        )

    def _expected_pattern(self, student):
        tenant = student.tenant
        branch = student.branch
        ay = student.academic_year
        if not tenant or not branch or not ay:
            return None
        year_str = (ay.name or "").split("-")[0]
        branch_code = re.escape(branch.branch_code or "")
        prefix = re.escape((tenant.admission_no_prefix or "").strip())

        fmt = tenant.admission_no_format
        if fmt == "YEAR_BRANCH_SEQ":
            return rf"^{re.escape(year_str)}/{branch_code}/\d+$"
        if fmt == "BRANCH_YEAR_SEQ":
            return rf"^{branch_code}/{re.escape(year_str)}/\d+$"
        if fmt == "YEAR_SEQ":
            return rf"^{re.escape(year_str)}/\d+$"
        if fmt == "PREFIX_SEQ":
            if prefix:
                return rf"^{prefix}-\d+$"
            # Empty prefix on PREFIX_SEQ is malformed setup; treat as unknown here.
            return r"^\d+$"
        return rf"^{re.escape(year_str)}-{branch_code}-\d+$"

    def _needs_normalization(self, student):
        num = (student.admission_number or "").strip()
        if not num:
            return True
        pat = self._expected_pattern(student)
        if not pat:
            return False
        return re.match(pat, num) is None

    def handle(self, *args, **options):
        qs = Student.objects.select_related("tenant", "branch", "academic_year").all()

        if options.get("tenant_id"):
            qs = qs.filter(tenant_id=options["tenant_id"])
        if options.get("branch_id"):
            qs = qs.filter(branch_id=options["branch_id"])
        if options.get("academic_year_id"):
            qs = qs.filter(academic_year_id=options["academic_year_id"])
        if not options.get("include_inactive"):
            qs = qs.filter(status__in=["ACTIVE", "PENDING_APPROVAL"])

        candidates = [s for s in qs.iterator() if self._needs_normalization(s)]
        self.stdout.write(self.style.WARNING(f"Found {len(candidates)} student(s) needing normalization."))

        if not candidates:
            self.stdout.write(self.style.SUCCESS("No changes required."))
            return

        for s in candidates[:20]:
            self.stdout.write(
                f"- {s.id} | {s.first_name} {s.last_name or ''} | current={s.admission_number!r}"
            )
        if len(candidates) > 20:
            self.stdout.write(f"... and {len(candidates) - 20} more.")

        if not options.get("apply"):
            self.stdout.write(self.style.WARNING("Dry-run only. Re-run with --apply to persist changes."))
            return

        updated = 0
        with transaction.atomic():
            for s in candidates:
                if not s.branch_id or not s.academic_year_id:
                    continue
                new_no = Student.generate_admission_number(s.branch, s.academic_year)
                if new_no and new_no != s.admission_number:
                    s.admission_number = new_no
                    s.save(update_fields=["admission_number", "updated_at"])
                    updated += 1

        self.stdout.write(self.style.SUCCESS(f"Updated {updated} admission number(s)."))
