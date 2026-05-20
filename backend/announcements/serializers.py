from rest_framework import serializers
from students.models import ClassSection
from .models import Announcement, AnnouncementReadReceipt


class AnnouncementSerializer(serializers.ModelSerializer):
    read_count = serializers.SerializerMethodField()
    target_class_labels = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'published_at', 'tenant']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        qs = ClassSection.objects.none()
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            qs = ClassSection.objects.filter(branch__tenant=request.user.tenant)
        self.fields['target_classes'] = serializers.PrimaryKeyRelatedField(
            many=True,
            queryset=qs,
            required=False,
            allow_empty=True,
        )

    def get_read_count(self, obj):
        return obj.read_receipts.count()

    def get_target_class_labels(self, obj):
        if obj.target_audience != 'CLASS':
            return []
        return [c.display_name for c in obj.target_classes.all()]

    def get_is_read(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.read_receipts.filter(user=request.user).exists()

    def validate(self, attrs):
        if 'target_audience' in attrs and attrs.get('target_audience') != 'INDIVIDUAL':
            attrs['recipient_email'] = None

        aud = attrs.get('target_audience')
        if aud is None and self.instance:
            aud = self.instance.target_audience

        if aud == 'INDIVIDUAL':
            email = attrs.get('recipient_email')
            if email is None and self.instance:
                email = self.instance.recipient_email
            if not (str(email or '').strip()):
                raise serializers.ValidationError(
                    {'recipient_email': 'Enter the recipient email for a one-to-one announcement.'}
                )
            attrs['recipient_email'] = str(email).strip()

        branch = attrs.get('branch')
        if branch is None and self.instance:
            branch = self.instance.branch

        if 'target_audience' in attrs and attrs.get('target_audience') != 'CLASS':
            attrs['target_classes'] = []

        if aud == 'CLASS':
            tcs = attrs.get('target_classes')
            if tcs is None and self.instance:
                tcs = list(self.instance.target_classes.all())
            if not tcs:
                raise serializers.ValidationError(
                    {'target_classes': 'Select at least one class for parents in those sections.'}
                )
            if branch:
                for cs in tcs:
                    if str(cs.branch_id) != str(branch.id):
                        raise serializers.ValidationError(
                            {
                                'target_classes': (
                                    f'Class "{cs.display_name}" is not in the announcement branch.'
                                )
                            }
                        )

        return attrs

    def create(self, validated_data):
        target_classes = validated_data.pop('target_classes', [])
        instance = super().create(validated_data)
        if target_classes is not None:
            instance.target_classes.set(target_classes)
        return instance

    def update(self, instance, validated_data):
        target_classes = validated_data.pop('target_classes', None)
        instance = super().update(instance, validated_data)
        if target_classes is not None:
            instance.target_classes.set(target_classes)
        return instance


class AnnouncementReadReceiptSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnnouncementReadReceipt
        fields = '__all__'
        read_only_fields = ['id', 'read_at']
