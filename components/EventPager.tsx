'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Client-side paging for the event list. Turning pages never navigates, so
 * the operator keeps their scroll position and any open edit form. The
 * current page is mirrored into every hidden `page` input inside, so a save
 * still redirects back to the page the operator was looking at.
 */
export function EventPager({
  totalItems,
  pageSize,
  initialPage,
  children,
}: {
  totalItems: number;
  pageSize: number;
  initialPage: number;
  children: React.ReactNode;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const [page, setPage] = useState(() => Math.min(Math.max(1, initialPage), totalPages));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll(':scope .rows .row').forEach((row, index) => {
      const visible = index >= (page - 1) * pageSize && index < page * pageSize;
      (row as HTMLElement).hidden = !visible;
    });
    root.querySelectorAll('input[name="page"]').forEach((input) => {
      (input as HTMLInputElement).value = String(page);
    });
  }, [page, pageSize]);

  function turn(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
    document.getElementById('kegiatan')?.scrollIntoView({ block: 'start' });
  }

  return (
    <div ref={rootRef}>
      {children}
      {totalPages > 1 ? (
        <nav className="pager" aria-label="Halaman kegiatan">
          {page > 1 ? (
            <button type="button" className="btn btn--quiet" onClick={() => turn(page - 1)}>
              Sebelumnya
            </button>
          ) : (
            <span className="btn btn--quiet is-off" aria-hidden="true">
              Sebelumnya
            </span>
          )}
          <span className="pager__meta">
            Halaman {page} dari {totalPages}
          </span>
          {page < totalPages ? (
            <button type="button" className="btn btn--quiet" onClick={() => turn(page + 1)}>
              Berikutnya
            </button>
          ) : (
            <span className="btn btn--quiet is-off" aria-hidden="true">
              Berikutnya
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
