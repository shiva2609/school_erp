import os
import django
from datetime import date
from django.test import Client

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from tenants.models import Tenant
from accounts.models import User
from students.models import ClassSection, Student, ParentStudentRelation
from timetable.models import Subject

def main():
    teacher_user = User.objects.filter(role='TEACHER').first()
    if not teacher_user:
        print("No teacher found.")
        return
    tenant = teacher_user.tenant
    
    # Find the class the teacher is assigned to
    from staff.models import TeacherAssignment
    assignment = TeacherAssignment.objects.filter(teacher__user=teacher_user).first()
    if not assignment:
        print("Teacher has no assignments.")
        return
        
    class_section = assignment.class_section
    print(f"Testing for Teacher: {teacher_user.email}, Class: {class_section.display_name}")

    # Find a student in this class and their parent
    student = Student.objects.filter(class_section=class_section, status='ACTIVE').first()
    if not student:
        print("No students in this class.")
        return
        
    parent_relation = ParentStudentRelation.objects.filter(student=student).first()
    if not parent_relation:
        print("No parent for this student.")
        return
    parent_user = parent_relation.parent
    print(f"Testing for Student: {student.first_name}, Parent: {parent_user.email}")
    
    # Find a subject
    subject = Subject.objects.filter(tenant=tenant).first()

    # Simulate Teacher Action
    c = Client()
    # Assuming login uses JWT in the real app, but for a simple test we can use force_login
    c.force_login(teacher_user)
    
    today = date.today().isoformat()
    
    # Mark Attendance
    print("\n--- Teacher marking attendance ---")
    resp_attendance = c.post('/api/v1/attendance/bulk/', {
        "class_section_id": str(class_section.id),
        "date": today,
        "records": [
            {
                "student_id": str(student.id),
                "status": "ABSENT",
                "remarks": "Fever"
            }
        ]
    }, content_type='application/json')
    print("Attendance API status:", resp_attendance.status_code)
    
    # Post Homework
    print("\n--- Teacher posting homework ---")
    resp_hw = c.post('/api/v1/homework/', {
        "class_section": str(class_section.id),
        "subject": str(subject.id),
        "title": "Math Integration Test",
        "description": "Solve integration problems 1-10",
        "due_date": today,
        "activity_type": "HOMEWORK",
        "is_published": True
    }, content_type='application/json')
    print("Homework API status:", resp_hw.status_code)
    
    # Simulate Parent Action
    print("\n--- Parent fetching data ---")
    c.logout()
    c.force_login(parent_user)
    
    # Check Attendance
    parent_att = c.get(f'/api/v1/parent/children/{student.id}/attendance/')
    print("Parent Attendance API status:", parent_att.status_code)
    if parent_att.status_code == 200:
        data = parent_att.json().get('data', [])
        found = [d for d in data if d.get('date') == today and d.get('status') == 'ABSENT']
        if found:
            print("SUCCESS: Parent successfully received the ABSENT attendance record.")
        else:
            print("FAILURE: Attendance not found in parent response.")
            print(data)
            
    # Check Homework
    parent_hw = c.get(f'/api/v1/parent/children/{student.id}/homework/')
    print("Parent Homework API status:", parent_hw.status_code)
    if parent_hw.status_code == 200:
        data = parent_hw.json().get('data', [])
        found = [d for d in data if d.get('title') == 'Math Integration Test']
        if found:
            print("SUCCESS: Parent successfully received the Homework record.")
        else:
            print("FAILURE: Homework not found in parent response.")
            print(data)

if __name__ == '__main__':
    main()
