from django.urls import path
from . import views

app_name = 'staff_attendance'

urlpatterns = [
    # Staff-side endpoints (Phase 2)
    path('staff-attend/qr/generate/', views.qr_generate, name='qr-generate'),
    path('staff-attend/my-status/', views.my_status, name='my-status'),
    path('staff-attend/my-history/', views.my_history, name='my-history'),

    # Device-side endpoints (Phase 2-3)
    path('staff-attend/qr/validate/', views.qr_validate, name='qr-validate'),
    path('staff-attend/mark/', views.mark_attendance, name='mark-attendance'),
    path('staff-attend/device/info/', views.device_info, name='device-info'),

    # Phase 6: Admin endpoints
    path('staff-attend/admin/daily/', views.admin_daily, name='admin-daily'),
    path('staff-attend/admin/devices/', views.admin_devices, name='admin-devices'),
    path('staff-attend/admin/photo/<uuid:pk>/<str:photo_type>/', views.admin_photo, name='admin-photo'),
    path('staff-attend/admin/list/', views.admin_attendance_list, name='admin-attendance-list'),
    path('staff-attend/admin/<uuid:pk>/action/', views.admin_attendance_action, name='admin-attendance-action'),
    path('staff-attend/admin/today-summary/', views.admin_today_summary, name='admin-today-summary'),
]
