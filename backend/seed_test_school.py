"""
Bulk Seed Script for Test School Tenant
========================================
Seeds Nursery–Grade 10, 3 sections each, 40–50 students/section,
subjects, teachers, fee structures, transport routes + rate slabs.

Usage:
    source venv/bin/activate
    python seed_test_school.py
"""
import os
import sys
import django
import random
import string
from decimal import Decimal
from datetime import date, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import transaction
from accounts.models import User
from tenants.models import Tenant, Branch, AcademicYear
from students.models import ClassSection, Student, ParentStudentRelation, GRADE_CHOICES
from timetable.models import Subject
from staff.models import TeacherProfile, TeacherAssignment
from fees.models import FeeCategory, FeeStructure, FeeStructureItem, StudentFeeItem
from transport.models import TransportRoute, TransportRateSlab, StudentTransport

# ──────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────
TENANT_NAME_MATCH = "test school"
SECTIONS = ['A', 'B', 'C']
STUDENTS_PER_SECTION = (40, 50)  # random range
DEFAULT_PASSWORD = 'password123'

GRADES = [
    'NURSERY', 'LKG', 'UKG',
    '1', '2', '3', '4', '5',
    '6', '7', '8', '9', '10',
]

# Subject mapping by grade group
SUBJECTS_BY_GROUP = {
    'pre_primary': ['English', 'Hindi', 'EVS', 'Art'],
    'primary': ['English', 'Hindi', 'Mathematics', 'EVS', 'Science', 'Social Studies'],
    'middle': ['English', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Sanskrit', 'Computer Science', 'Art'],
    'high': ['English', 'Hindi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Social Studies', 'Sanskrit', 'Computer Science', 'Physical Education'],
}

def get_grade_group(grade):
    if grade in ('NURSERY', 'LKG', 'UKG'):
        return 'pre_primary'
    elif grade in ('1', '2', '3', '4', '5'):
        return 'primary'
    elif grade in ('6', '7', '8'):
        return 'middle'
    else:
        return 'high'

# Indian first/last names for realistic data
FIRST_NAMES_MALE = [
    'Aarav', 'Arjun', 'Vivaan', 'Aditya', 'Sai', 'Reyansh', 'Dhruv', 'Kabir',
    'Anay', 'Vihaan', 'Ishaan', 'Krishna', 'Rohan', 'Aryan', 'Dev', 'Arnav',
    'Rudra', 'Shaurya', 'Laksh', 'Atharva', 'Advait', 'Parth', 'Ritvik', 'Yash',
    'Manan', 'Ved', 'Ayaan', 'Rian', 'Darsh', 'Tanish', 'Harsh', 'Pranav',
    'Rahul', 'Neeraj', 'Akash', 'Manish', 'Karthik', 'Ravi', 'Suresh', 'Ganesh',
]
FIRST_NAMES_FEMALE = [
    'Aanya', 'Saanvi', 'Diya', 'Ananya', 'Aadhya', 'Isha', 'Kavya', 'Priya',
    'Riya', 'Meera', 'Navya', 'Aisha', 'Sara', 'Kiara', 'Aditi', 'Siya',
    'Pari', 'Nisha', 'Pooja', 'Tanvi', 'Anvi', 'Myra', 'Avni', 'Trisha',
    'Sneha', 'Neha', 'Shruti', 'Divya', 'Kriti', 'Mahi', 'Lakshmi', 'Gauri',
    'Pallavi', 'Swati', 'Anjali', 'Vandana', 'Bhavya', 'Jyoti', 'Madhavi', 'Radhika',
]
LAST_NAMES = [
    'Sharma', 'Verma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Rao', 'Gupta',
    'Jain', 'Agarwal', 'Mishra', 'Pandey', 'Trivedi', 'Mehta', 'Shah', 'Desai',
    'Nair', 'Menon', 'Iyer', 'Pillai', 'Srinivasan', 'Chauhan', 'Yadav', 'Tiwari',
    'Dubey', 'Saxena', 'Bhat', 'Joshi', 'Kapoor', 'Malhotra', 'Chopra', 'Thakur',
    'Rathore', 'Patil', 'Kulkarni', 'Deshpande', 'Goswami', 'Banerjee', 'Chatterjee', 'Das',
]

FATHER_OCCUPATIONS = ['Engineer', 'Doctor', 'Business', 'Teacher', 'Farmer', 'Government Employee', 'Private Employee', 'Shopkeeper', 'Driver', 'Lawyer']
MOTHER_OCCUPATIONS = ['Homemaker', 'Teacher', 'Doctor', 'Nurse', 'Engineer', 'Business', 'Government Employee', 'Private Employee']

# Fee amounts by grade group (annual)
FEE_AMOUNTS = {
    'pre_primary': {'TUITION': 24000, 'DEV_FUND': 5000, 'EXAM': 2000, 'ACTIVITY': 3000},
    'primary':     {'TUITION': 30000, 'DEV_FUND': 6000, 'EXAM': 2500, 'ACTIVITY': 3500},
    'middle':      {'TUITION': 36000, 'DEV_FUND': 7000, 'EXAM': 3000, 'ACTIVITY': 4000},
    'high':        {'TUITION': 45000, 'DEV_FUND': 8000, 'EXAM': 3500, 'ACTIVITY': 5000},
}

# Transport
TRANSPORT_ROUTES = [
    ('Route A: School → Dilsukhnagar → LB Nagar', 'Dilsukhnagar', 'LB Nagar', 12),
    ('Route B: School → Uppal → Nacharam', 'Uppal', 'Nacharam', 8),
    ('Route C: School → Hayathnagar → Vanasthalipuram', 'Hayathnagar', 'Vanasthalipuram', 15),
    ('Route D: School → Kothapet → Malakpet', 'Kothapet', 'Malakpet', 10),
]
TRANSPORT_SLABS = [
    (0, 5, 500),
    (5, 10, 800),
    (10, 15, 1100),
    (15, 25, 1500),
]

counter = {'users': 0, 'students': 0, 'teachers': 0, 'sections': 0, 'subjects': 0, 'parents': 0}
# Per-branch admission number counter to guarantee uniqueness
adm_seq = {}  # branch_id -> current_seq


def random_phone():
    return f"9{random.randint(100000000, 999999999)}"

def random_dob(grade):
    """Generate a plausible DOB for a student in the given grade."""
    base_year = 2026
    grade_age_map = {
        'NURSERY': 3, 'LKG': 4, 'UKG': 5,
        '1': 6, '2': 7, '3': 8, '4': 9, '5': 10,
        '6': 11, '7': 12, '8': 13, '9': 14, '10': 15,
    }
    age = grade_age_map.get(grade, 10)
    birth_year = base_year - age - random.randint(0, 1)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return date(birth_year, month, day)


def clean_existing(tenant):
    """Remove existing seeded data for this tenant."""
    print("  Cleaning existing data...")
    # Delete in dependency order
    StudentTransport.objects.filter(student__tenant=tenant).delete()
    ParentStudentRelation.objects.filter(student__tenant=tenant).delete()
    StudentFeeItem.objects.filter(student__tenant=tenant).delete()
    Student.objects.filter(tenant=tenant).delete()
    TeacherAssignment.objects.filter(tenant=tenant).delete()
    TeacherProfile.objects.filter(tenant=tenant).delete()
    TransportRateSlab.objects.filter(tenant=tenant).delete()
    User.objects.filter(tenant=tenant, role__in=['SUPER_ADMIN', 'BRANCH_ADMIN']).delete()
    User.objects.filter(tenant=tenant, role__in=['TEACHER', 'PARENT']).delete()
    ClassSection.objects.filter(tenant=tenant).delete()
    Subject.objects.filter(tenant=tenant).delete()
    FeeStructureItem.objects.filter(structure__tenant=tenant).delete()
    FeeStructure.objects.filter(tenant=tenant).delete()
    FeeCategory.objects.filter(tenant=tenant).delete()
    TransportRoute.objects.filter(tenant=tenant).delete()
    print("  ✓ Cleaned.")


def create_subjects(tenant, branch):
    """Create subjects for each grade group."""
    created = {}
    for group, names in SUBJECTS_BY_GROUP.items():
        created[group] = []
        for name in names:
            code = name[:3].upper()
            subj, _ = Subject.objects.get_or_create(
                tenant=tenant, branch=branch, name=name,
                defaults={'code': code, 'grade_levels': [], 'is_active': True}
            )
            created[group].append(subj)
            counter['subjects'] += 1
    return created


def create_fee_categories(tenant, branch):
    """Create fee categories for a branch."""
    cats = {}
    for code, name in [('TUITION', 'Tuition Fee'), ('DEV_FUND', 'Development Fund'),
                        ('EXAM', 'Exam Fee'), ('ACTIVITY', 'Activity Fee'), ('TRANSPORT', 'Transport Fee')]:
        cat, _ = FeeCategory.objects.get_or_create(
            branch=branch, code=code,
            defaults={'tenant': tenant, 'name': name, 'is_active': True, 'order': 1}
        )
        cats[code] = cat
    return cats


def create_fee_structure(tenant, branch, ay, grade, cats):
    """Create fee structure for a grade."""
    group = get_grade_group(grade)
    amounts = FEE_AMOUNTS[group]
    grade_display = dict(GRADE_CHOICES).get(grade, grade)
    
    structure, _ = FeeStructure.objects.get_or_create(
        branch=branch, academic_year=ay, grade=grade,
        defaults={
            'tenant': tenant,
            'name': f"{grade_display} Fee Structure ({ay.name})",
            'is_active': True,
        }
    )
    for code, amount in amounts.items():
        if code in cats:
            FeeStructureItem.objects.get_or_create(
                structure=structure, category=cats[code],
                defaults={'amount': Decimal(str(amount)), 'frequency': 'ANNUALLY'}
            )
    return structure


def create_teacher(tenant, branch, ay, class_section, subjects, is_class_teacher=True):
    """Create a teacher user + profile + assignment."""
    first = random.choice(FIRST_NAMES_MALE + FIRST_NAMES_FEMALE)
    last = random.choice(LAST_NAMES)
    email = f"teacher_{first.lower()}_{last.lower()}_{random.randint(100,999)}@{tenant.slug}.edu"
    phone = random_phone()

    user = User.objects.create_user(
        email=email, password=DEFAULT_PASSWORD,
        first_name=first, last_name=last,
        role='TEACHER', tenant=tenant, branch=branch, phone=phone,
    )
    counter['users'] += 1

    profile = TeacherProfile.objects.create(
        tenant=tenant, user=user, branch=branch,
        qualification='B.Ed, M.A.', is_active=True,
    )
    counter['teachers'] += 1

    # Assign as class teacher
    if subjects:
        primary_subj = subjects[0]
        TeacherAssignment.objects.create(
            tenant=tenant, teacher=profile, class_section=class_section,
            subject=primary_subj, is_class_teacher=is_class_teacher, academic_year=ay,
        )

    # Also mark on ClassSection
    if is_class_teacher:
        class_section.class_teacher = user
        class_section.save(update_fields=['class_teacher'])

    return user, profile


def create_student(tenant, branch, ay, class_section, grade, roll):
    """Create a single student with parent accounts."""
    gender = random.choice(['MALE', 'FEMALE'])
    first = random.choice(FIRST_NAMES_MALE if gender == 'MALE' else FIRST_NAMES_FEMALE)
    last = random.choice(LAST_NAMES)
    dob = random_dob(grade)
    father_name = f"{random.choice(FIRST_NAMES_MALE)} {last}"
    mother_name = f"{random.choice(FIRST_NAMES_FEMALE)} {last}"
    father_phone = random_phone()
    mother_phone = random_phone()

    # Generate admission number using in-memory counter (avoids SQLite lock issues)
    if branch.id not in adm_seq:
        adm_seq[branch.id] = 0
    adm_seq[branch.id] += 1
    year_str = ay.name.split('-')[0]
    adm_no = f"{year_str}/{branch.branch_code}/{adm_seq[branch.id]:04d}"

    student = Student.objects.create(
        tenant=tenant, branch=branch, academic_year=ay,
        admission_number=adm_no,
        first_name=first, last_name=last,
        date_of_birth=dob, gender=gender,
        class_section=class_section, roll_number=roll,
        status='ACTIVE',
        father_name=father_name, father_phone=father_phone,
        father_occupation=random.choice(FATHER_OCCUPATIONS),
        mother_name=mother_name, mother_phone=mother_phone,
        mother_occupation=random.choice(MOTHER_OCCUPATIONS),
        address_line1=f"{random.randint(1, 999)}, {random.choice(['MG Road', 'Gandhi Nagar', 'Nehru Colony', 'Rajiv Enclave', 'Subhash Marg'])}",
        city=random.choice(['Hyderabad', 'Secunderabad', 'Rangareddy']),
        state='Telangana', pincode=f"{random.randint(500001, 500099)}",
    )
    counter['students'] += 1


    # Create parent accounts using the helper
    _link_parent(tenant, student, father_name, father_phone, 'FATHER')
    _link_parent(tenant, student, mother_name, mother_phone, 'MOTHER')

    return student


def _link_parent(tenant, student, name, phone, relation_type):
    """Create or link a parent user account."""
    if not phone:
        return
    email = f"{phone}@parent.local"
    parts = name.split(' ', 1)
    first = parts[0]
    last = parts[1] if len(parts) > 1 else ''

    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            'first_name': first, 'last_name': last,
            'role': 'PARENT', 'tenant': tenant, 'phone': phone,
        }
    )
    if created:
        user.set_password(DEFAULT_PASSWORD)
        user.save()
        counter['parents'] += 1

    ParentStudentRelation.objects.get_or_create(
        parent=user, student=student,
        defaults={'relation_type': relation_type}
    )


