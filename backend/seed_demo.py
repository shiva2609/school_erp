import os
import django
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from tenants.models import Plan, Tenant, Domain, Branch, AcademicYear
from accounts.models import User
from django.utils import timezone

def seed():
    print("🌱 Seeding verification data...")
    
    # 1. Create a Plan
    plan, _ = Plan.objects.get_or_create(
        name="Enterprise",
        defaults={
            "max_branches": 10,
            "max_students": 10000,
            "price_monthly": 4999.00
        }
    )
    
    # 2. Create a Tenant
    tenant, created = Tenant.objects.get_or_create(
        slug="demo",
        defaults={
            "name": "Demo School Group",
            "plan": plan,
            "owner_email": "admin@demo.com",
            "city": "Hyderabad",
            "state": "Telangana",
            "pincode": "500001"
        }
    )
    
    # 3. Create a Domain for the tenant
    Domain.objects.get_or_create(
        tenant=tenant,
        domain="demo.localhost",
        defaults={"is_primary": True}
    )

    # 4. Create a Branch
    branch, _ = Branch.objects.get_or_create(
        tenant=tenant,
        branch_code="MAIN",
        defaults={"name": "Main Campus"}
    )

    # 5. Create an Academic Year
    AcademicYear.objects.get_or_create(
        tenant=tenant,
        branch=branch,
        name="2024-2025",
        defaults={
            "start_date": timezone.now().date(),
            "end_date": timezone.now().date() + timezone.timedelta(days=365),
            "is_active": True
        }
    )

    # 6. Create Test Users
    # 6a. Super Admin (Developer - Global)
    if not User.objects.filter(email="super_admin@demo.com").exists():
        super_admin = User.objects.create_superuser(
            email="super_admin@demo.com",
            password="password123",
            first_name="Developer",
            last_name="SuperAdmin",
        )
        print(f"✅ Created Super Admin: {super_admin.email} / password123")
    else:
        print("ℹ️ User super_admin@demo.com already exists.")
    # 6a. School Admin (Group Level)
    if not User.objects.filter(email="school_admin@demo.com").exists():
        school_admin = User.objects.create_user(
            email="school_admin@demo.com",
            password="password123",
            first_name="Demo",
            last_name="SchoolAdmin",
            role="SUPER_ADMIN",
            tenant=tenant
        )
        print(f"✅ Created School Admin: {school_admin.email} / password123")
    else:
        print("ℹ️ User school_admin@demo.com already exists.")

    # 6b. Branch Admin (School Level)
    if not User.objects.filter(email="branch_admin@demo.com").exists():
        branch_admin = User.objects.create_user(
            email="branch_admin@demo.com",
            password="password123",
            first_name="Demo",
            last_name="BranchAdmin",
            role="BRANCH_ADMIN",
            tenant=tenant
        )
        print(f"✅ Created Branch Admin: {branch_admin.email} / password123")
    else:
        print("ℹ️ User branch_admin@demo.com already exists.")

    print("🚀 Seed complete! You can now log in at http://localhost:3000/login")

if __name__ == "__main__":
    seed()
