import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import User

print("--- ALL USERS ---")
for u in User.objects.all():
    print(f"Email: {u.email}, Role: {u.role}, Branch: {u.branch_id} ({u.branch.name if u.branch else 'None'}), Tenant: {u.tenant_id}")
