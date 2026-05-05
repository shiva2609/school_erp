"""
Rebuild report filter context from ExportJob.filters JSON (matches ReportFilters / BaseReportFilter query keys).
"""
from __future__ import annotations

import logging
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Optional

logger = logging.getLogger(__name__)


class ExportFilterBundle:
    """
    Duck-types as BaseReportFilter for AdmitService / PaymentsService (expects .user.tenant and query-like fields).
    """

    def __init__(
        self,
        *,
        tenant,
        branch_id: Optional[str] = None,
        academic_year_id: Optional[str] = None,
        start_date=None,
        end_date=None,
        class_id: Optional[str] = None,
        section_id: Optional[str] = None,
        status: Optional[str] = None,
        source: Optional[str] = None,
        payment_mode: Optional[str] = None,
        vendor_id: Optional[str] = None,
        expense_category_id: Optional[str] = None,
        expense_type: Optional[str] = None,
        vendor_name: Optional[str] = None,
        exam_id: Optional[str] = None,
    ):
        self.user = SimpleNamespace(tenant=tenant)
        self.branch_id = branch_id or None
        if self.branch_id == '':
            self.branch_id = None
        self.academic_year_id = academic_year_id or None
        if self.academic_year_id == '':
            self.academic_year_id = None
        self.start_date = start_date
        self.end_date = end_date
        self.class_id = class_id or None
        if self.class_id == '':
            self.class_id = None
        self.section_id = section_id or None
        if self.section_id == '':
            self.section_id = None
        self.status = status or None
        if self.status == '':
            self.status = None
        self.source = source or None
        if self.source == '':
            self.source = None
        self.payment_mode = payment_mode or None
        self.vendor_id = vendor_id or None
        self.expense_category_id = expense_category_id or None
        self.expense_type = (expense_type or None)
        if self.expense_type == '':
            self.expense_type = None
        self.vendor_name = (vendor_name or None)
        if self.vendor_name == '':
            self.vendor_name = None
        self.exam_id = exam_id or None
        if self.exam_id == '':
            self.exam_id = None

    @classmethod
    def from_job(cls, job) -> 'ExportFilterBundle':
        raw: dict[str, Any] = job.filters if isinstance(job.filters, dict) else {}
        start_date = end_date = None
        start_key = raw.get('startDate') or raw.get('start_date')
        end_key = raw.get('endDate') or raw.get('end_date')
        if start_key:
            try:
                start_date = datetime.strptime(str(start_key), '%Y-%m-%d').date()
            except ValueError:
                logger.warning('Invalid export filter start date: %s', start_key)
        if end_key:
            try:
                end_date = datetime.strptime(str(end_key), '%Y-%m-%d').date()
            except ValueError:
                logger.warning('Invalid export filter end date: %s', end_key)

        return cls(
            tenant=job.tenant,
            branch_id=raw.get('branch_id'),
            academic_year_id=raw.get('academic_year_id'),
            start_date=start_date,
            end_date=end_date,
            class_id=raw.get('class_id'),
            section_id=raw.get('section_id'),
            status=raw.get('status'),
            source=raw.get('source'),
            payment_mode=raw.get('payment_mode'),
            vendor_id=raw.get('vendor_id'),
            expense_category_id=raw.get('expense_category_id'),
            expense_type=raw.get('expense_type'),
            vendor_name=raw.get('vendor_name'),
            exam_id=raw.get('exam_id') or raw.get('examId'),
        )
