'use client';

import { useEffect, useMemo, useState } from 'react';

import type { PrayerTimes } from '@/lib/prayer';

type TargetKind = 'imsak' | 'adhan';

type Target = {
  label: string;
  kind: TargetKind;
  minutes: number;
};

type CountdownState =
  | {
      mode: 'active';
      label: string;
      value: string;
    }
  | {
      mode: 'idle';
      label: string;
      value: string;
    };

type ClockParts = {
  hour: number;
  minute: number;
  second: number;
};

function getJakartaParts(now: Date): ClockParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  return {
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? '0'),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? '0'),
    second: Number(parts.find((part) => part.type === 'second')?.value ?? '0'),
  };
}

function parseMinutes(time: string) {
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatClock(minutes: number) {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function buildTargets(prayerTimes: PrayerTimes): Target[] {
  const subuh = parseMinutes(prayerTimes.subuh);
  const dzuhur = parseMinutes(prayerTimes.dzuhur);
  const ashar = parseMinutes(prayerTimes.ashar);
  const maghrib = parseMinutes(prayerTimes.maghrib);
  const isya = parseMinutes(prayerTimes.isya);

  const targets: Target[] = [];

  if (subuh !== null) {
    targets.push({ label: 'Imsak', kind: 'imsak', minutes: Math.max(0, subuh - 15) });
    targets.push({ label: 'Fajr', kind: 'adhan', minutes: subuh });
  }

  if (dzuhur !== null) targets.push({ label: 'Dhuhr', kind: 'adhan', minutes: dzuhur });
  if (ashar !== null) targets.push({ label: 'Asr', kind: 'adhan', minutes: ashar });
  if (maghrib !== null) targets.push({ label: 'Maghrib', kind: 'adhan', minutes: maghrib });
  if (isya !== null) targets.push({ label: 'Isha', kind: 'adhan', minutes: isya });

  return targets.sort((left, right) => left.minutes - right.minutes);
}

export function AdhanCountdown({ prayerTimes }: { prayerTimes: PrayerTimes | null }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const state = useMemo<CountdownState | null>(() => {
    if (!now || !prayerTimes) {
      return null;
    }

    const targets = buildTargets(prayerTimes);
    if (!targets.length) {
      return null;
    }

    const { hour, minute, second } = getJakartaParts(now);
    const currentSeconds = hour * 3600 + minute * 60 + second;

    const activeTarget = targets.find((target) => {
      const targetSeconds = target.minutes * 60;
      return currentSeconds >= targetSeconds - 15 * 60 && currentSeconds <= targetSeconds;
    });

    if (!activeTarget) {
      const nextTarget = targets.find((target) => target.minutes * 60 > currentSeconds) ?? targets[0];
      if (!nextTarget) {
        return null;
      }

      return {
        mode: 'idle' as const,
        label: 'Next prayer',
        value: `${nextTarget.label} at ${formatClock(nextTarget.minutes)}`,
      };
    }

    const targetSeconds = activeTarget.minutes * 60;
    const remaining = targetSeconds - currentSeconds;

    return {
      mode: 'active' as const,
      label: activeTarget.kind === 'imsak' ? 'Until imsak' : 'Until adhan',
      value: `${activeTarget.label} in ${formatDuration(remaining)}`,
    };
  }, [now, prayerTimes]);

  if (!state) {
    return (
      <div className="adhan-counter" suppressHydrationWarning>
        <div className="adhan-counter__label">Adhan</div>
        <div className="adhan-counter__value is-pending">Syncing schedule...</div>
      </div>
    );
  }

  return (
    <div
      className={`adhan-counter ${state.mode === 'active' ? 'is-active' : ''}`}
      suppressHydrationWarning
    >
      <div className="adhan-counter__label">{state.label}</div>
      <div className="adhan-counter__value">{state.value}</div>
    </div>
  );
}