def create_transport(tenant, branch):
    """Create transport routes and rate slabs."""
    routes = []
    for name, start, end, dist in TRANSPORT_ROUTES:
        route, _ = TransportRoute.objects.get_or_create(
            branch=branch, name=name,
            defaults={
                'tenant': tenant, 'start_point': start,
                'end_point': end, 'distance_km': Decimal(str(dist)),
            }
        )
        routes.append(route)

    for min_km, max_km, rate in TRANSPORT_SLABS:
        TransportRateSlab.objects.get_or_create(
            branch=branch, min_km=Decimal(str(min_km)), max_km=Decimal(str(max_km)),
            defaults={
                'tenant': tenant, 'monthly_rate': Decimal(str(rate)), 'is_active': True,
            }
        )
    return routes


def opt_student_transport(student, routes, branch, cats):
    """Opt ~20% of students into transport."""
    if random.random() > 0.20:
        return
    route = random.choice(routes)
    dist = Decimal(str(random.randint(2, 20)))
    monthly = TransportRateSlab.get_rate_for_distance(branch, dist)
    if not monthly:
        return
    st, created = StudentTransport.objects.get_or_create(
        student=student,
        defaults={
            'route': route, 'distance_km': dist,
            'pickup_point': random.choice(route.stops) if route.stops else '',
            'monthly_fee': monthly, 'is_active': True,
        }
    )
    if created and 'TRANSPORT' in cats:
        StudentFeeItem.objects.update_or_create(
            student=student, academic_year=student.academic_year, category=cats['TRANSPORT'],
            defaults={'amount': monthly * 12, 'is_locked': True}
        )


