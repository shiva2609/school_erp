from django.db import migrations, models


def backfill_locked_amount(apps, schema_editor):
    FeeStructureItem = apps.get_model('fees', 'FeeStructureItem')
    FeeStructureItem.objects.filter(locked_amount__isnull=True).update(locked_amount=models.F('amount'))


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0010_feeapproval_zonal_includes_2000'),
    ]

    operations = [
        migrations.AddField(
            model_name='feestructureitem',
            name='locked_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.RunPython(backfill_locked_amount, migrations.RunPython.noop),
    ]
