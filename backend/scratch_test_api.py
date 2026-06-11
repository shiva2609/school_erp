import os
import django
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.conf import settings
settings.ALLOWED_HOSTS.append('testserver')

from rest_framework.test import APIClient
from accounts.models import User
from tenants.models import Branch, Tenant

# Fetch first tenant and branch
tenant = Tenant.objects.first()
branch = Branch.objects.filter(tenant=tenant).first()

# Create or get accountant with branch
accountant_with_branch = User.objects.filter(role='ACCOUNTANT', branch__isnull=False).first()
if not accountant_with_branch:
    accountant_with_branch = User.objects.create_user(
        email="temp_acc_branch@test.com",
        password="password123",
        role='ACCOUNTANT',
        tenant=tenant,
        branch=branch,
        first_name="Temp",
        last_name="Accountant"
    )

print(f"Testing for Accountant with Branch: {accountant_with_branch.email}")
print(f"User Branch: {accountant_with_branch.branch_id}")

client = APIClient()
client.force_authenticate(user=accountant_with_branch)

# Test 1: Category creation with branch_id = "" (like when "All Branches" is selected)
print("\n--- Category Creation with branch_id = '' ---")
cat_payload = {
    "name": "Acc Test Cat Empty",
    "description": "Desc",
    "branch_id": ""
}
response = client.post("/api/v1/expenses/categories/", cat_payload, format="json")
print("Status Code:", response.status_code)
print("Response:", response.data if hasattr(response, 'data') else response.content[:200])

# Test 2: Vendor creation with branch = "" (like when "All Branches" is selected)
print("\n--- Vendor Creation with branch = '' ---")
vendor_payload = {
    "vendor_type": "COMPANY",
    "category": "GENERAL",
    "name": "Acc Test Vendor Empty",
    "first_name": "",
    "last_name": "",
    "contact_person": "",
    "phone": "9876543210",
    "email": "",
    "pan_number": "",
    "aadhaar": "",
    "is_active": True,
    "associated_expense_types": [],
    "branch": ""
}
response = client.post("/api/v1/vendors/", vendor_payload, format="json")
print("Status Code:", response.status_code)
print("Response:", response.data if hasattr(response, 'data') else response.content[:200])

# Test 3: Vendor creation without branch field (undefined)
print("\n--- Vendor Creation without branch field ---")
vendor_payload_no_branch = {
    "vendor_type": "COMPANY",
    "category": "GENERAL",
    "name": "Acc Test Vendor No Field",
    "first_name": "",
    "last_name": "",
    "contact_person": "",
    "phone": "9876543210",
    "email": "",
    "pan_number": "",
    "aadhaar": "",
    "is_active": True,
    "associated_expense_types": []
}
response = client.post("/api/v1/vendors/", vendor_payload_no_branch, format="json")
print("Status Code:", response.status_code)
print("Response:", response.data if hasattr(response, 'data') else response.content[:200])

# Clean up temp user
User.objects.filter(email="temp_acc_branch@test.com").delete()
