"""
Who may enter exam marks for a given class section + subject.
"""
from accounts.permissions import normalize_role, can_access_domain
from staff.models import TeacherProfile, TeacherAssignment
from timetable.models import TimetableSlot


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

    if role in ('PRINCIPAL', 'BRANCH_ADMIN', 'TEACHER'):
        if user.branch_id and str(class_section.branch_id) != str(user.branch_id):
            return False

    if role in ('PRINCIPAL', 'BRANCH_ADMIN'):
        return True

    if role != 'TEACHER':
        return False

    # Assignment is already tied to this class section (which has its academic year).
    # Do not require assignment.academic_year_id == class_section.academic_year_id — that
    # often drifts after year setup fixes and would wrongly block legitimate teachers.
    tp = TeacherProfile.objects.filter(user=user).first()
    if tp and TeacherAssignment.objects.filter(
        teacher=tp,
        class_section=class_section,
        subject=subject,
    ).exists():
        return True

    return TimetableSlot.objects.filter(
        teacher=user,
        class_section=class_section,
        subject=subject,
    ).exclude(subject__isnull=True).exists()
