from django.utils import timezone
from datetime import datetime, time
import logging

logger = logging.getLogger(__name__)

class BaseReportFilter:
    def __init__(self, request, user):
        self.request = request
        self.user = user
        self.branch_id = self._get_branch_id()
        self.academic_year_id = request.query_params.get('academic_year_id')
        
        # Parse Dates
        start_date_str = request.query_params.get('startDate')
        end_date_str = request.query_params.get('endDate')
        
        self.start_date = None
        self.end_date = None
        
        try:
            if start_date_str:
                self.start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            if end_date_str:
                self.end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except ValueError:
            logger.warning("Invalid date format. Expected YYYY-MM-DD.")
            
        self.class_id = request.query_params.get('class_id')
        self.section_id = request.query_params.get('section_id')
        self.status = request.query_params.get('status')
        self.source = request.query_params.get('source')
        self.payment_mode = request.query_params.get('payment_mode')
        self.vendor_id = request.query_params.get('vendor_id')
        self.expense_category_id = request.query_params.get('expense_category_id')
        _et = (request.query_params.get('expense_type') or '').strip()
        _vn = (request.query_params.get('vendor_name') or '').strip()
        self.expense_type = _et or None
        self.vendor_name = _vn or None
        self.exam_id = request.query_params.get('exam_id')

    def _get_branch_id(self):
        from accounts.utils import get_validated_branch_id
        requested_branch = self.request.query_params.get('branch_id')
        return get_validated_branch_id(self.user, requested_branch)
