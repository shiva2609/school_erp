import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from students.models import Student
student = Student.objects.first()
for field in student._meta.fields:
    if 'legacy' in field.name.lower() or 'due' in field.name.lower() or 'old' in field.name.lower():
        print(field.name, type(field))
