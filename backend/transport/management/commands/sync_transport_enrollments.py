from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction

from fees.models import FeeInvoice, StudentFeeItem, FeeCategory, Payment
from transport.models import TransportFeeEnrollment, StudentTransport


class Command(BaseCommand):
    help = "Auto-enroll students with transport invoices or fees into TransportFeeEnrollment"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Preview enrollments to create without making database changes.',
        )
        parser.add_argument(
            '--tenant',
            type=str,
            default=None,
            help='Limit to a specific tenant ID or schema name.',
        )
        parser.add_argument(
            '--branch',
            type=str,
            default=None,
            help='Limit to a specific branch ID.',
        )
        parser.add_argument(
            '--academic-year',
            type=str,
            default=None,
            help='Limit to a specific academic year ID.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        tenant_filter = options.get('tenant')
        branch_filter = options.get('branch')
        ay_filter = options.get('academic_year')

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE — No database changes will be made.\n"))

        # Find all active transport invoices
        trn_invoices_qs = FeeInvoice.objects.filter(
            invoice_number__startswith='TRN-'
        ).exclude(
            status='CANCELLED'
        ).select_related('student', 'branch', 'academic_year', 'tenant')

        if tenant_filter:
            trn_invoices_qs = trn_invoices_qs.filter(tenant_id=tenant_filter)
        if branch_filter:
            trn_invoices_qs = trn_invoices_qs.filter(branch_id=branch_filter)
        if ay_filter:
            trn_invoices_qs = trn_invoices_qs.filter(academic_year_id=ay_filter)

        # Build map of (student_id, academic_year_id) -> invoice details
        student_ay_map = {}
        for inv in trn_invoices_qs.iterator():
            if not inv.student or not inv.academic_year:
                continue
            key = (inv.student_id, inv.academic_year_id)
            if key not in student_ay_map:
                student_ay_map[key] = {
                    'student': inv.student,
                    'academic_year': inv.academic_year,
                    'branch': inv.branch,
                    'tenant': inv.tenant,
                    'invoices': [],
                }
            student_ay_map[key]['invoices'].append(inv)

        self.stdout.write(f"Found {len(student_ay_map)} student-academic year pairs with transport invoices.")

        created_count = 0
        already_enrolled_count = 0
        total_agreed_added = Decimal('0.00')

        for (student_id, ay_id), data in student_ay_map.items():
            student = data['student']
            ay = data['academic_year']
            branch = data['branch']
            tenant = data['tenant']
            invoices = data['invoices']

            existing_enrollment = TransportFeeEnrollment.objects.filter(
                student=student,
                academic_year=ay
            ).first()

            if existing_enrollment:
                already_enrolled_count += 1
                continue

            # Determine agreed amount
            # 1. From StudentFeeItem if exists
            transport_sf = StudentFeeItem.objects.filter(
                student=student,
                academic_year=ay,
                category__code='TRANSPORT'
            ).first()

            if transport_sf and transport_sf.amount > 0:
                agreed_amount = transport_sf.amount
            else:
                # 2. Maximum gross/net amount across student's TRN invoices
                max_invoice_amount = max(
                    (inv.net_amount or inv.gross_amount for inv in invoices),
                    default=Decimal('0.00')
                )
                agreed_amount = max_invoice_amount

            # Determine pickup point if available
            pickup_point = ''
            opt_in = StudentTransport.objects.filter(student=student).first()
            if opt_in and opt_in.pickup_point:
                pickup_point = opt_in.pickup_point
            else:
                # Check invoice item descriptions
                for inv in invoices:
                    for item in inv.items.all():
                        if item.description and 'Pickup:' in item.description:
                            pickup_point = item.description.split('Pickup:')[-1].strip()
                            break
                    if pickup_point:
                        break

            # Calculate total paid so far
            total_paid = sum(inv.paid_amount for inv in invoices)

            self.stdout.write(
                f"  [+] Enrolling Student: {student.first_name} {student.last_name} ({student.admission_number})\n"
                f"      Branch: {branch.name} | AY: {ay.display_name if hasattr(ay, 'display_name') else ay.start_date.year}\n"
                f"      Agreed Amount: ₹{agreed_amount:,.2f} | Paid Amount: ₹{total_paid:,.2f} | Pickup: '{pickup_point or 'N/A'}'"
            )

            if not dry_run:
                with transaction.atomic():
                    TransportFeeEnrollment.objects.create(
                        tenant=tenant,
                        branch=branch,
                        student=student,
                        academic_year=ay,
                        pickup_point=pickup_point,
                        agreed_amount=agreed_amount,
                        is_active=True,
                    )

            created_count += 1
            total_agreed_added += agreed_amount

        self.stdout.write("\n" + "=" * 60)
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN SUMMARY:\n"
                    f"  - Newly Enrolled: {created_count} students (Total Agreed: ₹{total_agreed_added:,.2f})\n"
                    f"  - Already Enrolled: {already_enrolled_count} students\n"
                    f"Run without --dry-run to apply changes to database."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"SYNCHRONIZATION COMPLETED:\n"
                    f"  - Successfully Enrolled: {created_count} students (Total Agreed: ₹{total_agreed_added:,.2f})\n"
                    f"  - Already Enrolled: {already_enrolled_count} students"
                )
            )
