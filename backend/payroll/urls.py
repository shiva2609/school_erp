from django.urls import path
from . import views

app_name = 'payroll'

urlpatterns = [
    path('payroll/preview/', views.payroll_preview, name='payroll-preview'),
    path('payroll/generate/', views.payroll_generate, name='payroll-generate'),
    path('payroll/list/', views.payroll_list, name='payroll-list'),
    path('payroll/<uuid:pk>/pdf/', views.payroll_pdf, name='payroll-pdf'),
]
