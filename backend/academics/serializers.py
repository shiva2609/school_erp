from decimal import Decimal
from rest_framework import serializers
from academics.models import AcademicSubject, Assessment, AssessmentSubject

class MarkRowSerializer(serializers.Serializer):
    student_id     = serializers.UUIDField()
    marks_obtained = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, allow_null=True
    )
    is_absent      = serializers.BooleanField(required=False, default=False)
    remarks        = serializers.CharField(required=False, allow_blank=True, max_length=200)


class BulkExamMarksSerializer(serializers.Serializer):
    assessment_id = serializers.UUIDField()
    class_section_id = serializers.UUIDField()
    subject_id = serializers.UUIDField()
    default_max_marks = serializers.DecimalField(
        max_digits=7, decimal_places=2, required=False, default=Decimal('100')
    )
    rows = MarkRowSerializer(many=True)


# ─────────────────────────────────────────────────────────────────────────────
# NEW: Academic Subjects & Assessments serializers
# ─────────────────────────────────────────────────────────────────────────────

class AcademicSubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicSubject
        fields = [
            'id', 'name', 'is_optional', 'is_first_language',
            'is_second_language', 'is_third_language',
            'display_order', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AssessmentSubjectSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_is_optional = serializers.BooleanField(source='subject.is_optional', read_only=True)

    class Meta:
        model = AssessmentSubject
        fields = [
            'id', 'subject', 'subject_name', 'subject_is_optional',
            'max_marks', 'min_marks', 'exam_date', 'exam_time',
        ]
        read_only_fields = ['id', 'subject_name', 'subject_is_optional']


class AssessmentSerializer(serializers.ModelSerializer):
    subject_count = serializers.SerializerMethodField()
    grade_display = serializers.CharField(source='get_grade_display', read_only=True)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)

    class Meta:
        model = Assessment
        fields = [
            'id', 'name', 'academic_year', 'academic_year_name',
            'grade', 'grade_display',
            'start_date', 'end_date',
            'status',       # DRAFT / ACTIVE / LOCKED
            'is_active',
            'subject_count', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'grade_display', 'academic_year_name',
            'subject_count', 'created_at', 'updated_at',
        ]

    def get_subject_count(self, obj):
        return obj.assessment_subjects.count()
