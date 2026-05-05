import logging
import re
from decimal import Decimal, ROUND_HALF_UP

from django.template import Template, Context
from django.utils import timezone
from django.utils.html import escape

from common.pdf_render import html_to_pdf_bytes

logger = logging.getLogger(__name__)


def absolute_media_url(request, url: str) -> str:
    """Turn relative logo/media paths into absolute URLs so WeasyPrint can fetch them."""
    if not url or not str(url).strip():
        return ''
    url = str(url).strip()
    if url.startswith(('http://', 'https://', 'data:')):
        return url
    if request is not None:
        try:
            return request.build_absolute_uri(url)
        except Exception:
            pass
    return url


_LOW = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
]
_TENS = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
]


def _under_hundred(n: int) -> str:
    if n < 20:
        return _LOW[n]
    t, u = divmod(n, 10)
    w = _TENS[t]
    if u:
        w = f'{w} {_LOW[u]}'
    return w


def _under_thousand(n: int) -> str:
    if n < 100:
        return _under_hundred(n)
    h, rest = divmod(n, 100)
    w = f'{_LOW[h]} Hundred'
    if rest:
        w = f'{w} {_under_hundred(rest)}'
    return w


def _int_to_words_indian(n: int) -> str:
    if n == 0:
        return 'Zero'
    if n < 0:
        return f'Minus {_int_to_words_indian(-n)}'
    parts = []
    crore, n = divmod(n, 10000000)
    lakh, n = divmod(n, 100000)
    thousand, n = divmod(n, 1000)
    if crore:
        parts.append(f'{_under_thousand(crore)} Crore')
    if lakh:
        parts.append(f'{_under_thousand(lakh)} Lakh')
    if thousand:
        parts.append(f'{_under_thousand(thousand)} Thousand')
    if n:
        parts.append(_under_thousand(n))
    return ' '.join(parts)


def rupee_amount_in_words(amount) -> str:
    """Indian-style words for receipt footers (e.g. 'Five Thousand Rupees Only')."""
    d = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    rupees = int(d)
    paise = int((d * 100) % 100)
    words = f'{_int_to_words_indian(rupees)} Rupees'
    if paise:
        words += f' and {_int_to_words_indian(paise)} Paisa'
    return f'{words} Only'


def build_fee_receipt_context(payment, request=None):
    """
    Single context dict for FEE_RECEIPT HTML templates and built-in CONFIG receipts.

    Includes aliases so older templates using exam.*, payment.date, payment.mode, etc. keep working.
    """
    invoice = payment.invoice
    invoice.refresh_from_db()
    student = payment.student
    tenant = payment.tenant
    branch = invoice.branch if invoice else None

    class_section_str = str(student.class_section) if student.class_section else ''
    full_name = f'{student.first_name} {student.last_name or ""}'.strip()
    amt_str = str(payment.amount)
    printed = timezone.now().date()

    collected_by = ''
    if payment.collected_by:
        collected_by = f'{payment.collected_by.first_name} {payment.collected_by.last_name}'.strip()

    logo = absolute_media_url(request, tenant.logo_url or '')

    return {
        'tenant_name': tenant.name,
        'tenant_logo': logo,
        'tenant_address': tenant.address or '',
        'tenant_city': tenant.city or '',
        'tenant_state': tenant.state or '',
        'tenant_pincode': tenant.pincode or '',
        'tenant_phone': tenant.owner_phone or '',
        'branch_name': branch.name if branch else '',
        'branch_code': branch.branch_code if branch else '',
        'student': {
            'first_name': student.first_name or '',
            'last_name': student.last_name or '',
            'full_name': full_name,
            'admission_number': student.admission_number or '',
            'class_section': class_section_str,
            'class_name': class_section_str,
            'father_name': student.father_name or '',
            'mother_name': student.mother_name or '',
            'father_phone': student.father_phone or '',
            'mother_phone': student.mother_phone or '',
            'guardian_name': student.guardian_name or '',
            'guardian_phone': student.guardian_phone or '',
        },
        'invoice': {
            'invoice_number': invoice.invoice_number,
            'month': invoice.month or '',
            'net_amount': str(invoice.net_amount),
            'outstanding_amount': str(invoice.outstanding_amount),
            'academic_year': str(invoice.academic_year) if invoice.academic_year else '',
        },
        'exam': {
            'academic_year': str(invoice.academic_year) if invoice.academic_year else '',
        },
        'payment': {
            'receipt_number': payment.receipt_number or '',
            'amount': amt_str,
            'total_amount': amt_str,
            'payment_date': str(payment.payment_date),
            'date': str(payment.payment_date),
            'printed_date': str(printed),
            'payment_mode': payment.payment_mode or '',
            'mode': payment.payment_mode or '',
            'payment_mode_display': payment.get_payment_mode_display() if hasattr(payment, 'get_payment_mode_display') else (payment.payment_mode or ''),
            'reference_number': payment.reference_number or '',
            'collected_by': collected_by,
            'amount_in_words': rupee_amount_in_words(payment.amount),
            'balance': str(invoice.outstanding_amount),
        },
    }


