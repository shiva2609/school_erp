"""
Who may enter exam marks for a given class section + subject.

Access is granted only via explicit TeacherAssignment records.
Timetable slots are a scheduling artefact and do NOT grant marks access.

can_admin_enter_marks() is a separate helper for the consolidated marks
endpoint (used by accountants / admins). TEACHER role is excluded here —
teachers always use the per-subject can_enter_exam_marks() flow.
"""
from accounts.permissions import normalize_role, can_access_domain
from staff.models import TeacherProfile, TeacherAssignment
from students.models import ClassSection


def can_admin_enter_marks(user, class_section) -> bool:
    """
    Grant consolidated marks access to ACCOUNTANT and above (excluding TEACHER).
    Teachers must use the subject-scoped can_enter_exam_marks() instead.
    """
    if not user.is_authenticated:
        return False
    if not can_access_domain(user, 'academic'):
        return False
    if class_section.tenant_id != getattr(user, 'tenant_id', None):
        return False

    role = normalize_role(user.role)

    if role in ('OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT'):
        return True

    if role == 'ZONAL_ADMIN':
        zacc = getattr(user, 'zone_accesses', None)
        zone_ids = list(zacc.values_list('zone_id', flat=True)) if zacc is not None else []
        if not zone_ids:
            return False
        bzone = getattr(class_section.branch, 'zone_id', None)
        return bzone is None or bzone in zone_ids

    if role in ('PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'):
        if user.branch_id and str(class_section.branch_id) != str(user.branch_id):
            return False
        return True

    # TEACHER and all other roles are denied — teachers use the per-subject flow
    return False


def can_enter_exam_marks(user, class_section, subject) -> bool:
    if not user.is_authenticated:
        return False
    if not can_access_domain(user, 'academic'):
        return False
    if class_section.tenant_id != getattr(user, 'tenant_id', None):
        return False

    role = normalize_role(user.role)

    if role == 'ZONAL_ADMIN':
        zacc = getattr(user, 'zone_accesses', None)
        zone_ids = list(zacc.values_list('zone_id', flat=True)) if zacc is not None else []
        if not zone_ids:
            return False
        bzone = getattr(class_section.branch, 'zone_id', None)
        if bzone and bzone not in zone_ids:
            return False
        return True

    if role in ('OWNER', 'SUPER_ADMIN'):
        return True

    if role in ('PRINCIPAL', 'BRANCH_ADMIN'):
        if user.branch_id and str(class_section.branch_id) != str(user.branch_id):
            return False
        return True

    # ACCOUNTANT cannot enter marks — they configure assessments only
    if role != 'TEACHER':
        return False

    # Branch isolation for teachers
    if user.branch_id and str(class_section.branch_id) != str(user.branch_id):
        return False

    # Marks access is ONLY via TeacherAssignment (not TimetableSlot)
    tp = TeacherProfile.objects.filter(user=user).first()
    if not tp:
        return False

    sibling_cs_ids = ClassSection.objects.filter(
        tenant=class_section.tenant,
        branch=class_section.branch,
        grade=class_section.grade,
        section=class_section.section,
    ).values_list('id', flat=True)

    return TeacherAssignment.objects.filter(
        staff=tp,
        class_section_id__in=sibling_cs_ids,
        subject=subject,
    ).exists()
