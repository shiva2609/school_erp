import logging
from django.conf import settings
from django.core import signing
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)

from .serializers import CustomTokenObtainPairSerializer
from django.middleware.csrf import get_token
from .jwt_cookies import set_auth_cookies
from .mfa_views import MFA_SIGN_SALT


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    from .throttles import LoginRateThrottle
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]
    def post(self, request, *args, **kwargs):
        _login_id = request.data.get('email') or ''
        logger.info("Login attempt for identifier len=%s", len(str(_login_id)))
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            logger.info("Login successful (identifier len=%s)", len(str(_login_id)))
        except Exception as e:
            logger.warning("Login failed (identifier len=%s): %s", len(str(_login_id)), type(e).__name__)
            raise e

        user = serializer.user
        if user.mfa_enabled and user.mfa_totp_secret:
            max_age = getattr(settings, 'MFA_CHALLENGE_MAX_AGE', 600)
            challenge = signing.dumps({'u': str(user.pk)}, salt=MFA_SIGN_SALT)
            get_token(request)
            return Response(
                {
                    'success': True,
                    'mfa_required': True,
                    'mfa_challenge': challenge,
                    'must_change_password': getattr(user, 'must_change_password', False),
                    'csrf_token': get_token(request),
                },
                status=status.HTTP_200_OK,
            )

        response = Response(
            {
                'success': True,
                'message': 'Login successful',
                'must_change_password': getattr(user, 'must_change_password', False),
                'csrf_token': get_token(request),
            },
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(
            response,
            request,
            serializer.validated_data['access'],
            serializer.validated_data['refresh'],
        )
        return response

class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]
    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get('refresh_token')
        if not refresh_token:
            return Response({"success": False, "error": {"code": "NO_REFRESH_TOKEN"}}, status=status.HTTP_401_UNAUTHORIZED)
        
        request.data['refresh'] = refresh_token
        try:
            response_data = super().post(request, *args, **kwargs)
        except Exception as e:
            return Response({"success": False, "error": {"code": "TOKEN_EXPIRED"}}, status=status.HTTP_401_UNAUTHORIZED)

        is_secure = not settings.DEBUG
        # Force setting the CSRF token cookie on refresh
        get_token(request)
        response = Response({"success": True, "csrf_token": get_token(request)}, status=status.HTTP_200_OK)
        response.set_cookie(
            'access_token',
            response_data.data['access'],
            max_age=3600,
            httponly=True,
            secure=is_secure,
            samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax')
        )
        return response

class LogoutView(APIView):
    def post(self, request):
        # Blacklist the refresh token to prevent reuse
        refresh_token = request.COOKIES.get('refresh_token')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass  # Token may already be blacklisted or invalid
        response = Response({"success": True, "message": "Logout successful"}, status=status.HTTP_200_OK)
        response.delete_cookie('access_token')
        response.delete_cookie('refresh_token')
        return response

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        data = serializer.data
        data['must_change_password'] = request.user.must_change_password
        return Response({"success": True, "data": data, "csrf_token": get_token(request)})

