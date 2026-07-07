from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0018_csvimportjob_update_fee_details_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='classsection',
            name='display_order',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
