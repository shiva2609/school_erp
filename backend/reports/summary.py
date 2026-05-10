"""Aggregate totals for report API responses (paired with ReportPagination.summary)."""
from decimal import Decimal

from django.db.models import Sum


def _s(v):
    if v is None:
        return '0'
    return str(v)


def fee_invoice_totals(qs):
    a = qs.aggregate(
        total_outstanding=Sum('outstanding_amount'),
        total_paid=Sum('paid_amount'),
        total_net=Sum('net_amount'),
        total_gross=Sum('gross_amount'),
    )
    return {k: _s(a[k]) for k in a}


def payment_amount_total(qs):
    return {'total_amount': _s(qs.aggregate(t=Sum('amount'))['t'])}


def expense_amount_total(qs):
    return {'total_amount': _s(qs.aggregate(t=Sum('amount'))['t'])}


def concession_totals(qs):
    a = qs.aggregate(
        total_concession=Sum('concession_amount'),
        total_net=Sum('net_amount'),
        total_gross=Sum('gross_amount'),
    )
    return {k: _s(a[k]) for k in a}


def transaction_ledger_totals(qs):
    inc = qs.filter(transaction_type='INCOME').aggregate(t=Sum('amount'))['t']
    exp = qs.filter(transaction_type='EXPENSE').aggregate(t=Sum('amount'))['t']
    inc_d = inc or Decimal('0')
    exp_d = exp or Decimal('0')
    return {
        'total_income': _s(inc),
        'total_expense': _s(exp),
        'net_cashflow': _s(inc_d - exp_d),
    }


def transaction_log_sum(qs):
    """Single total for other-income / deleted-other-income ledgers."""
    return {'total_amount': _s(qs.aggregate(t=Sum('amount'))['t'])}


def sum_dict_list_field(rows, field):
    s = sum(Decimal(str(r.get(field) or 0)) for r in rows)
    return _s(s)


def income_statement_total(rows):
    return {'total_amount': sum_dict_list_field(rows, 'total')}


def fees_paid_grand_total(rows):
    return {'total_amount': sum_dict_list_field(rows, 'total')}


def applicant_fee_totals(qs):
    return {'total_allocated': _s(qs.aggregate(t=Sum('application_fee_amount'))['t'])}


def student_list_totals(qs):
    a = qs.aggregate(
        total_initial_income=Sum('total_initial_income'),
        admission_fee_collected=Sum('admission_fee_collected'),
        fixed_deposit_collected=Sum('fixed_deposit_collected'),
    )
    return {k: _s(a[k]) for k in a}


def simple_count_summary(qs):
    return {'record_count': str(qs.count())}


def list_len_summary(items):
    return {'record_count': str(len(items))}


def mismatch_totals(rows):
    if not rows:
        return {'record_count': '0', 'total_abs_delta': '0'}
    s = sum(abs(Decimal(str(r.get('delta') or 0))) for r in rows)
    return {'record_count': str(len(rows)), 'total_abs_delta': _s(s)}


def strength_total_students(rows):
    return {'total_students': str(sum(int(r.get('count') or 0) for r in rows))}


def applicant_count_rollups(rows):
    return {'total_applications': str(sum(int(r.get('count') or 0) for r in rows))}


def year_transition_rollups(rows):
    if not rows:
        return {
            'records_total': '0',
            'active': '0',
            'promoted': '0',
            'detained': '0',
            'dropout': '0',
            'graduated': '0',
            'transferred': '0',
        }
    keys = [
        'records_total', 'active', 'promoted', 'detained',
        'dropout', 'graduated', 'transferred',
    ]
    return {k: str(sum(int(r.get(k) or 0) for r in rows)) for k in keys}
