from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse

from accounts.models import User
from tenants.models import Tenant, Branch, AcademicYear, Zone
from students.models import Student, ClassSection
from staff.models import TeacherProfile, TeacherAssignment
from academics.models import AcademicSubject
from timetable.models import TimetableSlot, Period


class StudentAccessPolicyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(
            name='Students Tenant',
            owner_email='owner@students.test',
            city='City',
            state='State',
            pincode='123456',
        )
        self.zone = Zone.objects.create(name='Students Zone', tenant=self.tenant)
        self.branch = Branch.objects.create(
            name='Students Branch',
            branch_code='STU1',
            tenant=self.tenant,
            zone=self.zone,
        )
        self.ay = AcademicYear.objects.create(
            name='2026-27',
            tenant=self.tenant,
            start_date='2026-06-01',
            end_date='2027-05-31',
        )
        self.student = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            first_name='A',
            last_name='Student',
            date_of_birth='2010-01-01',
            status='ACTIVE',
        )

    def test_chief_accountant_cannot_access_students_api(self):
        user = User.objects.create_user(
            email='chief@students.test',
            password='password123',
            tenant=self.tenant,
            role='CHIEF_ACCOUNTANT',
        )
        self.client.force_authenticate(user=user)
        response = self.client.get(reverse('student-list'))
        self.assertEqual(response.status_code, 403)
        self.assertIn('academic', str(response.data).lower())


class TeacherYearPromotionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(
            name='Test Tenant',
            owner_email='owner@test.org',
            city='City',
            state='State',
            pincode='123456',
        )
        self.zone = Zone.objects.create(name='Test Zone', tenant=self.tenant)
        self.branch = Branch.objects.create(
            name='Test Branch',
            branch_code='TB1',
            tenant=self.tenant,
            zone=self.zone,
        )
        
        # Create active and inactive academic years
        self.ay_active = AcademicYear.objects.create(
            name='2026-27',
            tenant=self.tenant,
            start_date='2026-06-01',
            end_date='2027-05-31',
            is_active=True,
            status='ACTIVE',
        )
        self.ay_inactive = AcademicYear.objects.create(
            name='2025-26',
            tenant=self.tenant,
            start_date='2025-06-01',
            end_date='2026-05-31',
            is_active=False,
            status='CLOSED',
        )
        
        # Create class sections
        self.cs_active = ClassSection.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay_active,
            grade='GRADE_10',
            section='A',
            display_name='Grade 10 - Section A (Active)',
        )
        self.cs_inactive = ClassSection.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay_inactive,
            grade='GRADE_9',
            section='A',
            display_name='Grade 9 - Section A (Inactive)',
        )
        
        # Create teacher user
        self.teacher_user = User.objects.create_user(
            email='teacher@test.org',
            password='password123',
            tenant=self.tenant,
            branch=self.branch,
            role='TEACHER',
            first_name='John',
            last_name='Doe',
        )
        self.teacher_profile = TeacherProfile.objects.create(
            tenant=self.tenant,
            user=self.teacher_user,
            branch=self.branch,
        )
        
        # Create subject and period
        self.subject = AcademicSubject.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            name='Mathematics',
            
        )
        self.period = Period.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            name='Period 1',
            start_time='08:00:00',
            end_time='09:00:00',
            order=1,
        )
        
        # Create teacher assignments for both active and inactive years
        self.ta_active = TeacherAssignment.objects.create(
            tenant=self.tenant,
            staff=self.teacher_profile,
            class_section=self.cs_active,
            subject=None,
            academic_year=self.ay_active,
            role='CLASS_TEACHER',
        )
        self.ta_inactive = TeacherAssignment.objects.create(
            tenant=self.tenant,
            staff=self.teacher_profile,
            class_section=self.cs_inactive,
            subject=None,
            academic_year=self.ay_inactive,
            role='CLASS_TEACHER',
        )
        
        # Create students
        self.student_active = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay_active,
            class_section=self.cs_active,
            first_name='Active',
            last_name='Student',
            date_of_birth='2010-01-01',
            status='ACTIVE',
        )
        self.student_inactive = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay_inactive,
            class_section=self.cs_inactive,
            first_name='Inactive',
            last_name='Student',
            date_of_birth='2009-01-01',
            status='ACTIVE',
        )

    def test_teacher_class_section_list_only_active_year(self):
        self.client.force_authenticate(user=self.teacher_user)
        
        # 1. Normal list - should fallback to active year
        response = self.client.get(reverse('classsection-list'))
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        class_ids = [item['id'] for item in data]
        self.assertIn(str(self.cs_active.id), class_ids)
        self.assertNotIn(str(self.cs_inactive.id), class_ids)
        
        # 2. Teacher only list - should only return active year class
        response = self.client.get(reverse('classsection-list') + '?teacher_only=true')
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        class_ids = [item['id'] for item in data]
        self.assertIn(str(self.cs_active.id), class_ids)
        self.assertNotIn(str(self.cs_inactive.id), class_ids)

    def test_teacher_student_list_only_active_year(self):
        self.client.force_authenticate(user=self.teacher_user)
        response = self.client.get(reverse('student-list'))
        self.assertEqual(response.status_code, 200)
        data = response.data['results']
        student_ids = [item['id'] for item in data]
        self.assertIn(str(self.student_active.id), student_ids)
        self.assertNotIn(str(self.student_inactive.id), student_ids)

    def test_teacher_dashboard_only_active_year(self):
        self.client.force_authenticate(user=self.teacher_user)
        
        # Add a timetable slot for both classes to test timetable active filtering
        from accounts.teacher_views import WEEKDAY_MAP
        from datetime import date
        today_day = WEEKDAY_MAP.get(date.today().weekday(), 'MON')
        
        TimetableSlot.objects.create(
            tenant=self.tenant,
            class_section=self.cs_active,
            period=self.period,
            day_of_week=today_day,
            subject=self.subject,
            teacher=self.teacher_profile,
        )
        TimetableSlot.objects.create(
            tenant=self.tenant,
            class_section=self.cs_inactive,
            period=self.period,
            day_of_week=today_day,
            subject=self.subject,
            teacher=self.teacher_profile,
        )

        response = self.client.get('/api/v1/teacher/dashboard/')
        self.assertEqual(response.status_code, 200)
        dash_data = response.data['data']
        
        # Verify assigned classes are only active
        assigned_classes = dash_data['assigned_classes']
        class_ids = [c['id'] for c in assigned_classes]
        self.assertIn(str(self.cs_active.id), class_ids)
        self.assertNotIn(str(self.cs_inactive.id), class_ids)
        
        # Verify timetable only shows active class
        schedule = dash_data['today_schedule']
        class_names = [s['class_name'] for s in schedule]
        self.assertIn(self.cs_active.display_name, class_names)
        self.assertNotIn(self.cs_inactive.display_name, class_names)

