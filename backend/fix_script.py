import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "school_erp.settings")
django.setup()

from reports.services.payments import PaymentsService
from accounts.models import User
from reports.filters import BaseReportFilter
from django.test import RequestFactory

class DummyUser:
    def __init__(self):
        self.tenant_id = User.objects.first().tenant_id
        self.role = 'SUPER_ADMIN'
        self.tenant = User.objects.first().tenant

rf = RequestFactory()
request = rf.get('/?report_type=class')
request.user = DummyUser()
filters = BaseReportFilter(request, request.user)

try:
    rows, cats, _ = PaymentsService.get_grouped_fee_balances(filters, report_type='class')
    print("Class report rows:", rows)
except Exception as e:
    print("Error:", e)
