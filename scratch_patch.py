import re

with open('backend/reports/export_utils.py', 'r') as f:
    content = f.read()

csv_func = """
def generate_csv_bytes(report_type: str, headers: list, data_rows: list):
    import csv
    import io
    import uuid
    
    string_buffer = io.StringIO()
    writer = csv.writer(string_buffer)
    writer.writerow(headers)
    for row in data_rows:
        writer.writerow(row)
        
    bytes_buffer = io.BytesIO(string_buffer.getvalue().encode('utf-8'))
    file_name = f"{report_type}_{uuid.uuid4().hex[:8]}.csv"
    return bytes_buffer, file_name, "text/csv"

"""

if 'generate_csv_bytes' not in content:
    content = content.replace('def generate_excel_bytes', csv_func + 'def generate_excel_bytes')
    with open('backend/reports/export_utils.py', 'w') as f:
        f.write(content)
    print("Added generate_csv_bytes")
else:
    print("generate_csv_bytes already exists")
