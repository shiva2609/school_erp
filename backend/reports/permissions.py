from rest_framework import permissions
from accounts.permissions import has_min_role, normalize_role, can_access_domain

class ReportAccessPermission(permissions.BasePermission):
    """
    Allows access only to SUPER_ADMIN (tenant), BRANCH_ADMIN, and ACCOUNTANT (not teachers/parents).
    Blocks TEACHER and PARENT.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        role = normalize_role(request.user.role)
        if role in ['TEACHER', 'STUDENT', 'PARENT']:
            return False

        # Preserve backward compatibility with rank checks while enforcing domain capability.
        return has_min_role(request.user, 'ACCOUNTANT') and (
            can_access_domain(request.user, 'finance') or can_access_domain(request.user, 'academic')
        )
