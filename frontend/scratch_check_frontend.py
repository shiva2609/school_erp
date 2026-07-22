import os
with open('/Users/vkshivakumar/school-erp/school_erp/frontend/src/components/students/enrollment/StudentEnrollmentModal.tsx', 'r') as f:
    for line in f.readlines():
        if 'api.post' in line or 'branch' in line:
            print(line.strip())