class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, *args, **kwargs):
        from .serializers import ChangePasswordSerializer
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            if not request.user.check_password(serializer.data.get("old_password")):
                return Response({"error": "Wrong password."}, status=status.HTTP_400_BAD_REQUEST)
            request.user.set_password(serializer.data.get("new_password"))
            # Clear the forced password change flag after successful update
            request.user.must_change_password = False
            request.user.save()
            return Response({"success": True, "message": "Password updated successfully"}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from .models import User
from .serializers import UserSerializer
from .permissions import IsBranchAdminOrAbove, ROLE_HIERARCHY, normalize_role, role_in
from .utils import log_audit_action

# Only these roles can manage (create/update/delete) other users
ROLES_THAT_CAN_MANAGE_USERS = ['OWNER', 'SUPER_ADMIN', 'BRANCH_ADMIN']

class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsBranchAdminOrAbove]

    def _get_rank(self, role):
        return ROLE_HIERARCHY.get(normalize_role(role), 0)

    def check_permissions(self, request):
        super().check_permissions(request)
        # For mutation operations, only admins can manage users
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            if not role_in(request.user, ROLES_THAT_CAN_MANAGE_USERS):
                raise PermissionDenied("Only admins can manage users.")

    def get_queryset(self):
        user = self.request.user
        role = normalize_role(user.role)
        if role == 'OWNER':
            qs = User.objects.all()
        else:
            # Non-platform users only see users in their tenant
            qs = User.objects.filter(tenant=user.tenant)
        
        # Filtering by tenant (Owner only)
        tenant_id = self.request.query_params.get('tenant_id')
        if tenant_id and role == 'OWNER':
            qs = qs.filter(tenant_id=tenant_id)

        # Filtering by branch
        branch_id = self.request.query_params.get('branch_id')
        if branch_id:
            # For non-super admins, we already have tenant isolation in the base queryset
            # Super admins can filter by any branch
            qs = qs.filter(branch_id=branch_id)
        
        # Branch isolation enforcement for lower roles
        if role not in ['OWNER', 'SUPER_ADMIN'] and user.branch:
            qs = qs.filter(branch=user.branch)

        # Filtering by role
        role_filter = self.request.query_params.get('role')
        if role_filter:
            qs = qs.filter(role=role_filter)
            
        return qs.order_by('first_name', 'last_name')

    def perform_create(self, serializer):
        creator_role = normalize_role(self.request.user.role)
        target_role = serializer.validated_data.get('role')

        creator_rank = self._get_rank(creator_role)
        target_rank = self._get_rank(target_role)

        # Cannot create user with equal or higher privilege (higher rank = more privilege)
        if target_rank >= creator_rank and creator_role != 'OWNER':
            raise PermissionDenied("You do not have permission to create a user with this role.")

        tenant = None
        if creator_role != 'OWNER':
            tenant = self.request.user.tenant
        else:
            # If owner, they must specify a tenant for non-platform roles
            tenant = serializer.validated_data.get('tenant')
            if not tenant and normalize_role(target_role) != 'OWNER':
               tenant_id = self.request.data.get('tenant_id') or self.request.data.get('tenant')
               if tenant_id:
                   from tenants.models import Tenant
                   try:
                       tenant = Tenant.objects.get(id=tenant_id)
                   except (Tenant.DoesNotExist, ValueError):
                       pass
            
            if not tenant and normalize_role(target_role) != 'OWNER':
                if normalize_role(target_role) == 'SUPER_ADMIN':
                    from tenants.models import Tenant
                    first_name = serializer.validated_data.get('first_name', '')
                    last_name = serializer.validated_data.get('last_name', '')
                    tenant_name = f"{first_name} {last_name}'s School".strip()
                    tenant = Tenant.objects.create(name=tenant_name)
                else:
                    raise PermissionDenied('Tenant is required when creating non-platform users.')

        branch = serializer.validated_data.get('branch')
        
        # If the creator is a BRANCH_ADMIN, they can ONLY create users for their own branch.
        if creator_role == 'BRANCH_ADMIN':
            branch = self.request.user.branch
            
        serializer.save(tenant=tenant, branch=branch)

    def perform_update(self, serializer):
        creator_role = normalize_role(self.request.user.role)
        target_role = serializer.validated_data.get('role', serializer.instance.role)

        creator_rank = self._get_rank(creator_role)
        target_rank = self._get_rank(target_role)
        instance_rank = self._get_rank(serializer.instance.role)

        if (target_rank >= creator_rank or instance_rank >= creator_rank) and creator_role != 'OWNER':
            raise PermissionDenied("You cannot modify users of this role level.")

        password_in = bool((self.request.data.get('password') or '').strip())
        serializer.save()

        if password_in:
            u = serializer.instance
            log_audit_action(
                self.request.user,
                'ADMIN_PASSWORD_RESET',
                'User',
                u.id,
                {
                    'target_user_id': str(u.id),
                    'target_email': u.email,
                    'must_change_password': u.must_change_password,
                },
                tenant=u.tenant,
            )

    def perform_destroy(self, instance):
        creator_role = normalize_role(self.request.user.role)
        creator_rank = self._get_rank(creator_role)
        instance_rank = self._get_rank(instance.role)

        if instance.id == self.request.user.id:
            raise PermissionDenied("You cannot delete your own account.")

        if instance_rank >= creator_rank and creator_role != 'OWNER':
            raise PermissionDenied("You cannot delete a user with equal or higher privileges.")

        # PROTECT: Deactivate tenant-level super admin instead of deleting to preserve tenant data.
        if normalize_role(instance.role) == 'SUPER_ADMIN':
            instance.is_active = False
            instance.save()
            return
            
        instance.delete()

