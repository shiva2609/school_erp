from decimal import Decimal

from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from accounts.permissions import IsSchoolAdminOrAbove, IsSuperAdmin, normalize_role
from .models import Tenant, Branch, AcademicYear, GlobalSetting, Zone, BranchAdmissionFee
from .serializers import (
    TenantSerializer,
    BranchSerializer,
    AcademicYearSerializer,
    GlobalSettingSerializer,
    ZoneSerializer,
    BranchAdmissionFeeSerializer,
)
from fees.models import FeeCategory, FeeStructure, FeeStructureItem
from students.models import ClassSection

class TenantViewSet(viewsets.ModelViewSet):
    """
    Super Admins can see all tenants.
    Others can only see their own tenant.
    """
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(getattr(user, 'role', None))
        if role == 'OWNER':
            return Tenant.objects.all()
        elif user.tenant:
            return Tenant.objects.filter(id=user.tenant.id)
        return Tenant.objects.none()

    @action(detail=False, methods=['get', 'patch'], url_path='me')
    def me(self, request):
        user = request.user
        if not user.tenant:
            return Response({"error": "No tenant associated with user"}, status=status.HTTP_404_NOT_FOUND)
        
        tenant = user.tenant
        if request.method == 'PATCH':
            serializer = self.get_serializer(tenant, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response({"data": serializer.data})
        
        serializer = self.get_serializer(tenant)
        return Response({"data": serializer.data})


class BranchViewSet(viewsets.ModelViewSet):
    """
    Provide available branches for dropdowns and management.
    """
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSchoolAdminOrAbove()]
        return [IsAuthenticated()]

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({'success': True, 'data': serializer.data})

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(getattr(user, 'role', None))
        qs = Branch.objects.none()
        
        if role == 'OWNER':
            qs = Branch.objects.all()
        elif role in ['SUPER_ADMIN', 'CHIEF_ACCOUNTANT'] and user.tenant:
            qs = Branch.objects.filter(tenant=user.tenant)
        elif role == 'ZONAL_ADMIN':
            zone_ids = list(user.zone_accesses.values_list('zone_id', flat=True))
            qs = Branch.objects.filter(tenant=user.tenant, zone_id__in=zone_ids)
        elif role in ['PRINCIPAL', 'BRANCH_ADMIN', 'TEACHER', 'ACCOUNTANT', 'STUDENT', 'PARENT']:
            for_transfer = self.request.query_params.get('for_transfer') == 'true'
            if for_transfer and role in ['PRINCIPAL', 'BRANCH_ADMIN', 'ACCOUNTANT'] and user.tenant:
                # Allow branch-scoped staff to see all branches when initiating a student transfer
                qs = Branch.objects.filter(tenant=user.tenant)
            elif user.branch:
                qs = Branch.objects.filter(id=user.branch.id)
            elif user.tenant:
                # Fallback if branch is not set but tenant is
                qs = Branch.objects.filter(tenant=user.tenant)
            
        tenant_id = self.request.query_params.get('tenant_id')
        if tenant_id and (role in ['OWNER', 'SUPER_ADMIN'] or not user.tenant):
            qs = qs.filter(tenant_id=tenant_id)
            
        return qs


    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        if not tenant:
             # If super admin, they must provide a tenant in the request or we derive it
             tenant_id = self.request.data.get('tenant')
             if tenant_id:
                 tenant = Tenant.objects.get(id=tenant_id)
        
        branch = serializer.save(tenant=tenant)
        # Create default fee categories
        defaults = [
            ('Tuition Fee', 'TUITION'),
            ('Transport (0-2 KM)', 'TRANS_0_2'),
            ('Transport (2-5 KM)', 'TRANS_2_5'),
            ('Transport (5-10 KM)', 'TRANS_5_10'),
            ('Transport (10+ KM)', 'TRANS_10_PLUS'),
        ]
        for name, code in defaults:
            FeeCategory.objects.get_or_create(
                tenant=self.request.user.tenant,
                branch=branch,
                code=code,
                defaults={'name': name}
            )
        FeeCategory.objects.get_or_create(
            tenant=self.request.user.tenant,
            branch=branch,
            code='ADMISSION',
            defaults={
                'name': 'Admission Fee',
                'description': 'One-time admission / application fee',
                'is_active': True,
                'order': 0,
            },
        )

        # Seed default Indian grading scale so grades are computed correctly
        # for this branch from day one.
        self._seed_grade_scale(branch)

    @staticmethod
    def _seed_grade_scale(branch):
        """Seed the standard Indian grading scale for a branch if not already present."""
        from academics.models import GradeScale
        if GradeScale.objects.filter(branch=branch).exists():
            return  # already seeded — don't overwrite custom scales
        scales = [
            ('A1', 91.0, 100.0,  10.0),
            ('A2', 81.0,  90.99,  9.0),
            ('B1', 71.0,  80.99,  8.0),
            ('B2', 61.0,  70.99,  7.0),
            ('C1', 51.0,  60.99,  6.0),
            ('C2', 41.0,  50.99,  5.0),
            ('D1', 33.0,  40.99,  4.0),
            ('D2', 21.0,  32.99,  0.0),
            ('E',   0.0,  20.99,  0.0),
        ]
        for grade, min_p, max_p, point in scales:
            GradeScale.objects.get_or_create(
                branch=branch,
                name='Standard Indian Scale',
                grade=grade,
                defaults={
                    'tenant': branch.tenant,
                    'min_marks_percent': min_p,
                    'max_marks_percent': max_p,
                    'grade_point': point,
                },
            )


    @action(detail=True, methods=['get', 'patch'], url_path='admission-fee')
    def admission_fee(self, request, pk=None):
        """GET/PATCH configured admission fee for this branch and an academic year (not part of class fee structure)."""
        branch = self.get_object()
        if request.method == 'GET':
            ay_id = request.query_params.get('academic_year_id')
        else:
            ay_id = request.data.get('academic_year_id')
        if not ay_id:
            return Response({'detail': 'academic_year_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        ay = get_object_or_404(AcademicYear, id=ay_id, tenant_id=branch.tenant_id)
        row, _ = BranchAdmissionFee.objects.get_or_create(
            branch=branch, academic_year=ay, defaults={'amount': Decimal('0.00')}
        )
        if request.method == 'GET':
            return Response({
                'success': True,
                'data': BranchAdmissionFeeSerializer(row).data,
            })
        # PATCH
        perm = IsSchoolAdminOrAbove()
        if not perm.has_permission(request, self):
            return Response(status=status.HTTP_403_FORBIDDEN)
        amt = request.data.get('amount')
        if amt is None:
            return Response({'detail': 'amount is required.'}, status=status.HTTP_400_BAD_REQUEST)
        row.amount = Decimal(str(amt))
        if row.amount < 0:
            return Response({'detail': 'amount cannot be negative.'}, status=status.HTTP_400_BAD_REQUEST)
        row.save(update_fields=['amount', 'updated_at'])
        return Response({'success': True, 'data': BranchAdmissionFeeSerializer(row).data})


class AcademicYearViewSet(viewsets.ModelViewSet):
    """
    Provide available academic years for dropdowns and management.
    """
    serializer_class = AcademicYearSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSchoolAdminOrAbove()]
        return [IsAuthenticated()]

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({'success': True, 'data': serializer.data})

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(getattr(user, 'role', None))
        qs = AcademicYear.objects.none()
        
        if role == 'OWNER':
            qs = AcademicYear.objects.all()
        elif user.tenant:
            qs = AcademicYear.objects.filter(tenant=user.tenant)
        
        # Additional filter by branch if provided, though years are tenant-wide
        branch_id = self.request.query_params.get('branch_id')
        if branch_id and role in ['OWNER', 'SUPER_ADMIN']:
            qs = qs.filter(tenant__branches__id=branch_id).distinct()
            
        return qs

    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        
        if not tenant:
            # Fallback for manual creation or super admin
            tenant_id = self.request.data.get('tenant')
            if tenant_id:
                tenant = Tenant.objects.get(id=tenant_id)
                
        serializer.save(tenant=tenant)

    @action(detail=True, methods=['post'], url_path='clone-setup')
    def clone_setup(self, request, pk=None):
        target_year = self.get_object()
        source_year_id = request.data.get('source_year_id')
        if not source_year_id:
            return Response({'error': 'source_year_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            source_year = AcademicYear.objects.get(id=source_year_id)
        except AcademicYear.DoesNotExist:
            return Response({'error': 'Source academic year not found'}, status=status.HTTP_404_NOT_FOUND)

        # B11: Prevent cross-tenant cloning
        if source_year.tenant != request.user.tenant:
            return Response({'error': 'Cannot clone from a different tenant.'}, status=status.HTTP_403_FORBIDDEN)
        # 1. Clone ClassSections
        sections = ClassSection.objects.filter(academic_year=source_year)
        cloned_sections = 0
        for section in sections:
            # Check if already exists in target
            if not ClassSection.objects.filter(
                branch=section.branch, academic_year=target_year, 
                grade=section.grade, section=section.section
            ).exists():
                ClassSection.objects.create(
                    tenant=section.tenant,
                    branch=section.branch,
                    academic_year=target_year,
                    grade=section.grade,
                    section=section.section,
                    max_capacity=section.max_capacity,
                    is_active=section.is_active
                )
                cloned_sections += 1

        # 2. Clone Fee Structures (including branch-wide ones like 'TRANSPORT')
        cloned_structures = 0
        source_structures = FeeStructure.objects.filter(academic_year=source_year)
        for old_struct in source_structures:
            new_struct, created = FeeStructure.objects.get_or_create(
                tenant=old_struct.tenant,
                branch=old_struct.branch,
                academic_year=target_year,
                grade=old_struct.grade,
                defaults={
                    'name': f"{old_struct.grade} Fees - {target_year.name}",
                    'created_by': request.user
                }
            )
            if created:
                cloned_structures += 1
                # Clone items
                for item in old_struct.items.all():
                    FeeStructureItem.objects.get_or_create(
                        structure=new_struct,
                        category=item.category,
                        defaults={
                            'amount': item.amount,
                            'frequency': item.frequency,
                            'is_optional': item.is_optional
                        }
                    )

        # 3. Clone branch admission fees (one-time admission amount per branch/year)
        cloned_adm = 0
        for old_row in BranchAdmissionFee.objects.filter(academic_year=source_year):
            _, created = BranchAdmissionFee.objects.get_or_create(
                branch=old_row.branch,
                academic_year=target_year,
                defaults={'amount': old_row.amount},
            )
            if created:
                cloned_adm += 1

        return Response({
            'message': f'Successfully cloned {cloned_sections} sections and {cloned_structures} structures.',
            'sections_cloned': cloned_sections,
            'structures_cloned': cloned_structures,
            'admission_fees_cloned': cloned_adm,
        })

class SuperAdminTenantViewSet(viewsets.ModelViewSet):
    """
    Dedicated viewset for SUPER_ADMIN to manage all tenants.
    """
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    queryset = Tenant.objects.all()

    @action(detail=True, methods=['patch'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        tenant = self.get_object()
        tenant.is_active = not tenant.is_active
        tenant.save()
        return Response({'success': True, 'is_active': tenant.is_active})

class GlobalSettingViewSet(viewsets.ModelViewSet):
    """
    Manage global system settings.
    GET is public if the setting is_public.
    POST/PATCH requires SUPER_ADMIN.
    """
    serializer_class = GlobalSettingSerializer
    queryset = GlobalSetting.objects.all()

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated(), IsSuperAdmin()]
        
    def get_queryset(self):
        if self.request.user.is_authenticated and normalize_role(getattr(self.request.user, 'role', '')) == 'OWNER':
            return GlobalSetting.objects.all()
        return GlobalSetting.objects.filter(is_public=True)


class ZoneViewSet(viewsets.ModelViewSet):
    serializer_class = ZoneSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSchoolAdminOrAbove()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(getattr(user, 'role', None))
        if role == 'OWNER':
            return Zone.objects.all()
        if user.tenant:
            return Zone.objects.filter(tenant=user.tenant)
        return Zone.objects.none()

    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        if normalize_role(getattr(self.request.user, 'role', None)) == 'OWNER' and not tenant:
            tenant_id = self.request.data.get('tenant')
            if tenant_id:
                tenant = Tenant.objects.get(id=tenant_id)
        serializer.save(tenant=tenant)