def lock_student_fees(student, grade, cats):
    """Create StudentFeeItem entries for the student based on grade group."""
    group = get_grade_group(grade)
    amounts = FEE_AMOUNTS[group]
    for code, amount in amounts.items():
        if code in cats:
            StudentFeeItem.objects.get_or_create(
                student=student, academic_year=student.academic_year, category=cats[code],
                defaults={'amount': Decimal(str(amount)), 'is_locked': True}
            )


def seed_branch(tenant, branch, ay):
    """Seed a single branch with all data."""
    print(f"\n  ── Branch: {branch.name} ──")

    # 0. Create Branch Admin
    admin_email = f"{branch.branch_code.lower()}_admin@{tenant.slug}.edu"
    User.objects.create_user(
        email=admin_email, password=DEFAULT_PASSWORD,
        first_name=f"{branch.name}", last_name="Admin",
        role='BRANCH_ADMIN', tenant=tenant, branch=branch,
    )
    counter['users'] += 1
    print(f"  Created Branch Admin: {admin_email}")

    # 1. Subjects
    print("  Creating subjects...")
    subjects_by_group = create_subjects(tenant, branch)

    # 2. Fee categories
    print("  Creating fee categories...")
    cats = create_fee_categories(tenant, branch)

    # 3. Transport
    print("  Creating transport routes & slabs...")
    routes = create_transport(tenant, branch)

    # 4. Classes, teachers, students
    for grade in GRADES:
        group = get_grade_group(grade)
        grade_subjects = subjects_by_group[group]

        # Fee structure for grade
        create_fee_structure(tenant, branch, ay, grade, cats)

        for section in SECTIONS:
            display = f"{dict(GRADE_CHOICES).get(grade, grade)} - Section {section}"
            cs = ClassSection.objects.create(
                tenant=tenant, branch=branch, academic_year=ay,
                grade=grade, section=section, display_name=display,
                max_capacity=50, is_active=True,
            )
            counter['sections'] += 1

            # Teacher for this section
            teacher_user, teacher_profile = create_teacher(
                tenant, branch, ay, cs, grade_subjects, is_class_teacher=True
            )

            # Students
            num_students = random.randint(*STUDENTS_PER_SECTION)
            for roll in range(1, num_students + 1):
                student = create_student(tenant, branch, ay, cs, grade, roll)
                lock_student_fees(student, grade, cats)
                opt_student_transport(student, routes, branch, cats)

        grade_display = dict(GRADE_CHOICES).get(grade, grade)
        print(f"    ✓ {grade_display}: {len(SECTIONS)} sections done")

    print(f"  ── Branch {branch.name} complete ──")


