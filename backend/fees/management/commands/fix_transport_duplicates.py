"""
Management command: fix_transport_duplicates

One-time migration to fix students who were imported via CSV (which created a
TRN-{branch_code}-{year} transport invoice) and were subsequently enrolled in
the Transport module (which created a separate TRN-ANN-{branch_code}-{year}
invoice). This resulted in two active transport invoices per student, causing
inflated balances and doubled receipt amounts.

This command:
  1. Finds all (student, academic_year) pairs where both invoice types coexist.
  2. Migrates completed payments from the CSV invoice to the TRN-ANN invoice.
  3. Recomputes paid_amount, outstanding_amount, and status on the TRN-ANN invoice.
  4. Cancels the CSV-imported invoice (status=CANCELLED, outstanding_amount=0).
  5. Updates the StudentFeeItem for TRANSPORT to match the TRN-ANN net_amount.

Usage:
  python manage.py fix_transport_duplicates           # apply changes
  python manage.py fix_transport_duplicates --dry-run # preview only, no DB writes
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Migrate duplicate CSV-imported transport invoices into transport enrollment invoices"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Preview affected records without making any database changes.',
        )
        parser.add_argument(
            '--tenant',
            type=str,
            default=None,
            help='Limit to a specific tenant schema name (optional).',
        )

    def handle(self, *args, **options):
        from fees.models import FeeInvoice, PaymentAllocation, StudentFeeItem, FeeCategory

        dry_run = options['dry_run']
        tenant_filter = options.get('tenant')

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no database changes will be made.\n"))

        # Find all TRN-ANN-... invoices (created by transport enrollment module)
        trn_ann_qs = FeeInvoice.objects.filter(
            invoice_number__contains='TRN-ANN-',
        ).select_related('student', 'branch', 'academic_year', 'tenant')

        if tenant_filter:
            trn_ann_qs = trn_ann_qs.filter(tenant__schema_name=tenant_filter)

        total_checked = 0
        total_fixed = 0
        total_payments_migrated = 0

        for ann_invoice in trn_ann_qs.iterator():
            student = ann_invoice.student
            academic_year = ann_invoice.academic_year
            branch = ann_invoice.branch
            total_checked += 1

            # Look for a corresponding CSV-imported transport invoice:
            # prefix TRN-{branch_code}-{year}, month="ANNUAL", NOT TRN-ANN-
            csv_inv = FeeInvoice.objects.filter(
                student=student,
                academic_year=academic_year,
                month="ANNUAL",
                invoice_number__startswith=f'TRN-{branch.branch_code}-',
            ).exclude(
                invoice_number__startswith='TRN-ANN-'
            ).exclude(
                status='CANCELLED'
            ).first()

            if not csv_inv:
                continue  # no duplicate found for this student

            # Gather payments to migrate
            completed_payments_qs = csv_inv.payments.filter(status='COMPLETED')
            payment_ids = list(completed_payments_qs.values_list('id', flat=True))
            total_migrated = sum(p.amount for p in completed_payments_qs)

            self.stdout.write(
                f"  Student: {student} | AY: {academic_year}\n"
                f"    CSV invoice:        {csv_inv.invoice_number} "
                f"(net={csv_inv.net_amount}, paid={csv_inv.paid_amount}, "
                f"outstanding={csv_inv.outstanding_amount}, status={csv_inv.status})\n"
                f"    TRN-ANN invoice:    {ann_invoice.invoice_number} "
                f"(net={ann_invoice.net_amount}, paid={ann_invoice.paid_amount}, "
                f"outstanding={ann_invoice.outstanding_amount}, status={ann_invoice.status})\n"
                f"    Payments to migrate: {len(payment_ids)} payment(s) totalling ₹{total_migrated}\n"
            )

            if dry_run:
                total_fixed += 1
                total_payments_migrated += len(payment_ids)
                continue

            # Apply changes atomically
            with transaction.atomic():
                # Re-point payments and allocations to the TRN-ANN invoice
                completed_payments_qs.update(invoice=ann_invoice)
                PaymentAllocation.objects.filter(invoice=csv_inv).update(invoice=ann_invoice)

                # Recompute TRN-ANN invoice amounts
                agreed_amount = ann_invoice.net_amount
                paid = min(total_migrated, agreed_amount)
                outstanding = max(Decimal('0'), agreed_amount - paid)
                if outstanding == Decimal('0'):
                    new_status = 'PAID'
                elif paid > Decimal('0'):
                    new_status = 'PARTIALLY_PAID'
                else:
                    new_status = 'SENT'

                ann_invoice.paid_amount = paid
                ann_invoice.outstanding_amount = outstanding
                ann_invoice.status = new_status
                ann_invoice.save(update_fields=['paid_amount', 'outstanding_amount', 'status'])

                # Cancel the CSV-imported transport invoice
                csv_inv.status = 'CANCELLED'
                csv_inv.outstanding_amount = Decimal('0')
                csv_inv.save(update_fields=['status', 'outstanding_amount'])

                # Update StudentFeeItem for TRANSPORT if it exists
                transport_cat = FeeCategory.objects.filter(
                    branch=branch, code='TRANSPORT'
                ).first()
                if transport_cat:
                    StudentFeeItem.objects.filter(
                        student=student,
                        academic_year=academic_year,
                        category=transport_cat,
                    ).update(amount=agreed_amount)

            total_fixed += 1
            total_payments_migrated += len(payment_ids)
            self.stdout.write(
                self.style.SUCCESS(
                    f"    ✓ Fixed: CSV invoice cancelled, {len(payment_ids)} payment(s) migrated, "
                    f"TRN-ANN status → {new_status}\n"
                )
            )

        # Summary
        self.stdout.write("\n" + "─" * 60)
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN complete. {total_fixed} student(s) would be fixed "
                    f"({total_payments_migrated} payment(s) migrated) out of {total_checked} TRN-ANN invoices checked.\n"
                    f"Run without --dry-run to apply changes."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Migration complete. {total_fixed} student(s) fixed "
                    f"({total_payments_migrated} payment(s) migrated) out of {total_checked} TRN-ANN invoices checked."
                )
            )
