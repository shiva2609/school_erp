from django.db import migrations

def copy_subjects(apps, schema_editor):
    TimetableSubject = apps.get_model('timetable', 'Subject')
    AcademicSubject = apps.get_model('academics', 'AcademicSubject')

    subjects = TimetableSubject.objects.all()
    academic_subjects_to_create = []
    
    for sub in subjects:
        if not AcademicSubject.objects.filter(id=sub.id).exists():
            academic_subjects_to_create.append(
                AcademicSubject(
                    id=sub.id,
                    tenant_id=sub.tenant_id,
                    branch_id=sub.branch_id,
                    name=sub.name
                )
            )
    
    # We use ignore_conflicts for safety if it already exists
    AcademicSubject.objects.bulk_create(academic_subjects_to_create, ignore_conflicts=True)

class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0007_alter_examresult_subject_and_more'),
        ('timetable', '0003_alter_timetableslot_teacher'),
    ]

    operations = [
        migrations.RunPython(copy_subjects, migrations.RunPython.noop),
    ]
