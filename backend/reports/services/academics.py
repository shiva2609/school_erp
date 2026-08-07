from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, DecimalField, Exists, OuterRef, Q, Subquery, Sum, Value, UUIDField
from django.db.models.functions import Coalesce

from academics.models import ExamResult, Assessment, AssessmentSubject
from attendance.models import AttendanceRecord
from fees.models import FeeInvoice, Payment
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
        special_fee_amount_subquery = (
            completed_payments.filter(invoice__invoice_number__startswith='SPF-')
            .values('student_id')
            .annotate(total=Sum('amount'))
            .values('total')[:1]
        )

        spf_latest_id_sq = Subquery(
            FeeInvoice.objects.filter(
                student_id=OuterRef('pk'),
                academic_year_id=OuterRef('academic_year_id'),
                invoice_number__startswith='SPF-',
            )
            .exclude(status__in=['CANCELLED', 'WAIVED'])
            .order_by('-created_at')
            .values('id')[:1],
            output_field=UUIDField(null=True),
        )
        spf_net_sq = Subquery(
            FeeInvoice.objects.filter(id=OuterRef('_spf_latest_id'))
            .values('net_amount')[:1],
            output_field=DecimalField(max_digits=10, decimal_places=2),
        )
        spf_outstanding_sq = Subquery(
            FeeInvoice.objects.filter(id=OuterRef('_spf_latest_id'))
            .values('outstanding_amount')[:1],
            output_field=DecimalField(max_digits=10, decimal_places=2),
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
            _spf_latest_id=spf_latest_id_sq,
            special_fee_collected=Coalesce(
                Subquery(special_fee_amount_subquery, output_field=DecimalField(max_digits=10, decimal_places=2)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
        ).annotate(
            special_fee_net=Coalesce(
                spf_net_sq,
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
            special_fee_outstanding=Coalesce(
                spf_outstanding_sq,
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
            total_initial_income=Coalesce(
                Subquery(admission_amount_subquery, output_field=DecimalField(max_digits=10, decimal_places=2)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ) + Coalesce(
                Subquery(fixed_deposit_amount_subquery, output_field=DecimalField(max_digits=10, decimal_places=2)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ) + Coalesce(
                Subquery(special_fee_amount_subquery, output_field=DecimalField(max_digits=10, decimal_places=2)),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
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
        if getattr(filters, 'special_fee_payment', None) == 'PAID':
            qs = qs.filter(special_fee_net__gt=0, special_fee_outstanding__lte=0)
        elif getattr(filters, 'special_fee_payment', None) == 'UNPAID':
            qs = qs.filter(special_fee_net__gt=0, special_fee_collected__lte=0)
        elif getattr(filters, 'special_fee_payment', None) == 'PARTIAL':
            qs = qs.filter(special_fee_outstanding__gt=0, special_fee_collected__gt=0)
        elif getattr(filters, 'special_fee_payment', None) == 'NOT_INVOICED':
            qs = qs.filter(special_fee_net__lte=0)

        return qs.order_by('class_section__grade', 'class_section__section', 'first_name')

    @staticmethod
    def get_student_strength(filters):
        """
        Returns student strength grouped by class & section.
        - group_by=gender   → columns: male, female, other, total
        - group_by=category → columns: general, bc, obc, sc, st, other, total

        Extra filters accepted:
          - status: ACTIVE | INACTIVE | ALL  (default: ACTIVE)
          - class_id: grade string
          - section_id: UUID of class section
        """
        group_by = getattr(filters, 'group_by', 'gender') or 'gender'
        status_filter = getattr(filters, 'status', 'ACTIVE') or 'ACTIVE'

        qs = Student.objects.all()
        qs = BaseReportService.apply_branch_scope(qs, filters)
        qs = BaseReportService.apply_academic_year(qs, filters.academic_year_id)

        if status_filter == 'ALL':
            pass
        elif status_filter == 'INACTIVE':
            qs = qs.filter(status='INACTIVE')
        else:
            qs = qs.filter(status='ACTIVE')

        # Optional class/section filters
        if getattr(filters, 'class_id', None):
            qs = qs.filter(grade=filters.class_id)
        if getattr(filters, 'section_id', None):
            qs = qs.filter(class_section_id=filters.section_id)

        qs = qs.select_related('class_section')

        from collections import defaultdict

        rows_by_section = defaultdict(lambda: defaultdict(int))
        for s in qs.values('grade', 'class_section_id', 'class_section__section', 'gender', 'caste_category'):
            grade = s['grade'] or ''
            section = s['class_section__section'] or 'A'
            key = (grade, section, str(s['class_section_id'] or ''))

            if group_by == 'gender':
                g = (s['gender'] or 'OTHER').upper()
                rows_by_section[key][g] += 1
                rows_by_section[key]['total'] += 1
            else:
                cat_raw = (s['caste_category'] or 'GENERAL').upper()
                # Normalise category values
                if cat_raw in ('', 'GENERAL', 'GEN'):
                    cat = 'GENERAL'
                else:
                    cat = cat_raw
                rows_by_section[key][cat] += 1
                rows_by_section[key]['total'] += 1

        results = []
        for (grade, section, _section_id), counts in sorted(rows_by_section.items()):
            row = {
                'class': grade,
                'section': section,
            }
            if group_by == 'gender':
                row['male'] = counts.get('MALE', 0)
                row['female'] = counts.get('FEMALE', 0)
                row['other'] = counts.get('OTHER', 0)
            else:
                row['general'] = counts.get('GENERAL', 0)
                row['bc'] = counts.get('BC', 0)
                row['obc'] = counts.get('OBC', 0)
                row['sc'] = counts.get('SC', 0)
                row['st'] = counts.get('ST', 0)
                row['oc'] = counts.get('OC', 0)
                row['other'] = counts.get('OTHER', 0)
            row['total'] = counts.get('total', 0)
            results.append(row)

        return results


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

        ex = ExamResult.objects.select_related('student', 'subject', 'assessment', 'student__class_section').filter(
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
            assessment_id=filters.exam_id,
        )
        if filters.branch_id:
            qs = qs.filter(branch_id=filters.branch_id)
        if filters.academic_year_id:
            qs = qs.filter(assessment__academic_year_id=filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
        rows = list(qs.values(
            'student__first_name', 'student__last_name', 'student__admission_number',
            'student__class_section__grade', 'student__class_section__section',
            'subject__name', 'marks_obtained', 'max_marks', 'percentage', 'assessment__name',
        ))
        buckets = defaultdict(list)
        for r in rows:
            key = (
                r.get('assessment__name') or '',
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
        """Long-format marks for an assessment (export / consolidated sheet)."""
        if not getattr(filters, 'exam_id', None):
            return ExamResult.objects.none()
        qs = ExamResult.objects.filter(tenant=filters.user.tenant, assessment_id=filters.exam_id)
        if filters.branch_id:
            qs = qs.filter(branch_id=filters.branch_id)
        if filters.academic_year_id:
            qs = qs.filter(assessment__academic_year_id=filters.academic_year_id)
        if filters.class_id:
            qs = qs.filter(student__class_section__grade=filters.class_id)
        if filters.section_id:
            qs = qs.filter(student__class_section_id=filters.section_id)
        return qs.select_related('student', 'subject', 'assessment').order_by(
            'student__class_section__grade', 'student__class_section__section',
            'student__first_name', 'subject__name',
        )



    @staticmethod
    def get_assessment_for_print(filters):
        """Resolve an Assessment (new module) by exam_id for Hall Ticket generation."""
        eid = getattr(filters, 'exam_id', None)
        if not eid:
            return None
        return Assessment.objects.filter(pk=eid, tenant=filters.user.tenant).select_related(
            'academic_year', 'branch',
        ).first()

    @staticmethod
    def _build_subjects_schedule(assessment):
        """
        Fetch AssessmentSubject records for the assessment, sorted by exam_date then exam_time.
        Returns a list of dicts ready for template rendering.
        """
        subjects_qs = (
            AssessmentSubject.objects
            .filter(assessment=assessment)
            .select_related('subject')
            .order_by('exam_date', 'exam_time', 'subject__display_order', 'subject__name')
        )
        rows = []
        for as_subj in subjects_qs:
            subj = as_subj.subject
            # Build display name with optional language indicator
            name = subj.name
            if subj.is_first_language:
                name = f'{name} (First Language)'
            elif subj.is_second_language:
                name = f'{name} (Second Language)'
            elif subj.is_third_language:
                name = f'{name} (Third Language)'

            rows.append({
                'subject_name': name,
                'exam_date': str(as_subj.exam_date) if as_subj.exam_date else '',
                'exam_time': str(as_subj.exam_time) if as_subj.exam_time else '',
                'max_marks': str(as_subj.max_marks),
                'min_marks': str(as_subj.min_marks),
                'is_optional': subj.is_optional,
            })
        return rows

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
        # Use Assessment
        assessment = AcademicsService.get_assessment_for_print(filters)
        if assessment and assessment.academic_year_id:
            qs = qs.filter(academic_year_id=assessment.academic_year_id)
        return qs.order_by('class_section__grade', 'class_section__section', 'roll_number', 'first_name')

    @staticmethod
    def _student_card_dict(student):
        cs = student.class_section
        if cs:
            cls_label = f'{cs.get_grade_display()} - Section {cs.section}'
        else:
            cls_label = ''
        # father_name is a direct field on Student — no extra query needed
        father_name = student.father_name or ''
        return {
            'first_name': student.first_name,
            'last_name': student.last_name or '',
            'full_name': f'{student.first_name} {student.last_name or ""}'.strip(),
            'father_name': father_name,
            'admission_number': student.admission_number or '',
            # enrollment_number = the school's own number (e.g. 2528, KGS-KZP-229)
            # falls back to admission_number if legacy is not set
            'enrollment_number': student.legacy_admission_number or student.admission_number or '',
            'class_section': cls_label,
            'class_grade': cs.grade if cs else '',
            'class_section_code': cs.section if cs else '',
            'roll_number': str(student.roll_number) if student.roll_number is not None else '',
            'date_of_birth': str(student.date_of_birth) if student.date_of_birth else '',
            'gender': student.gender or '',
            'photo_url': student.photo_url or '',
        }

    @staticmethod
    def _exam_dict(assessment):
        """
        Build the exam context dict for an Assessment.
        """
        return {
            'name': assessment.name,
            'start_date': str(assessment.start_date),
            'end_date': str(assessment.end_date),
            'academic_year': str(assessment.academic_year) if assessment.academic_year_id else '',
        }

    @staticmethod
    def build_hall_ticket_context(student, assessment, subjects=None):
        """
        Build hall ticket context for a student.
        """
        tenant = student.tenant
        branch = student.branch
        subj_list = subjects or []
        half = (len(subj_list) + 1) // 2
        return {
            'tenant_name': tenant.name,
            'tenant_logo': tenant.logo_url or '',
            'tenant_address': tenant.address or '',
            'tenant_city': tenant.city or '',
            'tenant_state': tenant.state or '',
            'branch_name': branch.name if branch else '',
            'branch_address': branch.address if branch else '',
            'exam': AcademicsService._exam_dict(assessment),
            'student': AcademicsService._student_card_dict(student),
            'subjects': subj_list,
            # Pre-split for Django templates (no index access in Django template engine)
            'subjects_left': subj_list[:half],
            'subjects_right': subj_list[half:],
        }

    @staticmethod
    def build_report_card_context(student, assessment):
        base = AcademicsService.build_hall_ticket_context(student, assessment)
        results = ExamResult.objects.filter(
            student=student, assessment=assessment, tenant=student.tenant,
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
        overall_grade = ''
        overall_remark = ''
        if total_max > 0:
            percentage_val = (total_obt / total_max * Decimal('100'))
            pct = str(percentage_val.quantize(Decimal('0.01')))
            
            from academics.models import GradeScale
            scale = GradeScale.objects.filter(
                branch=student.branch,
                min_marks_percent__lte=percentage_val,
                max_marks_percent__gte=percentage_val
            ).first()
            if scale:
                overall_grade = scale.grade
                overall_remark = scale.remarks
                
        base['subjects'] = subjects
        base['aggregate'] = {
            'total_marks': str(total_obt),
            'max_marks': str(total_max),
            'percentage': pct,
            'grade': overall_grade,
            'remark': overall_remark,
        }
        return base

    @staticmethod
    def build_report_card_summary_context(students_qs, assessment):
        tenant = assessment.tenant
        branch = assessment.branch
        rows = []
        for s in students_qs:
            card = AcademicsService.build_report_card_context(s, assessment)
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
            'exam': AcademicsService._exam_dict(assessment),
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
        term = AcademicsService.get_assessment_for_print(filters)
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
