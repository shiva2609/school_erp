from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'rate-slabs', views.TransportRateSlabViewSet, basename='transport-rate-slab')
router.register(r'students', views.StudentTransportViewSet, basename='student-transport')
router.register(r'enrollments', views.TransportFeeEnrollmentViewSet, basename='transport-fee-enrollment')

urlpatterns = [
    path('transport/', include(router.urls)),
    path('transport/opt-in/', views.student_transport_opt_in, name='transport-opt-in'),
    path('transport/opt-out/', views.student_transport_opt_out, name='transport-opt-out'),
]
