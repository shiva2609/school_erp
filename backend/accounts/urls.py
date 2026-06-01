from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LoginView, RefreshView, LogoutView, MeView, UserViewSet, ChangePasswordView, SuperAdminAuditLogViewSet, ImpersonateView
from .mfa_views import MfaVerifyView, MfaSetupView, MfaConfirmView, MfaDisableView
from .password_reset import PasswordResetRequestView, PasswordResetConfirmView
from . import parent_views
from . import teacher_views

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'super-admin/audit-logs', SuperAdminAuditLogViewSet, basename='super-admin-audit-logs')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', LoginView.as_view(), name='auth_login'),
    path('auth/mfa/verify/', MfaVerifyView.as_view(), name='auth_mfa_verify'),
    path('auth/mfa/setup/', MfaSetupView.as_view(), name='auth_mfa_setup'),
    path('auth/mfa/confirm/', MfaConfirmView.as_view(), name='auth_mfa_confirm'),
    path('auth/mfa/disable/', MfaDisableView.as_view(), name='auth_mfa_disable'),
    path('auth/impersonate/', ImpersonateView.as_view(), name='auth_impersonate'),
    path('auth/refresh/', RefreshView.as_view(), name='auth_refresh'),
    path('auth/logout/', LogoutView.as_view(), name='auth_logout'),
    path('auth/me/', MeView.as_view(), name='auth_me'),
    path('auth/password/change/', ChangePasswordView.as_view(), name='auth_change_password'),
    path('auth/password/reset/', PasswordResetRequestView.as_view(), name='auth_password_reset'),
    path('auth/password/reset/confirm/', PasswordResetConfirmView.as_view(), name='auth_password_reset_confirm'),
    # Parent Portal
    path('parent/children/', parent_views.parent_children, name='parent_children'),
    path('parent/children/<uuid:student_id>/profile/', parent_views.parent_child_profile, name='parent_child_profile'),
    path('parent/children/<uuid:student_id>/fees/invoices/', parent_views.parent_child_invoices, name='parent_child_invoices'),
    path('parent/children/<uuid:student_id>/attendance/', parent_views.parent_child_attendance, name='parent_child_attendance'),
    path('parent/children/<uuid:student_id>/homework/', parent_views.parent_child_homework, name='parent_child_homework'),
    path('parent/children/<uuid:student_id>/homework/<uuid:homework_id>/acknowledge/', parent_views.parent_acknowledge_homework, name='parent_acknowledge_homework'),
    path('parent/children/<uuid:student_id>/timetable/', parent_views.parent_child_timetable, name='parent_child_timetable'),
    path('parent/children/<uuid:student_id>/transport/', parent_views.parent_child_transport, name='parent_child_transport'),
    path('parent/children/<uuid:student_id>/marks/', parent_views.parent_child_marks, name='parent_child_marks'),
    path('parent/announcements/', parent_views.parent_announcements, name='parent_announcements'),
    # Teacher Portal
    path('teacher/dashboard/', teacher_views.teacher_dashboard, name='teacher_dashboard'),
]
