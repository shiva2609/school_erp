import django
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

print('=== 1. BACKWARD COMPAT: TeacherProfile alias ===')
from staff.models import TeacherProfile, StaffProfile
assert TeacherProfile is StaffProfile, 'ALIAS BROKEN'
print('PASS: TeacherProfile is StaffProfile')

print()
print('=== 2. TeacherAssignment field check ===')
from staff.models import TeacherAssignment
ta_fields = {f.name for f in TeacherAssignment._meta.get_fields()}
print('staff field exists:', 'staff' in ta_fields)
print('teacher field absent:', 'teacher' not in ta_fields)
print('PASS' if 'staff' in ta_fields and 'teacher' not in ta_fields else 'FAIL')

print()
print('=== 3. FIELD EXISTENCE CHECK: all new HR fields ===')
required_fields = [
    'marital_status', 'father_name', 'mother_name', 'spouse_name',
    'aadhaar_number', 'esi_number', 'alternate_mobile',
    'current_address', 'permanent_address', 'city', 'state', 'pincode',
    'emergency_contact_number'
]
model_fields = {f.name for f in StaffProfile._meta.get_fields()}
all_pass = True
for f in required_fields:
    ok = f in model_fields
    result = 'PASS' if ok else 'FAIL'
    print(result + ': ' + f)
    if not ok:
        all_pass = False
print('OVERALL:', 'ALL PASS' if all_pass else 'SOME FAILED')

print()
print('=== 4. PERMISSION HIERARCHY CHECK ===')
from accounts.permissions import has_min_role
from unittest.mock import MagicMock

def mock_user(role):
    u = MagicMock()
    u.role = role
    u.is_authenticated = True
    return u

rules = [
    ('ACCOUNTANT', 'ACCOUNTANT', True),
    ('PRINCIPAL', 'ACCOUNTANT', False),
    ('SUPER_ADMIN', 'ACCOUNTANT', True),
    ('TEACHER', 'TEACHER', True),
    ('STAFF', 'TEACHER', False),
    ('PRINCIPAL', 'PRINCIPAL', True),
]
all_pass = True
for role, min_role, expected in rules:
    result = has_min_role(mock_user(role), min_role)
    ok = result == expected
    label = 'PASS' if ok else 'FAIL'
    print(label + ': ' + role + ' >= ' + min_role + ' expected=' + str(expected) + ' got=' + str(result))
    if not ok:
        all_pass = False
print('OVERALL:', 'ALL PASS' if all_pass else 'SOME FAILED')

print()
print('=== 5. SERIALIZER FIELD COVERAGE CHECK ===')
from staff.serializers import StaffProfileSerializer
s = StaffProfileSerializer()
serializer_fields = set(s.fields.keys())
required_in_serializer = [
    'marital_status', 'father_name', 'mother_name', 'spouse_name',
    'aadhaar_number', 'esi_number', 'alternate_mobile',
    'current_address', 'permanent_address', 'city', 'state', 'pincode',
    'emergency_contact_number', 'employee_id', 'category_name',
    'designation_name', 'department_name', 'is_teaching_role',
    'user_details', 'assignments',
]
all_pass = True
for f in required_in_serializer:
    ok = f in serializer_fields
    label = 'PASS' if ok else 'FAIL'
    print(label + ': ' + f)
    if not ok:
        all_pass = False
print('OVERALL:', 'ALL PASS' if all_pass else 'SOME FAILED')

print()
print('=== 6. ACADEMICS BACKWARD COMPAT: staff app imports ===')
try:
    from staff.models import TeacherAssignment, TeacherProfile
    from staff.serializers import TeacherProfileSerializer, TeacherAssignmentSerializer
    print('PASS: All legacy aliases importable')
except Exception as e:
    print('FAIL: ' + str(e))

print()
print('=== 7. StaffViewSet Permission Logic ===')
from staff.views import StaffViewSet
from rest_framework.test import APIRequestFactory
factory = APIRequestFactory()

# Simulate a PRINCIPAL user doing a GET list (should be allowed)
req = factory.get('/api/v1/staff/')
req.user = mock_user('PRINCIPAL')
req.user.is_authenticated = True
vs = StaffViewSet()
vs.action = 'list'
vs.request = req
perms = vs.get_permissions()
perm_results = all(p.has_permission(req, vs) for p in perms)
print('PASS: PRINCIPAL can LIST' if perm_results else 'FAIL: PRINCIPAL list blocked')

# Simulate a PRINCIPAL trying to CREATE (should be denied)
req2 = factory.post('/api/v1/staff/')
req2.user = mock_user('PRINCIPAL')
req2.user.is_authenticated = True
vs2 = StaffViewSet()
vs2.action = 'create'
vs2.request = req2
perms2 = vs2.get_permissions()
perm_results2 = all(p.has_permission(req2, vs2) for p in perms2)
print('PASS: PRINCIPAL cannot CREATE' if not perm_results2 else 'FAIL: PRINCIPAL create allowed')

print()
print('=== 8. NEW ALLOWLIST ROLE CHECK ===')
from accounts.permissions import IsStaffWriter
writer_perms = IsStaffWriter()
rules_writer = [
    ('ACCOUNTANT', True),
    ('CHIEF_ACCOUNTANT', True),
    ('SUPER_ADMIN', True),
    ('OWNER', True),
    ('PRINCIPAL', False),
    ('BRANCH_ADMIN', False),
    ('TEACHER', False),
]
all_pass_writer = True
for role, expected in rules_writer:
    result = writer_perms.has_permission(req, vs) if role == 'PRINCIPAL' else writer_perms.has_permission(req2 if role != 'PRINCIPAL' else req, vs2) # mocked request doesn't matter, just user role
    
    mock_req = MagicMock()
    mock_req.user = mock_user(role)
    
    result = writer_perms.has_permission(mock_req, None)
    ok = result == expected
    label = 'PASS' if ok else 'FAIL'
    print(f"{label}: {role} write access -> expected={expected}, got={result}")
    if not ok: all_pass_writer = False
print('OVERALL:', 'ALL PASS' if all_pass_writer else 'SOME FAILED')

print()
print('All checks complete.')
