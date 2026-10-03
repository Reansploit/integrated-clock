'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Running text as a three-beat choreography instead of an endless marquee.
 *
 * Each message takes one beat in turn. The first slides in from the right and
 * stops in the middle, then falls out the bottom as the second drops in from
 * the top; the second flips back out up top for the third, which flips in
 * from below, holds, then walks out toward the end; the stage empties before
 * the loop restarts. Still beats are five seconds long, measured from a still
 * stage, so the text reads instead of strobing past.
 */
type Phase =
  | 'enterH'
  | 'hold'
  | 'flipOut'
  | 'flipIn'
  | 'exitH'
  | 'empty'
  | 'dropIn'
  | 'dropOut';

const PHASE_MS: Record<Phase, number> = {
  enterH: 1100,
  hold: 5000,
  flipOut: 550,
  flipIn: 550,
  exitH: 2800,
  empty: 5000,
  dropIn: 650,
  dropOut: 650,
};

const SEQUENCE: Phase[] = [
  'enterH',
  'hold',
  'dropOut',
  'dropIn',
  'hold',
  'flipOut',
  'flipIn',
  'hold',
  'exitH',
  'empty',
];

// The next line is already in place when its entrance starts.
const ADVANCE_ON: Phase[] = ['enterH', 'flipIn', 'dropIn'];

type TickerProps = {
  items: string[];
  fallback?: string;
};

export function Ticker({ items, fallback }: TickerProps) {
  const messages = useMemo(() => {
    const lines = items.map((line) => line.trim()).filter(Boolean);
    if (lines.length) return lines;
    const fallbackLine = (fallback ?? '').trim();
    return fallbackLine ? [fallbackLine] : [];
  }, [items, fallback]);

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    [],
  );

  const [step, setStep] = useState(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!messages.length) return undefined;
    if (reducedMotion) {
      const timer = window.setInterval(() => {
        setIndex((current) => (current + 1) % messages.length);
      }, 8000);
      return () => window.clearInterval(timer);
    }
    const phase = SEQUENCE[step % SEQUENCE.length];
    const timer = window.setTimeout(() => {
      const next = (step + 1) % SEQUENCE.length;
      if (ADVANCE_ON.includes(SEQUENCE[next])) {
        setIndex((current) => (current + 1) % messages.length);
      }
      setStep(next);
    }, PHASE_MS[phase]);
    return () => window.clearTimeout(timer);
  }, [step, messages, reducedMotion]);

  if (!messages.length) return null;

  const phase: Phase = reducedMotion ? 'hold' : SEQUENCE[step % SEQUENCE.length];
  const message = messages[index % messages.length];

  return (
    <div className="ticker">
      <div className="ticker-stage" data-phase={phase}>
        {phase === 'empty' ? null : (
          <span key={`${index}-${phase}`} aria-hidden="true" className={`ticker-item ticker-item--${phase}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
