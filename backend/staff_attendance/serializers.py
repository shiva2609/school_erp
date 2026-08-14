from rest_framework import serializers
from .models import StaffAttendanceTransaction, StaffAttendance


class QRGenerateResponseSerializer(serializers.Serializer):
    """Response for QR code generation."""
    qr_data = serializers.CharField(help_text='Token to encode in QR code')
    expires_in = serializers.IntegerField(help_text='Seconds until token expires')
    transaction_id = serializers.UUIDField(help_text='Transaction ID for tracking')


class QRValidateRequestSerializer(serializers.Serializer):
    """Request from attendance device to validate a scanned QR token."""
    token = serializers.CharField(max_length=64, help_text='Scanned QR token')


class QRValidateResponseSerializer(serializers.Serializer):
    """Response after successful QR validation."""
    transaction_id = serializers.UUIDField()
    employee_id = serializers.CharField()
    staff_name = serializers.CharField()
    branch_name = serializers.CharField()
    designation = serializers.CharField(allow_blank=True)
    action = serializers.ChoiceField(choices=['CHECK_IN', 'CHECK_OUT', 'COMPLETED'])
    message = serializers.CharField()


class MyStatusResponseSerializer(serializers.Serializer):
    """Response for staff's own attendance status today."""
    date = serializers.DateField()
    status = serializers.CharField()
    check_in_at = serializers.DateTimeField(allow_null=True)
    check_out_at = serializers.DateTimeField(allow_null=True)
    can_generate_qr = serializers.BooleanField(
        help_text='Whether the staff can generate a QR code right now'
    )
    message = serializers.CharField()


class StaffAttendanceSerializer(serializers.ModelSerializer):
    """Full serializer for attendance records (used in history/reports)."""
    staff_name = serializers.SerializerMethodField()
    employee_id = serializers.SerializerMethodField()
    designation = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffAttendance
        fields = [
            'id', 'date', 'status', 'source',
            'check_in_at', 'check_out_at',
            'check_in_photo', 'check_out_photo',
            'staff_name', 'employee_id', 'designation', 'branch_name',
            'approval_status', 'approved_by_name', 'approved_at',
            'remarks', 'created_at',
        ]

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

    def get_branch_name(self, obj):
        return obj.branch.name if obj.branch else ''

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip()
        return ''