from .models import AuditLog
from .serializers import AuditLogSerializer
from .permissions import IsSuperAdmin


def _audit_impersonation(*, actor, target, reason: str):
    tenant = getattr(target, 'tenant', None) or getattr(actor, 'tenant', None)
    if not tenant:
        return
    AuditLog.objects.create(
        tenant=tenant,
        user=actor,
        action='IMPERSONATE',
        model_name='User',
        record_id=target.id,
        details={
            'target_user_id': str(target.id),
            'target_email': target.email,
            'reason': reason[:2000],
        },
    )


class AuditLogPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 500


class SuperAdminAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Owner: all tenants. School / tenant super admins: their tenant only.
    """
    queryset = AuditLog.objects.select_related('tenant', 'user').all().order_by('-created_at')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    pagination_class = AuditLogPagination

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        role = normalize_role(user.role)
        if role == 'OWNER':
            return qs
        if getattr(user, 'tenant_id', None):
            return qs.filter(tenant_id=user.tenant_id)
        return qs.none()

class ImpersonateView(APIView):
    """
    Allows SUPER_ADMIN to generate authentication tokens for ANY user, effectively logging in as them.
    """
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        target_user_id = request.data.get('user_id')
        reason = (request.data.get('reason') or '').strip()
        if not target_user_id:
            return Response({"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if len(reason) < 10:
            return Response(
                {"error": "reason is required (at least 10 characters) for security audit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor = request.user
        if actor.mfa_enabled and actor.mfa_totp_secret:
            import pyotp

            code = (request.data.get('actor_otp') or '').replace(' ', '')
            if not code or not pyotp.TOTP(actor.mfa_totp_secret).verify(code, valid_window=1):
                return Response(
                    {
                        'error': 'Your authenticator code is required or invalid.',
                        'code': 'ACTOR_MFA_REQUIRED',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            target_user = User.objects.get(id=target_user_id)
        except User.DoesNotExist:
            return Response({"error": "Target user not found"}, status=status.HTTP_404_NOT_FOUND)

        actor_role = normalize_role(actor.role)
        if actor_role != 'OWNER':
            if not getattr(actor, 'tenant_id', None) or target_user.tenant_id != actor.tenant_id:
                return Response(
                    {"error": "You can only impersonate users in your own organization."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        _audit_impersonation(actor=request.user, target=target_user, reason=reason)
        logger.info(
            "SUPER_ADMIN impersonation started: actor=%s target=%s",
            request.user.id,
            target_user.id,
        )
        
        refresh = RefreshToken.for_user(target_user)
        access = refresh.access_token

        is_secure = not settings.DEBUG
        response = Response({
            "success": True, 
            "message": f"Successfully impersonating {target_user.email}",
            "user": {
                "id": str(target_user.id),
                "email": target_user.email,
                "role": target_user.role,
                "first_name": target_user.first_name,
                "last_name": target_user.last_name
            }
        }, status=status.HTTP_200_OK)
        
        response.set_cookie(
            'access_token',
            str(access),
            max_age=3600,
            httponly=True,
            secure=is_secure,
            samesite='Lax'
        )
        response.set_cookie(
            'refresh_token',
            str(refresh),
            max_age=86400 * 7,
            httponly=True,
            secure=is_secure,
            samesite='Lax'
        )
        return response
