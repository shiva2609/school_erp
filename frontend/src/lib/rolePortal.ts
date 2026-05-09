/**
 * Role → first screen after authentication.
 *
 * Maps to backend `accounts.User.ROLE_CHOICES`:
 * - OWNER: platform operator
 * - SUPER_ADMIN: org-wide (tenant) or platform when `tenant` is null
 * - ZONAL_ADMIN: zone-scoped oversight
 * - CHIEF_ACCOUNTANT: tenant finance lead
 * - PRINCIPAL: branch academic leadership
 * - BRANCH_ADMIN: branch operations + finance
 * - ACCOUNTANT: branch finance
 * - TEACHER: class-scoped
 * - PARENT: children only (`/api/parent/*`)
 *
 * "School admin" in product language ≈ SUPER_ADMIN with a tenant (full org).
 * "Branch admin" ≈ BRANCH_ADMIN.
 */

export function getPostLoginPath(role: string, tenantId?: string | null): string {
  switch (role) {
    case 'OWNER':
      return '/management-dashboard';
    case 'SUPER_ADMIN':
      return tenantId ? '/dashboard' : '/management-dashboard';
    case 'TEACHER':
      return '/teacher-dashboard';
    case 'PARENT':
      return '/parent';
    case 'CHIEF_ACCOUNTANT':
    case 'ZONAL_ADMIN':
    case 'PRINCIPAL':
    case 'BRANCH_ADMIN':
    case 'ACCOUNTANT':
    case 'STUDENT':
    default:
      return '/dashboard';
  }
}
