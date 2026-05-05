from rest_framework import permissions
from accounts.permissions import can_access_domain


class AcademicDomainPermission(permissions.BasePermission):
    """Users who may work in the academic domain (teachers, principals, etc.)."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and can_access_domain(request.user, 'academic')
        )
