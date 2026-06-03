import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsAccountantOrAbove, IsTeacherOrAbove, normalize_role
from .models import TeacherProfile, TeacherAssignment
from .serializers import TeacherProfileSerializer, TeacherAssignmentSerializer

logger = logging.getLogger(__name__)

class StaffViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'assignments'):
            return [IsAuthenticated(), IsTeacherOrAbove()]
        return [IsAuthenticated(), IsAccountantOrAbove()]

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(user.role)
        if role == 'OWNER':
            # Scope to tenant if one is assigned, otherwise show all
            if user.tenant:
                return TeacherProfile.objects.filter(tenant=user.tenant)
            return TeacherProfile.objects.all()
        # Non-super admins only see teachers in their tenant
        qs = TeacherProfile.objects.filter(tenant=user.tenant)
        # Branch Isolation (using direct branch tagging)
        if role not in ['OWNER', 'SUPER_ADMIN'] and user.branch:
            qs = qs.filter(branch=user.branch)
        return qs

    def get_serializer_class(self):
        if self.action in ['assignments', 'assign_teacher']:
            return TeacherAssignmentSerializer
        return TeacherProfileSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(f"StaffViewSet validation errors: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            self.perform_create(serializer)
        except Exception as e:
            logger.error(f"Error creating teacher: {str(e)}")
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        user = self.request.user
        role = normalize_role(user.role)
        branch = serializer.validated_data.get('branch')
        
        if role == 'OWNER':
            teacher_user = serializer.validated_data.get('user')
            tenant = teacher_user.tenant if teacher_user else None
        else:
            tenant = user.tenant
            
        if role in ('PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT') and user.branch:
            branch = user.branch

        serializer.save(tenant=tenant, branch=branch)

    def perform_destroy(self, instance):
        """Perform soft-delete by deactivating the staff profile and user account."""
        instance.is_active = False
        instance.save()
        if instance.user:
            instance.user.is_active = False
            instance.user.save()

    @action(detail=True, methods=['get'], url_path='assignments')
    def assignments(self, request, pk=None):
        teacher = self.get_object()
        assignments = TeacherAssignment.objects.filter(teacher=teacher)
        serializer = TeacherAssignmentSerializer(assignments, many=True)
        return Response({"data": serializer.data})

    @action(detail=False, methods=['post'], url_path='assign')
    def assign_teacher(self, request):
        from django.db import transaction
        
        teacher_id = request.data.get('teacher')
        class_ids = request.data.get('class_sections', [])
        subject_ids = request.data.get('subjects', [])
        academic_year_id = request.data.get('academic_year')
        is_class_teacher_requested = request.data.get('is_class_teacher', False)
        primary_class_id = request.data.get('primary_class_id')
        
        # New Granular Format: {"class_assignments": {"class_id": ["subject_id1", "subject_id2"], ...}}
        class_assignments = request.data.get('class_assignments', {})

        if not teacher_id or not academic_year_id:
            return Response({"error": "teacher and academic_year are required."}, status=status.HTTP_400_BAD_REQUEST)

        # Convert old format to new format if provided
        if not class_assignments and (class_ids and subject_ids):
            class_assignments = {str(cid): [str(sid) for sid in subject_ids] for cid in class_ids}

        if not class_assignments:
             return Response({"error": "No class-subject assignments provided."}, status=status.HTTP_400_BAD_REQUEST)

        created_assignments = []
        with transaction.atomic():
            # 1. Collect all requested (class_id, subject_id) pairs
            requested_pairs = set()
            for cs_id, sub_ids in class_assignments.items():
                for sub_id in sub_ids:
                    requested_pairs.add((str(cs_id), str(sub_id)))

            # 2. Delete existing assignments that are NOT in the requested set
            # Filter by teacher and academic year to isolate the scope
            TeacherAssignment.objects.filter(
                teacher_id=teacher_id,
                academic_year_id=academic_year_id
            ).exclude(
                class_section_id__in=[p[0] for p in requested_pairs],
                subject_id__in=[p[1] for p in requested_pairs]
            ).delete()
            
            # Additional cleanup: even if IDs match individually, the pair must match
            existing = TeacherAssignment.objects.filter(teacher_id=teacher_id, academic_year_id=academic_year_id)
            for ext in existing:
                 if (str(ext.class_section_id), str(ext.subject_id)) not in requested_pairs:
                     ext.delete()

            # 3. Create or update requested assignments
            from students.models import ClassSection
            from staff.models import TeacherProfile
            teacher_profile = TeacherProfile.objects.get(id=teacher_id)
            teacher_user = teacher_profile.user

            for cs_id, sub_ids in class_assignments.items():
                is_ct = False
                if is_class_teacher_requested and primary_class_id and str(cs_id) == str(primary_class_id):
                    is_ct = True
                elif is_class_teacher_requested and not primary_class_id and len(class_assignments) == 1:
                    is_ct = True

                if is_ct:
                    # Enforce 1-to-1: This teacher cannot be primary teacher of any other class
                    TeacherAssignment.objects.filter(
                        teacher_id=teacher_id, academic_year_id=academic_year_id
                    ).exclude(class_section_id=cs_id).update(is_class_teacher=False)
                    
                    # This class cannot have any other primary teacher
                    TeacherAssignment.objects.filter(
                        class_section_id=cs_id, academic_year_id=academic_year_id
                    ).exclude(teacher_id=teacher_id).update(is_class_teacher=False)
                    
                    if teacher_user:
                        ClassSection.objects.filter(class_teacher=teacher_user).exclude(id=cs_id).update(class_teacher=None)
                        ClassSection.objects.filter(id=cs_id).update(class_teacher=teacher_user)
                else:
                    # If this teacher is no longer the class teacher for this class section, unset it
                    if teacher_user:
                        ClassSection.objects.filter(id=cs_id, class_teacher=teacher_user).update(class_teacher=None)

                for sub_id in sub_ids:
                    assignment, created = TeacherAssignment.objects.update_or_create(
                        class_section_id=cs_id,
                        subject_id=sub_id,
                        academic_year_id=academic_year_id,
                        defaults={
                            'teacher_id': teacher_id,
                            'tenant': request.user.tenant,
                            'is_class_teacher': is_ct
                        }
                    )
                    created_assignments.append(assignment)
        
        return Response({
            "success": True, 
            "count": len(created_assignments),
            "message": f"Successfully assigned {len(created_assignments)} subjects/classes."
        }, status=status.HTTP_201_CREATED)
