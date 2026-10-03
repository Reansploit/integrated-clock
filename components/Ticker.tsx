'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Running text.
 *
 * A marquee only loops cleanly when the distance it travels equals one full
 * copy of its content. The previous version rendered the ticker items, then the
 * running text, then the ticker items again. With three items that produced two
 * halves of different lengths, so translating by 50% landed mid-sequence and
 * the text visibly jumped once per cycle.
 *
 * The track holds two identical groups here and moves exactly one group width,
 * so the seam is invisible. Each group is also repeated until it is at least as
 * wide as the board, otherwise the space after the text scrolls past would show
 * empty background instead of more text.
 *
 * The count comes from measuring the viewport, so the viewport width has to stay
 * independent of the track. `.page-shell` pins its column with `minmax(0, 1fr)`
 * for that reason; without it each measurement asks for more copies, the track
 * grows, and the board walks off the right edge.
 */

/** Crawl speed in pixels per second, so the motion feels the same on any display. */
const SPEED_PX_PER_SEC = 42;

/**
 * Copies rendered before measurement. One message on a wide board needs three
 * or four to cover the width, and starting short would show an empty frame
 * before the browser reports its sizes.
 */
const INITIAL_COPIES = 3;

type TickerProps = {
  items: string[];
  fallback?: string;
};

export function Ticker({ items, fallback }: TickerProps) {
  const lines = items.map((line) => line.trim()).filter(Boolean);
  const messages = lines.length ? lines : [fallback ?? ''].filter(Boolean);

  const viewportRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(INITIAL_COPIES);
  const [duration, setDuration] = useState(30);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) {
      return;
    }

    const viewportWidth = viewport.getBoundingClientRect().width;
    if (viewportWidth <= 0) {
      return;
    }

    // One copy is already rendered, so measuring the live group gives a real
    // stride: message widths plus the trailing gap that keeps the seam honest.
    const measuredGroup = group.getBoundingClientRect().width;
    if (measuredGroup <= 0) {
      return;
    }

    const copiesPerMessage = Math.max(1, group.querySelectorAll('.ticker-item').length);
    const stride = measuredGroup / copiesPerMessage;
    const needed = Math.max(1, Math.ceil(viewportWidth / stride));

    setCopies(needed);
    setDuration(Math.max(16, (needed * stride) / SPEED_PX_PER_SEC));
  }, []);

  useEffect(() => {
    measure();

    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [measure, messages.length]);

  const renderMessages = (keyPrefix: string) =>
    messages.map((message, messageIndex) => (
      <span className="ticker-item" key={`${keyPrefix}-${messageIndex}`}>
        {message}
      </span>
    ));

  return (
    <div className="ticker" ref={viewportRef}>
      <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
        <div className="ticker__group" ref={groupRef} aria-hidden="true">
          {Array.from({ length: copies }, (_, copyIndex) => renderMessages(`a-${copyIndex}`))}
        </div>
        <div className="ticker__group" aria-hidden="true">
          {Array.from({ length: copies }, (_, copyIndex) => renderMessages(`b-${copyIndex}`))}
        </div>
      </div>
    </div>
  );
}