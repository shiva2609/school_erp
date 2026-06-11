import os
import django
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import User
from tenants.models import Branch, Tenant

print("--- ALL ACCOUNTANT USERS ---")
accountants = User.objects.filter(role='ACCOUNTANT')
for u in accountants:
    print(f"Email: {u.email}")
    print(f"  Branch: {u.branch_id} ({u.branch.name if u.branch else 'None'})")
    print(f"  Tenant: {u.tenant_id} ({u.tenant.name if u.tenant else 'None'})")

print("\n--- ALL BRANCHES ---")
for b in Branch.objects.all():
    print(f"Branch ID: {b.id}, Name: {b.name}, Tenant: {b.tenant_id} ({b.tenant.name if b.tenant else 'None'})")
