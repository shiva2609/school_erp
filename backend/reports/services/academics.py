from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, DecimalField, Exists, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from academics.models import ExamResult, ExamTerm
from attendance.models import AttendanceRecord
from fees.models import Payment
from reports.services.base import BaseReportService
from students.models import ParentStudentRelation, Student, StudentAcademicRecord
from tenants.models import AcademicYear, Branch

class AcademicsService:
    @staticmethod
    def get_students(filters):
        qs = Student.objects.select_related('class_section', 'academic_year', 'branch')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)

        completed_payments = Payment.objects.filter(student_id=OuterRef('pk'), status='COMPLETED')
        admission_paid_exists = completed_payments.filter(invoice__invoice_number__startswith='ADM-')
        fixed_deposit_paid_exists = completed_payments.filter(invoice__invoice_number__startswith='FDP-')

        admission_amount_subquery = (
            completed_payments.filter(invoice__invoice_number__startswith='ADM-')
            .values('student_id')
            .annotate(total=Sum('amount'))
            .values('total')[:1]
        )
        fixed_deposit_amount_subquery = (
            completed_payments.filter(invoice__invoice_number__startswith='FDP-')
            .values('student_id')
            .annotate(total=Sum('amount'))
            .values('total')[:1]
        )
        qs = qs.annotate(
            admission_fee_paid=Exists(admission_paid_exists),
            fixed_deposit_paid=Exists(fixed_deposit_paid_exists),
            admission_fee_collected=Coalesce(
                Subquery(admission_amount_subquery, output_field=DecimalField(max_digits=10, decimal_places=2)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
            fixed_deposit_collected=Coalesce(
                Subquery(fixed_deposit_amount_subquery, output_field=DecimalField(max_digits=10, decimal_places=2)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
        ).annotate(
            total_initial_income=Coalesce(
                Subquery(admission_amount_subquery, output_field=DecimalField(max_digits=10, decimal_places=2)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ) + Coalesce(
                Subquery(fixed_deposit_amount_subquery, output_field=DecimalField(max_digits=10, decimal_places=2)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )
        
        if filters.class_id:
            qs = qs.filter(class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(class_section_id=filters.section_id)
        if filters.status:
            qs = qs.filter(status=filters.status)
        if filters.admission_payment == 'PAID':
            qs = qs.filter(admission_fee_paid=True)
        elif filters.admission_payment == 'UNPAID':
            qs = qs.filter(admission_fee_paid=False)
        if filters.fixed_deposit_payment == 'PAID':
            qs = qs.filter(fixed_deposit_paid=True)
        elif filters.fixed_deposit_payment == 'UNPAID':
            qs = qs.filter(fixed_deposit_paid=False)
            
        return qs.order_by('class_section__grade', 'class_section__section', 'first_name')

    @staticmethod
    def get_student_strength(filters):
        qs = Student.objects.filter(status='ACTIVE')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        
        return qs.values('gender', 'caste_category').annotate(count=Count('id')).order_by('gender', 'caste_category')

    @staticmethod
    def get_year_transition_summary(filters):
        """
        Counts of StudentAcademicRecord rows by terminal/active status for one academic year.
        Use the *source* year (the year you ran promotion against) to see promoted / dropout / etc.
        When branch_id is unset (school admin: All Branches), returns one summary row per branch.
        """
        tenant = getattr(filters.user, 'tenant', None)
        if not tenant:
            return []

        ay_id = getattr(filters, 'academic_year_id', None) or None
        if not ay_id:
            active = AcademicYear.objects.filter(tenant=tenant, is_active=True).first()
            if not active:
                raise ValueError(
                    'No academic year was selected and no active academic year is configured for your organization.'
                )
            ay_id = active.id

        ay = AcademicYear.objects.filter(id=ay_id, tenant=tenant).first()
        ay_name = ay.name if ay else ''

        base = StudentAcademicRecord.objects.filter(
            academic_year_id=ay_id,
            student__tenant=tenant,
        )
        if filters.branch_id:
            base = base.filter(student__branch_id=filters.branch_id)
            row = base.aggregate(
                records_total=Count('id'),
                active=Count('id', filter=Q(status='ACTIVE')),
                promoted=Count('id', filter=Q(status='PROMOTED')),
                detained=Count('id', filter=Q(status='DETAINED')),
                dropout=Count('id', filter=Q(status='DROPOUT')),
                graduated=Count('id', filter=Q(status='GRADUATED')),
                transferred=Count('id', filter=Q(status='TRANSFERRED')),
            )
            b = Branch.objects.filter(id=filters.branch_id, tenant=tenant).first()
            return [{
                'branch_id': str(filters.branch_id),
                'branch_name': b.name if b else '',
                'academic_year_id': str(ay_id),
                'academic_year_name': ay_name,
                **row,
            }]

        rows = base.values('student__branch_id', 'student__branch__name').annotate(
            records_total=Count('id'),
            active=Count('id', filter=Q(status='ACTIVE')),
            promoted=Count('id', filter=Q(status='PROMOTED')),
            detained=Count('id', filter=Q(status='DETAINED')),
            dropout=Count('id', filter=Q(status='DROPOUT')),
            graduated=Count('id', filter=Q(status='GRADUATED')),
            transferred=Count('id', filter=Q(status='TRANSFERRED')),
        ).order_by('student__branch__name')

        out = []
        for r in rows:
            bid = r.get('student__branch_id')
            out.append({
                'branch_id': str(bid) if bid else '',
                'branch_name': r.get('student__branch__name') or '—',
                'academic_year_id': str(ay_id),
                'academic_year_name': ay_name,
                'records_total': r['records_total'],
                'active': r['active'],
                'promoted': r['promoted'],
                'detained': r['detained'],
                'dropout': r['dropout'],
                'graduated': r['graduated'],
                'transferred': r['transferred'],
            })
        return out

    @staticmethod
    def get_student_attendance_daily(filters):
        qs = AttendanceRecord.objects.select_related('student', 'class_section')
        qs = qs.filter(tenant=filters.user.tenant)
        if filters.branch_id:
            qs = qs.filter(class_section__branch_id=filters.branch_id)
            
        qs = BaseReportService.apply_date_range(qs, 'date', filters.start_date, filters.end_date)
        
        if filters.class_id:
            qs = qs.filter(class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(class_section_id=filters.section_id)
            
        return qs.order_by('-date', 'student__first_name')

    @staticmethod
    def get_student_notes(filters):
        """Non-empty attendance remarks and exam evaluator remarks."""
        notes = []
        att = AttendanceRecord.objects.select_related('student', 'class_section').filter(
            tenant=filters.user.tenant,
        ).exclude(remarks__isnull=True).exclude(remarks='')
        if filters.branch_id:
            att = att.filter(class_section__branch_id=filters.branch_id)
        if filters.academic_year_id:
            att = att.filter(class_section__academic_year_id=filters.academic_year_id)
        att = BaseReportService.apply_date_range(att, 'date', filters.start_date, filters.end_date)
        if filters.class_id:
            att = att.filter(class_section__grade=filters.class_id)
        if filters.section_id:
            att = att.filter(class_section_id=filters.section_id)
        for r in att.order_by('-date').iterator(chunk_size=500):
            cs = r.class_section
            notes.append({
                'date': str(r.date),
                'source': 'ATTENDANCE',
                'admission_number': getattr(r.student, 'admission_number', None) or '',
                'student_name': f'{r.student.first_name} {r.student.last_name or ""}'.strip(),
                'grade': cs.grade if cs else '',
                'section': cs.section if cs else '',
                'note': r.remarks,
            })

        ex = ExamResult.objects.select_related('student', 'subject', 'exam_term', 'student__class_section').filter(
            tenant=filters.user.tenant,
        ).exclude(remarks__isnull=True).exclude(remarks='')
        if filters.branch_id:
            ex = ex.filter(branch_id=filters.branch_id)
        if filters.academic_year_id:
            ex = ex.filter(student__academic_year_id=filters.academic_year_id)
        ex = BaseReportService.apply_date_range(ex, 'evaluated_at__date', filters.start_date, filters.end_date)
        if filters.class_id:
            ex = ex.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            ex = ex.filter(student__class_section_id=filters.section_id)
        for r in ex.order_by('-evaluated_at').iterator(chunk_size=500):
            cs = r.student.class_section if r.student_id else None
            subj = r.subject.name if r.subject_id else ''
            notes.append({
                'date': str(r.evaluated_at.date()) if r.evaluated_at else '',
                'source': 'EXAM',
                'admission_number': getattr(r.student, 'admission_number', None) or '',
                'student_name': f'{r.student.first_name} {r.student.last_name or ""}'.strip(),
                'grade': cs.grade if cs else '',
                'section': cs.section if cs else '',
                'note': f'{subj}: {r.remarks}' if subj else r.remarks,
            })

        notes.sort(key=lambda x: x['date'], reverse=True)
        return notes

    @staticmethod
    def get_students_missing_parent_login(filters):
        """
        Active students with no parent link, or linked parents who have never logged in.
        """
        qs = Student.objects.filter(status='ACTIVE').select_related('class_section')
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(class_section_id=filters.section_id)

        has_rel = ParentStudentRelation.objects.filter(student_id=OuterRef('pk'))
        parent_logged_in = ParentStudentRelation.objects.filter(
            student_id=OuterRef('pk'),
            parent__last_login__isnull=False,
        )
        qs = qs.annotate(
            has_rel=Exists(has_rel),
            any_login=Exists(parent_logged_in),
        ).filter(Q(has_rel=False) | Q(any_login=False))
        return qs.order_by('class_section__grade', 'class_section__section', 'admission_number', 'first_name')

    @staticmethod
    def get_student_ranks(filters):
        if not getattr(filters, 'exam_id', None):
            return []
        qs = ExamResult.objects.filter(
            tenant=filters.user.tenant,
            exam_term_id=filters.exam_id,
        )
        if filters.branch_id:
            qs = qs.filter(branch_id=filters.branch_id)
        if filters.academic_year_id:
            qs = qs.filter(exam_term__academic_year_id=filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
        rows = list(qs.values(
            'student__first_name', 'student__last_name', 'student__admission_number',
            'student__class_section__grade', 'student__class_section__section',
            'subject__name', 'marks_obtained', 'max_marks', 'percentage', 'exam_term__name',
        ))
        buckets = defaultdict(list)
        for r in rows:
            key = (
                r.get('exam_term__name') or '',
                r.get('subject__name') or '',
                r.get('student__class_section__grade') or '',
                r.get('student__class_section__section') or '',
            )
            buckets[key].append(r)
        out = []
        for _key, lst in buckets.items():
            lst.sort(key=lambda x: float(x['marks_obtained'] or 0), reverse=True)
            prev_marks = None
            rank = 0
            for i, r in enumerate(lst):
                m = float(r['marks_obtained'] or 0)
                if i == 0 or m != prev_marks:
                    rank = i + 1
                prev_marks = m
                out.append({**r, 'rank': rank})
        out.sort(key=lambda x: (
            x.get('subject__name') or '',
            x.get('rank') or 0,
            x.get('student__last_name') or '',
        ))
        return out

    @staticmethod
    def get_consolidated_marks_flat(filters):
        """Long-format marks for an exam term (export / consolidated sheet)."""
        if not getattr(filters, 'exam_id', None):
            return ExamResult.objects.none()
        qs = ExamResult.objects.filter(tenant=filters.user.tenant, exam_term_id=filters.exam_id)
        if filters.branch_id:
            qs = qs.filter(branch_id=filters.branch_id)
        if filters.academic_year_id:
            qs = qs.filter(exam_term__academic_year_id=filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
        return qs.select_related('student', 'subject', 'exam_term').order_by(
            'student__class_section__grade', 'student__class_section__section',
            'student__first_name', 'subject__name',
        )

    @staticmethod
    def get_exam_term_for_print(filters):
        eid = getattr(filters, 'exam_id', None)
        if not eid:
            return None
        return ExamTerm.objects.filter(pk=eid, tenant=filters.user.tenant).select_related(
            'academic_year', 'branch',
        ).first()

    @staticmethod
    def get_students_for_exam_print(filters):
        """Active students in scope; when an exam is selected, align to that exam's academic year."""
        qs = Student.objects.filter(status='ACTIVE').select_related(
            'class_section', 'branch', 'academic_year', 'tenant',
        )
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(class_section_id=filters.section_id)
        term = AcademicsService.get_exam_term_for_print(filters)
        if term and term.academic_year_id:
            qs = qs.filter(academic_year_id=term.academic_year_id)
        return qs.order_by('class_section__grade', 'class_section__section', 'first_name')

    @staticmethod
    def _student_card_dict(student):
        cs = student.class_section
        if cs:
            cls_label = f'{cs.get_grade_display()} - Section {cs.section}'
        else:
            cls_label = ''
        return {
            'first_name': student.first_name,
            'last_name': student.last_name or '',
            'admission_number': student.admission_number or '',
            'class_section': cls_label,
            'class_grade': cs.grade if cs else '',
            'class_section_code': cs.section if cs else '',
            'roll_number': str(student.roll_number) if student.roll_number is not None else '',
            'date_of_birth': str(student.date_of_birth) if student.date_of_birth else '',
            'gender': student.gender or '',
            'photo_url': student.photo_url or '',
        }

    @staticmethod
    def _exam_dict(exam_term):
        return {
            'name': exam_term.name,
            'start_date': str(exam_term.start_date),
            'end_date': str(exam_term.end_date),
            'academic_year': str(exam_term.academic_year) if exam_term.academic_year_id else '',
        }

    @staticmethod
    def build_hall_ticket_context(student, exam_term):
        tenant = student.tenant
        branch = student.branch
        return {
            'tenant_name': tenant.name,
            'tenant_logo': tenant.logo_url or '',
            'tenant_address': tenant.address or '',
            'tenant_city': tenant.city or '',
            'tenant_state': tenant.state or '',
            'branch_name': branch.name if branch else '',
            'exam': AcademicsService._exam_dict(exam_term),
            'student': AcademicsService._student_card_dict(student),
        }

    @staticmethod
    def build_report_card_context(student, exam_term):
        base = AcademicsService.build_hall_ticket_context(student, exam_term)
        results = ExamResult.objects.filter(
            student=student, exam_term=exam_term, tenant=student.tenant,
        ).select_related('subject').order_by('subject__name')
        subjects = []
        total_obt = Decimal('0')
        total_max = Decimal('0')
        for r in results:
            subjects.append({
                'name': r.subject.name if r.subject_id else '',
                'marks_obtained': str(r.marks_obtained),
                'max_marks': str(r.max_marks),
                'percentage': str(r.percentage) if r.percentage is not None else '',
                'grade': r.grade or '',
                'remarks': r.remarks or '',
            })
            total_obt += r.marks_obtained
            total_max += r.max_marks
        pct = ''
        if total_max > 0:
            pct = str((total_obt / total_max * Decimal('100')).quantize(Decimal('0.01')))
        base['subjects'] = subjects
        base['aggregate'] = {
            'total_marks': str(total_obt),
            'max_marks': str(total_max),
            'percentage': pct,
        }
        return base

    @staticmethod
    def build_report_card_summary_context(students_qs, exam_term):
        tenant = exam_term.tenant
        branch = exam_term.branch
        rows = []
        for s in students_qs:
            card = AcademicsService.build_report_card_context(s, exam_term)
            rows.append({
                'student': card['student'],
                'subjects': card['subjects'],
                'aggregate': card['aggregate'],
            })
        return {
            'tenant_name': tenant.name,
            'tenant_logo': tenant.logo_url or '',
            'tenant_address': tenant.address or '',
            'tenant_city': tenant.city or '',
            'tenant_state': tenant.state or '',
            'branch_name': branch.name if branch else '',
            'exam': AcademicsService._exam_dict(exam_term),
            'students': rows,
        }

    @staticmethod
    def build_id_card_context(student):
        """Context for DocumentTemplate type ID_CARD (matches templates/generate/student/...)."""
        tenant = student.tenant
        branch = student.branch
        guardian = student.guardian_name or student.father_name or ''
        contact = student.guardian_phone or student.father_phone or ''
        return {
            'tenant_name': tenant.name,
            'tenant_logo': tenant.logo_url or '',
            'tenant_address': tenant.address or '',
            'tenant_city': tenant.city or '',
            'tenant_state': tenant.state or '',
            'branch_name': branch.name if branch else '',
            'student': {
                'first_name': student.first_name,
                'last_name': student.last_name or '',
                'admission_number': student.admission_number or '',
                'date_of_birth': str(student.date_of_birth) if student.date_of_birth else '',
                'class_section': str(student.class_section) if student.class_section else '',
                'guardian_name': guardian,
                'contact': contact,
                'blood_group': student.blood_group or '',
            },
        }

    @staticmethod
    def get_report_card_summary_preview_rows(filters):
        term = AcademicsService.get_exam_term_for_print(filters)
        if not term:
            return []
        rows = []
        for s in AcademicsService.get_students_for_exam_print(filters):
            card = AcademicsService.build_report_card_context(s, term)
            rows.append({
                'admission_number': card['student']['admission_number'],
                'first_name': card['student']['first_name'],
                'last_name': card['student']['last_name'],
                'class_section__grade': card['student']['class_grade'],
                'class_section__section': card['student']['class_section_code'],
                'total_marks': card['aggregate']['total_marks'],
                'max_marks': card['aggregate']['max_marks'],
                'percentage': card['aggregate']['percentage'],
            })
        return rows
