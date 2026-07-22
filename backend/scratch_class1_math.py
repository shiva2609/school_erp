import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from fees.models import FeeInvoice, FeeInvoiceItem
from django.db.models import Sum

invoices = FeeInvoice.objects.filter(student__class_section__grade='1')
print("Total Invoices:", invoices.count())
print("Gross:", invoices.aggregate(Sum('gross_amount'))['gross_amount__sum'])
print("Net:", invoices.aggregate(Sum('net_amount'))['net_amount__sum'])
print("Paid:", invoices.aggregate(Sum('paid_amount'))['paid_amount__sum'])
print("Outstanding:", invoices.aggregate(Sum('outstanding_amount'))['outstanding_amount__sum'])
print("Late Fee:", invoices.aggregate(Sum('late_fee_amount'))['late_fee_amount__sum'])

items = FeeInvoiceItem.objects.filter(invoice__student__class_section__grade='1')
for category in items.values('category__name').annotate(
    gross=Sum('original_amount'),
    net=Sum('final_amount'),
    concession=Sum('concession')
):
    print(f"Cat: {category['category__name']}, Gross: {category['gross']}, Net: {category['net']}, Concession: {category['concession']}")
