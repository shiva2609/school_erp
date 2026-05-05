import os
import json
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from tenants.models import Branch
from django.contrib.auth import get_user_model
from expenses.models import ExpenseCategory

User = get_user_model()
u = User.objects.filter(role='SUPER_ADMIN').first()

b = Branch.objects.filter(tenant=u.tenant).first()
qs = ExpenseCategory.objects.filter(branch_id=b.id)

print(qs.count())
print(list(qs.values('name')))
