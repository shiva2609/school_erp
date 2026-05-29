from django.test import TransactionTestCase
from decimal import Decimal
from datetime import date
from django.core.files.uploadedfile import SimpleUploadedFile
from accounts.models import User
from tenants.models import Tenant, Branch, AcademicYear
from students.models import Student, ClassSection
from fees.models import FeeInvoice, FeeInvoiceItem, StudentFeeItem, Payment, PaymentAllocation, FeeCarryForward, FeeCategory
from students.serializers import StudentSerializer
from students.csv_import import process_rows, CsvImportJob

class CsvImportFeesTests(TransactionTestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Test Tenant', 
            owner_email='admin@test.com', 
            city='City', 
            state='State', 
            pincode='123456',
            admission_no_format='YEAR_BRANCH_SEQ'
        )
        self.branch = Branch.objects.create(
            name='Test Branch', 
            branch_code='TGMS',
            tenant=self.tenant
        )
        self.ay = AcademicYear.objects.create(
            name='2026-27', 
            tenant=self.tenant, 
            start_date=date(2026, 6, 1), 
            end_date=date(2027, 5, 31),
            is_active=True
        )
        self.class_section = ClassSection.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            grade='1',
            section='A'
        )
        self.user = User.objects.create_user(
            email='admin@test.com', 
            password='password123',
            tenant=self.tenant,
            branch=self.branch,
            role='BRANCH_ADMIN'
        )
        self.job = CsvImportJob.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            created_by=self.user,
            status='PENDING'
        )

    def test_granular_fee_import_precision(self):
        """Verify importing granular columns creates correct dual-invoices, items, payments and past dues."""
        rows = [{
            'admission no': 'TGMS-INJ-0139',
            'student name': 'SUJATHA MUDAVATH',
            'class': 'Class I',
            'section': 'Sec A',
            'parent name': 'VENKAT RAM',
            'parent mobile': '09705279336',
            'tuition fee': '45,000',
            'transport fee': '12,000',
            'past due': '4,000',
            'tuition collected': '31,000',
            'transport collected': '8,000',
            'past due collected': '4,000',
            'tuition concession': '10,000',
            'transport concession': '2,000',
            'past due concession': '0',
        }]

        process_rows(self.job, rows)
        self.job.refresh_from_db()
        if self.job.success_count != 1:
            print("TEST GRANULAR ERROR LOGS:", self.job.error_log)
        self.job.refresh_from_db()
        self.assertEqual(self.job.success_count, 1)
        self.assertEqual(len(self.job.error_log), 0)

        # 1. Student Created
        student = Student.objects.filter(branch=self.branch, first_name='SUJATHA').first()
        self.assertIsNotNone(student)

        # 2. Invoices Verified
        invoices = FeeInvoice.objects.filter(student=student).order_by('invoice_number')
        self.assertEqual(invoices.count(), 2)

        # 2a. Tuition Invoice (INV-)
        tuition_inv = invoices.filter(invoice_number__startswith='INV-').first()
        self.assertIsNotNone(tuition_inv)
        self.assertEqual(tuition_inv.gross_amount, Decimal('45000.00'))
        self.assertEqual(tuition_inv.concession_amount, Decimal('10000.00'))
        self.assertEqual(tuition_inv.net_amount, Decimal('35000.00'))
        self.assertEqual(tuition_inv.paid_amount, Decimal('31000.00'))
        self.assertEqual(tuition_inv.outstanding_amount, Decimal('4000.00'))
        self.assertEqual(tuition_inv.status, 'PARTIALLY_PAID')

        # 2b. Tuition Items/Locks
        self.assertTrue(FeeInvoiceItem.objects.filter(invoice=tuition_inv, category__code='TUITION').exists())
        self.assertTrue(StudentFeeItem.objects.filter(student=student, category__code='TUITION', amount=Decimal('35000.00')).exists())

        # 2c. Transport Invoice (TRN-)
        transport_inv = invoices.filter(invoice_number__startswith='TRN-').first()
        self.assertIsNotNone(transport_inv)
        self.assertEqual(transport_inv.gross_amount, Decimal('12000.00'))
        self.assertEqual(transport_inv.concession_amount, Decimal('2000.00'))
        self.assertEqual(transport_inv.net_amount, Decimal('10000.00'))
        self.assertEqual(transport_inv.paid_amount, Decimal('8000.00'))
        self.assertEqual(transport_inv.outstanding_amount, Decimal('2000.00'))
        self.assertEqual(transport_inv.status, 'PARTIALLY_PAID')

        # 2d. Transport Items/Locks
        self.assertTrue(FeeInvoiceItem.objects.filter(invoice=transport_inv, category__code='TRANSPORT').exists())
        self.assertTrue(StudentFeeItem.objects.filter(student=student, category__code='TRANSPORT', amount=Decimal('10000.00')).exists())

        # 3. Payments allocation
        current_year_allocs = PaymentAllocation.objects.filter(payment__student=student, allocation_type='CURRENT_YEAR')
        self.assertEqual(current_year_allocs.count(), 2)
        self.assertEqual(current_year_allocs.filter(invoice=tuition_inv).first().allocated_amount, Decimal('31000.00'))
        self.assertEqual(current_year_allocs.filter(invoice=transport_inv).first().allocated_amount, Decimal('8000.00'))

        # 4. Carry Forwards Verified
        cf = FeeCarryForward.objects.filter(student=student).first()
        self.assertIsNotNone(cf)
        self.assertEqual(cf.carry_forward_amount, Decimal('4000.00'))
        self.assertEqual(cf.paid_amount, Decimal('4000.00'))
        self.assertEqual(cf.written_off_amount, Decimal('0.00'))
        self.assertEqual(cf.status, 'PAID')

        # 5. Past Due Payments Allocation
        prev_year_allocs = PaymentAllocation.objects.filter(payment__student=student, allocation_type='PREVIOUS_YEAR_DUES')
        self.assertEqual(prev_year_allocs.count(), 1)
        self.assertEqual(prev_year_allocs.first().allocated_amount, Decimal('4000.00'))
        self.assertEqual(prev_year_allocs.first().carry_forward, cf)

        # 6. Existing Serializer Dash Compatibility check (now correctly integrates carry forward dues)
        serializer = StudentSerializer(student)
        fee_stats = serializer.data['fee_stats']
        self.assertEqual(fee_stats['total_fee'], 39000.0) # Correctly includes current year net (35k) + carry forward (4k)
        self.assertEqual(fee_stats['total_paid'], 35000.0) # Correctly includes current year paid (31k) + carry forward paid (4k)

    def test_flat_fee_import_precision(self):
        """Verify importing flat columns creates correct academic invoice, payments and past dues (with flat resolution support)."""
        rows = [{
            'admission no': 'TGMS-INJ-0100',
            'student name': 'Amshala Devansh Yejamahi',
            'class': 'Class I',
            'section': 'Sec A',
            'total fee': '45,000',
            'fee paid': '10,000',
            'concession': '25,000',
            'past due': '5,000',
            'past due collected': '3,000',
            'past due concession': '1,000'
        }]

        process_rows(self.job, rows)
        self.job.refresh_from_db()
        if self.job.success_count != 1:
            print("TEST FLAT ERROR LOGS:", self.job.error_log)
        self.assertEqual(self.job.success_count, 1)

        student = Student.objects.filter(branch=self.branch, legacy_admission_number='TGMS-INJ-0100').first()
        self.assertIsNotNone(student)

        # 1. Academic Invoice
        invoices = FeeInvoice.objects.filter(student=student)
        self.assertEqual(invoices.count(), 1)
        inv = invoices.first()
        self.assertEqual(inv.gross_amount, Decimal('45000.00'))
        self.assertEqual(inv.concession_amount, Decimal('25000.00'))
        self.assertEqual(inv.net_amount, Decimal('20000.00'))
        self.assertEqual(inv.paid_amount, Decimal('10000.00'))
        self.assertEqual(inv.outstanding_amount, Decimal('10000.00'))

        # 2. Carry Forward
        cf = FeeCarryForward.objects.filter(student=student).first()
        self.assertIsNotNone(cf)
        self.assertEqual(cf.carry_forward_amount, Decimal('5000.00'))
        self.assertEqual(cf.paid_amount, Decimal('3000.00'))
        self.assertEqual(cf.written_off_amount, Decimal('1000.00'))
        self.assertEqual(cf.status, 'PARTIALLY_PAID')

        # 3. Cash Ledgers
        payments = Payment.objects.filter(student=student)
        self.assertEqual(payments.count(), 2) # 1 for current tuition, 1 for past due
        self.assertEqual(payments.filter(invoice=inv, amount=Decimal('10000.00')).count(), 1)
        self.assertEqual(payments.filter(invoice=inv, amount=Decimal('3000.00')).count(), 1)
