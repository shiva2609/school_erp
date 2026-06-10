from decimal import Decimal
from datetime import date
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from students.models import ClassSection, Student
from tenants.models import Tenant, Branch, AcademicYear, Zone
from transport.models import TransportFeeEnrollment
from fees.models import FeeInvoice, Payment


class TransportFeeEnrollmentApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(
            name='Test School Tenant', owner_email='owner@test.edu', city='City', state='State', pincode='123456'
        )
        self.zone = Zone.objects.create(name='Zone 1', tenant=self.tenant)
        self.branch = Branch.objects.create(
            name='Primary Branch', tenant=self.tenant, zone=self.zone, branch_code='PB01'
        )
        self.ay = AcademicYear.objects.create(
            name='2026-2027', tenant=self.tenant, start_date='2026-06-01', end_date='2027-05-31'
        )
        self.cs = ClassSection.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            grade='5',
            section='B',
        )
        self.accountant_user = User.objects.create_user(
            email='accountant@test.edu',
            password='securepassword',
            tenant=self.tenant,
            branch=self.branch,
            role='ACCOUNTANT',
            first_name='Acc',
            last_name='One',
        )
        self.student = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            class_section=self.cs,
            admission_number='TS001',
            first_name='Ada',
            last_name='Lovelace',
            date_of_birth='2015-01-01',
            gender='FEMALE',
            status='ACTIVE',
        )

    def test_enroll_student_in_transport(self):
        self.client.force_authenticate(self.accountant_user)
        payload = {
            'student_id': str(self.student.id),
            'academic_year_id': str(self.ay.id),
            'agreed_amount': '12500.00',
            'pickup_point': 'Apollo Square'
        }
        r = self.client.post('/api/v1/transport/enrollments/', payload, format='json')
        self.assertEqual(r.status_code, 201)
        
        # Verify enrollment database record
        enrollment = TransportFeeEnrollment.objects.get(student=self.student, academic_year=self.ay)
        self.assertEqual(enrollment.agreed_amount, Decimal('12500.00'))
        self.assertEqual(enrollment.pickup_point, 'Apollo Square')

        # Verify corresponding FeeInvoice creation
        invoice = FeeInvoice.objects.get(student=self.student, academic_year=self.ay, invoice_number__startswith='TRN-ANN-')
        self.assertEqual(invoice.gross_amount, Decimal('12500.00'))
        self.assertEqual(invoice.outstanding_amount, Decimal('12500.00'))
        self.assertEqual(invoice.net_amount, Decimal('12500.00'))
        self.assertEqual(invoice.paid_amount, Decimal('0.00'))
        self.assertEqual(invoice.status, 'SENT')

    def test_enroll_student_already_enrolled(self):
        self.client.force_authenticate(self.accountant_user)
        TransportFeeEnrollment.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            student=self.student,
            academic_year=self.ay,
            agreed_amount=Decimal('10000.00'),
            pickup_point='Legacy'
        )

        payload = {
            'student_id': str(self.student.id),
            'academic_year_id': str(self.ay.id),
            'agreed_amount': '12500.00',
            'pickup_point': 'Apollo Square'
        }
        r = self.client.post('/api/v1/transport/enrollments/', payload, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('already enrolled', r.data['detail'])

    def test_cancel_enrollment_no_payment(self):
        self.client.force_authenticate(self.accountant_user)
        # Create enrollment and invoice
        payload = {
            'student_id': str(self.student.id),
            'academic_year_id': str(self.ay.id),
            'agreed_amount': '8000.00',
            'pickup_point': 'North Gate'
        }
        r_create = self.client.post('/api/v1/transport/enrollments/', payload, format='json')
        self.assertEqual(r_create.status_code, 201)
        enrollment_id = r_create.data['id']

        # Confirm existence in db
        self.assertTrue(TransportFeeEnrollment.objects.filter(id=enrollment_id).exists())
        self.assertTrue(FeeInvoice.objects.filter(student=self.student, academic_year=self.ay, invoice_number__startswith='TRN-ANN-').exists())

        # Call destroy endpoint to unregister/cancel
        r_delete = self.client.delete(f'/api/v1/transport/enrollments/{enrollment_id}/')
        self.assertEqual(r_delete.status_code, 204)

        # Verify deletion from db
        self.assertFalse(TransportFeeEnrollment.objects.filter(id=enrollment_id).exists())
        self.assertFalse(FeeInvoice.objects.filter(student=self.student, academic_year=self.ay, invoice_number__startswith='TRN-ANN-').exists())

    def test_cancel_enrollment_with_payment(self):
        self.client.force_authenticate(self.accountant_user)
        # Create enrollment and invoice
        payload = {
            'student_id': str(self.student.id),
            'academic_year_id': str(self.ay.id),
            'agreed_amount': '15000.00',
            'pickup_point': 'South Station'
        }
        r_create = self.client.post('/api/v1/transport/enrollments/', payload, format='json')
        self.assertEqual(r_create.status_code, 201)
        enrollment_id = r_create.data['id']

        # Get invoice
        invoice = FeeInvoice.objects.get(student=self.student, academic_year=self.ay, invoice_number__startswith='TRN-ANN-')
        
        # Record a payment
        Payment.objects.create(
            tenant=self.tenant,
            invoice=invoice,
            student=self.student,
            branch=self.branch,
            amount=Decimal('5000.00'),
            payment_mode='CASH',
            payment_date=date.today(),
            status='COMPLETED',
            receipt_number='RCP-TEST-001'
        )
        invoice.paid_amount = Decimal('5000.00')
        invoice.outstanding_amount = Decimal('10000.00')
        invoice.save()

        # Try to delete/cancel the enrollment
        r_delete = self.client.delete(f'/api/v1/transport/enrollments/{enrollment_id}/')
        self.assertEqual(r_delete.status_code, 400)
        self.assertIn('recorded', r_delete.data['detail'])

        # Verify records are NOT deleted
        self.assertTrue(TransportFeeEnrollment.objects.filter(id=enrollment_id).exists())
        self.assertTrue(FeeInvoice.objects.filter(id=invoice.id).exists())
