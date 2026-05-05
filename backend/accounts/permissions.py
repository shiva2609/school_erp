from rest_framework import permissions

PLATFORM_OWNER_ROLES = {'OWNER'}
TENANT_FULL_ACCESS_ROLES = {'SUPER_ADMIN'}
TENANT_FINANCE_ROLES = {'CHIEF_ACCOUNTANT'}
ZONE_SCOPED_ROLES = {'ZONAL_ADMIN'}
BRANCH_SCOPED_ROLES = {'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT', 'TEACHER', 'STUDENT', 'PARENT'}

# Single source of truth for role hierarchy across the entire system.
# Higher number = more privilege. Used by has_min_role() for permission checks.
ROLE_HIERARCHY = {
    'OWNER': 120,
    'SUPER_ADMIN': 100,
    'CHIEF_ACCOUNTANT': 85,
    'ZONAL_ADMIN': 80,
    'PRINCIPAL': 70,
    'BRANCH_ADMIN': 65,
    'ACCOUNTANT': 60,
    'TEACHER': 40,
    'STUDENT': 20,
    'PARENT': 10,
}


def normalize_role(role):
    if not role:
        return role
    # Removed role; old DB values and stale tokens normalize to tenant super admin.
    if role == 'SCHOOL_ADMIN':
        return 'SUPER_ADMIN'
    if role in ROLE_HIERARCHY:
        return role
    return role


def role_in(user, allowed_roles):
    user_role = normalize_role(getattr(user, 'role', None))
    normalized = {normalize_role(r) for r in allowed_roles}
    return user_role in normalized

def has_min_role(user, min_role):
    if not user.is_authenticated:
        return False
    user_rank = ROLE_HIERARCHY.get(normalize_role(user.role), 0)
    min_rank = ROLE_HIERARCHY.get(normalize_role(min_role), 0)
    return user_rank >= min_rank


def get_user_scope(user):
    role = normalize_role(getattr(user, 'role', None))
    if role in PLATFORM_OWNER_ROLES:
        return {'level': 'platform'}
    if role in TENANT_FULL_ACCESS_ROLES or role in TENANT_FINANCE_ROLES:
        return {'level': 'tenant', 'tenant_id': getattr(user, 'tenant_id', None)}
    if role in ZONE_SCOPED_ROLES:
        zone_ids = list(getattr(user, 'zone_accesses', []).values_list('zone_id', flat=True))
        return {'level': 'zone', 'tenant_id': getattr(user, 'tenant_id', None), 'zone_ids': zone_ids}
    if role in BRANCH_SCOPED_ROLES:
        return {
            'level': 'branch',
            'tenant_id': getattr(user, 'tenant_id', None),
            'branch_id': getattr(user, 'branch_id', None),
        }
    return {'level': 'none'}


def can_access_domain(user, domain):
    role = normalize_role(getattr(user, 'role', None))
    allowed = {
        'finance': {'OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT', 'ZONAL_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'},
        'academic': {'OWNER', 'SUPER_ADMIN', 'ZONAL_ADMIN', 'PRINCIPAL', 'BRANCH_ADMIN', 'TEACHER'},
        'settings': {'OWNER', 'SUPER_ADMIN'},
    }
    return role in allowed.get(domain, set())

class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        # Backward compatible: legacy platform SUPER_ADMIN remains valid until full role migration is complete.
        return role_in(request.user, {'OWNER', 'SUPER_ADMIN'})

class IsSchoolAdminOrAbove(permissions.BasePermission):
    """Tenant super admin and above (rank >= SUPER_ADMIN)."""

    def has_permission(self, request, view):
        return has_min_role(request.user, 'SUPER_ADMIN')

class IsBranchAdminOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        return has_min_role(request.user, 'BRANCH_ADMIN')

class IsAccountantOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        return has_min_role(request.user, 'ACCOUNTANT')

class IsTeacherOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        return has_min_role(request.user, 'TEACHER')

class IsParentOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        return has_min_role(request.user, 'PARENT')

