from rest_framework import serializers
from .models import Period, TimetableSlot, ClassSubjectDemand


class PeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = Period
        fields = '__all__'
        read_only_fields = ['id', 'tenant']



class TimetableSlotSerializer(serializers.ModelSerializer):
    period_name = serializers.CharField(source='period.name', read_only=True)
    period_start = serializers.TimeField(source='period.start_time', read_only=True)
    period_end = serializers.TimeField(source='period.end_time', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True, default=None)
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = TimetableSlot
        fields = '__all__'
        read_only_fields = ['id', 'tenant']

    def get_teacher_name(self, obj):
        if obj.teacher and obj.teacher.user:
            return f"{obj.teacher.user.first_name} {obj.teacher.user.last_name}"
        return None

    def validate(self, data):
        tenant = self.context['request'].user.tenant
        
        # When updating explicitly passed data might be missing if partial update, so fallback to instance
        period = data.get('period', self.instance.period if self.instance else None)
        day_of_week = data.get('day_of_week', self.instance.day_of_week if self.instance else None)
        class_section = data.get('class_section', self.instance.class_section if self.instance else None)
        teacher = data.get('teacher', self.instance.teacher if self.instance else None)

        if not all([period, day_of_week, class_section]):
            return data # handled by other validators

        qs_class = TimetableSlot.objects.filter(
            tenant=tenant, class_section=class_section, period=period, day_of_week=day_of_week
        )
        if self.instance:
            qs_class = qs_class.exclude(pk=self.instance.pk)
        if qs_class.exists():
            raise serializers.ValidationError({"class_section": "Class section is already booked for this period on this day."})
            
        if teacher:
            qs_teacher = TimetableSlot.objects.filter(
                tenant=tenant, teacher=teacher, period=period, day_of_week=day_of_week
            )
            if self.instance:
                qs_teacher = qs_teacher.exclude(pk=self.instance.pk)
            if qs_teacher.exists():
                raise serializers.ValidationError({"teacher": "Teacher is already scheduled for this period on this day."})
                
        return data

class ClassSubjectDemandSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = ClassSubjectDemand
        fields = '__all__'
        read_only_fields = ['id', 'tenant']

    def get_teacher_name(self, obj):
        if obj.teacher and obj.teacher.user:
            return f"{obj.teacher.user.first_name} {obj.teacher.user.last_name}"
        return None
