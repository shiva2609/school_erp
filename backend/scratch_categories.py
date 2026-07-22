import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from fees.models import FeeCategory
for cat in FeeCategory.objects.all():
    print(cat.name)
