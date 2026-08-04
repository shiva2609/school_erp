import os
import django
import sys
from datetime import date, time

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User
from staff.models import StaffProfile, TeacherAssignment
from tenants.models import Tenant, Branch, AcademicYear
from academics.models import AcademicSubject, Assessment, AssessmentSubject
from students.models import ClassSection, Student

def run():
    print("Starting data seed and repair...")

    # 1. Repair orphaned StaffProfiles
    print("\n--- Repairing StaffProfiles ---")
    teachers = User.objects.filter(role='TEACHER')
    for teacher in teachers:
        # Check if they already have a StaffProfile linked
        sp = StaffProfile.objects.filter(user=teacher).first()
        if not sp:
            # Find an orphaned one in their branch, or create a new one
            orphaned = StaffProfile.objects.filter(user=None, branch=teacher.branch).first()
            if orphaned:
                orphaned.user = teacher
                orphaned.save()
                print(f"Linked orphaned StaffProfile {orphaned.id} to {teacher.email}")
                sp = orphaned
            else:
                sp = StaffProfile.objects.create(
                    tenant=teacher.tenant,
                    branch=teacher.branch,
                    user=teacher,
                    employee_id=f"EMP-{teacher.id.hex[:6]}",
                )
                print(f"Created new StaffProfile {sp.id} for {teacher.email}")
        else:
            print(f"User {teacher.email} already has StaffProfile {sp.id}")

    # For the rest of the script, we will focus on teacher@p2.com's branch
    target_teacher = User.objects.filter(email='teacher@p2.com').first()
    if not target_teacher:
        print("Could not find teacher@p2.com, aborting seed.")
        return

    tenant = target_teacher.tenant
    branch = target_teacher.branch
    staff_profile = StaffProfile.objects.get(user=target_teacher)
    
    # 2. Get or create an active Academic Year for this branch's tenant
    ay = AcademicYear.objects.filter(tenant=tenant, is_active=True).first()
    if not ay:
        ay = AcademicYear.objects.create(
            tenant=tenant,
            name="2026-2027",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
            status='ACTIVE'
        )
        print(f"Created new active AcademicYear: {ay.name}")
    else:
        print(f"Using active AcademicYear: {ay.name}")

    # 3. Create a ClassSection (with a VALID grade choice '1' instead of 'GRADE_1')
    cs, created = ClassSection.objects.get_or_create(
        tenant=tenant,
        branch=branch,
        academic_year=ay,
        grade='1',
        section='A',
        defaults={'display_name': 'Grade 1 - Section A', 'is_active': True}
    )
    if created:
        print(f"Created ClassSection: {cs.display_name}")
    else:
        print(f"Using existing ClassSection: {cs.display_name}")

    # 4. Create Academic Subjects
    subjects_data = [
        ("English", False),
        ("Mathematics", False),
        ("Science", False),
    ]
    academic_subjects = []
    for i, (name, is_opt) in enumerate(subjects_data):
        subj, created = AcademicSubject.objects.get_or_create(
            tenant=tenant,
            branch=branch,
            name=name,
            defaults={'is_optional': is_opt, 'display_order': i}
        )
        academic_subjects.append(subj)
        if created:
            print(f"Created AcademicSubject: {name}")

    # 5. Create Teacher Assignments
    for subj in academic_subjects:
        ta, created = TeacherAssignment.objects.get_or_create(
            tenant=tenant,
            staff=staff_profile,
            class_section=cs,
            role='SUBJECT_TEACHER',
            subject=subj,
            academic_year=ay
        )
        if created:
            print(f"Created TeacherAssignment for {subj.name}")

    # Also make them class teacher
    ta_ct, created = TeacherAssignment.objects.get_or_create(
        tenant=tenant,
        staff=staff_profile,
        class_section=cs,
        role='CLASS_TEACHER',
        academic_year=ay,
        defaults={'subject': None}
    )
    if created:
        print("Created CLASS_TEACHER assignment")

    # 6. Create an Assessment
    assessment, created = Assessment.objects.get_or_create(
        tenant=tenant,
        branch=branch,
        academic_year=ay,
        grade='1',
        name='Mid Term Exam',
        defaults={
            'start_date': date.today(),
            'end_date': date.today(),
            'status': 'ACTIVE',
            'is_active': True
        }
    )
    # Ensure it's active so teachers can enter marks
    if assessment.status != 'ACTIVE':
        assessment.status = 'ACTIVE'
        assessment.save()
        print("Updated Assessment status to ACTIVE")
    if created:
        print(f"Created Assessment: {assessment.name}")

    # 7. Create Assessment Subjects
    for subj in academic_subjects:
        asub, created = AssessmentSubject.objects.get_or_create(
            assessment=assessment,
            subject=subj,
            defaults={'max_marks': 100, 'min_marks': 35}
        )
        if created:
            print(f"Created AssessmentSubject for {subj.name}")

    # 8. Create some students in the class
    students_data = [
        ("John", "Doe", "MALE"),
        ("Jane", "Smith", "FEMALE"),
        ("Alice", "Johnson", "FEMALE"),
    ]
    for idx, (first, last, gender) in enumerate(students_data):
        admin_no = f"ADM-P2-{idx+1}"
        student, created = Student.objects.get_or_create(
            tenant=tenant,
            branch=branch,
            academic_year=ay,
            admission_number=admin_no,
            defaults={
                'first_name': first,
                'last_name': last,
                'gender': gender,
                'date_of_birth': date(2020, 1, 1),
                'grade': '1',
                'class_section': cs,
                'status': 'ACTIVE'
            }
        )
        if created:
            print(f"Created Student: {first} {last}")
        else:
            # Ensure they are in the class section
            if student.class_section != cs:
                student.class_section = cs
                student.save()

    print("\nData seed complete! Teacher marks entry flow is now fully equipped.")

if __name__ == '__main__':
    run()
