'use client';

import { useEffect } from 'react';

export function AutoRefresh() {
  useEffect(() => {
    const timer = window.setInterval(() => {
      window.location.reload();
    }, 3_600_000);

    return () => window.clearInterval(timer);
  }, []);

  return null;
}
