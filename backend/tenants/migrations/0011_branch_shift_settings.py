from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0010_add_branch_staff_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='branch',
            name='shift_start_time',
            field=models.TimeField(default='09:00', help_text='Standard shift start time (e.g. 09:00). Used to auto-tag Late-In.'),
        ),
        migrations.AddField(
            model_name='branch',
            name='shift_end_time',
            field=models.TimeField(default='17:00', help_text='Standard shift end time (e.g. 17:00). Used to auto-tag Early-Out.'),
        ),
        migrations.AddField(
            model_name='branch',
            name='late_in_grace_minutes',
            field=models.PositiveIntegerField(default=15, help_text='Grace period in minutes after shift start before marking as Late-In.'),
        ),
        migrations.AddField(
            model_name='branch',
            name='early_out_grace_minutes',
            field=models.PositiveIntegerField(default=15, help_text='Grace period in minutes before shift end; checkout before this is Early-Out.'),
        ),
    ]
