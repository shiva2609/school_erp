from decimal import Decimal
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from accounts.permissions import IsSchoolAdminOrAbove
from staff.models import StaffProfile
from .models import SalaryStatement
from .serializers import SalaryStatementSerializer
from .tags import compute_monthly_summary


@api_view(['GET'])
@permission_classes([IsSchoolAdminOrAbove])
def payroll_preview(request):
    """
    Preview monthly attendance summary for all active staff.
    Does NOT save anything.
    GET /api/v1/payroll/preview/?month=8&year=2026
    """
    user = request.user
    try:
        month = int(request.query_params.get('month', timezone.localdate().month))
        year = int(request.query_params.get('year', timezone.localdate().year))
    except (ValueError, TypeError):
        return Response({'error': 'Invalid month or year.'}, status=status.HTTP_400_BAD_REQUEST)

    if not 1 <= month <= 12:
        return Response({'error': 'Month must be between 1 and 12.'}, status=status.HTTP_400_BAD_REQUEST)

    # Fetch active staff for this branch/tenant
    staff_qs = StaffProfile.objects.select_related(
        'user', 'designation', 'branch'
    ).filter(tenant=user.tenant, is_active=True)

    if getattr(user, 'branch_id', None):
        staff_qs = staff_qs.filter(branch_id=user.branch_id)

    # Check if saved statements exist for this month
    existing = SalaryStatement.objects.filter(
        tenant=user.tenant, month=month, year=year
    )
    if getattr(user, 'branch_id', None):
        existing = existing.filter(branch_id=user.branch_id)
    existing_by_staff = {str(s.staff_id): s for s in existing}

    results = []
    for staff in staff_qs:
        branch = staff.branch
        if not branch:
            continue

        summary = compute_monthly_summary(staff, year, month, branch)
        gross = Decimal(staff.basic_salary or 0)

        # Use existing saved statement data if available
        existing_stmt = existing_by_staff.get(str(staff.id))
        manual_deduction = Decimal(existing_stmt.manual_deduction) if existing_stmt else Decimal('0')
        deduction_reason = existing_stmt.deduction_reason if existing_stmt else ''
        net_salary = gross - manual_deduction
        stmt_status = existing_stmt.status if existing_stmt else 'DRAFT'
        stmt_id = str(existing_stmt.id) if existing_stmt else None

        staff_name = ''
        if staff.user:
            staff_name = f"{staff.user.first_name} {staff.user.last_name}".strip()

        results.append({
            'staff_id': str(staff.id),
            'statement_id': stmt_id,
            'employee_id': staff.employee_id,
            'staff_name': staff_name,
            'designation': staff.designation.name if staff.designation else '',
            'basic_salary': str(gross),
            'manual_deduction': str(manual_deduction),
            'deduction_reason': deduction_reason,
            'net_salary': str(net_salary),
            'status': stmt_status,
            **summary,
        })

    return Response({
        'month': month,
        'year': year,
        'results': results,
    })


