import os
import re

files_to_check = [
    'academics/marks_access.py',
    'academics/tests.py',
    'academics/views.py',
    'accounts/teacher_views.py',
    'diagnose_attendance.py',
    'seed_test_school.py',
    'staff/views.py',
    'students/tests.py',
    'students/tests_students_api.py'
]

for file_path in files_to_check:
    full_path = os.path.join(os.getcwd(), file_path)
    if not os.path.exists(full_path):
        continue
    with open(full_path, 'r') as f:
        content = f.read()
    
    # We want to replace teacher= with staff= ONLY when associated with TeacherAssignment.
    # A simple regex for TeacherAssignment.objects...teacher=
    # This is tricky across lines. Let's do string replacement for exact lines.

    # We will just print the exact matches with 2 lines context so we can use multi_replace.
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'teacher=' in line or 'teacher_id=' in line:
            print(f"{file_path}:{i+1}: {line.strip()}")
            if i > 0:
                print(f"  Prev: {lines[i-1].strip()}")

