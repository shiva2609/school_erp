import os
import json
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from tenants.models import Branch

User = get_user_model()
u = User.objects.filter(role='SUPER_ADMIN').first()

client = APIClient()
client.force_authenticate(user=u)

b = Branch.objects.filter(tenant=u.tenant).first()

response = client.get(f'/api/expenses/categories/?branch_id={b.id}')
print(f"Status: {response.status_code}")
print(json.dumps(response.data, indent=2))
