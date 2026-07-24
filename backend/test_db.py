import os
import django
import json
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from staff.models import TeacherAssignment
from academics.models import Assessment
from students.models import ClassSection

assignments = TeacherAssignment.objects.all()
print("ASSIGNMENTS:")
for a in assignments:
    print(f"ID: {a.id}, Role: {a.role}, Subject: {a.subject.name if a.subject else None}, Class: {a.class_section.display_name}, Grade: {a.class_section.grade}, AcademicYear: {a.academic_year_id}")

exams = Assessment.objects.all()
print("\nEXAMS:")
for e in exams:
    print(f"ID: {e.id}, Name: {e.name}, Grade: {e.grade}, AcademicYear: {e.academic_year_id}")
