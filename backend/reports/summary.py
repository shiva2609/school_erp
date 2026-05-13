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
    """Roll up collected amounts; avoid Sum(total_initial_income) on a combined annotation (fragile on some DB backends)."""
    a = qs.aggregate(
        admission_fee_collected=Sum('admission_fee_collected'),
        fixed_deposit_collected=Sum('fixed_deposit_collected'),
        special_fee_collected=Sum('special_fee_collected'),
    )
    ad = a['admission_fee_collected'] or Decimal('0')
    fd = a['fixed_deposit_collected'] or Decimal('0')
    sp = a['special_fee_collected'] or Decimal('0')
    ti = ad + fd + sp
    return {
        'total_initial_income': _s(ti),
        'admission_fee_collected': _s(ad),
        'fixed_deposit_collected': _s(fd),
        'special_fee_collected': _s(sp),
    }


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


# --- Table footer row totals (full filtered queryset / full row list, not current page) ---


def footer_fee_balance_amount_columns(qs):
    """Keys align with fee balance report columns: net, paid, balance."""
    a = qs.aggregate(
        net_amount=Sum('net_amount'),
        paid_amount=Sum('paid_amount'),
        outstanding_amount=Sum('outstanding_amount'),
    )
    return {k: _s(a[k]) for k in a}


def footer_outstanding_column(qs):
    a = qs.aggregate(outstanding_amount=Sum('outstanding_amount'))
    return {k: _s(a[k]) for k in a}


def footer_amount_column(qs, field='amount'):
    return {field: _s(qs.aggregate(t=Sum(field))['t'])}


def footer_concession_columns(qs):
    a = qs.aggregate(
        gross_amount=Sum('gross_amount'),
        net_amount=Sum('net_amount'),
        concession_amount=Sum('concession_amount'),
    )
    g = a['gross_amount'] or Decimal('0')
    c = a['concession_amount'] or Decimal('0')
    pct = (c / g * Decimal('100')) if g else Decimal('0')
    return {
        'gross_amount': _s(a['gross_amount']),
        'net_amount': _s(a['net_amount']),
        'concession_amount': _s(a['concession_amount']),
        'concession_percent': _s(pct),
    }


def footer_student_detailed_balance_columns(student_summary_qs):
    # Use aggregate aliases distinct from annotation names — Django otherwise emits wrong SQL
    # (e.g. total_net=Sum('total_net') on a queryset already annotated total_net sums to 0 / can error).
    a = student_summary_qs.aggregate(
        _sum_net=Sum('total_net'),
        _sum_paid=Sum('total_paid'),
        _sum_outstanding=Sum('total_outstanding'),
    )
    return {
        'total_net': _s(a['_sum_net']),
        'total_paid': _s(a['_sum_paid']),
        'total_outstanding': _s(a['_sum_outstanding']),
    }


def footer_mismatch_amount_columns(rows):
    if not rows:
        return {}
    return {
        'invoice_paid': _s(sum(Decimal(str(r.get('invoice_paid') or 0)) for r in rows)),
        'payment_sum': _s(sum(Decimal(str(r.get('payment_sum') or 0)) for r in rows)),
        'delta': _s(sum(Decimal(str(r.get('delta') or 0)) for r in rows)),
    }
