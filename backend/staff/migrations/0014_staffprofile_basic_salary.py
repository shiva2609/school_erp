from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('staff', '0013_fix_employee_id_format'),
    ]
    operations = [
        migrations.AddField(
            model_name='staffprofile',
            name='basic_salary',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Monthly basic salary in INR.', max_digits=10, null=True),
        ),
    ]
