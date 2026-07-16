import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import (
    IsAccountantOrAbove, IsTeacherOrAbove, IsPrincipalOrAbove,
    IsStaffWriter,
    normalize_role,
)
from .models import (
    StaffProfile, TeacherAssignment,
    StaffCategory, Department, Designation, Qualification, Specialization,
)
from .serializers import (
    StaffProfileSerializer, TeacherAssignmentSerializer,
    StaffCategorySerializer, DepartmentSerializer, DesignationSerializer,
    QualificationSerializer, SpecializationSerializer,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────
# Helper mixin: branch-scoped master data
# ─────────────────────────────────────────────────────────────────

class MasterDataViewSetMixin:
    """
    Common behaviour for all master data ViewSets:
    - Read: any authenticated staff-or-above user
    - Write: accountant-or-above only
    - Automatically scopes to the request user's tenant/branch
    """

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated(), IsTeacherOrAbove()]
        return [IsAuthenticated(), IsAccountantOrAbove()]

    def _get_branch_scoped_qs(self, model):
        user = self.request.user
        role = normalize_role(user.role)
        qs = model.objects.filter(tenant=user.tenant)
        if role not in ('OWNER', 'SUPER_ADMIN') and user.branch:
            qs = qs.filter(branch=user.branch)
        return qs.order_by('name')

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(tenant=user.tenant, branch=user.branch)


# ─────────────────────────────────────────────────────────────────
# Master Data ViewSets
# ─────────────────────────────────────────────────────────────────

class StaffCategoryViewSet(MasterDataViewSetMixin, viewsets.ModelViewSet):
    serializer_class = StaffCategorySerializer

    def get_queryset(self):
        return self._get_branch_scoped_qs(StaffCategory)


