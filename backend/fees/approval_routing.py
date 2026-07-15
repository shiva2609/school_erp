"""
Fee reduction approval routing: zonal vs tenant super admin by discount size and branch zone.
"""
from decimal import Decimal

from accounts.permissions import normalize_role
from accounts.utils import apply_scope_filter, filter_queryset_for_user_tenant

# Inclusive ceiling: zonal admin handles discounts up to and including this amount (when branch has a zone).
FEE_DISCOUNT_ZONAL_MAX = Decimal('2000')


def compute_fee_approval_routing(branch, standard_total, offered_total):
    """
    Returns (routing, discount_amount).
    - ZONAL: branch has a zone and discount <= 2000.
    - TENANT_SUPER: discount > 2000 or branch has no zone (tenant SUPER_ADMIN only).
    """
    std = standard_total if standard_total is not None else Decimal('0')
    off = offered_total if offered_total is not None else Decimal('0')
    discount = std - off
    if discount < 0:
        discount = Decimal('0')
    zone_id = getattr(branch, 'zone_id', None)
    if zone_id and discount <= FEE_DISCOUNT_ZONAL_MAX:
        return 'ZONAL', discount
    return 'TENANT_SUPER', discount


def user_can_access_fee_approval_api(user):
    role = normalize_role(getattr(user, 'role', None))
    allowed_roles = ('SUPER_ADMIN', 'ZONAL_ADMIN', 'OWNER', 'CHIEF_ACCOUNTANT', 'PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT')
    if role not in allowed_roles:
        return False
    if not getattr(user, 'tenant_id', None):
        return False
    return True


def fee_approval_queryset_for_user(user, queryset):
    qs = filter_queryset_for_user_tenant(queryset, user, 'tenant')
    role = normalize_role(getattr(user, 'role', None))
    if role in ('SUPER_ADMIN', 'OWNER', 'CHIEF_ACCOUNTANT'):
        return qs
    if role == 'ZONAL_ADMIN':
        return apply_scope_filter(
            qs.filter(routing='ZONAL'),
            user,
            tenant_lookup='tenant_id',
            branch_lookup='branch_id',
            zone_lookup='branch__zone_id',
        )
    if role in ('PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'):
        return apply_scope_filter(
            qs,
            user,
            tenant_lookup='tenant_id',
            branch_lookup='branch_id',
            zone_lookup='branch__zone_id',
        )
    return qs.none()


def user_can_act_on_fee_approval(user, approval):
    role = normalize_role(getattr(user, 'role', None))
    if user.tenant_id != approval.tenant_id:
        return False
    if role == 'SUPER_ADMIN':
        return True
    if approval.routing == 'ZONAL':
        if role != 'ZONAL_ADMIN':
            return False
        zone_ids = set(user.zone_accesses.values_list('zone_id', flat=True))
        zid = getattr(approval.branch, 'zone_id', None)
        return zid is not None and zid in zone_ids
    return False
