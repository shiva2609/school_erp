"""
System Validation Script
========================
Validates that the seeded test school data and all feature endpoints
are working correctly.

Usage:
    source venv/bin/activate
    python validate_system.py
"""
import os
import sys
import django
import requests

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import User
from tenants.models import Tenant, Branch, AcademicYear
from students.models import Student, ClassSection, ParentStudentRelation
from staff.models import TeacherProfile, TeacherAssignment
from fees.models import FeeStructure, FeeCategory, StudentFeeItem
from transport.models import TransportRoute, TransportRateSlab, StudentTransport

BASE_URL = 'http://localhost:8000/api'
RESULTS = []
PASS = '✓'
FAIL = '✗'


def check(label, condition, detail=''):
    status = PASS if condition else FAIL
    RESULTS.append((status, label, detail))
    print(f"  {status}  {label}" + (f" — {detail}" if detail else ''))


def section(title):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}")


def api_login(email=None, phone=None, password='password123'):
    session = requests.Session()
    payload = {'password': password}
    if email:
        payload['email'] = email
    elif phone:
        payload['email'] = phone  # Serializer expects phone in the 'email' field
    try:
        r = session.post(f'{BASE_URL}/auth/login/', json=payload, timeout=5)
        if r.status_code == 200 and 'access_token' in session.cookies:
            return session
    except Exception:
        pass
    return None


def api_get(path, session):
    try:
        r = session.get(f'{BASE_URL}/{path}', timeout=10)
        return r.status_code, r.json() if r.content else {}
    except Exception as e:
        print(f"    API Error for {path}: {e}")
        return None, str(e)


# ─────────────────────────────────────────────────────────
# 1. DB Checks
# ─────────────────────────────────────────────────────────
section("1. Database Integrity")

tenant = Tenant.objects.filter(name__icontains='test school').first()
check("Test school tenant exists", tenant is not None)

if tenant:
    branches = Branch.objects.filter(tenant=tenant, is_active=True)
    check("Has 2 branches", branches.count() == 2, f"Found {branches.count()}")

    ay = AcademicYear.objects.filter(tenant=tenant).first()
    check("Academic year exists", ay is not None)

    sections = ClassSection.objects.filter(tenant=tenant)
    check("78 class sections created", sections.count() == 78, f"Found {sections.count()}")

    students = Student.objects.filter(tenant=tenant)
    check("3000+ students seeded", students.count() >= 3000, f"Found {students.count()}")

    students_with_adm = students.exclude(admission_number='').exclude(admission_number=None)
    check("All students have admission numbers", students_with_adm.count() == students.count(),
          f"{students_with_adm.count()}/{students.count()} have admission numbers")

    # Check class teachers
    sections_with_teacher = sections.exclude(class_teacher=None)
    check("All sections have class teachers",
          sections_with_teacher.count() == sections.count(),
          f"{sections_with_teacher.count()}/{sections.count()} have teachers")

    # Teacher profiles
    teacher_users = User.objects.filter(tenant=tenant, role='TEACHER')
    teacher_profiles = TeacherProfile.objects.filter(tenant=tenant)
    check("78 teacher profiles created", teacher_profiles.count() == 78, f"Found {teacher_profiles.count()}")

    # Parent accounts
    parent_users = User.objects.filter(tenant=tenant, role='PARENT')
    check("Parent accounts created (6000+)", parent_users.count() >= 6000, f"Found {parent_users.count()}")

    relations = ParentStudentRelation.objects.filter(student__tenant=tenant)
    check("Parent-student relations exist", relations.count() >= students.count(), f"Found {relations.count()}")

    # Fee structures
    fee_structures = FeeStructure.objects.filter(tenant=tenant)
    check("26 fee structures (13 grades × 2 branches)", fee_structures.count() == 26, f"Found {fee_structures.count()}")

    student_fee_items = StudentFeeItem.objects.filter(student__tenant=tenant)
    check("Student fee items created", student_fee_items.count() > 0, f"Found {student_fee_items.count()}")

    # Transport
    routes = TransportRoute.objects.filter(tenant=tenant)
    check("Transport routes created", routes.count() >= 4, f"Found {routes.count()}")

    slabs = TransportRateSlab.objects.filter(tenant=tenant)
    check("Transport rate slabs created", slabs.count() >= 4, f"Found {slabs.count()}")

    transport_students = StudentTransport.objects.filter(student__tenant=tenant, is_active=True)
    check("~20% students opted into transport",
          transport_students.count() > 400,
          f"Found {transport_students.count()} ({transport_students.count()*100//students.count()}%)")

    # Transport fee items for opted-in students
    transport_fee_items = student_fee_items.filter(category__code='TRANSPORT')
    check("Transport fee items match opted-in students",
          transport_fee_items.count() == transport_students.count(),
          f"Fee items: {transport_fee_items.count()}, Opted-in: {transport_students.count()}")


# ─────────────────────────────────────────────────────────
# 2. API Login Tests
# ─────────────────────────────────────────────────────────
section("2. Authentication")

