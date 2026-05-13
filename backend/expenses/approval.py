"""Expense approval thresholds (operational spend) — keep in sync with ExpenseViewSet.perform_create auto-approve."""
from decimal import Decimal

from accounts.permissions import normalize_role

EXPENSE_AUTO_APPROVE_MAX = Decimal('3000')
EXPENSE_ZONAL_APPROVE_MAX = Decimal('5000')


def user_can_approve_submitted_expense(user, amount) -> bool:
    """
    SUBMITTED expenses above EXPENSE_AUTO_APPROVE_MAX require human approval.
    - Above EXPENSE_ZONAL_APPROVE_MAX: OWNER or tenant SUPER_ADMIN only.
    - Between (AUTO, ZONAL_MAX]: ZONAL_ADMIN or CHIEF_ACCOUNTANT, plus super/owner above.
    """
    role = normalize_role(getattr(user, 'role', None))
    amt = amount if amount is not None else Decimal('0')
    if amt <= EXPENSE_AUTO_APPROVE_MAX:
        return False
    if role in ('OWNER', 'SUPER_ADMIN'):
        return True
    if amt > EXPENSE_ZONAL_APPROVE_MAX:
        return False
    return role in ('ZONAL_ADMIN', 'CHIEF_ACCOUNTANT')
