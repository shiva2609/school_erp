import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from tenants.models import Tenant, Branch, AcademicYear
from accounts.models import User
from datetime import date

tenant, created = Tenant.objects.get_or_create(
    slug='testschool',
    defaults={
        'name': 'Test School',
        'is_active': True
    }
)

ay, created = AcademicYear.objects.get_or_create(
    tenant=tenant,
    name='2026-2027',
    defaults={
        'start_date': date(2026, 6, 1),
        'end_date': date(2027, 5, 31),
        'is_active': True
    }
)

branch, created = Branch.objects.get_or_create(
    tenant=tenant,
    branch_code='MAIN',
    defaults={
        'name': 'Main Branch',
        'is_active': True
    }
)
print(f"Tenant: {tenant.name}, AY: {ay.name}, Branch: {branch.name}")
