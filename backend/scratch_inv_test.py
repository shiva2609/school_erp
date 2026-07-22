import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from fees.models import FeeInvoice
qs = FeeInvoice.objects.exclude(academic_year__is_active=True).filter(outstanding_amount__gt=0)
print(qs.count())
