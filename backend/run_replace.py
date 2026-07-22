import re
import os

replacements = {
    'academics/marks_access.py': [
        (r'teacher=tp,', r'staff=tp,')
    ],
    'academics/views.py': [
        (r'TeacherAssignment.objects.filter\(teacher=tp\)', r'TeacherAssignment.objects.filter(staff=tp)')
    ],
    'accounts/teacher_views.py': [
        (r'assignments = TeacherAssignment.objects.filter\(\s*teacher=teacher_profile,', 
         r'assignments = TeacherAssignment.objects.filter(\n                staff=teacher_profile,')
    ],
    'diagnose_attendance.py': [
        (r'TeacherAssignment.objects.filter\(teacher=profile\)', r'TeacherAssignment.objects.filter(staff=profile)')
    ],
    'seed_test_school.py': [
        (r'tenant=tenant, teacher=profile, class_section=class_section,', r'tenant=tenant, staff=profile, class_section=class_section,')
    ],
    'staff/views.py': [
        (r'TeacherAssignment.objects.filter\(teacher=teacher\)', r'TeacherAssignment.objects.filter(staff=teacher)'),
        (r'TeacherAssignment.objects.filter\(\s*teacher_id=teacher_id,', r'TeacherAssignment.objects.filter(\n                staff_id=teacher_id,'),
        (r'existing = TeacherAssignment.objects.filter\(teacher_id=teacher_id, academic_year_id=academic_year_id\)', r'existing = TeacherAssignment.objects.filter(staff_id=teacher_id, academic_year_id=academic_year_id)'),
        (r'teacher_id=teacher_id, academic_year_id=academic_year_id', r'staff_id=teacher_id, academic_year_id=academic_year_id'),
        (r'\)\.exclude\(teacher_id=teacher_id\)\.update\(is_class_teacher=False\)', r').exclude(staff_id=teacher_id).update(is_class_teacher=False)')
    ],
    'students/tests_students_api.py': [
        (r'teacher=self.teacher_profile,', r'staff=self.teacher_profile,')
    ]
}

for file_path, reps in replacements.items():
    full_path = os.path.join(os.getcwd(), file_path)
    if not os.path.exists(full_path):
        continue
    with open(full_path, 'r') as f:
        content = f.read()
    
    for old, new in reps:
        content = re.sub(old, new, content)
        
    with open(full_path, 'w') as f:
        f.write(content)

