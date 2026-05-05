"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.contrib import admin
from django.urls import path, include
from common.health import health_check

urlpatterns = [
    path('api/health/', health_check, name='health-check'),
]

if getattr(settings, 'DJANGO_ADMIN_ENABLED', True):
    urlpatterns.append(path('admin/', admin.site.urls))

urlpatterns += [
    path('api/v1/', include('accounts.urls')),
    path('api/v1/tenants/', include('tenants.urls')),
    path('api/v1/', include('students.urls')),
    path('api/v1/', include('attendance.urls')),
    path('api/v1/', include('timetable.urls')),
    path('api/v1/', include('fees.urls')),
    path('api/v1/', include('expenses.urls')),
    path('api/v1/', include('homework.urls')),
    path('api/v1/', include('notifications.urls')),
    path('api/v1/', include('announcements.urls')),
    path('api/v1/', include('reports.urls')),
    path('api/v1/', include('staff.urls')),
    path('api/v1/', include('transport.urls')),
    path('api/v1/', include('document_templates.urls')),
    path('api/v1/', include('academics.urls')),
]
