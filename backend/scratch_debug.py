import os
import django
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import User
from tenants.models import Tenant, Branch
from expenses.models import ExpenseCategory, Vendor
from expenses.serializers import ExpenseCategorySerializer, VendorSerializer
from rest_framework.exceptions import ValidationError

print("--- USERS ---")
for user in User.objects.all():
    print(f"User: {user.email}, Role: {user.role}, Branch: {user.branch_id}, Tenant: {user.tenant_id}")

print("\n--- TENANTS & BRANCHES ---")
for t in Tenant.objects.all():
    print(f"Tenant: {t.id} ({t.name})")
    for b in Branch.objects.filter(tenant=t):
        print(f"  Branch: {b.id} ({b.name})")

# Let's pick an accountant user or admin user with a tenant to simulate
test_user = User.objects.filter(role__in=['ACCOUNTANT', 'SUPER_ADMIN', 'OWNER', 'CHIEF_ACCOUNTANT'], tenant__isnull=False).first()
if test_user:
    print(f"\nSimulating actions with User: {test_user.email} (Role: {test_user.role})")
    
    # 1. Test Vendor creation via serializer
    branch = test_user.branch or Branch.objects.filter(tenant=test_user.tenant).first()
    print(f"Using branch: {branch}")
    
    # Let's create fake category first for associated_expense_types
    cat = ExpenseCategory.objects.filter(branch=branch).first()
    if not cat:
        cat = ExpenseCategory.objects.create(tenant=test_user.tenant, branch=branch, name="Office Supplies", code="OFFICE_SUPPLIES")
        print(f"Created category: {cat}")
    else:
        print(f"Found category: {cat}")

    vendor_data = {
        'vendor_type': 'COMPANY',
        'category': 'GENERAL',
        'name': 'Acme Corp',
        'phone': '1234567890',
        'associated_expense_types': [str(cat.id)]
    }
    
    print("Testing VendorSerializer validation...")
    serializer = VendorSerializer(data=vendor_data)
    if serializer.is_valid():
        print("Serializer is valid.")
        try:
            # Replicate perform_create
            branch_id = str(branch.id)
            branch_obj = Branch.objects.get(id=branch_id, tenant=test_user.tenant)
            vendor = serializer.save(tenant=test_user.tenant, branch=branch_obj)
            print(f"Vendor successfully saved: {vendor.id} (name: {vendor.name})")
            
            # Clean up
            vendor.delete()
            print("Cleaned up created vendor.")
        except Exception as e:
            print("Error during serializer.save/perform_create:", e)
    else:
        print("Serializer validation FAILED:", serializer.errors)
        
    # 2. Test ExpenseCategory creation
    cat_data = {
        'name': 'Test Expense Category',
        'description': 'Test Description',
    }
    print("Testing ExpenseCategorySerializer validation...")
    cat_serializer = ExpenseCategorySerializer(data=cat_data)
    if cat_serializer.is_valid():
        print("ExpenseCategorySerializer is valid.")
        try:
            name = cat_data.get('name')
            code = name[:20].upper().replace(' ', '_')
            cat_obj = cat_serializer.save(tenant=test_user.tenant, branch=branch, code=code)
            print(f"ExpenseCategory successfully saved: {cat_obj.id} (code: {cat_obj.code})")
            
            # Clean up
            cat_obj.delete()
            print("Cleaned up created category.")
        except Exception as e:
            print("Error during ExpenseCategorySerializer.save/perform_create:", e)
    else:
        print("ExpenseCategorySerializer validation FAILED:", cat_serializer.errors)

else:
    print("\nNo suitable user found in database.")
