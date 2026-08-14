from staff_attendance.models import StaffAttendance
from reports.services.base import BaseReportService

class StaffReportsService:
    @staticmethod
    def get_staff_attendance(filters):
        qs = StaffAttendance.objects.select_related('staff', 'staff__user', 'staff__branch')
        
        # Branch isolation:
        qs = qs.filter(tenant=filters.user.tenant)
        if filters.branch_id:
            qs = qs.filter(staff__branch_id=filters.branch_id)
            
        qs = BaseReportService.apply_date_range(qs, 'date', filters.start_date, filters.end_date)
        
        if filters.status:
            qs = qs.filter(status=filters.status)

        return qs.order_by('-date')
