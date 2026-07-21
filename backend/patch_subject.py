import os
import sys

filepath = 'timetable/views.py'
with open(filepath, 'r') as f:
    content = f.read()

target = "qs = qs.filter(teacher_assignments__staff__user=user).distinct()"
replacement = """qs = qs.filter(teacher_assignments__staff__user=user)
            cs = self.request.query_params.get('class_section_id')
            if cs:
                qs = qs.filter(teacher_assignments__class_section_id=cs)
            qs = qs.distinct()"""

if target in content:
    with open(filepath, 'w') as f:
        f.write(content.replace(target, replacement))
    print("Patched timetable/views.py")
else:
    print("Target string not found!")
