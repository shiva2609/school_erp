import uuid
from django.db import models
from django.conf import settings

TEMPLATE_TYPES = [
    ('ID_CARD', 'ID Card'),
    ('FEE_RECEIPT', 'Fee Receipt'),
    ('TRANSPORT_FEE_RECEIPT', 'Transport Fee Receipt'),
    ('TRANSFER_CERTIFICATE', 'Transfer Certificate'),
    ('HALL_TICKET', 'Hall Ticket'),
    ('REPORT_CARD', 'Report Card (per student)'),
    ('REPORT_CARD_SUMMARY', 'Report Card Summary (section)'),
]

TEMPLATE_MODES = [
    ('CONFIG', 'Standard Configuration (Safe)'),
    ('HTML', 'Raw HTML (Advanced)'),
]

class DocumentTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='document_templates')
    branch = models.ForeignKey('tenants.Branch', on_delete=models.CASCADE, null=True, blank=True, related_name='document_templates')
    
    name = models.CharField(max_length=200)
    type = models.CharField(max_length=50, choices=TEMPLATE_TYPES)
    mode = models.CharField(max_length=20, choices=TEMPLATE_MODES, default='CONFIG')
    
    # Mode = CONFIG (Stores JSON)
    # e.g., {'theme': 'modern', 'primary_color': '#ff0000', 'logo': 'url'}
    config_data = models.JSONField(blank=True, null=True, default=dict)
    
    # Mode = HTML (Stores raw text)
    raw_html = models.TextField(blank=True, null=True)
    
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'branch', 'type'],
                condition=models.Q(is_default=True),
                name='unique_default_template_per_type'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"
