import os
import django
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from reports.services.payments import PaymentsService
from reports.filters import BaseReportFilter
from django.test import RequestFactory
from rest_framework.request import Request
from accounts.models import User
import traceback

user = User.objects.first()
rf = RequestFactory()
django_request = rf.get('/?report_type=class')
request = Request(django_request)
request.user = user
filters = BaseReportFilter(request, user)

print("Starting test...")
try:
    rows, cat_ids, categories = PaymentsService.get_grouped_fee_balances(
        filters,
        report_type='class',
        fee_category_ids=None,
        min_amount=None,
        max_amount=None,
        by_percentage=False,
        status_filter='ALL',
    )
    print("Class rows:", len(rows))
    
    rows, cat_ids, categories = PaymentsService.get_grouped_fee_balances(
        filters,
        report_type='student',
        fee_category_ids=None,
        min_amount=None,
        max_amount=None,
        by_percentage=False,
        status_filter='ALL',
    )
    print("Student rows:", len(rows))
    print("Success!")
except Exception as e:
    print("Error occurred!")
    traceback.print_exc()
