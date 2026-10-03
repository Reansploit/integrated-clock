'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The display reloads itself every five minutes so schedule, prayer, and slot
 * changes reach the wall without anyone touching it. Only the board: a reload
 * on /admin would throw away a form the operator is halfway through filling in.
 */
export function AutoRefresh() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;

    const timer = window.setInterval(() => {
      window.location.reload();
    }, 300_000);

    return () => window.clearInterval(timer);
  }, [pathname]);

  return null;
}
