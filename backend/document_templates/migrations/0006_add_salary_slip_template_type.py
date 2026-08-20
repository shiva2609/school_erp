from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('document_templates', '0005_alter_documenttemplate_type'),
    ]
    operations = [
        migrations.AlterField(
            model_name='documenttemplate',
            name='type',
            field=models.CharField(
                choices=[
                    ('ID_CARD', 'ID Card'),
                    ('FEE_RECEIPT', 'Fee Receipt'),
                    ('TRANSPORT_FEE_RECEIPT', 'Transport Fee Receipt'),
                    ('TRANSFER_CERTIFICATE', 'Transfer Certificate'),
                    ('HALL_TICKET', 'Hall Ticket'),
                    ('REPORT_CARD', 'Report Card (per student)'),
                    ('REPORT_CARD_SUMMARY', 'Report Card Summary (section)'),
                    ('VENDOR_BILL_RECEIPT', 'Vendor Bill Receipt'),
                    ('SALARY_SLIP', 'Salary Slip'),
                ],
                max_length=50,
            ),
        ),
    ]
