from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'academics/exams', views.ExamTermViewSet, basename='academics-exams')

urlpatterns = [
    path('', include(router.urls)),
    path('academics/marks/context/', views.teacher_marks_context, name='academics-marks-context'),
    path('academics/marks/grid/', views.teacher_marks_grid, name='academics-marks-grid'),
    path('academics/marks/bulk/', views.teacher_marks_bulk_save, name='academics-marks-bulk'),
    path('academics/marks/publish/', views.teacher_marks_publish, name='academics-marks-publish'),
    path('academics/report-card/', views.report_card, name='academics-report-card'),
]
