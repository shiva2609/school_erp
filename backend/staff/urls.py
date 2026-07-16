from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StaffViewSet,
    StaffCategoryViewSet,
    DepartmentViewSet,
    DesignationViewSet,
    QualificationViewSet,
    SpecializationViewSet,
)

# Router for the main staff profiles
staff_router = DefaultRouter()
staff_router.register(r'staff', StaffViewSet, basename='staff')

# Router for master data — registered under different prefixes to avoid
# collision with StaffViewSet's detail route (^staff/<pk>/).
master_router = DefaultRouter()
master_router.register(r'staff-categories', StaffCategoryViewSet, basename='staff-categories')
master_router.register(r'staff-departments', DepartmentViewSet, basename='staff-departments')
master_router.register(r'staff-designations', DesignationViewSet, basename='staff-designations')
master_router.register(r'staff-qualifications', QualificationViewSet, basename='staff-qualifications')
master_router.register(r'staff-specializations', SpecializationViewSet, basename='staff-specializations')

urlpatterns = [
    path('', include(staff_router.urls)),
    path('', include(master_router.urls)),
]
