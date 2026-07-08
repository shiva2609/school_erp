from django.test import TransactionTestCase
from decimal import Decimal
from datetime import date
from rest_framework.test import APIClient
from accounts.models import User
from tenants.models import Tenant, Branch, AcademicYear
from students.models import Student
from fees.models import FeeInvoice, Payment
from expenses.models import TransactionLog
from django.urls import reverse

class FinancialIntegrityTests(TransactionTestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Test Tenant', owner_email='admin@test.com', city='City', state='State', pincode='123456')
        self.branch = Branch.objects.create(name='Test Branch', tenant=self.tenant)
        self.ay = AcademicYear.objects.create(name='2026-27', tenant=self.tenant, start_date='2026-06-01', end_date='2027-05-31')
        
        self.user = User.objects.create_user(
            email='admin@test.com', 
            password='password123',
            tenant=self.tenant,
            branch=self.branch,
            role='BRANCH_ADMIN'
        )
        self.client.force_authenticate(user=self.user)
        
        self.student = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            first_name='John',
            last_name='Doe',
            date_of_birth='2010-01-01',
            status='ACTIVE'
        )
        
    def test_invoice_balance_equals_payments_sum(self):
        """Sum of payment amounts == invoice.paid_amount for every invoice."""
        invoice = FeeInvoice.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            student=self.student,
            invoice_number='INV-202604-001',
            month='2026-04',
            due_date=date(2026, 4, 30),
            gross_amount=Decimal('1000.00'),
            net_amount=Decimal('1000.00'),
            outstanding_amount=Decimal('1000.00'),
            status='DRAFT'
        )
        
        # Payment 1
        url = reverse('payment-record-offline')
        response = self.client.post(url, {
            'invoice_id': invoice.id,
            'amount': '300.00',
            'payment_mode': 'CASH',
            'payment_date': '2026-04-10'
        }, format='json')
        self.assertEqual(response.status_code, 201)
        
        # Payment 2
        response = self.client.post(url, {
            'invoice_id': invoice.id,
            'amount': '200.00',
            'payment_mode': 'CASH',
            'payment_date': '2026-04-12'
        }, format='json')
        self.assertEqual(response.status_code, 201)
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.paid_amount, Decimal('500.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('500.00'))
        self.assertEqual(invoice.status, 'PARTIALLY_PAID')

    def test_no_overpayment_possible(self):
        """Payment > outstanding_amount is rejected."""
        invoice = FeeInvoice.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            student=self.student,
            invoice_number='INV-202604-002',
            month='2026-04',
            due_date=date(2026, 4, 30),
            gross_amount=Decimal('1000.00'),
            net_amount=Decimal('1000.00'),
            outstanding_amount=Decimal('1000.00'),
            status='SENT'
        )
        
        url = reverse('payment-record-offline')
        response = self.client.post(url, {
            'invoice_id': invoice.id,
            'amount': '1500.00',
            'payment_mode': 'CASH',
            'payment_date': '2026-04-10'
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Amount exceeds outstanding balance', response.data['detail'])

    def test_payment_creates_transaction_log(self):
        """Completed payment creates a TransactionLog entry for INCOME."""
        invoice = FeeInvoice.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            student=self.student,
            invoice_number='INV-202604-003',
            month='2026-04',
            due_date=date(2026, 4, 30),
            gross_amount=Decimal('1000.00'),
            net_amount=Decimal('1000.00'),
            outstanding_amount=Decimal('1000.00'),
            status='SENT'
        )
        url = reverse('payment-record-offline')
        self.client.post(url, {
            'invoice_id': invoice.id,
            'amount': '400.00',
            'payment_mode': 'UPI',
            'payment_date': '2026-04-10',
            'reference_number': 'UPI123456789'
        }, format='json')
        
        logs = TransactionLog.objects.filter(transaction_type='INCOME', reference_model='Payment')
        self.assertEqual(logs.count(), 1)
        self.assertEqual(logs.first().amount, Decimal('400.00'))

    def test_cancel_invoice_with_payments_rejected(self):
        """Cannot cancel an invoice that already has payments."""
        invoice = FeeInvoice.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            student=self.student,
            invoice_number='INV-202604-004',
            month='2026-04',
            due_date=date(2026, 4, 30),
            gross_amount=Decimal('1000.00'),
            net_amount=Decimal('1000.00'),
            outstanding_amount=Decimal('500.00'),
            paid_amount=Decimal('500.00'),
            status='PARTIALLY_PAID'
        )
        
        url = reverse('feeinvoice-cancel', args=[invoice.id])
        response = self.client.patch(url, {'reason': 'Testing cancellation'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Cannot cancel an invoice with recorded payments', response.data['detail'])
