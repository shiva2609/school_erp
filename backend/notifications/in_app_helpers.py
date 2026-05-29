"""Helpers for deduplicating and building payloads for in-app (IN_APP) notifications."""
from django.utils import timezone

from .models import NotificationLog


def fee_invoice_parent_payload(invoice):
    """Context for fee / transport invoice notifications to parents."""
    student = invoice.student
    name = f'{student.first_name} {student.last_name}'.strip()
    inv_no = invoice.invoice_number
    if inv_no.startswith('ADM-'):
        fee_kind = 'admission'
    elif inv_no.startswith('TRN-'):
        fee_kind = 'transport'
    else:
        fee_kind = 'academic'
    return {
        'invoice_id': str(invoice.id),
        'invoice_number': invoice.invoice_number,
        'amount': str(invoice.outstanding_amount),
        'student_name': name,
        'fee_kind': fee_kind,
        'due_date': invoice.due_date.isoformat() if invoice.due_date else '',
    }


def payment_parent_payload(payment):
    inv = payment.invoice
    student = payment.student
    name = f'{student.first_name} {student.last_name}'.strip()
    no = inv.invoice_number
    if no.startswith('ADM-'):
        fk = 'admission'
    elif no.startswith('TRN-'):
        fk = 'transport'
    else:
        fk = 'academic'
    return {
        'payment_id': str(payment.id),
        'invoice_id': str(inv.id),
        'invoice_number': inv.invoice_number,
        'amount': str(payment.amount),
        'student_name': name,
        'fee_kind': fk,
    }


def in_app_invoice_event_exists(parent_user, event_type: str, invoice_id) -> bool:
    try:
        return NotificationLog.objects.filter(
            recipient_user=parent_user,
            channel='IN_APP',
            event_type=event_type,
            payload__contains={'invoice_id': str(invoice_id)},
        ).exists()
    except Exception:
        logs = NotificationLog.objects.filter(
            recipient_user=parent_user,
            channel='IN_APP',
            event_type=event_type,
        )
        for log in logs:
            if isinstance(log.payload, dict) and log.payload.get('invoice_id') == str(invoice_id):
                return True
        return False


def in_app_payment_confirmed_exists(parent_user, payment_id) -> bool:
    try:
        return NotificationLog.objects.filter(
            recipient_user=parent_user,
            channel='IN_APP',
            event_type='PAYMENT_CONFIRMED',
            payload__contains={'payment_id': str(payment_id)},
        ).exists()
    except Exception:
        logs = NotificationLog.objects.filter(
            recipient_user=parent_user,
            channel='IN_APP',
            event_type='PAYMENT_CONFIRMED',
        )
        for log in logs:
            if isinstance(log.payload, dict) and log.payload.get('payment_id') == str(payment_id):
                return True
        return False


def invoice_fee_reminder_sent_in_calendar_month(parent_user, invoice_id, year: int, month: int) -> bool:
    """True if a scheduled-style fee reminder was already logged this month for this invoice (in-app)."""
    try:
        return NotificationLog.objects.filter(
            recipient_user=parent_user,
            channel='IN_APP',
            event_type__in=['FEE_REMINDER', 'FEE_REMINDER_3DAYS'],
            payload__contains={'invoice_id': str(invoice_id)},
            created_at__year=year,
            created_at__month=month,
        ).exists()
    except Exception:
        logs = NotificationLog.objects.filter(
            recipient_user=parent_user,
            channel='IN_APP',
            event_type__in=['FEE_REMINDER', 'FEE_REMINDER_3DAYS'],
            created_at__year=year,
            created_at__month=month,
        )
        for log in logs:
            if isinstance(log.payload, dict) and log.payload.get('invoice_id') == str(invoice_id):
                return True
        return False
