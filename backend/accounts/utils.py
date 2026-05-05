"""
Branch access validation utility.
Centralizes branch-level permission enforcement across all ViewSets.
"""
from rest_framework.exceptions import PermissionDenied
from accounts.permissions import get_user_scope, normalize_role


def get_validated_branch_id(user, requested_branch_id):
    """
    Returns a validated branch_id string or None.
    
    Rules:
    - SUPER_ADMIN: can access any branch within their tenant.
      If requested_branch_id is provided, validates it belongs to user's tenant.
      If not provided, returns None (meaning "all branches").
    - BRANCH_ADMIN / ACCOUNTANT / TEACHER: locked to their own branch.
      The requested_branch_id query param is IGNORED — always returns user.branch_id.
    - If a branch_id is requested that doesn't belong to the user's tenant, raises PermissionDenied.
    """
    role = normalize_role(getattr(user, 'role', None))

    if role in ('OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT'):
        if requested_branch_id and requested_branch_id not in ('all', ''):
            import uuid as _uuid
            try:
                _uuid.UUID(str(requested_branch_id))
            except ValueError:
                return None  # Invalid UUID format, treat as "all branches"
            from tenants.models import Branch
            branch_qs = Branch.objects.filter(id=requested_branch_id)
            if role in ('SUPER_ADMIN', 'CHIEF_ACCOUNTANT'):
                if not user.tenant:
                    raise PermissionDenied("Access denied: no organization context for this account.")
                branch_qs = branch_qs.filter(tenant=user.tenant)
            if not branch_qs.exists():
                raise PermissionDenied("Access denied: branch does not belong to your organization.")
            return requested_branch_id
        return None  # All branches within tenant
    if role == 'ZONAL_ADMIN':
        if requested_branch_id and requested_branch_id not in ('all', ''):
            from tenants.models import Branch
            branch_qs = Branch.objects.filter(
                id=requested_branch_id,
                tenant=user.tenant,
                zone_id__in=user.zone_accesses.values_list('zone_id', flat=True),
            )
            if not branch_qs.exists():
                raise PermissionDenied("Access denied: branch is outside your zones.")
            return requested_branch_id
        return None
    else:
        # Locked to own branch regardless of what was requested
        return str(user.branch_id) if user.branch_id else None


def get_active_academic_year(tenant):
    """
    Returns the currently active AcademicYear for a tenant, or None.
    Used as a default when no academic_year_id is provided in queries.
    """
    from tenants.models import AcademicYear
    return AcademicYear.objects.filter(tenant=tenant, is_active=True).first()


def log_audit_action(user, action, model_name, record_id, details=None, tenant=None):
    """
    Logs an audit action. Since we wrap operations in @transaction.atomic,
    if the main operation fails, the audit log will also rollback.
    Pass tenant= explicitly when user may be None (e.g. webhook-driven events).
    """
    from accounts.models import AuditLog
    resolved_tenant = tenant or (getattr(user, 'tenant', None) if user else None)
    if not resolved_tenant:
        return
    AuditLog.objects.create(
        tenant=resolved_tenant,
        user=user,
        action=action,
        model_name=model_name,
        record_id=record_id,
        details=details or {}
    )


def log_bulk_action(user, action_type, record_count, details=None, tenant=None):
    """
    Logs a bulk action (e.g. bulk reminders, bulk approvals).
    Pass tenant= when the acting user may have no tenant (e.g. platform SUPER_ADMIN).
    """
    from accounts.models import BulkActionLog
    resolved = tenant or (getattr(user, 'tenant', None) if user else None)
    if not resolved:
        return
    BulkActionLog.objects.create(
        tenant=resolved,
        performed_by=user,
        action_type=action_type,
        record_count=record_count,
        details=details or {}
    )


def filter_queryset_for_user_tenant(queryset, user, tenant_lookup):
    """
    SUPER_ADMIN: no tenant filter (platform-wide read).
    Other roles: restrict to user.tenant; missing tenant yields empty queryset.
    """
    if normalize_role(getattr(user, 'role', None)) == 'OWNER':
        return queryset
    t = getattr(user, 'tenant', None)
    if not t:
        return queryset.none()
    return queryset.filter(**{tenant_lookup: t})


def apply_scope_filter(
    queryset,
    user,
    *,
    tenant_lookup='tenant_id',
    branch_lookup='branch_id',
    zone_lookup='branch__zone_id',
):
    """
    Apply centralized role scope filtering to any queryset.
    """
    scope = get_user_scope(user)
    level = scope.get('level')

    if level == 'platform':
        return queryset
    if level == 'tenant':
        tenant_id = scope.get('tenant_id')
        return queryset.filter(**{tenant_lookup: tenant_id}) if tenant_id else queryset.none()
    if level == 'zone':
        tenant_id = scope.get('tenant_id')
        zone_ids = scope.get('zone_ids') or []
        if not tenant_id or not zone_ids:
            return queryset.none()
        return queryset.filter(**{tenant_lookup: tenant_id, f'{zone_lookup}__in': zone_ids})
    if level == 'branch':
        tenant_id = scope.get('tenant_id')
        branch_id = scope.get('branch_id')
        if not tenant_id or not branch_id:
            return queryset.none()
        return queryset.filter(**{tenant_lookup: tenant_id, branch_lookup: branch_id})
    return queryset.none()