class DepartmentViewSet(MasterDataViewSetMixin, viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        return self._get_branch_scoped_qs(Department)


class DesignationViewSet(MasterDataViewSetMixin, viewsets.ModelViewSet):
    serializer_class = DesignationSerializer

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(user.role)
        qs = Designation.objects.filter(tenant=user.tenant)
        if role not in ('OWNER', 'SUPER_ADMIN') and user.branch:
            qs = qs.filter(branch=user.branch)
        # Optional: filter by category
        category_id = self.request.query_params.get('category')
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs.order_by('name')


class QualificationViewSet(MasterDataViewSetMixin, viewsets.ModelViewSet):
    serializer_class = QualificationSerializer

    def get_queryset(self):
        return self._get_branch_scoped_qs(Qualification)


class SpecializationViewSet(MasterDataViewSetMixin, viewsets.ModelViewSet):
    serializer_class = SpecializationSerializer

    def get_queryset(self):
        return self._get_branch_scoped_qs(Specialization)


# ─────────────────────────────────────────────────────────────────
# Staff ViewSet
# ─────────────────────────────────────────────────────────────────

class StaffViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'assignments'):
            # Principals and above can VIEW staff records
            return [IsAuthenticated(), IsPrincipalOrAbove()]
        # Only SUPER_ADMIN / ACCOUNTANT can CREATE / EDIT / DELETE
        # Principals are intentionally excluded (business rule)
        return [IsAuthenticated(), IsStaffWriter()]

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(user.role)

        if role == 'OWNER':
            return StaffProfile.objects.filter(tenant=user.tenant) if user.tenant else StaffProfile.objects.all()

        qs = StaffProfile.objects.filter(tenant=user.tenant).select_related(
            'user', 'category', 'department', 'designation', 'qualification_ref', 'specialization_ref'
        )

        # Branch isolation for non-global roles
        if role not in ('OWNER', 'SUPER_ADMIN') and user.branch:
            qs = qs.filter(branch=user.branch)

        # Optional query filters
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('department'):
            qs = qs.filter(department_id=params['department'])
        if params.get('designation'):
            qs = qs.filter(designation_id=params['designation'])
        if params.get('category'):
            qs = qs.filter(category_id=params['category'])
        if params.get('employment_type'):
            qs = qs.filter(employment_type=params['employment_type'])
        if params.get('search'):
            from django.db.models import Q
            q = params['search']
            qs = qs.filter(
                Q(employee_id__icontains=q)
                | Q(user__first_name__icontains=q)
                | Q(user__last_name__icontains=q)
                | Q(user__email__icontains=q)
                | Q(mobile__icontains=q)
            )

        return qs.order_by('employee_id')

    def get_serializer_class(self):
        if self.action in ('assignments', 'assign_teacher'):
            return TeacherAssignmentSerializer
        return StaffProfileSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            logger.warning("StaffViewSet create validation errors: %s", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            self.perform_create(serializer)
        except Exception as e:
            logger.error("Error creating staff: %s", str(e))
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        user = self.request.user
        role = normalize_role(user.role)

        if role == 'OWNER':
            # OWNER may specify an explicit branch/tenant via the serializer
            tenant = user.tenant
        else:
            tenant = user.tenant

        # Branch-scoped roles: force the profile's branch to their own branch
        branch = serializer.validated_data.get('branch')
        if role in ('PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT') and user.branch:
            branch = user.branch

        serializer.save(tenant=tenant, branch=branch)

    def perform_destroy(self, instance):
        """Soft-delete: mark profile inactive; deactivate portal account if any."""
        instance.status = 'INACTIVE'
        instance.is_active = False
        instance.save()
        if instance.user:
            instance.user.is_active = False
            instance.user.save()

    # ── Custom Actions ──────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='assignments',
            permission_classes=[IsAuthenticated, IsTeacherOrAbove])
    def assignments(self, request, pk=None):
        staff = self.get_object()
        qs = TeacherAssignment.objects.filter(staff=staff).select_related(
            'class_section', 'subject', 'academic_year'
        )
        serializer = TeacherAssignmentSerializer(qs, many=True)
        return Response({"data": serializer.data})

    @action(detail=False, methods=['post'], url_path='assign',
            permission_classes=[IsAuthenticated, IsAccountantOrAbove])
    def assign_teacher(self, request):
        from django.db import transaction
        from students.models import ClassSection

        staff_id = request.data.get('teacher')  # frontend still sends 'teacher' key
        class_assignments = request.data.get('class_assignments', {})
        academic_year_id = request.data.get('academic_year')
        is_class_teacher_requested = request.data.get('is_class_teacher', False)
        primary_class_id = request.data.get('primary_class_id')

        # Legacy flat format: class_sections + subjects → convert
        class_ids = request.data.get('class_sections', [])
        subject_ids = request.data.get('subjects', [])
        if not class_assignments and class_ids and subject_ids:
            class_assignments = {str(cid): [str(sid) for sid in subject_ids] for cid in class_ids}

        if not staff_id or not academic_year_id:
            return Response(
                {"error": "teacher and academic_year are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not class_assignments:
            return Response(
                {"error": "No class-subject assignments provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_assignments = []
        with transaction.atomic():
            # 1. Collect all requested (class_id, subject_id) pairs
            requested_pairs = set()
            for cs_id, sub_ids in class_assignments.items():
                for sub_id in sub_ids:
                    requested_pairs.add((str(cs_id), str(sub_id)))

            # 2. Remove assignments that are NOT in the requested set
            existing_qs = TeacherAssignment.objects.filter(
                staff_id=staff_id, academic_year_id=academic_year_id
            )
            for ext in existing_qs:
                if (str(ext.class_section_id), str(ext.subject_id)) not in requested_pairs:
                    ext.delete()

            # 3. Resolve the staff profile
            staff_profile = StaffProfile.objects.get(id=staff_id)
            staff_user = staff_profile.user

            # 4. Create/update requested pairs
            for cs_id, sub_ids in class_assignments.items():
                is_ct = False
                if is_class_teacher_requested:
                    if primary_class_id and str(cs_id) == str(primary_class_id):
                        is_ct = True
                    elif not primary_class_id and len(class_assignments) == 1:
                        is_ct = True

                if is_ct:
                    # 1-to-1: clear class-teacher flag on all other classes for this staff
                    TeacherAssignment.objects.filter(
                        staff_id=staff_id, academic_year_id=academic_year_id
                    ).exclude(class_section_id=cs_id).update(is_class_teacher=False)

                    # 1-to-1: clear class-teacher flag on all other staff for this class
                    TeacherAssignment.objects.filter(
                        class_section_id=cs_id, academic_year_id=academic_year_id
                    ).exclude(staff_id=staff_id).update(is_class_teacher=False)

                    if staff_user:
                        ClassSection.objects.filter(class_teacher=staff_user).exclude(
                            id=cs_id
                        ).update(class_teacher=None)
                        ClassSection.objects.filter(id=cs_id).update(class_teacher=staff_user)
                else:
                    # Unset class_teacher on this section if it was this staff
                    if staff_user:
                        ClassSection.objects.filter(
                            id=cs_id, class_teacher=staff_user
                        ).update(class_teacher=None)

                for sub_id in sub_ids:
                    assignment, _ = TeacherAssignment.objects.update_or_create(
                        class_section_id=cs_id,
                        subject_id=sub_id,
                        academic_year_id=academic_year_id,
                        defaults={
                            'staff_id': staff_id,
                            'tenant': request.user.tenant,
                            'is_class_teacher': is_ct,
                        },
                    )
                    created_assignments.append(assignment)

        return Response(
            {
                "success": True,
                "count": len(created_assignments),
                "message": f"Successfully assigned {len(created_assignments)} class-subject(s).",
            },
            status=status.HTTP_201_CREATED,
        )
