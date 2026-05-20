from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.utils import timezone
from datetime import timedelta
from accounts.models import User
from tenants.models import Tenant, Branch, Zone, AcademicYear
from students.models import Student, ParentStudentRelation, ClassSection
from announcements.models import Announcement, AnnouncementReadReceipt
from announcements.services import publish_announcement, AnnouncementPublishError
from announcements.tasks import publish_scheduled_announcements

class AnnouncementsSystemTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant & Branch A setup
        self.tenant_a = Tenant.objects.create(
            name='Tenant A', owner_email='a@school.com', city='City', state='State', pincode='123456'
        )
        self.zone_a = Zone.objects.create(name='Zone A', tenant=self.tenant_a)
        self.branch_a = Branch.objects.create(
            name='Branch A', tenant=self.tenant_a, zone=self.zone_a, branch_code='A1'
        )
        self.ay_a = AcademicYear.objects.create(
            name='2026-27', tenant=self.tenant_a, start_date='2026-06-01', end_date='2027-05-31'
        )

        # Tenant & Branch B setup (isolation testing)
        self.tenant_b = Tenant.objects.create(
            name='Tenant B', owner_email='b@school.com', city='City', state='State', pincode='123456'
        )
        self.zone_b = Zone.objects.create(name='Zone B', tenant=self.tenant_b)
        self.branch_b = Branch.objects.create(
            name='Branch B', tenant=self.tenant_b, zone=self.zone_b, branch_code='B1'
        )

        # Users Setup
        # Branch A Admin
        self.branch_a_admin = User.objects.create_user(
            email='admin_a@school.com', password='password123',
            tenant=self.tenant_a, branch=self.branch_a, role='BRANCH_ADMIN'
        )
        # Branch B Admin
        self.branch_b_admin = User.objects.create_user(
            email='admin_b@school.com', password='password123',
            tenant=self.tenant_b, branch=self.branch_b, role='BRANCH_ADMIN'
        )
        # Super admin (Tenant scoped)
        self.super_admin = User.objects.create_user(
            email='super_admin@school.com', password='password123',
            tenant=self.tenant_a, branch=None, role='SUPER_ADMIN'
        )
        # Teacher A
        self.teacher_a = User.objects.create_user(
            email='teacher_a@school.com', password='password123',
            tenant=self.tenant_a, branch=self.branch_a, role='TEACHER'
        )
        # Teacher B (Isolation testing)
        self.teacher_b = User.objects.create_user(
            email='teacher_b@school.com', password='password123',
            tenant=self.tenant_a, branch=self.branch_a, role='TEACHER'
        )
        # Parent A
        self.parent_a = User.objects.create_user(
            email='parent_a@school.com', password='password123',
            tenant=self.tenant_a, branch=self.branch_a, role='PARENT'
        )

        # Class Section
        self.class_a = ClassSection.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            academic_year=self.ay_a,
            grade='1',
            section='A'
        )

        # Link parent A to a student in Branch A, Grade 1
        self.student_a = Student.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            academic_year=self.ay_a,
            class_section=self.class_a,
            first_name='Kid',
            last_name='A',
            date_of_birth='2018-01-01',
            status='ACTIVE'
        )
        ParentStudentRelation.objects.create(
            parent=self.parent_a,
            student=self.student_a,
            relation_type='FATHER'
        )

    def test_publish_announcement_service_success(self):
        """Service publishes an announcement draft and resolves active recipients."""
        ann = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            created_by=self.branch_a_admin,
            title='Staff Meeting',
            body='Meeting at 4pm',
            target_audience='TEACHERS',
            is_published=False
        )
        self.assertFalse(ann.is_published)
        self.assertIsNone(ann.published_at)

        # Publish through service
        published_ann = publish_announcement(ann)
        self.assertTrue(published_ann.is_published)
        self.assertIsNotNone(published_ann.published_at)

    def test_publish_announcement_service_fails_when_no_recipients(self):
        """Service raises exception if target audience matches zero active users."""
        ann = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_b,  # Branch B has no teachers in tenant A (tenant_a)
            created_by=self.branch_a_admin,
            title='Empty announcement',
            body='No one will read this',
            target_audience='TEACHERS',
            is_published=False
        )
        with self.assertRaises(AnnouncementPublishError):
            publish_announcement(ann)

    def test_scheduled_publishing_celery_task(self):
        """Celery scheduled task scans and publishes due announcements."""
        ann = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            created_by=self.branch_a_admin,
            title='Scheduled Bulletin',
            body='This was scheduled',
            target_audience='ALL',
            is_published=False,
            scheduled_for=timezone.now() - timedelta(minutes=1)
        )
        stats = publish_scheduled_announcements()
        self.assertEqual(stats['published'], 1)
        self.assertEqual(stats['errors'], 0)

        # Verify that it is now published
        ann.refresh_from_db()
        self.assertTrue(ann.is_published)
        self.assertIsNotNone(ann.published_at)

    def test_admin_branch_isolation_on_viewset(self):
        """Admins can only CRUD announcements scoped to their branch."""
        # Create notice for Branch A
        notice_a = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            created_by=self.branch_a_admin,
            title='Notice A',
            body='Scope branch A',
            target_audience='ALL',
            is_published=True,
            published_at=timezone.now()
        )
        
        # Create notice for Branch B (different tenant or branch)
        notice_b = Announcement.objects.create(
            tenant=self.tenant_b,
            branch=self.branch_b,
            created_by=self.branch_b_admin,
            title='Notice B',
            body='Scope branch B',
            target_audience='ALL',
            is_published=True,
            published_at=timezone.now()
        )

        # Authenticate Branch A admin
        self.client.force_authenticate(user=self.branch_a_admin)
        url = reverse('announcement-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        # Branch A admin should see Notice A but NOT Notice B
        notice_ids = [n['id'] for n in response.data.get('results', response.data)]
        self.assertIn(str(notice_a.id), notice_ids)
        self.assertNotIn(str(notice_b.id), notice_ids)

        # Hitting retrieve / delete on Notice B returns 404 (isolation works)
        detail_url = reverse('announcement-detail', args=[notice_b.id])
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, 404)

    def test_teacher_recipient_filtering_on_viewset(self):
        """Teachers only see announcements matching their assigned branch and role."""
        # 1. Staff notice (matching teacher branch)
        notice_staff = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            title='Staff Notice',
            body='General staff notice',
            target_audience='STAFF',
            is_published=True,
            published_at=timezone.now()
        )

        # 2. Teachers notice (matching teacher branch)
        notice_teachers = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            title='Teachers Notice',
            body='Teacher specific notice',
            target_audience='TEACHERS',
            is_published=True,
            published_at=timezone.now()
        )

        # 3. Direct Message (CONFIDENTIAL) notice matching this teacher's email
        notice_dm_matching = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            title='Your Pay slip',
            body='Confidential payroll slip',
            target_audience='INDIVIDUAL',
            recipient_email=self.teacher_a.email,
            is_published=True,
            published_at=timezone.now()
        )

        # 4. Direct Message notice targeted to someone else (should NOT leak)
        notice_dm_other = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            title='Someone Else Slip',
            body='Confidential payroll slip of teacher X',
            target_audience='INDIVIDUAL',
            recipient_email='someoneelse@school.com',
            is_published=True,
            published_at=timezone.now()
        )

        # Authenticate Teacher A
        self.client.force_authenticate(user=self.teacher_a)
        url = reverse('announcement-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        notice_ids = [n['id'] for n in response.data.get('results', response.data)]
        self.assertIn(str(notice_staff.id), notice_ids)
        self.assertIn(str(notice_teachers.id), notice_ids)
        self.assertIn(str(notice_dm_matching.id), notice_ids)
        self.assertNotIn(str(notice_dm_other.id), notice_ids)  # VITAL Isolation check

    def test_parent_scoped_announcements_view(self):
        """Parents only see notices matching their active branches and target audience."""
        # General notice for parents in Branch A
        notice_parents = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            title='Parent Notice',
            body='General parents meeting info',
            target_audience='PARENTS',
            is_published=True,
            published_at=timezone.now()
        )

        # Class notice matching parent's student section
        notice_class = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            title='Class A Notice',
            body='Grade 1-A specific updates',
            target_audience='CLASS',
            is_published=True,
            published_at=timezone.now()
        )
        notice_class.target_classes.add(self.class_a)

        # Authenticate Parent A
        self.client.force_authenticate(user=self.parent_a)
        url = reverse('parent_announcements')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        notice_ids = [n['id'] for n in response.data['data']]
        self.assertIn(str(notice_parents.id), notice_ids)
        self.assertIn(str(notice_class.id), notice_ids)

    def test_read_receipts_and_is_read_flag(self):
        """Hitting mark-read endpoint creates receipt and computes is_read properly."""
        notice = Announcement.objects.create(
            tenant=self.tenant_a,
            branch=self.branch_a,
            title='Notice to Read',
            body='Please read this and mark it done',
            target_audience='TEACHERS',
            is_published=True,
            published_at=timezone.now()
        )

        self.client.force_authenticate(user=self.teacher_a)
        
        # 1. Fetch initially - should be marked as unread (is_read=False)
        url = reverse('announcement-list')
        response = self.client.get(url)
        notice_data = next(n for n in response.data.get('results', response.data) if n['id'] == str(notice.id))
        self.assertFalse(notice_data['is_read'])

        # 2. Mark as read
        mark_read_url = reverse('announcement-mark-read', args=[notice.id])
        response = self.client.post(mark_read_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])

        # 3. Fetch again - should now be is_read=True
        response = self.client.get(url)
        notice_data = next(n for n in response.data.get('results', response.data) if n['id'] == str(notice.id))
        self.assertTrue(notice_data['is_read'])