# Sample a parent user
parent_user = User.objects.filter(tenant=tenant, role='PARENT').first()
parent_token = None
if parent_user:
    parent_token = api_login(email=parent_user.email)
    check("Parent login via email", parent_token is not None, parent_user.email)

    # Also test phone login
    if parent_user.phone:
        phone_token = api_login(phone=parent_user.phone)
        check("Parent login via phone", phone_token is not None, parent_user.phone)

# Sample a teacher
teacher_user = User.objects.filter(tenant=tenant, role='TEACHER').first()
teacher_token = None
if teacher_user:
    teacher_token = api_login(email=teacher_user.email)
    check("Teacher login", teacher_token is not None, teacher_user.email)

# Branch admin (if any)
admin_user = User.objects.filter(tenant=tenant, role__in=['SUPER_ADMIN', 'BRANCH_ADMIN']).first()
admin_token = None
if admin_user:
    admin_token = api_login(email=admin_user.email)
    check("Admin login", admin_token is not None, admin_user.email)
else:
    check("Admin user exists", False, "No admin user for test school — skipping admin tests")


# ─────────────────────────────────────────────────────────
# 3. Parent Portal API
# ─────────────────────────────────────────────────────────
section("3. Parent Portal API")

if parent_token:
    status, data = api_get('parent/children/', parent_token)
    check("GET parent/children/ returns 200", status == 200, f"Status: {status}")

    if status == 200:
        children = data.get('data', [])
        check("Children list not empty", len(children) > 0, f"Found {len(children)} children")

        if children:
            child = children[0]
            check("branch_name returned", bool(child.get('branch_name')), child.get('branch_name'))
            check("enroll_no returned", bool(child.get('enroll_no')), child.get('enroll_no'))
            check("committed_fee returned", child.get('committed_fee') is not None, str(child.get('committed_fee')))
            check("transport_opted returned", 'transport_opted' in child, str(child.get('transport_opted')))

            # Drill into first child
            child_id = child['id']
            status2, fees_data = api_get(f'parent/children/{child_id}/fees/invoices/', parent_token)
            check("GET parent child fee invoices returns 200", status2 == 200, f"Status: {status2}")

            status3, att_data = api_get(f'parent/children/{child_id}/attendance/', parent_token)
            check("GET parent child attendance returns 200", status3 == 200, f"Status: {status3}")

            status4, hw_data = api_get(f'parent/children/{child_id}/homework/', parent_token)
            check("GET parent child homework returns 200", status4 == 200, f"Status: {status4}")

            status5, tr_data = api_get(f'parent/children/{child_id}/transport/', parent_token)
            check("GET parent child transport returns 200", status5 == 200, f"Status: {status5}")


# ─────────────────────────────────────────────────────────
# 4. Teacher Portal API
# ─────────────────────────────────────────────────────────
section("4. Teacher Portal API")

if teacher_token:
    status, data = api_get('teacher/dashboard/', teacher_token)
    check("GET teacher/dashboard/ returns 200", status == 200, f"Status: {status}")

    if status == 200:
        info = data.get('data', {})
        check("Teacher assigned_classes in response", 'assigned_classes' in info)
        check("Today's schedule in response", 'today_schedule' in info)


# ─────────────────────────────────────────────────────────
# 5. Transport API
# ─────────────────────────────────────────────────────────
section("5. Transport API")

if admin_token:
    status, data = api_get('transport/routes/', admin_token)
    check("GET transport/routes/ returns 200", status == 200, f"Status: {status}")

    status2, data2 = api_get('transport/rate-slabs/', admin_token)
    check("GET transport/rate-slabs/ returns 200", status2 == 200, f"Status: {status2}")

    status3, data3 = api_get('transport/students/', admin_token)
    check("GET transport/students/ returns 200", status3 == 200, f"Status: {status3}")
else:
    check("Transport API (skipped — no admin token)", False, "Need admin user to test")


# ─────────────────────────────────────────────────────────
# 6. Core Data APIs (as admin)
# ─────────────────────────────────────────────────────────
section("6. Core Data APIs")

if admin_token:
    for path, label in [
        ('students/', 'GET students/'),
        ('classes/', 'GET classes/'),
        ('fees/categories/', 'GET fees/categories/'),
        ('fees/structures/', 'GET fees/structures/'),
    ]:
        status, _ = api_get(path, admin_token)
        check(f"{label} returns 200", status == 200, f"Status: {status}")


# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print("  VALIDATION SUMMARY")
print(f"{'='*60}")
passes = sum(1 for r in RESULTS if r[0] == PASS)
fails = sum(1 for r in RESULTS if r[0] == FAIL)
print(f"  {PASS} Passed: {passes}")
print(f"  {FAIL} Failed: {fails}")
print(f"  Total:   {len(RESULTS)}")
if fails == 0:
    print("\n  🎉 ALL CHECKS PASSED!")
else:
    print(f"\n  ⚠️  {fails} check(s) FAILED. Review above.")
print(f"{'='*60}\n")

sys.exit(0 if fails == 0 else 1)
