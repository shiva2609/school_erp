from django.urls import path
from . import views

urlpatterns = [
    path('academics/marks/context/', views.teacher_marks_context, name='academics-marks-context'),
    path('academics/marks/grid/', views.teacher_marks_grid, name='academics-marks-grid'),
    path('academics/marks/bulk/', views.teacher_marks_bulk_save, name='academics-marks-bulk'),
]
