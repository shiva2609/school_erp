import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from staff_attendance.views import mark_attendance
from staff_attendance.models import StaffAttendanceTransaction, StaffAttendance
from staff.models import StaffProfile
from tenants.models import Tenant, Branch
from rest_framework.test import force_authenticate
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from datetime import timedelta
import uuid

User = get_user_model()
tenant = Tenant.objects.first()
branch = Branch.objects.filter(tenant=tenant).first()
staff_user = User.objects.filter(role='STAFF', tenant=tenant).first()
staff = StaffProfile.objects.filter(user=staff_user).first()
device_user = User.objects.filter(role='ATTENDANCE_DEVICE', tenant=tenant).first()

if not device_user:
    print("No device user")
    exit(1)

txn = StaffAttendanceTransaction.objects.create(
    tenant=tenant,
    staff=staff,
    user=staff_user,
    branch=branch,
    token=uuid.uuid4().hex,
    token_hmac='fake',
    status='VALIDATED',
    validated_by_device=device_user,
    validated_at=timezone.now(),
    expires_at=timezone.now() + timedelta(days=1)
)

factory = RequestFactory()
# Valid image required for PIL to not throw UnidentifiedImageError
# This is a 1x1 black JPEG
import base64
jpeg_data = base64.b64decode(b'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')
photo = SimpleUploadedFile("photo.jpg", jpeg_data, content_type="image/jpeg")

request = factory.post('/api/v1/staff-attend/mark/', {
    'transaction_id': str(txn.id),
    'action': 'CHECK_IN',
    'photo': photo
})
force_authenticate(request, user=device_user)

try:
    response = mark_attendance(request)
    print(f"Status: {response.status_code}")
    print(f"Data: {response.data}")
except Exception as e:
    import traceback
    traceback.print_exc()
