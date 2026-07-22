import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from students.models import Student
from django.contrib.auth import get_user_model
from students.views import StudentViewSet
from django.test import RequestFactory
import json

User = get_user_model()
student = Student.objects.filter(first_name__icontains="KADARI", last_name__icontains="NEROOP").first()
if not student:
    print("Student not found")
    exit()

admin = User.objects.filter(role="SUPER_ADMIN").first()

factory = RequestFactory()
request = factory.post('/update', data=json.dumps({
    'class_section_id': str(student.class_section.id),
    'offered_total': 28000,
    'reason': 'chairman'
}), content_type='application/json')
request.user = admin

view = StudentViewSet.as_view({'post': 'update_class_and_fees'})
try:
    response = view(request, pk=student.id)
    print("Response Status:", response.status_code)
    print("Response Data:", response.data)
except Exception as e:
    import traceback
    traceback.print_exc()
