from decimal import Decimal
from rest_framework import serializers

from academics.models import ExamTerm, ExamSubjectConfig

class ExamTermSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamTerm
        fields = ['id', 'name', 'start_date', 'end_date', 'weightage_percentage', 'is_active', 'branch', 'academic_year']
        read_only_fields = ['branch', 'academic_year']

class ExamSubjectConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamSubjectConfig
        fields = ['id', 'exam_term', 'class_section', 'subject', 'max_marks']


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
