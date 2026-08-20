import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('staff', '0014_staffprofile_basic_salary'),
        ('tenants', '0011_branch_shift_settings'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SalaryStatement',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('month', models.PositiveSmallIntegerField()),
                ('year', models.PositiveIntegerField()),
                ('total_working_days', models.PositiveIntegerField(default=0)),
                ('present_days', models.PositiveIntegerField(default=0)),
                ('absent_days', models.PositiveIntegerField(default=0)),
                ('late_in_count', models.PositiveIntegerField(default=0)),
                ('early_out_count', models.PositiveIntegerField(default=0)),
                ('leave_days', models.PositiveIntegerField(default=0)),
                ('half_days', models.PositiveIntegerField(default=0)),
                ('gross_salary', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('manual_deduction', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('deduction_reason', models.TextField(blank=True, default='')),
                ('net_salary', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('status', models.CharField(choices=[('DRAFT', 'Draft'), ('FINALIZED', 'Finalized')], default='DRAFT', max_length=10)),
                ('generated_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='salary_statements', to='tenants.branch')),
                ('generated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='generated_salary_statements', to=settings.AUTH_USER_MODEL)),
                ('staff', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='salary_statements', to='staff.staffprofile')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='salary_statements', to='tenants.tenant')),
            ],
            options={
                'ordering': ['-year', '-month', 'staff__employee_id'],
            },
        ),
        migrations.AddConstraint(
            model_name='salarystatement',
            constraint=models.UniqueConstraint(fields=['staff', 'month', 'year'], name='unique_salary_statement_per_staff_month'),
        ),
        migrations.AddIndex(
            model_name='salarystatement',
            index=models.Index(fields=['branch', 'year', 'month'], name='payroll_sal_branch__idx'),
        ),
        migrations.AddIndex(
            model_name='salarystatement',
            index=models.Index(fields=['tenant', 'year', 'month'], name='payroll_sal_tenant__idx'),
        ),
    ]
