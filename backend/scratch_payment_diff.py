import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from fees.models import FeeInvoice, Payment
from django.db.models import Sum

print("Invoice Paid Sum:", FeeInvoice.objects.aggregate(Sum('paid_amount'))['paid_amount__sum'])
print("Payment Completed Sum:", Payment.objects.filter(status='COMPLETED').aggregate(Sum('amount'))['amount__sum'])
