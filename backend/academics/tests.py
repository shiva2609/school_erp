from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from academics.models import ExamResult, ExamTerm
from staff.models import TeacherProfile, TeacherAssignment
from students.models import ClassSection, Student
from tenants.models import Tenant, Branch, AcademicYear, Zone
from timetable.models import Subject


class TeacherMarksApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(
            name='Marks School', owner_email='o@marks.edu', city='C', state='S', pincode='111111'
        )
        self.zone = Zone.objects.create(name='Z1', tenant=self.tenant)
        self.branch = Branch.objects.create(
            name='Main', tenant=self.tenant, zone=self.zone, branch_code='MS1'
        )
        self.ay = AcademicYear.objects.create(
            name='2026-27', tenant=self.tenant, start_date='2026-06-01', end_date='2027-05-31'
        )
        self.cs = ClassSection.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            grade='5',
            section='A',
        )
        self.subject = Subject.objects.create(
            tenant=self.tenant, branch=self.branch, name='Mathematics', code='MAT'
        )
        self.exam = ExamTerm.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            name='Mid Term',
            start_date='2026-10-01',
            end_date='2026-10-15',
        )
        self.teacher_user = User.objects.create_user(
            email='teacher@marks.edu',
            password='pass12345',
            tenant=self.tenant,
            branch=self.branch,
            role='TEACHER',
            first_name='T',
            last_name='One',
        )
        self.profile = TeacherProfile.objects.create(
            user=self.teacher_user, tenant=self.tenant, branch=self.branch
        )
        TeacherAssignment.objects.create(
            tenant=self.tenant,
            teacher=self.profile,
            class_section=self.cs,
            subject=self.subject,
            academic_year=self.ay,
        )
        self.student = Student.objects.create(
            tenant=self.tenant,
            branch=self.branch,
            academic_year=self.ay,
            class_section=self.cs,
            admission_number='S001',
            first_name='Ada',
            last_name='Lovelace',
            date_of_birth='2015-01-01',
            gender='FEMALE',
            status='ACTIVE',
        )
        self.other_teacher = User.objects.create_user(
            email='other@marks.edu',
            password='pass12345',
            tenant=self.tenant,
            branch=self.branch,
            role='TEACHER',
            first_name='Other',
            last_name='Teacher',
        )
        TeacherProfile.objects.create(user=self.other_teacher, tenant=self.tenant, branch=self.branch)

    def test_marks_context_lists_assignment_and_exam(self):
        self.client.force_authenticate(self.teacher_user)
        r = self.client.get('/api/v1/academics/marks/context/')
        self.assertEqual(r.status_code, 200)
        data = r.data['data']
        self.assertEqual(len(data['assignments']), 1)
        self.assertEqual(len(data['exam_terms']), 1)
        self.assertEqual(data['exam_terms'][0]['name'], 'Mid Term')

    def test_marks_grid_and_bulk_save(self):
        self.client.force_authenticate(self.teacher_user)
        gr = self.client.get(
            '/api/v1/academics/marks/grid/',
            {
                'exam_term_id': str(self.exam.id),
                'class_section_id': str(self.cs.id),
                'subject_id': str(self.subject.id),
            },
        )
        self.assertEqual(gr.status_code, 200)
        self.assertEqual(len(gr.data['data']['students']), 1)

        payload = {
            'exam_term_id': str(self.exam.id),
            'class_section_id': str(self.cs.id),
            'subject_id': str(self.subject.id),
            'default_max_marks': '50',
            'rows': [{'student_id': str(self.student.id), 'marks_obtained': '42'}],
        }
        br = self.client.post('/api/v1/academics/marks/bulk/', payload, format='json')
        self.assertEqual(br.status_code, 200)
        self.assertEqual(br.data['data']['saved'], 1)
        self.assertEqual(br.data['data']['errors'], [])

        er = ExamResult.objects.get(student=self.student, exam_term=self.exam, subject=self.subject)
        self.assertEqual(er.marks_obtained, Decimal('42'))
        self.assertEqual(er.max_marks, Decimal('50'))
        self.assertEqual(er.evaluator_id, self.teacher_user.id)

    def test_unassigned_teacher_forbidden_on_bulk(self):
        self.client.force_authenticate(self.other_teacher)
        payload = {
            'exam_term_id': str(self.exam.id),
            'class_section_id': str(self.cs.id),
            'subject_id': str(self.subject.id),
            'rows': [{'student_id': str(self.student.id), 'marks_obtained': '10'}],
        }
        br = self.client.post('/api/v1/academics/marks/bulk/', payload, format='json')
        self.assertEqual(br.status_code, 403)
