from django.contrib import admin
from .models import SalaryStatement

@admin.register(SalaryStatement)
class SalaryStatementAdmin(admin.ModelAdmin):
    list_display = ['staff', 'month', 'year', 'gross_salary', 'net_salary', 'status']
    list_filter = ['year', 'month', 'status']
    search_fields = ['staff__employee_id', 'staff__user__first_name', 'staff__user__last_name']
