from django.utils import timezone
from datetime import datetime, time
import logging
import uuid

logger = logging.getLogger(__name__)


def _optional_uuid_param(raw):
    """Return a canonical UUID string for DB filters, or None if missing/invalid (avoids PG DataError on bad query strings)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in ('null', 'undefined', 'none', 'nan'):
        return None
    try:
        return str(uuid.UUID(s))
    except (ValueError, TypeError):
        logger.warning('Ignoring invalid UUID in report query params: %r', raw)
        return None


class BaseReportFilter:
    def __init__(self, request, user):
        self.request = request
        self.user = user
        self.branch_id = self._get_branch_id()
        self.academic_year_id = _optional_uuid_param(request.query_params.get('academic_year_id'))
        if not self.academic_year_id:
            from accounts.utils import get_active_academic_year
            active_ay = get_active_academic_year(user.tenant)
            if active_ay:
                self.academic_year_id = str(active_ay.id)
        
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
        self.section_id = _optional_uuid_param(request.query_params.get('section_id'))
        self.status = request.query_params.get('status')
        self.source = request.query_params.get('source')
        self.payment_mode = request.query_params.get('payment_mode')
        self.admission_payment = request.query_params.get('admission_payment')
        self.fixed_deposit_payment = request.query_params.get('fixed_deposit_payment')
        self.special_fee_payment = request.query_params.get('special_fee_payment')
        self.vendor_id = _optional_uuid_param(request.query_params.get('vendor_id'))
        self.expense_category_id = _optional_uuid_param(request.query_params.get('expense_category_id'))
        _et = (request.query_params.get('expense_type') or '').strip()
        _vn = (request.query_params.get('vendor_name') or '').strip()
        self.expense_type = _et or None
        self.vendor_name = _vn or None
        self.exam_id = _optional_uuid_param(request.query_params.get('exam_id'))

    def _get_branch_id(self):
        from accounts.utils import get_validated_branch_id
        requested_branch = self.request.query_params.get('branch_id')
        return get_validated_branch_id(self.user, requested_branch)
