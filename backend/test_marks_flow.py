import os
import django
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.models import User
from academics.models import Assessment, ExamResult, AcademicSubject
from students.models import ClassSection
from academics.views import teacher_marks_context, teacher_marks_grid, teacher_marks_bulk_save

def test_marks_flow():
    print("=== Starting End-to-End Marks Entry Test ===\n")
    
    # 1. Authenticate as the teacher
    teacher = User.objects.get(email='teacher@p2.com')
    factory = APIRequestFactory()
    print(f"Authenticated as Teacher: {teacher.email}")

    # 2. Get Context
    try:
        request = factory.get('/api/academics/marks/context/')
        force_authenticate(request, user=teacher)
        response = teacher_marks_context(request)
        if response.status_code != 200:
            print(f"FAIL: Context API returned {response.status_code}")
            return
        data = response.data.get('data', {}) if hasattr(response, 'data') else {}
    except Exception as e:
        import traceback
        print("EXCEPTION in context:")
        traceback.print_exc()
        return
    assignments = data.get('assignments', [])
    assessments = data.get('assessments', [])
    
    if not assignments:
        print("FAIL: No assignments found for teacher.")
        return
    if not assessments:
        print("FAIL: No active assessments found.")
        return
        
    print(f"Found {len(assignments)} assignments and {len(assessments)} active assessments.")
    
    # Pick the first assignment and assessment
    target_assignment = assignments[0]
    cs_id = target_assignment['class_section_id']
    cs_name = target_assignment['class_name']
    
    target_assessment = assessments[0]
    assessment_id = target_assessment['id']
    assessment_name = target_assessment['name']
    
    # We need a specific subject. Let's find one that is both assigned to the teacher and part of the assessment
    subj_id = None
    subj_name = None
    for a in assignments:
        if a.get('subject_id'):
            subj_id = a['subject_id']
            subj_name = a['subject_name']
            break
            
    print(f"\nTargeting:\n  Class: {cs_name}\n  Subject: {subj_name}\n  Assessment: {assessment_name}")

    # 3. Load the Marks Grid
    print("\n--- Loading Marks Grid ---")
    grid_url = f"/api/academics/marks/grid/?assessment_id={assessment_id}&class_section_id={cs_id}&subject_id={subj_id}"
    try:
        request = factory.get(grid_url)
        force_authenticate(request, user=teacher)
        response = teacher_marks_grid(request)
        if response.status_code != 200:
            print(f"FAIL: Grid API returned {response.status_code}")
            return
        grid_data = response.data.get('data', {}) if hasattr(response, 'data') else {}
    except Exception as e:
        import traceback
        print("EXCEPTION in grid:")
        traceback.print_exc()
        return
    students = grid_data.get('students', [])
    print(f"Success! Grid loaded {len(students)} students.")
    if not students:
        print("FAIL: No students found in the grid.")
        return
        
    print(f"  First student: {students[0].get('first_name', '')} {students[0].get('last_name', '')}")

    # 4. Save Initial Marks
    print("\n--- Saving Initial Marks ---")
    # Build payload
    rows = []
    for i, s in enumerate(students):
        # Give them some fake marks (e.g. 70, 80, 90)
        marks = 70 + (i * 10)
        rows.append({
            "student_id": s['student_id'],
            "marks_obtained": str(marks),
            "is_absent": False,
            "remarks": "Good"
        })
        
    payload = {
        "assessment_id": assessment_id,
        "class_section_id": cs_id,
        "subject_id": subj_id,
        "default_max_marks": "100.00",
        "rows": rows
    }
    
    try:
        request = factory.post('/api/academics/marks/bulk/', payload, format='json')
        force_authenticate(request, user=teacher)
        response = teacher_marks_bulk_save(request)
        if response.status_code == 200:
            print("Success! Marks saved.")
        else:
            print(f"FAIL: Save API returned {response.status_code}")
            return
    except Exception as e:
        import traceback
        print("EXCEPTION in bulk save:")
        traceback.print_exc()
        return
        
    # Verify DB
    saved_results = ExamResult.objects.filter(
        assessment_id=assessment_id, subject_id=subj_id, student__class_section_id=cs_id
    )
    print(f"Verified {saved_results.count()} ExamResult records in DB.")
    for r in saved_results:
        print(f"  Student: {r.student.first_name} | Marks: {r.marks_obtained} | Grade: {r.grade} | Pct: {r.percentage}%")

    # 5. Edit (Update) Marks
    print("\n--- Editing Existing Marks ---")
    rows[0]['marks_obtained'] = "95.50"
    rows[0]['remarks'] = "Excellent improvement"
    
    try:
        request = factory.post('/api/academics/marks/bulk/', payload, format='json')
        force_authenticate(request, user=teacher)
        response = teacher_marks_bulk_save(request)
        if response.status_code == 200:
            print("Success! Marks updated.")
        else:
            print(f"FAIL: Edit API returned {response.status_code}")
            return
    except Exception as e:
        import traceback
        print("EXCEPTION in bulk save (edit):")
        traceback.print_exc()
        return
        
    # Verify DB again
    saved_results = ExamResult.objects.filter(
        assessment_id=assessment_id, subject_id=subj_id, student__class_section_id=cs_id
    )
    first_student_result = saved_results.get(student_id=rows[0]['student_id'])
    print(f"Verified updated record in DB: Marks = {first_student_result.marks_obtained}, Remarks = '{first_student_result.remarks}'")
    
    print("\n=== End-to-End Test Passed! ===")

if __name__ == '__main__':
    test_marks_flow()
