import json
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from students.models import ClassSection, Student
from tenants.models import Tenant, Branch
from staff.models import TeacherProfile, TeacherAssignment
from tenants.models import AcademicYear

class StudentAPIErrorTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Test Tenant')
        self.branch = Branch.objects.create(name='Test Branch', tenant=self.tenant)
        self.ay = AcademicYear.objects.create(name='2024-2025', tenant=self.tenant, is_active=True, start_date='2024-04-01', end_date='2025-03-31')
        from timetable.models import Subject
        self.subject = Subject.objects.create(tenant=self.tenant, branch=self.branch, name='Math')
        
        self.teacher_user = User.objects.create_user(
            email='teacher@test.com',
            password='password123',
            role='TEACHER',
            tenant=self.tenant,
            branch=self.branch
        )
        self.teacher_profile = TeacherProfile.objects.create(user=self.teacher_user, tenant=self.tenant, branch=self.branch, employee_id='T01')
        
        self.class_section = ClassSection.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            grade='10',
            section='A',
            display_name='10-A'
        )
        TeacherAssignment.objects.create(
            tenant=self.tenant,
            teacher=self.teacher_profile,
            class_section=self.class_section,
            academic_year=self.ay,
            subject=self.subject,
            is_class_teacher=True
        )
        
        self.student = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            class_section=self.class_section,
            first_name='John',
            last_name='Doe',
            date_of_birth='2015-05-15',
            admission_number='ADM001',
            status='ACTIVE'
        )

    def test_students_endpoint(self):
        c = APIClient()
        c.force_authenticate(user=self.teacher_user)
        
        url = f'/api/v1/classes/{self.class_section.id}/students/'
        response = c.get(url)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.content.decode('utf-8')}")

    def test_attendance_endpoint(self):
        c = APIClient()
        c.force_authenticate(user=self.teacher_user)
        
        url = f'/api/v1/attendance/?class_section_id={self.class_section.id}&date=2024-05-15'
        response = c.get(url)
        print(f"Attendance Status: {response.status_code}")
        print(f"Attendance Response: {response.content.decode('utf-8')}")


