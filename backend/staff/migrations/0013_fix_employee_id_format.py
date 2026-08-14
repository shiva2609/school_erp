"""
Data migration to regenerate employee IDs using the corrected format:
{tenant.admission_no_prefix}{branch.staff_code}{3-digit-seq}

Example: KGS02001 (where KGS = tenant prefix, 02 = branch staff code, 001 = sequence)
"""
from django.db import migrations, connection


def regenerate_employee_ids(apps, schema_editor):
    StaffProfile = apps.get_model('staff', 'StaffProfile')
    StaffIdCounter = apps.get_model('staff', 'StaffIdCounter')
    
    cursor = connection.cursor()

    # Step 1: Clear all employee_ids using raw SQL to avoid constraint issues
    cursor.execute(
        "UPDATE staff_staffprofile SET employee_id = 'TEMP_' || id"
    )

    # Step 2: Group staff by branch and regenerate IDs
    branches_with_staff = (
        StaffProfile.objects
        .filter(branch__isnull=False, tenant__isnull=False)
        .values_list('branch_id', flat=True)
        .distinct()
    )

    for branch_id in branches_with_staff:
        staff_in_branch = (
            StaffProfile.objects
            .filter(branch_id=branch_id)
            .select_related('tenant', 'branch')
            .order_by('created_at')
        )

        seq = 0
        for staff in staff_in_branch:
            seq += 1
            tenant_prefix = ''
            if staff.tenant and staff.tenant.admission_no_prefix:
                tenant_prefix = staff.tenant.admission_no_prefix.strip().upper()

            staff_code = '01'
            if staff.branch and staff.branch.staff_code:
                staff_code = staff.branch.staff_code.strip().upper()

            new_id = f"{tenant_prefix}{staff_code}{seq:03d}"
            cursor.execute(
                "UPDATE staff_staffprofile SET employee_id = %s WHERE id = %s",
                [new_id, str(staff.pk)]
            )

        # Reset counter to match
        counter_exists = StaffIdCounter.objects.filter(branch_id=branch_id).exists()
        if counter_exists:
            StaffIdCounter.objects.filter(branch_id=branch_id).update(last_seq=seq)
        else:
            StaffIdCounter.objects.create(branch_id=branch_id, last_seq=seq)

    # Step 3: Handle orphan staff (no branch or no tenant)
    cursor.execute(
        "UPDATE staff_staffprofile SET employee_id = 'UNASSIGNED-' || SUBSTR(CAST(id AS TEXT), 1, 8) "
        "WHERE employee_id LIKE 'TEMP_%'"
    )


def reverse_noop(apps, schema_editor):
    """No reverse — employee IDs cannot be reliably restored."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('staff', '0012_staffprofile_status_reason'),
        ('tenants', '0010_add_branch_staff_code'),
    ]

    operations = [
        migrations.RunPython(regenerate_employee_ids, reverse_noop),
    ]
