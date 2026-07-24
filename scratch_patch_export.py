import re

with open('backend/reports/views/payments.py', 'r') as f:
    content = f.read()

export_block = """
        file_format = request.query_params.get('file', '').lower()
        if file_format in ('csv', 'pdf'):
            from django.http import HttpResponse
            from reports.export_utils import generate_csv_bytes, generate_pdf_bytes

            serialized = [self._serialize_row(r, report_type, categories) for r in rows]
            cat_headers = [c.name.upper() for c in categories]
            cat_keys = [f'cat_{str(c.id).replace("-", "_")}' for c in categories]
            
            if report_type == 'class':
                headers = ['CLASS', 'TOTAL STUDENTS'] + cat_headers + ['OLD DUES', 'CONCESSION', 'TOTAL AMOUNT', 'AMOUNT PAID', 'BALANCE']
                data_rows = []
                for r in serialized:
                    row = [r.get('class', ''), r.get('total_students', 0)]
                    row.extend([r.get(k, '0.00') for k in cat_keys])
                    row.extend([r.get('old_dues', '0.00'), r.get('concession_amount', '0.00'), r.get('net_amount', '0.00'), r.get('paid_amount', '0.00'), r.get('outstanding_amount', '0.00')])
                    data_rows.append(row)
            elif report_type == 'section':
                headers = ['CLASS', 'SECTION', 'TOTAL STUDENTS'] + cat_headers + ['OLD DUES', 'CONCESSION', 'TOTAL AMOUNT', 'AMOUNT PAID', 'BALANCE']
                data_rows = []
                for r in serialized:
                    row = [r.get('class', ''), r.get('section', ''), r.get('total_students', 0)]
                    row.extend([r.get(k, '0.00') for k in cat_keys])
                    row.extend([r.get('old_dues', '0.00'), r.get('concession_amount', '0.00'), r.get('net_amount', '0.00'), r.get('paid_amount', '0.00'), r.get('outstanding_amount', '0.00')])
                    data_rows.append(row)
            else:
                headers = ['ADMISSION NO.', 'STUDENT NAME', 'CLASS', 'SECTION', 'CATEGORY', 'PARENT NAME', 'PARENT MOBILE'] + cat_headers + ['OLD DUES', 'CONCESSION', 'TOTAL AMOUNT', 'AMOUNT PAID', 'BALANCE', 'STATUS', 'INACTIVE REASON']
                data_rows = []
                for r in serialized:
                    row = [r.get('admission_number', ''), r.get('student_name', ''), r.get('class', ''), r.get('section', ''), r.get('category', ''), r.get('parent_name', ''), r.get('parent_mobile', '')]
                    row.extend([r.get(k, '0.00') for k in cat_keys])
                    row.extend([r.get('old_dues', '0.00'), r.get('concession_amount', '0.00'), r.get('net_amount', '0.00'), r.get('paid_amount', '0.00'), r.get('outstanding_amount', '0.00'), r.get('status', ''), r.get('inactive_reason', '')])
                    data_rows.append(row)

            try:
                if file_format == 'csv':
                    buffer, file_name, content_type = generate_csv_bytes(f'fee_balances_{report_type}', headers, data_rows)
                    file_bytes = buffer.read()
                else:
                    file_bytes, file_name, content_type = generate_pdf_bytes(f'fee_balances_{report_type}', headers, data_rows)
            except Exception as exc:
                from rest_framework.response import Response
                from rest_framework import status
                return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
            response = HttpResponse(file_bytes, content_type=content_type)
            response['Content-Disposition'] = f'attachment; filename="{file_name}"'
            response['Content-Length'] = len(file_bytes)
            response['Access-Control-Expose-Headers'] = 'Content-Disposition'
            return response

        # ── Paginate ───────────────────────────────────────────────────────────"""

content = content.replace('        # ── Paginate ───────────────────────────────────────────────────────────', export_block)

with open('backend/reports/views/payments.py', 'w') as f:
    f.write(content)

print("Patched payments.py")
