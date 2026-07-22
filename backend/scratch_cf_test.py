import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from fees.models import FeeCarryForward
print(FeeCarryForward.objects.all().count())
print(FeeCarryForward.objects.filter(target_academic_year__is_active=True).count())
for cf in FeeCarryForward.objects.all()[:5]:
    print(cf.student.first_name, cf.carry_forward_amount, cf.target_academic_year_id)