def extract_body_html(html_string: str) -> str:
    match = re.search(r'<body[^>]*>(.*?)</body>', html_string, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else html_string


def build_document_html(template, context_dict: dict) -> str:
    """Render full HTML document (CONFIG or Django-template HTML mode)."""
    if template.mode == 'HTML' and template.raw_html:
        django_template = Template(template.raw_html)
        return django_template.render(Context(context_dict))

    cfg = template.config_data or {}
    bg_color = cfg.get('background_color', '#ffffff')
    text_color = cfg.get('text_color', '#333333')
    primary_color = cfg.get('primary_color', '#1a56db')
    school_name = cfg.get('school_name') or context_dict.get('tenant_name', 'School Name')
    logo_url = context_dict.get('tenant_logo', '')
    address = context_dict.get('tenant_address', '')
    city = context_dict.get('tenant_city', '')
    state = context_dict.get('tenant_state', '')
    branch_name = context_dict.get('branch_name', '')

    if template.type == 'ID_CARD':
        return _build_id_card_html(context_dict, cfg, school_name, logo_url, primary_color, bg_color, text_color, branch_name)
    if template.type == 'FEE_RECEIPT':
        return _build_fee_receipt_html(
            context_dict, cfg, school_name, logo_url, primary_color, bg_color, text_color,
            address, city, state, branch_name,
        )
    if template.type == 'HALL_TICKET':
        return _build_hall_ticket_html(
            context_dict, cfg, school_name, logo_url, primary_color, bg_color, text_color, branch_name,
        )
    if template.type == 'REPORT_CARD':
        return _build_report_card_html(
            context_dict, cfg, school_name, logo_url, primary_color, bg_color, text_color, branch_name,
        )
    if template.type == 'REPORT_CARD_SUMMARY':
        return _build_report_card_summary_html(
            context_dict, cfg, school_name, logo_url, primary_color, bg_color, text_color, branch_name,
        )
    if template.type == 'TRANSFER_CERTIFICATE':
        return _build_transfer_certificate_html(
            context_dict, cfg, school_name, logo_url, primary_color, bg_color, text_color, branch_name,
        )
    return f"<html><body><h1>Document type {escape(template.type)} not configured fully.</h1></body></html>"


def generate_pdf_from_template(template, context_dict: dict) -> bytes:
    html_content = build_document_html(template, context_dict)
    try:
        return html_to_pdf_bytes(html_content)
    except RuntimeError:
        logger.exception('WeasyPrint PDF failed for template %s', getattr(template, 'id', ''))
        raise


def generate_bulk_pdf_from_template(template, contexts: list) -> bytes:
    """One PDF with one page per context (same template, different merge data)."""
    bodies = []
    for ctx in contexts:
        full = build_document_html(template, ctx)
        bodies.append(extract_body_html(full))
    if template.type == 'ID_CARD':
        page_rule = '@page { size: 85.6mm 53.98mm; margin: 0; }'
    else:
        page_rule = '@page { size: A4; margin: 10mm; }'
    combined = f"""<html><head><meta charset="utf-8"><style>
        {page_rule}
        .erp-doc-page {{ page-break-after: always; }}
        .erp-doc-page:last-child {{ page-break-after: auto; }}
    </style></head><body>
    {''.join(f'<div class="erp-doc-page">{b}</div>' for b in bodies)}
    </body></html>"""
    return html_to_pdf_bytes(combined)


def _build_id_card_html(ctx, cfg, school_name, logo_url, primary, bg, text, branch):
    student = ctx.get('student', {})
    logo_html = f'<img src="{logo_url}" style="width:50px;height:50px;object-fit:contain;border-radius:6px;" />' if logo_url else '<div style="width:50px;height:50px;background:#e2e8f0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#64748b;">🏫</div>'
    
    return f"""
    <html>
    <head>
    <style>
        @page {{ size: 85.6mm 53.98mm; margin: 0; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Helvetica Neue', Arial, sans-serif; width: 85.6mm; height: 53.98mm; }}
        .card {{
            width: 100%; height: 100%;
            background: linear-gradient(135deg, {bg} 0%, #f1f5f9 100%);
            color: {text};
            padding: 8mm 6mm;
            position: relative;
            overflow: hidden;
        }}
        .card::before {{
            content: ''; position: absolute; top: 0; left: 0; right: 0;
            height: 3mm; background: linear-gradient(90deg, {primary}, {primary}cc);
        }}
        .header {{ display: flex; align-items: center; gap: 3mm; margin-top: 1mm; margin-bottom: 3mm; }}
        .school-info h1 {{ font-size: 9pt; font-weight: 800; color: {primary}; letter-spacing: 0.5px; }}
        .school-info p {{ font-size: 6pt; color: #64748b; }}
        .student-info {{ display: flex; flex-direction: column; gap: 1.5mm; }}
        .field {{ display: flex; gap: 2mm; font-size: 7pt; }}
        .field .label {{ color: #94a3b8; font-weight: 700; text-transform: uppercase; font-size: 5pt; letter-spacing: 0.5px; min-width: 18mm; }}
        .field .value {{ color: {text}; font-weight: 600; }}
        .student-name {{ font-size: 10pt; font-weight: 800; color: {text}; margin-bottom: 1mm; }}
    </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                {logo_html}
                <div class="school-info">
                    <h1>{school_name}</h1>
                    <p>{branch}</p>
                </div>
            </div>
            <div class="student-name">{student.get('first_name', '')} {student.get('last_name', '')}</div>
            <div class="student-info">
                <div class="field"><span class="label">Adm No</span><span class="value">{student.get('admission_number', '')}</span></div>
                <div class="field"><span class="label">Class</span><span class="value">{student.get('class_section', '')}</span></div>
                <div class="field"><span class="label">DOB</span><span class="value">{student.get('date_of_birth', '')}</span></div>
                <div class="field"><span class="label">Guardian</span><span class="value">{student.get('guardian_name', '')}</span></div>
                <div class="field"><span class="label">Contact</span><span class="value">{student.get('contact', '')}</span></div>
            </div>
        </div>
    </body>
    </html>
    """


def _build_fee_receipt_html(ctx, cfg, school_name, logo_url, primary, bg, text, address, city, state, branch):
    student = ctx.get('student', {})
    invoice = ctx.get('invoice', {})
    payment = ctx.get('payment', {})
    
    logo_html = f'<img src="{logo_url}" style="height:100px;max-width:300px;object-fit:contain;margin-bottom:12px;" />' if logo_url else '<div style="width:100px;height:100px;margin:0 auto 12px auto;background:linear-gradient(135deg,{primary},{primary}aa);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:40px;color:white;">🏫</div>'
    
    address_parts = [p for p in [address, city, state] if p]
    address_line = ', '.join(address_parts) if address_parts else ''

    return f"""
    <html>
    <head>
    <style>
        @page {{ size: A4; margin: 15mm; }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ 
            font-family: 'Helvetica Neue', Arial, sans-serif;
            color: {text};
            background: {bg};
            font-size: 10pt;
            line-height: 1.5;
        }}
        .receipt {{
            max-width: 180mm;
            margin: 0 auto;
            border: 1.5px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
            background: white;
        }}
        .receipt-header {{
            background: white;
            color: {text};
            padding: 25px 20px 15px 20px;
            text-align: center;
        }}
        .receipt-header h1 {{ font-size: 18pt; font-weight: 800; color: {primary}; margin-bottom: 4px; }}
        .receipt-header p {{ font-size: 9pt; opacity: 0.7; color: #64748b; }}
        .receipt-badge {{
            text-align: center;
            padding: 8px;
            background: #f0fdf4;
            border-bottom: 1px solid #e2e8f0;
        }}
        .receipt-badge span {{
            background: #16a34a;
            color: white;
            padding: 4px 16px;
            border-radius: 20px;
            font-size: 8pt;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
        }}
        .receipt-body {{ padding: 20px; }}
        .meta-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 20px;
        }}
        .meta-item {{
            padding: 10px 14px;
            background: #f8fafc;
            border-radius: 6px;
            border: 1px solid #f1f5f9;
        }}
        .meta-label {{
            font-size: 7pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #94a3b8;
            margin-bottom: 2px;
        }}
        .meta-value {{
            font-size: 10pt;
            font-weight: 600;
            color: {text};
        }}
        .amount-box {{
            text-align: center;
            padding: 18px;
            background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
            border: 2px solid #bbf7d0;
            border-radius: 8px;
            margin: 16px 0;
        }}
        .amount-box .label {{ font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #16a34a; }}
        .amount-box .value {{ font-size: 22pt; font-weight: 800; color: #15803d; margin-top: 4px; }}
        .divider {{
            border: none;
            border-top: 1px dashed #e2e8f0;
            margin: 16px 0;
        }}
        .footer {{
            text-align: center;
            padding: 12px 20px;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            font-size: 7pt;
            color: #94a3b8;
        }}
        .footer p {{ margin: 2px 0; }}
        .sig-area {{
            display: flex;
            justify-content: space-between;
            margin-top: 30px;
            padding-top: 10px;
        }}
        .sig-block {{ text-align: center; }}
        .sig-block .line {{ width: 100px; border-top: 1px solid #cbd5e1; margin-bottom: 4px; }}
        .sig-block .title {{ font-size: 7pt; color: #94a3b8; font-weight: 600; text-transform: uppercase; }}
    </style>
    </head>
    <body>
        <div class="receipt">
            <div class="receipt-header">
                {logo_html}
                <div>
                    <h1>{school_name}</h1>
                    <p>{branch}{(' • ' + address_line) if address_line else ''}</p>
                </div>
            </div>

            <div class="receipt-badge">
                <span>✓ Fee Receipt</span>
            </div>

            <div class="receipt-body">
                <div class="meta-grid">
                    <div class="meta-item">
                        <div class="meta-label">Receipt Number</div>
                        <div class="meta-value">{payment.get('receipt_number', '')}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Payment Date</div>
                        <div class="meta-value">{payment.get('payment_date', '')}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Student Name</div>
                        <div class="meta-value">{student.get('first_name', '')} {student.get('last_name', '')}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Admission Number</div>
                        <div class="meta-value">{student.get('admission_number', '')}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Class / Section</div>
                        <div class="meta-value">{student.get('class_section', '-')}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Academic Year</div>
                        <div class="meta-value">{invoice.get('academic_year', '-')}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Invoice Number</div>
                        <div class="meta-value">{invoice.get('invoice_number', '-')}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Payment Mode</div>
                        <div class="meta-value">{payment.get('payment_mode', 'CASH')}</div>
                    </div>
                </div>

                <div class="amount-box">
                    <div class="label">Amount Received</div>
                    <div class="value">₹{payment.get('amount', '0.00')}</div>
                </div>

                <div class="meta-grid">
                    <div class="meta-item">
                        <div class="meta-label">Total Invoice Amount</div>
                        <div class="meta-value">₹{invoice.get('net_amount', '-')}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Balance Outstanding</div>
                        <div class="meta-value">₹{invoice.get('outstanding_amount', '-')}</div>
                    </div>
                </div>

                {'<div class="meta-item" style="margin-bottom:10px;"><div class="meta-label">Reference / Txn ID</div><div class="meta-value">' + payment.get('reference_number', '') + '</div></div>' if payment.get('reference_number') else ''}

                <div class="sig-area">
                    <div class="sig-block">
                        <div class="line"></div>
                        <div class="title">Collected By: {payment.get('collected_by', '')}</div>
                    </div>
                    <div class="sig-block">
                        <div class="line"></div>
                        <div class="title">Authorized Signatory</div>
                    </div>
                </div>
            </div>

            <div class="footer">
                <p>This is a computer-generated receipt and does not require a physical signature.</p>
                <p>{school_name} • {address_line}</p>
            </div>
        </div>
    </body>
    </html>
    """


def _build_hall_ticket_html(ctx, cfg, school_name, logo_url, primary, bg, text, branch):
    exam = ctx.get('exam', {})
    student = ctx.get('student', {})
    logo_html = (
        f'<img src="{escape(logo_url)}" style="height:72px;max-width:220px;object-fit:contain;" />'
        if logo_url else ''
    )
    st_name = escape(f"{student.get('first_name', '')} {student.get('last_name', '')}".strip())
    return f"""
    <html><head><meta charset="utf-8">
    <style>
        @page {{ size: A4; margin: 14mm; }}
        body {{ font-family: 'Helvetica Neue', Arial, sans-serif; background: {escape(bg)}; color: {escape(text)}; font-size: 11pt; }}
        .wrap {{ border: 2px solid {escape(primary)}; border-radius: 10px; padding: 20px; background: #fff; }}
        .banner {{ text-align: center; border-bottom: 2px dashed {escape(primary)}; padding-bottom: 14px; margin-bottom: 18px; }}
        .banner h1 {{ color: {escape(primary)}; font-size: 18pt; margin: 6px 0; }}
        .banner .sub {{ font-size: 10pt; color: #64748b; }}
        .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
        .cell {{ background: #f8fafc; border-radius: 8px; padding: 10px 12px; border: 1px solid #e2e8f0; }}
        .lbl {{ font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #94a3b8; }}
        .val {{ font-weight: 600; margin-top: 4px; }}
        .student-name {{ font-size: 16pt; font-weight: 800; text-align: center; margin: 18px 0; color: {escape(primary)}; }}
        .foot {{ margin-top: 24px; font-size: 9pt; color: #94a3b8; text-align: center; }}
    </style></head><body>
        <div class="wrap">
            <div class="banner">
                {logo_html}
                <h1>{escape(school_name)}</h1>
                <p class="sub">{escape(branch or '')} · Hall Ticket</p>
            </div>
            <div class="student-name">{st_name}</div>
            <div class="grid">
                <div class="cell"><div class="lbl">Exam</div><div class="val">{escape(exam.get('name', ''))}</div></div>
                <div class="cell"><div class="lbl">Academic year</div><div class="val">{escape(exam.get('academic_year', ''))}</div></div>
                <div class="cell"><div class="lbl">Date (session)</div><div class="val">{escape(exam.get('start_date', ''))} – {escape(exam.get('end_date', ''))}</div></div>
                <div class="cell"><div class="lbl">Admission No.</div><div class="val">{escape(str(student.get('admission_number', '')))}</div></div>
                <div class="cell"><div class="lbl">Class</div><div class="val">{escape(str(student.get('class_section', '')))}</div></div>
                <div class="cell"><div class="lbl">Roll No.</div><div class="val">{escape(str(student.get('roll_number', '')))}</div></div>
            </div>
            <div class="foot">Bring this hall ticket and school ID to the examination. Follow instructions issued by the school.</div>
        </div>
    </body></html>
    """


def _build_report_card_html(ctx, cfg, school_name, logo_url, primary, bg, text, branch):
    exam = ctx.get('exam', {})
    student = ctx.get('student', {})
    subjects = ctx.get('subjects', [])
    agg = ctx.get('aggregate', {})
    logo_html = (
        f'<img src="{escape(logo_url)}" style="height:64px;max-width:200px;object-fit:contain;" />'
        if logo_url else ''
    )
    st_name = escape(f"{student.get('first_name', '')} {student.get('last_name', '')}".strip())
    rows = []
    for sub in subjects:
        rows.append(
            '<tr>'
            f'<td>{escape(str(sub.get("name", "")))}</td>'
            f'<td style="text-align:center">{escape(str(sub.get("marks_obtained", "")))}</td>'
            f'<td style="text-align:center">{escape(str(sub.get("max_marks", "")))}</td>'
            f'<td style="text-align:center">{escape(str(sub.get("percentage", "")))}</td>'
            f'<td style="text-align:center">{escape(str(sub.get("grade", "")))}</td>'
            '</tr>'
        )
    rows_html = '\n'.join(rows)
    return f"""
    <html><head><meta charset="utf-8">
    <style>
        @page {{ size: A4; margin: 12mm; }}
        body {{ font-family: 'Helvetica Neue', Arial, sans-serif; background: {escape(bg)}; color: {escape(text)}; font-size: 10pt; }}
        .wrap {{ max-width: 100%; }}
        .head {{ text-align: center; margin-bottom: 14px; border-bottom: 2px solid {escape(primary)}; padding-bottom: 10px; }}
        .head h1 {{ color: {escape(primary)}; font-size: 15pt; margin: 4px 0; }}
        .meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; font-size: 9pt; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
        th, td {{ border: 1px solid #cbd5e1; padding: 8px; }}
        th {{ background: {escape(primary)}; color: #fff; font-size: 8pt; text-transform: uppercase; }}
        .agg {{ margin-top: 14px; padding: 12px; background: #f1f5f9; border-radius: 8px; display: flex; justify-content: space-around; font-weight: 700; }}
    </style></head><body>
        <div class="wrap">
            <div class="head">
                {logo_html}
                <h1>{escape(school_name)}</h1>
                <div>{escape(branch or '')} · Report Card · {escape(exam.get('name', ''))}</div>
            </div>
            <div class="student-name" style="font-size:14pt;font-weight:800;text-align:center;margin:10px 0;">{st_name}</div>
            <div class="meta">
                <div>Admission: <strong>{escape(str(student.get('admission_number', '')))}</strong></div>
                <div>Class: <strong>{escape(str(student.get('class_section', '')))}</strong></div>
                <div>Year: <strong>{escape(exam.get('academic_year', ''))}</strong></div>
                <div>DOB: <strong>{escape(str(student.get('date_of_birth', '')))}</strong></div>
            </div>
            <table>
                <thead><tr><th>Subject</th><th>Marks</th><th>Max</th><th>%</th><th>Grade</th></tr></thead>
                <tbody>{rows_html}</tbody>
            </table>
            <div class="agg">
                <span>Total: {escape(str(agg.get('total_marks', '')))} / {escape(str(agg.get('max_marks', '')))}</span>
                <span>Overall %: {escape(str(agg.get('percentage', '')))}</span>
            </div>
        </div>
    </body></html>
    """


def _build_report_card_summary_html(ctx, cfg, school_name, logo_url, primary, bg, text, branch):
    exam = ctx.get('exam', {})
    students = ctx.get('students', [])
    logo_html = (
        f'<img src="{escape(logo_url)}" style="height:56px;max-width:180px;object-fit:contain;" />'
        if logo_url else ''
    )
    rows = []
    for row in students:
        st = row.get('student', {})
        agg = row.get('aggregate', {})
        name = escape(f"{st.get('first_name', '')} {st.get('last_name', '')}".strip())
        rows.append(
            '<tr>'
            f'<td>{name}</td>'
            f'<td>{escape(str(st.get("admission_number", "")))}</td>'
            f'<td>{escape(str(st.get("class_section", "")))}</td>'
            f'<td style="text-align:center">{escape(str(agg.get("total_marks", "")))}</td>'
            f'<td style="text-align:center">{escape(str(agg.get("max_marks", "")))}</td>'
            f'<td style="text-align:center">{escape(str(agg.get("percentage", "")))}</td>'
            '</tr>'
        )
    rows_html = '\n'.join(rows)
    return f"""
    <html><head><meta charset="utf-8">
    <style>
        @page {{ size: A4 landscape; margin: 10mm; }}
        body {{ font-family: 'Helvetica Neue', Arial, sans-serif; background: {escape(bg)}; color: {escape(text)}; font-size: 9pt; }}
        .head {{ text-align: center; margin-bottom: 10px; }}
        .head h1 {{ color: {escape(primary)}; font-size: 14pt; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ border: 1px solid #94a3b8; padding: 6px 8px; }}
        th {{ background: {escape(primary)}; color: #fff; font-size: 8pt; }}
        tr:nth-child(even) {{ background: #f8fafc; }}
    </style></head><body>
        <div class="head">
            {logo_html}
            <h1>{escape(school_name)}</h1>
            <p>{escape(branch or '')} · Report card summary · {escape(exam.get('name', ''))} · {escape(exam.get('academic_year', ''))}</p>
        </div>
        <table>
            <thead>
                <tr><th>Student</th><th>Adm. No.</th><th>Class</th><th>Total marks</th><th>Max</th><th>%</th></tr>
            </thead>
            <tbody>{rows_html}</tbody>
        </table>
    </body></html>
    """


def _build_transfer_certificate_html(ctx, cfg, school_name, logo_url, primary, bg, text, branch):
    st = ctx.get('student', {})
    tc = ctx.get('tc', {})
    logo_html = (
        f'<img src="{escape(logo_url)}" style="height:64px;max-width:200px;object-fit:contain;" />'
        if logo_url else ''
    )
    st_name = escape(f"{st.get('first_name', '')} {st.get('last_name', '')}".strip())
    addr_parts = [ctx.get('tenant_address'), ctx.get('tenant_city'), ctx.get('tenant_state')]
    addr_line = escape(', '.join(p for p in addr_parts if p))
    body_extra = cfg.get('certificate_body', '')
    return f"""
    <html><head><meta charset="utf-8">
    <style>
        @page {{ size: A4; margin: 18mm; }}
        body {{ font-family: 'Times New Roman', Georgia, serif; color: {escape(text)}; background: {escape(bg)}; font-size: 11pt; line-height: 1.45; }}
        .hdr {{ text-align: center; margin-bottom: 20px; }}
        .hdr h1 {{ color: {escape(primary)}; font-size: 16pt; margin: 6px 0; text-transform: uppercase; letter-spacing: 1px; }}
        .title {{ text-align: center; font-weight: 700; font-size: 13pt; margin: 24px 0 16px; text-decoration: underline; }}
        .p {{ margin: 10px 0; text-align: justify; }}
        .grid {{ margin: 18px 0; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; background: #f8fafc; }}
        .row {{ display: flex; gap: 12px; margin: 6px 0; }}
        .lbl {{ font-weight: 700; min-width: 160px; color: #475569; }}
        .sig {{ margin-top: 36px; display: flex; justify-content: space-between; }}
        .sig div {{ text-align: center; min-width: 200px; }}
        .line {{ border-top: 1px solid #64748b; margin-bottom: 6px; }}
    </style></head><body>
        <div class="hdr">
            {logo_html}
            <h1>{escape(school_name)}</h1>
            <div>{escape(branch or '')}</div>
            <div style="font-size:9pt;color:#64748b;">{addr_line}</div>
        </div>
        <div class="title">Transfer Certificate</div>
        <div class="grid">
            <div class="row"><span class="lbl">Certificate No.</span><span>{escape(str(tc.get('certificate_no', '')))}</span></div>
            <div class="row"><span class="lbl">Date of issue</span><span>{escape(str(tc.get('issue_date', '')))}</span></div>
            <div class="row"><span class="lbl">Admission No.</span><span>{escape(str(st.get('admission_number', '')))}</span></div>
        </div>
        <p class="p">This is to certify that <strong>{st_name}</strong>,
        son/daughter of <strong>{escape(str(st.get('father_name', '')))}</strong> and
        <strong>{escape(str(st.get('mother_name', '')))}</strong>,
        Date of Birth <strong>{escape(str(st.get('date_of_birth', '')))}</strong>,
        was a bonafide student of this institution, studying in class
        <strong>{escape(str(tc.get('last_class_studied', st.get('class_section', ''))))}</strong>
        during the academic session <strong>{escape(str(tc.get('academic_session', '')))}</strong>.</p>
        <p class="p">Date of leaving the school: <strong>{escape(str(tc.get('date_of_leaving', '')))}</strong>.
        Reason for leaving: <strong>{escape(str(tc.get('reason_for_leaving', '')))}</strong>.</p>
        <p class="p">Conduct: <strong>{escape(str(tc.get('conduct', 'Good')))}</strong>.
        {escape(str(tc.get('promotion_remark', 'Promoted to the next higher class.')))}</p>
        {f'<p class="p">{escape(body_extra)}</p>' if body_extra else ''}
        <p class="p">We wish <strong>{escape(str(st.get('first_name', 'the student')))}</strong> every success in future endeavours.</p>
        <div class="sig">
            <div><div class="line"></div><small>Class Teacher</small></div>
            <div><div class="line"></div><small>Principal / Head of Institution</small></div>
        </div>
    </body></html>
    """
