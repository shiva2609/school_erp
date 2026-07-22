from django.contrib import admin
from .models import Period, TimetableSlot

@admin.register(Period)
class PeriodAdmin(admin.ModelAdmin):
    list_display = ['name', 'branch', 'period_type', 'start_time', 'end_time', 'order']
    list_filter = ['branch', 'period_type']

@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ['class_section', 'day_of_week', 'period', 'subject', 'teacher']
    list_filter = ['day_of_week']
