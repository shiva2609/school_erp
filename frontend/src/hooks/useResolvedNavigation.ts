'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toMobilePath } from '@/lib/mobilePath';

function useResolvedNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  const resolve = useCallback(
    (target: string) => {
      if (/^https?:\/\//i.test(target)) {
        return { kind: 'external' as const, target };
      }
      if (
        pathname.startsWith('/m') &&
        target.startsWith('/') &&
        !target.startsWith('/m') &&
        !target.startsWith('/login')
      ) {
        return { kind: 'internal' as const, target: toMobilePath(target) };
      }
      return { kind: 'internal' as const, target };
    },
    [pathname]
  );

  const push = useCallback(
    (target: string, opts?: { scroll?: boolean }) => {
      const r = resolve(target);
      if (r.kind === 'external') {
        window.location.href = r.target;
        return;
      }
      router.push(r.target, opts);
    },
    [resolve, router]
  );

  const replace = useCallback(
    (target: string, opts?: { scroll?: boolean }) => {
      const r = resolve(target);
      if (r.kind === 'external') {
        window.location.href = r.target;
        return;
      }
      router.replace(r.target, opts);
    },
    [resolve, router]
  );

  return { push, replace };
}

/** When the user is inside `/m/*`, internal navigations stay under the mobile shell. */
export function useResolvedPush() {
  const { push } = useResolvedNavigation();
  return push;
}

export function useResolvedReplace() {
  const { replace } = useResolvedNavigation();
  return replace;
}
