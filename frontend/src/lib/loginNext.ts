/** Prevent open redirects: only same-app relative paths. */
export function safeInternalNext(raw: string | null): string | null {
  if (!raw) return null;
  const path = raw.split('#')[0];
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (path.includes(':')) return null;
  return path;
}
