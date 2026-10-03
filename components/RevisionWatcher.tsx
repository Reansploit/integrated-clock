'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const POLL_MS = 10_000;

/**
 * Reloads the wall board shortly after any console save, without anyone
 * touching the board tab. Each successful write bumps a revision counter in
 * the database; this polls that counter and reloads when it moves. A reload
 * waits out an actively playing video or a live announcement instead of
 * cutting it off mid-stream. Only the board: the consoles must never reload
 * under the operator's hands.
 */
export function RevisionWatcher({ initialRevision }: { initialRevision: number }) {
  const pathname = usePathname();
  const knownRef = useRef(initialRevision);

  useEffect(() => {
    knownRef.current = initialRevision;
  }, [initialRevision]);

  useEffect(() => {
    if (pathname !== '/') return;

    const busy = () =>
      document.documentElement.classList.contains('video-overlay-active') ||
      document.querySelector('.live-announcement-overlay') !== null;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch('/api/revision', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as { revision?: number };
        const revision = Number(payload.revision);
        if (!Number.isFinite(revision)) return;
        if (revision !== knownRef.current && !busy()) {
          knownRef.current = revision;
          window.location.reload();
        }
      } catch {
        // A failed poll reads the same counter again in ten seconds.
      }
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [pathname]);

  return null;
}
