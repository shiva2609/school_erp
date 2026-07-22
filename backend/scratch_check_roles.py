import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

users = User.objects.filter(role__icontains='ACCOUNTANT')
for u in users:
    print(f"User: {u.email}, Role: {u.role}, Branch: {u.branch.name if u.branch else 'None'}")

print("\n---")
users2 = User.objects.filter(email__icontains='accountant')
for u in users2:
    print(f"User: {u.email}, Role: {u.role}, Branch: {u.branch.name if u.branch else 'None'}")
