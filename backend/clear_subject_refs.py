import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from staff.models import TeacherAssignment
from homework.models import Homework
from academics.models import ExamResult, ExamSubjectConfig

print("Dropping existing TeacherAssignment, Homework, ExamResult, and ExamSubjectConfig records to allow safe schema migration...")
TeacherAssignment.objects.all().delete()
Homework.objects.all().delete()
ExamResult.objects.all().delete()
ExamSubjectConfig.objects.all().delete()

print("Done! Ready for migrations.")