def main():
    print("=" * 60)
    print("  SCHOOL ERP — BULK SEED SCRIPT")
    print("=" * 60)

    # Find the test school tenant
    tenant = Tenant.objects.filter(name__icontains=TENANT_NAME_MATCH).first()
    if not tenant:
        print(f"ERROR: No tenant matching '{TENANT_NAME_MATCH}' found.")
        print(f"Available tenants: {list(Tenant.objects.values_list('name', flat=True))}")
        sys.exit(1)

    print(f"\nTenant: {tenant.name} (ID: {tenant.id})")
    ay = AcademicYear.objects.filter(tenant=tenant, is_active=True).first()
    if not ay:
        ay = AcademicYear.objects.filter(tenant=tenant).first()
    if not ay:
        print("ERROR: No academic year found for this tenant.")
        sys.exit(1)
    print(f"Academic Year: {ay.name}")

    branches = Branch.objects.filter(tenant=tenant, is_active=True)
    print(f"Branches: {list(branches.values_list('name', flat=True))}")

    # Clean
    with transaction.atomic():
        clean_existing(tenant)

    # Seed each branch
    for branch in branches:
        with transaction.atomic():
            seed_branch(tenant, branch, ay)

    print("\n" + "=" * 60)
    print("  SEED COMPLETE")
    print("=" * 60)
    print(f"  Sections:  {counter['sections']}")
    print(f"  Students:  {counter['students']}")
    print(f"  Teachers:  {counter['teachers']}")
    print(f"  Parents:   {counter['parents']}")
    print(f"  Subjects:  {counter['subjects']}")
    print(f"  Users:     {counter['users']}")
    print("=" * 60)


if __name__ == '__main__':
    main()
