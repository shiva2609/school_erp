from decimal import Decimal

from rest_framework import serializers


class MarkRowSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    marks_obtained = serializers.DecimalField(max_digits=7, decimal_places=2)
    max_marks = serializers.DecimalField(max_digits=7, decimal_places=2, required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=200)


class BulkExamMarksSerializer(serializers.Serializer):
    exam_term_id = serializers.UUIDField()
    class_section_id = serializers.UUIDField()
    subject_id = serializers.UUIDField()
    default_max_marks = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=Decimal('100')
    )
    rows = MarkRowSerializer(many=True)
