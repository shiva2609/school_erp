from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'academics/subjects', views.AcademicSubjectViewSet, basename='academics-subjects')
router.register(r'academics/assessments', views.AssessmentViewSet, basename='academics-assessments')

urlpatterns = [
    path('', include(router.urls)),
    # Existing endpoints — unchanged
    path('academics/marks/context/', views.teacher_marks_context, name='academics-marks-context'),
    path('academics/marks/grid/', views.teacher_marks_grid, name='academics-marks-grid'),
    path('academics/marks/bulk/', views.teacher_marks_bulk_save, name='academics-marks-bulk'),
    path('academics/marks/publish/', views.teacher_marks_publish, name='academics-marks-publish'),
    path('academics/report-card/', views.report_card, name='academics-report-card'),
    # NEW: helper endpoint for Add Exam form subject loading
    path('academics/subjects-for-class/', views.subjects_for_class, name='academics-subjects-for-class'),
    # NEW: Consolidated marks endpoints (accountant / admin view across all subjects)
    path('academics/marks/consolidated/', views.consolidated_marks_grid, name='academics-marks-consolidated'),
    path('academics/marks/consolidated-bulk/', views.consolidated_marks_bulk_save, name='academics-marks-consolidated-bulk'),
]
