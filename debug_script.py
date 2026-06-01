import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'school_erp.settings')
django.setup()

from staff.models import TeacherAssignment
from accounts.models import CustomUser

user = CustomUser.objects.get(email='tel@test.com')
assignments = TeacherAssignment.objects.filter(teacher__user=user, academic_year__is_active=True)
print(f"User branch: {user.branch.name if user.branch else 'None'}")
for a in assignments:
    print(f"Assignment ID: {a.id}, is_class_teacher: {a.is_class_teacher}")
    print(f"  Class Section ID: {a.class_section.id}")
    print(f"  Class Section Name: {a.class_section.display_name}")
    print(f"  Class Section Branch: {a.class_section.branch.name}")
    print(f"  Class Section AY Active: {a.class_section.academic_year.is_active}")
