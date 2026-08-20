from rest_framework import serializers
from .models import SalaryStatement


class SalaryStatementSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()
    designation = serializers.SerializerMethodField()

    class Meta:
        model = SalaryStatement
        fields = [
            'id', 'staff', 'staff_name', 'employee_id', 'designation',
            'month', 'year',
            'total_working_days', 'present_days', 'absent_days',
            'late_in_count', 'early_out_count', 'leave_days', 'half_days',
            'gross_salary', 'manual_deduction', 'deduction_reason', 'net_salary',
            'status', 'generated_at', 'updated_at',
        ]
        read_only_fields = ['id', 'generated_at', 'updated_at']

    def get_staff_name(self, obj):
        if obj.staff and obj.staff.user:
            return f"{obj.staff.user.first_name} {obj.staff.user.last_name}".strip()
        return ''

    def get_employee_id(self, obj):
        return obj.staff.employee_id if obj.staff else ''

    def get_designation(self, obj):
        if obj.staff and obj.staff.designation:
            return obj.staff.designation.name
        return ''
