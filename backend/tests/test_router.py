import os
import json
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import RequestFactory
from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
from tenants.models import Branch

User = get_user_model()
u = User.objects.filter(role='SUPER_ADMIN').first()

factory = APIRequestFactory()
b = Branch.objects.filter(tenant=u.tenant).first()

# Use proper middleware simulation by using django.test.Client but with allowed host
from django.test import Client
client = Client(HTTP_HOST='localhost')
client.force_login(u)

response = client.get(f'/api/expenses/categories/?branch_id={b.id}')
print(f"Status: {response.status_code}")
if response.status_code == 200:
    print(json.dumps(response.json(), indent=2))
else:
    print(response.content)
