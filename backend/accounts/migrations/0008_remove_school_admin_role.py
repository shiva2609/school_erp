# Generated manually — remap legacy School Admin to Super Admin (organization).

from django.db import migrations, models


def forwards_school_admin_to_super_admin(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(role='SCHOOL_ADMIN').update(role='SUPER_ADMIN')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_role_refactor_and_zone_access'),
    ]

    operations = [
        migrations.RunPython(forwards_school_admin_to_super_admin, noop_reverse),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('OWNER', 'Owner (Platform Level)'),
                    ('SUPER_ADMIN', 'Super Admin (Organization / Tenant)'),
                    ('ZONAL_ADMIN', 'Zonal Admin'),
                    ('CHIEF_ACCOUNTANT', 'Chief Accountant'),
                    ('PRINCIPAL', 'Principal'),
                    ('BRANCH_ADMIN', 'Branch Admin (School Level)'),
                    ('ACCOUNTANT', 'Accountant'),
                    ('TEACHER', 'Teacher'),
                    ('STUDENT', 'Student'),
                    ('PARENT', 'Parent'),
                ],
                max_length=30,
            ),
        ),
    ]
