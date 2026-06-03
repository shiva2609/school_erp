import os
import django
import sys

# Set settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local')
try:
    django.setup()
except Exception as e:
    print(f"Error setting up Django environment: {e}")
    sys.exit(1)

from accounts.models import User
from students.models import ClassSection
from staff.models import TeacherProfile, TeacherAssignment
from tenants.models import AcademicYear, Branch

def diagnose(teacher_email):
    print("=" * 60)
    print(f"DIAGNOSING ATTENDANCE CLASS FETCHING FOR: {teacher_email}")
    print("=" * 60)
    
    # 1. Fetch User
    try:
        user = User.objects.get(email=teacher_email)
        print(f"✅ User Found:")
        print(f"   - Name: {user.first_name} {user.last_name}")
        print(f"   - Role: {user.role}")
        print(f"   - Tenant: {user.tenant.name if user.tenant else 'None'}")
        print(f"   - Branch: {user.branch.name if user.branch else 'None'} (ID: {user.branch_id})")
    except User.DoesNotExist:
        print(f"❌ User with email '{teacher_email}' does not exist in the database.")
        return
        
    if user.role != 'TEACHER':
        print(f"⚠️ User role is '{user.role}', not 'TEACHER'. Query filters may behave differently.")
        
    # 2. Check Active Academic Year
    active_ay = AcademicYear.objects.filter(tenant=user.tenant, is_active=True).first()
    if active_ay:
        print(f"✅ Active Academic Year: {active_ay.name} (Status: {active_ay.status})")
    else:
        print(f"❌ ERROR: No active academic year found for tenant '{user.tenant}'.")
        
    # 3. Check Direct Class Teacher Assignments
    print("\n--- Checking Direct Class Teacher Assignments (class_section.class_teacher) ---")
    direct_classes = ClassSection.objects.filter(class_teacher=user)
    if direct_classes.exists():
        print(f"✅ Found {direct_classes.count()} class(es) directly assigned:")
        for cs in direct_classes:
            is_branch_match = (cs.branch_id == user.branch_id)
            is_ay_active = (cs.academic_year == active_ay)
            print(f"   * {cs.display_name} (ID: {cs.id})")
            print(f"     - Branch Match: {'✅ Yes' if is_branch_match else f'❌ No (Class Branch: {cs.branch.name if cs.branch else None})'}")
            print(f"     - Academic Year Active: {'✅ Yes' if is_ay_active else f'❌ No (Class Year: {cs.academic_year.name if cs.academic_year else None})'}")
    else:
        print("ℹ️ No classes have this user set directly as 'class_teacher'.")

    # 4. Check TeacherAssignment Entries
    print("\n--- Checking Teacher Profile and Assignments (is_class_teacher=True) ---")
    try:
        profile = TeacherProfile.objects.get(user=user)
        print(f"✅ Teacher Profile Found:")
        print(f"   - Employee ID: {profile.employee_id}")
        print(f"   - Profile Branch: {profile.branch.name if profile.branch else 'None'}")
        
        assignments = TeacherAssignment.objects.filter(teacher=profile)
        if assignments.exists():
            print(f"✅ Found {assignments.count()} total subject/class assignments:")
            for ta in assignments:
                is_class_teacher_status = "Primary/Class Teacher" if ta.is_class_teacher else "Subject Teacher"
                is_ay_active = (ta.class_section.academic_year == active_ay)
                is_branch_match = (ta.class_section.branch_id == user.branch_id)
                print(f"   * Class: {ta.class_section.display_name} | Subject: {ta.subject.name} | Status: {is_class_teacher_status}")
                print(f"     - Branch Match: {'✅ Yes' if is_branch_match else '❌ No'}")
                print(f"     - Academic Year Active: {'✅ Yes' if is_ay_active else '❌ No'}")
        else:
            print("ℹ️ No TeacherAssignment records found for this profile.")
    except TeacherProfile.DoesNotExist:
        print("❌ ERROR: No TeacherProfile found for this User. Make sure a teacher profile exists.")

    # 5. Simulate API Viewset Queryset Filtering
    print("\n--- Simulating get_queryset() filters ---")
    qs = ClassSection.objects.filter(branch__tenant=user.tenant)
    print(f"1. Total in Tenant: {qs.count()}")
    
    if user.branch:
        qs = qs.filter(branch=user.branch)
        print(f"2. After User Branch Filter ({user.branch.name}): {qs.count()}")
        
    qs = qs.filter(academic_year__is_active=True)
    print(f"3. After Active Academic Year Filter: {qs.count()}")
    
    # Apply teacher attendance filtering
    qs_attendance = qs.filter(
        django.db.models.Q(class_teacher=user) |
        django.db.models.Q(teacher_assignments__teacher__user=user, teacher_assignments__is_class_teacher=True)
    ).distinct()
    
    print(f"4. After Attendance Filter (teacher_only=True): {qs_attendance.count()}")
    if qs_attendance.exists():
        for cs in qs_attendance:
            print(f"   🏆 Accessible Class: {cs.display_name} (ID: {cs.id})")
    else:
        print("   ❌ Dropdown will be EMPTY.")

if __name__ == '__main__':
    email = sys.argv[1] if len(sys.argv) > 1 else 'vk123@gmail.com'
    diagnose(email)
