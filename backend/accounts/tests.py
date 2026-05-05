from django.test import TestCase
from datetime import date
from rest_framework.test import APIClient
from accounts.models import User
from tenants.models import Tenant, Branch, AcademicYear, Zone
from students.models import Student
from fees.models import FeeInvoice
from django.urls import reverse
from accounts.permissions import normalize_role, get_user_scope
from accounts.utils import apply_scope_filter

class SecurityAndIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Tenant A Setup
        self.tenant_a = Tenant.objects.create(name='School A', owner_email='a@schoola.com', city='City', state='State', pincode='123456')
        self.zone_a = Zone.objects.create(name='Zone A', tenant=self.tenant_a)
        self.branch_a = Branch.objects.create(name='Branch A', tenant=self.tenant_a, zone=self.zone_a, branch_code='A1')
        self.ay_a = AcademicYear.objects.create(name='2026-27', tenant=self.tenant_a, start_date='2026-06-01', end_date='2027-05-31')
        self.user_a = User.objects.create_user(email='admin@schoola.com', password='password123', tenant=self.tenant_a, branch=self.branch_a, role='SUPER_ADMIN')
        
        # Tenant B Setup
        self.tenant_b = Tenant.objects.create(name='School B', owner_email='b@schoolb.com', city='City', state='State', pincode='123456')
        self.zone_b = Zone.objects.create(name='Zone B', tenant=self.tenant_b)
        self.branch_b = Branch.objects.create(name='Branch B', tenant=self.tenant_b, zone=self.zone_b, branch_code='B1')
        self.ay_b = AcademicYear.objects.create(name='2026-27', tenant=self.tenant_b, start_date='2026-06-01', end_date='2027-05-31')
        self.user_b = User.objects.create_user(email='admin@schoolb.com', password='password123', tenant=self.tenant_b, branch=self.branch_b, role='SUPER_ADMIN')
        
        # Data in Tenant A
        self.student_a = Student.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            academic_year=self.ay_a,
            first_name='Student',
            last_name='A',
            date_of_birth='2010-01-01',
            status='ACTIVE'
        )
        
    def test_student_queryset_isolation(self):
        """User from Tenant B cannot see students from Tenant A."""
        self.client.force_authenticate(user=self.user_b)
        url = reverse('student-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 0)
        
        # Verify Tenant A user CAN see the student
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 1)

    def test_fee_invoice_isolation(self):
        """User from Tenant B cannot see invoices from Tenant A."""
        FeeInvoice.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            academic_year=self.ay_a,
            student=self.student_a,
            invoice_number='INV-A',
            month='2026-04',
            due_date=date(2026, 4, 30),
            gross_amount=100,
            net_amount=100,
            outstanding_amount=100
        )
        
        self.client.force_authenticate(user=self.user_b)
        url = reverse('feeinvoice-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 0)

    def test_clone_setup_cross_tenant_blocked(self):
        """School Admin cannot clone a setup from a different tenant."""
        self.client.force_authenticate(user=self.user_b)
        url = reverse('academic-year-clone-setup', args=[self.ay_a.id])
        response = self.client.post(url, {
            'name': '2027-28',
            'start_date': '2027-06-01',
            'end_date': '2028-05-31',
            'copy_fees': False
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_accountant_cannot_create_users(self):
        """ACCOUNTANT role (rank 55) cannot create other users."""
        user_c = User.objects.create_user(
            email='accountant@schoola.com', 
            password='password123', 
            tenant=self.tenant_a, 
            branch=self.branch_a, 
            role='ACCOUNTANT'
        )
        self.client.force_authenticate(user=user_c)
        url = reverse('user-list')
        response = self.client.post(url, {
            'email': 'newteacher@schoola.com',
            'password': 'password123',
            'first_name': 'New',
            'last_name': 'Teacher',
            'role': 'TEACHER',
            'branch': self.branch_a.id
        }, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertIn('You do not have permission to perform this action', str(response.data))

    def test_super_admin_tenant_validation(self):
        """OWNER cannot create a non-platform user without specifying a tenant."""
        super_admin = User.objects.create_user(
            email='super@admin.com', 
            password='password123', 
            role='OWNER'
        )
        self.client.force_authenticate(user=super_admin)
        url = reverse('user-list')
        response = self.client.post(url, {
            'email': 'someadmin@school.com',
            'password': 'password123',
            'first_name': 'Some',
            'last_name': 'Admin',
            'role': 'BRANCH_ADMIN'
        }, format='json')
        # Expect either 403 or 400 since tenant is required
        self.assertIn(response.status_code, [400, 403])
        self.assertIn('Tenant', str(response.data))


class RoleScopeCompatibilityTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Scope School',
            owner_email='owner@scope.test',
            city='City',
            state='State',
            pincode='123456',
        )
        self.zone_1 = Zone.objects.create(name='Zone 1', tenant=self.tenant)
        self.zone_2 = Zone.objects.create(name='Zone 2', tenant=self.tenant)
        self.branch_1 = Branch.objects.create(name='Branch 1', tenant=self.tenant, zone=self.zone_1, branch_code='S1')
        self.branch_2 = Branch.objects.create(name='Branch 2', tenant=self.tenant, zone=self.zone_2, branch_code='S2')
        self.ay = AcademicYear.objects.create(
            name='2026-27',
            tenant=self.tenant,
            start_date='2026-06-01',
            end_date='2027-05-31',
        )
        self.student_1 = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch_1,
            academic_year=self.ay,
            first_name='S1',
            last_name='One',
            date_of_birth='2010-01-01',
            status='ACTIVE',
        )
        self.student_2 = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch_2,
            academic_year=self.ay,
            first_name='S2',
            last_name='Two',
            date_of_birth='2010-01-02',
            status='ACTIVE',
        )

    def test_legacy_school_admin_normalizes_to_super_admin(self):
        user = User.objects.create_user(
            email='legacy@scope.test',
            password='password123',
            tenant=self.tenant,
            role='SUPER_ADMIN',
        )
        self.assertEqual(normalize_role(user.role), 'SUPER_ADMIN')
        scope = get_user_scope(user)
        self.assertEqual(scope['level'], 'tenant')
        self.assertEqual(scope['tenant_id'], self.tenant.id)

    def test_zonal_admin_scope_filters_only_zone_branches(self):
        user = User.objects.create_user(
            email='zonal@scope.test',
            password='password123',
            tenant=self.tenant,
            role='ZONAL_ADMIN',
        )
        user.zones.add(self.zone_1)
        qs = apply_scope_filter(
            Student.objects.all(),
            user,
            tenant_lookup='tenant_id',
            branch_lookup='branch_id',
            zone_lookup='branch__zone_id',
        )
        self.assertEqual(list(qs.values_list('id', flat=True)), [self.student_1.id])
