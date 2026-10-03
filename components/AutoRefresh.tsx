'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The display reloads itself every thirty minutes as a backstop. Day-to-day
 * updates arrive faster: every console save bumps the board revision and the
 * RevisionWatcher reloads within seconds. Only the board: a reload on /admin
 * would throw away a form the operator is halfway through filling in.
 */
export function AutoRefresh() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;

    const timer = window.setInterval(() => {
      window.location.reload();
    }, 1_800_000);

    return () => window.clearInterval(timer);
  }, [pathname]);

  return null;
}