@api_view(['POST'])
@permission_classes([IsSchoolAdminOrAbove])
def payroll_generate(request):
    """
    Save/update salary statements for a month.
    POST /api/v1/payroll/generate/
    Body: { month, year, statements: [{ staff_id, manual_deduction, deduction_reason }] }
    """
    user = request.user
    month = request.data.get('month')
    year = request.data.get('year')
    statements_data = request.data.get('statements', [])

    if not month or not year:
        return Response({'error': 'month and year are required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        month = int(month)
        year = int(year)
    except (ValueError, TypeError):
        return Response({'error': 'Invalid month or year.'}, status=status.HTTP_400_BAD_REQUEST)

    saved = []
    errors = []

    for item in statements_data:
        staff_id = item.get('staff_id')
        try:
            staff = StaffProfile.objects.select_related('branch').get(
                id=staff_id, tenant=user.tenant
            )
        except StaffProfile.DoesNotExist:
            errors.append({'staff_id': staff_id, 'error': 'Staff not found.'})
            continue

        branch = staff.branch
        if not branch:
            errors.append({'staff_id': staff_id, 'error': 'Staff has no branch.'})
            continue

        summary = compute_monthly_summary(staff, year, month, branch)
        gross = Decimal(str(staff.basic_salary or 0))
        deduction = Decimal(str(item.get('manual_deduction', 0) or 0))
        net = gross - deduction

        stmt, _ = SalaryStatement.objects.update_or_create(
            staff=staff, month=month, year=year,
            defaults={
                'tenant': user.tenant,
                'branch': branch,
                'gross_salary': gross,
                'manual_deduction': deduction,
                'deduction_reason': item.get('deduction_reason', ''),
                'net_salary': net,
                'generated_by': user,
                **summary,
            }
        )
        saved.append(SalaryStatementSerializer(stmt).data)

    return Response({'saved': saved, 'errors': errors})


@api_view(['GET'])
@permission_classes([IsSchoolAdminOrAbove])
def payroll_list(request):
    """
    List saved salary statements for a month.
    GET /api/v1/payroll/list/?month=8&year=2026
    """
    user = request.user
    try:
        month = int(request.query_params.get('month', timezone.localdate().month))
        year = int(request.query_params.get('year', timezone.localdate().year))
    except (ValueError, TypeError):
        return Response({'error': 'Invalid month or year.'}, status=status.HTTP_400_BAD_REQUEST)

    qs = SalaryStatement.objects.select_related(
        'staff', 'staff__user', 'staff__designation'
    ).filter(tenant=user.tenant, month=month, year=year)

    if getattr(user, 'branch_id', None):
        qs = qs.filter(branch_id=user.branch_id)

    return Response(SalaryStatementSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([IsSchoolAdminOrAbove])
def payroll_pdf(request, pk):
    """
    Generate a PDF salary slip for a statement.
    GET /api/v1/payroll/<uuid>/pdf/
    """
    from django.shortcuts import get_object_or_404
    from django.http import HttpResponse
    from document_templates.models import DocumentTemplate
    from document_templates.services import build_document_html
    from common.pdf_render import html_to_pdf_bytes
    from django.utils.html import escape
    import calendar

    user = request.user
    stmt = get_object_or_404(SalaryStatement, pk=pk, tenant=user.tenant)

    # Try to get SALARY_SLIP template, fall back to built-in
    template = DocumentTemplate.objects.filter(
        tenant=user.tenant, type='SALARY_SLIP', is_active=True
    ).order_by('-is_default').first()

    tenant = user.tenant
    branch = stmt.branch
    staff = stmt.staff
    staff_name = ''
    if staff.user:
        staff_name = f"{staff.user.first_name} {staff.user.last_name}".strip()

    month_name = calendar.month_name[stmt.month]
    logo_url = getattr(tenant, 'logo_url', '') or ''

    ctx = {
        'tenant_name': tenant.name,
        'tenant_logo': logo_url,
        'branch_name': branch.name if branch else '',
        'staff_name': staff_name,
        'employee_id': staff.employee_id,
        'designation': staff.designation.name if staff.designation else '',
        'month': stmt.month,
        'month_name': month_name,
        'year': stmt.year,
        'month_year': f"{month_name} {stmt.year}",
        'total_working_days': stmt.total_working_days,
        'present_days': stmt.present_days,
        'absent_days': stmt.absent_days,
        'late_in_count': stmt.late_in_count,
        'early_out_count': stmt.early_out_count,
        'leave_days': stmt.leave_days,
        'half_days': stmt.half_days,
        'gross_salary': str(stmt.gross_salary),
        'manual_deduction': str(stmt.manual_deduction),
        'deduction_reason': stmt.deduction_reason,
        'net_salary': str(stmt.net_salary),
        'status': stmt.status,
    }

    if template:
        try:
            html = build_document_html(template, ctx)
            pdf_bytes = html_to_pdf_bytes(html)
        except Exception as e:
            html = _build_salary_slip_html(ctx)
            pdf_bytes = html_to_pdf_bytes(html)
    else:
        html = _build_salary_slip_html(ctx)
        pdf_bytes = html_to_pdf_bytes(html)

    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    safe_name = staff_name.replace(' ', '_') or 'staff'
    response['Content-Disposition'] = f'inline; filename="salary_slip_{safe_name}_{stmt.year}_{stmt.month:02d}.pdf"'
    return response


def _build_salary_slip_html(ctx):
    """Built-in salary slip HTML template (used when no SALARY_SLIP document template is configured)."""
    from django.utils.html import escape
    school = escape(ctx.get('tenant_name', ''))
    branch = escape(ctx.get('branch_name', ''))
    staff = escape(ctx.get('staff_name', ''))
    emp_id = escape(ctx.get('employee_id', ''))
    desig = escape(ctx.get('designation', ''))
    month_year = escape(ctx.get('month_year', ''))
    total = ctx.get('total_working_days', 0)
    present = ctx.get('present_days', 0)
    absent = ctx.get('absent_days', 0)
    late = ctx.get('late_in_count', 0)
    early = ctx.get('early_out_count', 0)
    leave = ctx.get('leave_days', 0)
    half = ctx.get('half_days', 0)
    gross = escape(str(ctx.get('gross_salary', '0')))
    deduction = escape(str(ctx.get('manual_deduction', '0')))
    reason = escape(ctx.get('deduction_reason', ''))
    net = escape(str(ctx.get('net_salary', '0')))
    logo_url = ctx.get('tenant_logo', '')
    logo_html = f'<img src="{escape(logo_url)}" style="height:60px;max-width:180px;object-fit:contain;" />' if logo_url else ''

    return f"""
    <html><head><meta charset="utf-8">
    <style>
        @page {{ size: A4; margin: 15mm; }}
        body {{ font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1e293b; }}
        .header {{ text-align: center; border-bottom: 2px solid #1a56db; padding-bottom: 12px; margin-bottom: 16px; }}
        .header h1 {{ font-size: 18pt; font-weight: 800; color: #1a56db; margin: 6px 0; }}
        .header p {{ font-size: 9pt; color: #64748b; margin: 2px 0; }}
        .slip-title {{ text-align: center; background: #1a56db; color: white; padding: 8px; border-radius: 6px; font-weight: 700; font-size: 12pt; margin-bottom: 16px; }}
        .info-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }}
        .info-item {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }}
        .info-label {{ font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #94a3b8; }}
        .info-value {{ font-weight: 600; margin-top: 2px; }}
        .section-title {{ font-weight: 700; font-size: 10pt; color: #1a56db; border-bottom: 1px solid #dbeafe; padding-bottom: 4px; margin: 16px 0 10px 0; }}
        .att-table {{ width: 100%; border-collapse: collapse; margin-bottom: 16px; }}
        .att-table th {{ background: #1a56db; color: white; padding: 6px 10px; text-align: left; font-size: 9pt; }}
        .att-table td {{ padding: 6px 10px; border-bottom: 1px solid #f1f5f9; font-size: 9pt; }}
        .att-table tr:nth-child(even) td {{ background: #f8fafc; }}
        .salary-box {{ background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border: 2px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center; }}
        .salary-box .gross {{ font-size: 11pt; color: #64748b; }}
        .salary-box .deduction {{ font-size: 10pt; color: #ef4444; margin-top: 4px; }}
        .salary-box .net {{ font-size: 18pt; font-weight: 800; color: #15803d; margin-top: 8px; }}
        .salary-box .net-label {{ font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #16a34a; }}
        .footer {{ margin-top: 40px; display: flex; justify-content: space-between; }}
        .sig {{ text-align: center; }}
        .sig .line {{ width: 120px; border-top: 1px solid #cbd5e1; margin-bottom: 4px; }}
        .sig .title {{ font-size: 7pt; color: #94a3b8; font-weight: 600; text-transform: uppercase; }}
    </style></head><body>
        <div class="header">
            {logo_html}<br/>
            <h1>{school}</h1>
            <p>{branch}</p>
        </div>
        <div class="slip-title">Salary Slip — {month_year}</div>
        <div class="info-grid">
            <div class="info-item"><div class="info-label">Employee Name</div><div class="info-value">{staff}</div></div>
            <div class="info-item"><div class="info-label">Employee ID</div><div class="info-value">{emp_id}</div></div>
            <div class="info-item"><div class="info-label">Designation</div><div class="info-value">{desig}</div></div>
            <div class="info-item"><div class="info-label">Month</div><div class="info-value">{month_year}</div></div>
        </div>
        <div class="section-title">Attendance Summary</div>
        <table class="att-table">
            <tr><th>Description</th><th>Count / Days</th></tr>
            <tr><td>Total Calendar Days</td><td>{total}</td></tr>
            <tr><td>Present Days</td><td>{present}</td></tr>
            <tr><td>Absent Days</td><td>{absent}</td></tr>
            <tr><td>Leave Days</td><td>{leave}</td></tr>
            <tr><td>Half Days</td><td>{half}</td></tr>
            <tr><td>Late-In Instances</td><td>{late}</td></tr>
            <tr><td>Early-Out Instances</td><td>{early}</td></tr>
        </table>
        <div class="section-title">Salary Calculation</div>
        <div class="salary-box">
            <div class="gross">Gross Salary: ₹{gross}</div>
            <div class="deduction">Deduction: ₹{deduction}{(' (' + reason + ')') if reason else ''}</div>
            <div class="net-label">Net Payable</div>
            <div class="net">₹{net}</div>
        </div>
        <div class="footer">
            <div class="sig"><div class="line"></div><div class="title">Employee Signature</div></div>
            <div class="sig"><div class="line"></div><div class="title">Accounts Manager</div></div>
            <div class="sig"><div class="line"></div><div class="title">Principal / Director</div></div>
        </div>
    </body></html>
    """
