import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local')
django.setup()

from students.models import Student, ClassSection
from staff.models import TeacherAssignment
from accounts.models import User

# Let's inspect active class sections
print("CLASS SECTIONS:")
for cs in ClassSection.objects.all():
    print(f"ID: {cs.id} | Name: {cs.display_name} | Branch: {cs.branch.name if cs.branch else 'None'}")

# Let's inspect students Mahesh and Shiva
print("\nSTUDENTS:")
for s in Student.objects.filter(first_name__in=['Mahesh', 'shiva']):
    print(f"ID: {s.id} | Name: {s.first_name} | Class: {s.class_section.display_name if s.class_section else 'None'} | Class ID: {s.class_section_id} | Branch: {s.branch.name if s.branch else 'None'}")

# Let's inspect TeacherAssignments
print("\nTEACHER ASSIGNMENTS FOR tel@test.com:")
try:
    user = User.objects.get(email='tel@test.com')
    for ta in TeacherAssignment.objects.filter(teacher__user=user):
        print(f"Class: {ta.class_section.display_name} (ID: {ta.class_section_id}) | Subject: {ta.subject.name} (ID: {ta.subject_id}) | Branch: {ta.class_section.branch.name if ta.class_section.branch else 'None'}")
except Exception as e:
    print("Error getting teacher assignments:", e)
