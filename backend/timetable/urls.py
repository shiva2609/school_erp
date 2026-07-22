from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'timetable/periods', views.PeriodViewSet, basename='period')
router.register(r'timetable/demands', views.ClassSubjectDemandViewSet, basename='demand')
router.register(r'timetable/slots', views.TimetableSlotViewSet, basename='timetableslot')

urlpatterns = [
    path('', include(router.urls)),
]
