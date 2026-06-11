"""Expense approval thresholds (operational spend) — keep in sync with ExpenseViewSet.perform_create auto-approve."""
from decimal import Decimal

from accounts.permissions import normalize_role

EXPENSE_AUTO_APPROVE_MAX = Decimal('3000')
EXPENSE_ZONAL_APPROVE_MAX = Decimal('5000')


def user_can_approve_submitted_expense(user, amount) -> bool:
    """
    Checks if a user is authorized to approve an expense/bill of a given amount.
    - OWNER and SUPER_ADMIN can approve any amount.
    - ZONAL_ADMIN and CHIEF_ACCOUNTANT can approve up to EXPENSE_ZONAL_APPROVE_MAX.
    """
    role = normalize_role(getattr(user, 'role', None))
    amt = amount if amount is not None else Decimal('0')
    
    if role in ('OWNER', 'SUPER_ADMIN'):
        return True
        
    if role in ('ZONAL_ADMIN', 'CHIEF_ACCOUNTANT'):
        return amt <= EXPENSE_ZONAL_APPROVE_MAX
        
    return False
