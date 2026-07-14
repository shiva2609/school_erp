from django.db import models
from django.db.models import Sum, DecimalField, F, Case, When, Value, ExpressionWrapper, Exists, OuterRef, Q
from django.db.models.functions import Coalesce
from fees.models import FeeInvoice, Payment
from expenses.models import Expense, TransactionLog
from students.models import Student, StudentAcademicRecord
from reports.services.base import BaseReportService
from decimal import Decimal

class PaymentsService:
    @staticmethod
    def get_fee_balances(filters):
        qs = FeeInvoice.objects.select_related('student', 'student__class_section').filter(outstanding_amount__gt=0).exclude(status='CANCELLED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
            
        return qs.order_by('-due_date')

    @staticmethod
    def get_grouped_fee_balances(filters, report_type='student', fee_category_ids=None,
                                 min_amount=None, max_amount=None, by_percentage=False,
                                 status_filter=None):
        """
        Returns aggregated fee balance data grouped by class / section / student.

        report_type: 'class' | 'section' | 'student'
        fee_category_ids: list of FeeCategory ids whose sums should be broken out as columns
        min_amount / max_amount: filter on paid_amount (absolute ₹ or % of net_amount)
        by_percentage: if True, min/max are % of net_amount; else absolute ₹
        status_filter: 'ALL' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' etc.
        """
        from fees.models import FeeCategory, FeeInvoiceItem
        from students.models import Student as StudentModel

        # ── Base queryset ──────────────────────────────────────────────────────
        if report_type in ('class', 'section'):
            qs = FeeInvoice.objects.select_related('student__class_section').exclude(status='CANCELLED')
            qs = BaseReportService.apply_branch_scope(qs, filters)
            if hasattr(filters, 'academic_year_id') and filters.academic_year_id:
                qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
            if filters.class_id:
                qs = qs.filter(student__class_section__grade=filters.class_id)
            if filters.section_id:
                qs = qs.filter(student__class_section_id=filters.section_id)
            if status_filter and status_filter != 'ALL':
                qs = qs.filter(status=status_filter)

            # ── Group-by fields ────────────────────────────────────────────────
            if report_type == 'class':
                group_fields = ['student__class_section__grade']
                order_fields = ['student__class_section__grade']
            else:  # section
                group_fields = ['student__class_section__grade', 'student__class_section__section']
                order_fields = ['student__class_section__grade', 'student__class_section__section']

            # ── 1. Aggregate invoice-level totals ──────────────────────────────
            invoice_ann = {
                'total_students': models.Count('student_id', distinct=True),
                'gross_amount': Coalesce(Sum('gross_amount'), Value(Decimal('0')), output_field=DecimalField()),
                'net_amount': Coalesce(Sum('net_amount'), Value(Decimal('0')), output_field=DecimalField()),
                'concession_amount': Coalesce(Sum('concession_amount'), Value(Decimal('0')), output_field=DecimalField()),
                'paid_amount': Coalesce(Sum('paid_amount'), Value(Decimal('0')), output_field=DecimalField()),
                'outstanding_amount': Coalesce(Sum('outstanding_amount'), Value(Decimal('0')), output_field=DecimalField()),
            }
            invoice_totals = list(qs.values(*group_fields).annotate(**invoice_ann).order_by(*order_fields))

            # Normalize keys to remove 'student__' prefix so they match the rest of the app's expectations
            rows = []
            for row in invoice_totals:
                new_row = {
                    'class_section__grade': row.get('student__class_section__grade'),
                    'class_section__section': row.get('student__class_section__section'),
                    'total_students': row.get('total_students', 0),
                    'gross_amount': row.get('gross_amount', Decimal('0')),
                    'net_amount': row.get('net_amount', Decimal('0')),
                    'concession_amount': row.get('concession_amount', Decimal('0')),
                    'paid_amount': row.get('paid_amount', Decimal('0')),
                    'outstanding_amount': row.get('outstanding_amount', Decimal('0')),
                }
                rows.append(new_row)

            # ── 2. Aggregate item-level totals (per category) ──────────────────
            categories = []
            if fee_category_ids:
                categories = list(FeeCategory.objects.filter(id__in=fee_category_ids))
                item_qs = FeeInvoiceItem.objects.filter(invoice__in=qs, category_id__in=fee_category_ids)
                item_group_fields = [f"invoice__{f}" for f in group_fields] + ['category_id']
                item_ann = {
                    'cat_sum': Coalesce(Sum('final_amount'), Value(Decimal('0')), output_field=DecimalField())
                }
                item_totals = list(item_qs.values(*item_group_fields).annotate(**item_ann))

                # Merge item totals into rows
                for row in rows:
                    grade = row['class_section__grade']
                    section = row.get('class_section__section')
                    
                    for cat in categories:
                        safe_key = f'cat_{str(cat.id).replace("-", "_")}'
                        # Find matching item total
                        cat_total = Decimal('0')
                        for it in item_totals:
                            if it['category_id'] == cat.id and it['invoice__student__class_section__grade'] == grade:
                                if report_type == 'section' and it.get('invoice__student__class_section__section') != section:
                                    continue
                                cat_total = it['cat_sum']
                                break
                        row[safe_key] = cat_total

            # Apply min/max amount filter on paid_amount
            if min_amount is not None or max_amount is not None:
                filtered_rows = []
                for row in rows:
                    if by_percentage:
                        net = row.get('net_amount') or Decimal('0')
                        paid = row.get('paid_amount') or Decimal('0')
                        pct = (paid / net * 100) if net else Decimal('0')
                        val = pct
                    else:
                        val = row.get('paid_amount') or Decimal('0')
                    if min_amount is not None and val < Decimal(str(min_amount)):
                        continue
                    if max_amount is not None and val > Decimal(str(max_amount)):
                        continue
                    filtered_rows.append(row)
                rows = filtered_rows

            return rows, fee_category_ids, categories

        else:
            # ── Student-level report: one row per invoice ──────────────────────
            qs = FeeInvoice.objects.select_related(
                'student', 'student__class_section'
            ).exclude(status='CANCELLED')

            qs = BaseReportService.apply_branch_scope(qs, filters)
            if hasattr(filters, 'academic_year_id') and filters.academic_year_id:
                qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
            if filters.class_id:
                qs = qs.filter(student__class_section__grade=filters.class_id)
            if filters.section_id:
                qs = qs.filter(student__class_section_id=filters.section_id)
            if status_filter and status_filter != 'ALL':
                qs = qs.filter(status=status_filter)

            # Per-category sums via FeeInvoiceItem annotation
            categories = []
            if fee_category_ids:
                categories = list(FeeCategory.objects.filter(id__in=fee_category_ids))
                for cat in categories:
                    safe_key = f'cat_{str(cat.id).replace("-", "_")}'
                    qs = qs.annotate(**{
                        safe_key: Coalesce(
                            Sum(
                                Case(
                                    When(items__category_id=cat.id, then=F('items__final_amount')),
                                    default=Value(Decimal('0')),
                                    output_field=DecimalField(),
                                )
                            ),
                            Value(Decimal('0')),
                            output_field=DecimalField(),
                        )
                    })

            # Apply min/max paid_amount filter
            if min_amount is not None and not by_percentage:
                qs = qs.filter(paid_amount__gte=Decimal(str(min_amount)))
            if max_amount is not None and not by_percentage:
                qs = qs.filter(paid_amount__lte=Decimal(str(max_amount)))

            qs = qs.order_by('student__class_section__grade', 'student__class_section__section', 'student__first_name')

            if by_percentage and (min_amount is not None or max_amount is not None):
                # Post-filter for percentage
                raw = list(qs.values(
                    'id', 'invoice_number', 'status',
                    'student__admission_number', 'student__first_name', 'student__last_name',
                    'student__class_section__grade', 'student__class_section__section',
                    'student__caste_category', 'student__father_name', 'student__father_phone',
                    'student__leaving_reason', 'student__status',
                    'gross_amount', 'net_amount', 'concession_amount', 'paid_amount', 'outstanding_amount', 'due_date',
                    *([f'cat_{str(c.id).replace("-", "_")}' for c in categories] if categories else []),
                ))
                filtered_rows = []
                for row in raw:
                    net = row.get('net_amount') or Decimal('0')
                    paid = row.get('paid_amount') or Decimal('0')
                    pct = (paid / net * 100) if net else Decimal('0')
                    if min_amount is not None and pct < Decimal(str(min_amount)):
                        continue
                    if max_amount is not None and pct > Decimal(str(max_amount)):
                        continue
                    filtered_rows.append(row)
                return filtered_rows, fee_category_ids, categories
            else:
                rows = list(qs.values(
                    'id', 'invoice_number', 'status',
                    'student__admission_number', 'student__first_name', 'student__last_name',
                    'student__class_section__grade', 'student__class_section__section',
                    'student__caste_category', 'student__father_name', 'student__father_phone',
                    'student__leaving_reason', 'student__status',
                    'gross_amount', 'net_amount', 'concession_amount', 'paid_amount', 'outstanding_amount', 'due_date',
                    *([f'cat_{str(c.id).replace("-", "_")}' for c in categories] if categories else []),
                ))
                return rows, fee_category_ids, categories

    @staticmethod
    def get_uncommitted_fee_students(filters):
        qs = Student.objects.select_related('class_section').filter(status='ACTIVE')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        
        if filters.academic_year_id:
            qs = qs.filter(academic_year_id=filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(class_section_id=filters.section_id)

        # 1. Has promoted academic record OR has legacy_admission_number
        has_promoted_record = StudentAcademicRecord.objects.filter(
            student=OuterRef('pk'),
            academic_year_id=OuterRef('academic_year_id'),
            promoted_from__isnull=False
        )
        qs = qs.annotate(
            has_promoted=Exists(has_promoted_record)
        ).filter(
            Q(has_promoted=True) | (~Q(legacy_admission_number='') & Q(legacy_admission_number__isnull=False))
        )
        
        # 2. Lacks annual FeeInvoice
        has_annual_invoice = FeeInvoice.objects.filter(
            student=OuterRef('pk'),
            academic_year_id=OuterRef('academic_year_id')
        ).exclude(status='CANCELLED')

        qs = qs.annotate(
            has_invoice=Exists(has_annual_invoice)
        ).filter(has_invoice=False)
        
        return qs.order_by('class_section__grade', 'class_section__section', 'first_name', 'last_name')

    @staticmethod
    def get_daily_collections(filters):
        qs = Payment.objects.select_related('student', 'invoice').filter(status='COMPLETED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        return qs.order_by('-payment_date')

    @staticmethod
    def get_receipts(filters, is_deleted=False):
        qs = Payment.objects.select_related('student', 'invoice').filter(receipt_number__isnull=False)
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        
        if is_deleted:
            qs = qs.filter(status='REFUNDED')
        else:
            qs = qs.exclude(status='REFUNDED')
            
        return qs.order_by('-payment_date')

    @staticmethod
    def get_concessions(filters):
        qs = FeeInvoice.objects.select_related('student', 'student__class_section').exclude(status='CANCELLED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)

        qs = qs.filter(concession_amount__gt=0)
        qs = qs.annotate(
            concession_percent=Case(
                When(
                    gross_amount__gt=0,
                    then=ExpressionWrapper(
                        (F('concession_amount') * Value(100.0)) / F('gross_amount'),
                        output_field=DecimalField(max_digits=7, decimal_places=2),
                    ),
                ),
                default=Value(0),
                output_field=DecimalField(max_digits=7, decimal_places=2),
            )
        )
        return qs.order_by('-created_at')

    @staticmethod
    def get_fees_paid_by_mode(filters):
        qs = Payment.objects.filter(status='COMPLETED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        
        return qs.values('payment_mode').annotate(total=Sum('amount')).order_by('payment_mode')

    @staticmethod
    def get_bank_transactions(filters):
        qs = Payment.objects.select_related('student').filter(
            status='COMPLETED', 
            payment_mode__in=['CHEQUE', 'NEFT', 'RTGS', 'DD', 'UPI']
        )
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        
        return qs.order_by('-payment_date')

    @staticmethod
    def get_income_statement(filters):
        qs = TransactionLog.objects.filter(transaction_type='INCOME')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        
        return qs.values('category').annotate(total=Sum('amount')).order_by('-total')

    @staticmethod
    def get_expense_statement(filters):
        """Cashbook expenses (approved operational spend) grouped by category."""
        qs = TransactionLog.objects.filter(transaction_type='EXPENSE')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        return qs.values('category').annotate(total=Sum('amount')).order_by('-total')

    @staticmethod
    def get_financial_dashboard(filters):
        """
        Income and expense breakdown from the cashbook plus net totals for dashboard UIs.
        """
        income_rows = list(PaymentsService.get_income_statement(filters))
        expense_rows = list(PaymentsService.get_expense_statement(filters))
        stats = PaymentsService.get_income_vs_expenses(filters)
        ti = stats['total_income'] or Decimal('0')
        te = stats['total_expense'] or Decimal('0')
        return {
            'income_by_category': income_rows,
            'expense_by_category': expense_rows,
            'totals': {
                'total_income': str(ti),
                'total_expense': str(te),
                'net': str(ti - te),
            },
        }

    @staticmethod
    def get_expenses(filters):
        qs = Expense.objects.select_related('category', 'vendor')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'expense_date', filters.start_date, filters.end_date)
        
        if filters.status:
            qs = qs.filter(status=filters.status)
        if getattr(filters, 'expense_category_id', None):
            qs = qs.filter(category_id=filters.expense_category_id)
        elif getattr(filters, 'expense_type', None):
            qs = qs.filter(category__name__icontains=filters.expense_type)
        if getattr(filters, 'vendor_id', None):
            qs = qs.filter(vendor_id=filters.vendor_id)
        elif getattr(filters, 'vendor_name', None):
            qs = qs.filter(vendor__name__icontains=filters.vendor_name)

        return qs.order_by('-expense_date')

    @staticmethod
    def get_income_vs_expenses(filters):
        qs = TransactionLog.objects.all()
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        
        stats = qs.aggregate(
            total_income=Coalesce(Sum('amount', filter=models.Q(transaction_type='INCOME')), Decimal('0.00'), output_field=DecimalField()),
            total_expense=Coalesce(Sum('amount', filter=models.Q(transaction_type='EXPENSE')), Decimal('0.00'), output_field=DecimalField())
        )
        return stats

    @staticmethod
    def get_mismatch_detection(filters):
        qs = FeeInvoice.objects.select_related('student').exclude(status='CANCELLED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        
        drifts = []
        # In a real system, we might want to do this via annotation, but keeping it simple as per original
        for inv in qs.iterator():
            payment_sum = Payment.objects.filter(
                invoice=inv, status='COMPLETED'
            ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
            
            if inv.paid_amount != payment_sum:
                drifts.append({
                    'invoice_number': inv.invoice_number,
                    'student_admission_number': getattr(inv.student, 'admission_number', None) or '',
                    'student_name': f"{inv.student.first_name} {inv.student.last_name}",
                    'invoice_paid': float(inv.paid_amount),
                    'payment_sum': float(payment_sum),
                    'delta': float(inv.paid_amount - payment_sum),
                })
                
        return drifts

    @staticmethod
    def get_all_receipts(filters):
        """All payments with a receipt number in the date window (any status)."""
        qs = Payment.objects.select_related('student').filter(receipt_number__isnull=False)
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'payment_date', filters.start_date, filters.end_date)
        if getattr(filters, 'payment_mode', None):
            qs = qs.filter(payment_mode=filters.payment_mode)
        return qs.order_by('-payment_date')

    @staticmethod
    def get_transaction_ledger(filters):
        qs = TransactionLog.objects.all()
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        return qs.order_by('-transaction_date')

    @staticmethod
    def get_student_balance_base_invoices(filters):
        """Same scope as student detailed balances, before grouping by student."""
        qs = FeeInvoice.objects.exclude(status='CANCELLED')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
        return qs

    @staticmethod
    def get_student_balance_summary(filters):
        qs = PaymentsService.get_student_balance_base_invoices(filters)
        data = list(qs.values(
            'student__id', 'student__admission_number', 'student__first_name', 'student__last_name',
            'student__class_section__grade', 'student__class_section__section',
        ).annotate(
            total_net=Sum('net_amount'),
            total_paid=Sum('paid_amount'),
            total_outstanding=Sum('outstanding_amount'),
        ).order_by('student__admission_number'))

        # Query carry forwards
        from fees.models import FeeCarryForward
        cf_qs = FeeCarryForward.objects.filter(
            target_academic_year_id=filters.academic_year_id
        )
        if filters.branch_id:
            cf_qs = cf_qs.filter(branch_id=filters.branch_id)
        if filters.class_id:
            cf_qs = cf_qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            cf_qs = cf_qs.filter(student__class_section_id=filters.section_id)

        cf_map = {
            str(cf.student_id): {
                'old_due': cf.carry_forward_amount,
                'old_collected': cf.paid_amount,
                'old_written_off': cf.written_off_amount,
                'old_outstanding': cf.remaining_amount,
            }
            for cf in cf_qs
        }

        for row in data:
            student_id = str(row['student__id'])
            cf_info = cf_map.get(student_id, {
                'old_due': Decimal('0.00'),
                'old_collected': Decimal('0.00'),
                'old_written_off': Decimal('0.00'),
                'old_outstanding': Decimal('0.00'),
            })
            
            old_due = cf_info['old_due']
            old_collected = cf_info['old_collected']
            old_outstanding = cf_info['old_outstanding']
            
            row['old_due'] = float(old_due)
            row['old_collected'] = float(old_collected)
            row['old_outstanding'] = float(old_outstanding)
            
            row['grand_total_net'] = float(row['total_net']) + float(old_due)
            row['grand_total_paid'] = float(row['total_paid']) + float(old_collected)
            row['grand_total_outstanding'] = float(row['total_outstanding']) + float(old_outstanding)
            
        return data

    @staticmethod
    def get_bus_expenses(filters):
        qs = PaymentsService.get_expenses(filters)
        return qs.filter(
            models.Q(category__name__icontains='transport')
            | models.Q(category__name__icontains='bus')
            | models.Q(title__icontains='transport')
            | models.Q(title__icontains='bus')
        )

    @staticmethod
    def get_other_income_ledger(filters):
        """
        Non–fee income from the cashbook (ledger rows not tied to fee payments).
        Fee tuition posts as reference_model=Payment / category Fee Payment.
        """
        qs = TransactionLog.objects.filter(transaction_type='INCOME', amount__gt=0)
        qs = qs.exclude(reference_model='Payment')
        qs = qs.exclude(category__in=['Fee Payment', 'Fee Reversal'])
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        return qs.order_by('-transaction_date')

    @staticmethod
    def get_deleted_other_income_ledger(filters):
        """
        Negative INCOME ledger rows excluding standard fee reversals (adjustments to misc income).
        """
        qs = TransactionLog.objects.filter(transaction_type='INCOME', amount__lt=0)
        qs = qs.exclude(reference_model='Payment')
        qs = qs.exclude(category='Fee Reversal')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_date_range(qs, 'transaction_date', filters.start_date, filters.end_date)
        return qs.order_by('-transaction_date')
