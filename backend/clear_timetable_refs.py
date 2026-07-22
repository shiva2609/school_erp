import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from timetable.models import TimetableSlot, ClassSubjectDemand

print("Dropping existing TimetableSlot and ClassSubjectDemand records...")
TimetableSlot.objects.all().delete()
ClassSubjectDemand.objects.all().delete()

print("Done!")
