import { getPostLoginPath } from '@/lib/rolePortal';

/** Web app paths → same routes under the mobile shell (`/m`). Preserves `?query`. */
export function toMobilePath(webPath: string): string {
  if (!webPath || !webPath.startsWith('/')) return '/m';
  if (webPath.startsWith('/m')) return webPath;
  if (webPath === '/login' || webPath.startsWith('/login?')) return webPath;
  const [path, query] = webPath.split('?');
  const base = `/m${path}`;
  return query ? `${base}?${query}` : base;
}

export function stripMobilePrefix(pathname: string): string {
  if (!pathname.startsWith('/m')) return pathname;
  const rest = pathname.replace(/^\/m(\/|$)/, '/');
  return rest === '' ? '/' : rest;
}

export function getMobilePostLoginPath(role: string, tenantId?: string | null): string {
  return toMobilePath(getPostLoginPath(role, tenantId));
}
