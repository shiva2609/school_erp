import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from students.views import StudentViewSet
from rest_framework.test import APIRequestFactory, force_authenticate
import json
from tenants.models import AcademicYear, Branch
from fees.models import FeeStructure
from students.models import GRADE_CHOICES

User = get_user_model()
accountant = User.objects.filter(role__icontains="ACCOUNTANT").first()

branch = accountant.branch
ay = AcademicYear.objects.filter(tenant=accountant.tenant, is_active=True).first()
grade = GRADE_CHOICES[0][0]

factory = APIRequestFactory()
request = factory.post('/students/', data=json.dumps({
    'first_name': 'Test',
    'last_name': 'Student',
    'gender': 'MALE',
    'date_of_birth': '2015-01-01',
    'branch': str(branch.id),
    'academic_year': str(ay.id),
    'grade': grade,
    'offered_total': 20000,
    'standard_total': 41000,
    'reason': 'test'
}), content_type='application/json')
force_authenticate(request, user=accountant)

view = StudentViewSet.as_view({'post': 'create'})
try:
    response = view(request)
    print("Response Status:", response.status_code)
    print("Response Data:", response.data)
except Exception as e:
    import traceback
    traceback.print_exc()
