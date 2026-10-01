'use client';

import { useEffect, useMemo, useState } from 'react';

import { getImsakTime, getNextPrayer } from '@/lib/prayer';
import type { NextPrayer, PrayerKey, PrayerTimes } from '@/lib/prayer';

type PrayerTimesPanelProps = {
  prayerTimes: PrayerTimes | null;
  initialNextPrayer: NextPrayer | null;
};

function parseClockToMinutes(value: string | null | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function getJakartaNowSeconds(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  const second = Number(parts.find((part) => part.type === 'second')?.value ?? '0');
  return hour * 3600 + minute * 60 + second;
}

function getAdhanRuntimeState(prayerTimes: PrayerTimes | null, now: Date | null) {
  if (!prayerTimes || !now) {
    return {
      blinkingKey: null as PrayerKey | null,
      overlayKey: null as PrayerKey | null,
    };
  }

  const currentSeconds = getJakartaNowSeconds(now);
  const adhanTargets: Array<{ key: PrayerKey; startSeconds: number }> = [
    { key: 'subuh' as PrayerKey, startSeconds: (parseClockToMinutes(prayerTimes.subuh) ?? -1) * 60 },
    { key: 'dzuhur' as PrayerKey, startSeconds: (parseClockToMinutes(prayerTimes.dzuhur) ?? -1) * 60 },
    { key: 'ashar' as PrayerKey, startSeconds: (parseClockToMinutes(prayerTimes.ashar) ?? -1) * 60 },
    { key: 'maghrib' as PrayerKey, startSeconds: (parseClockToMinutes(prayerTimes.maghrib) ?? -1) * 60 },
    { key: 'isya' as PrayerKey, startSeconds: (parseClockToMinutes(prayerTimes.isya) ?? -1) * 60 },
  ].filter((target) => target.startSeconds >= 0);

  const blinkingTarget = adhanTargets.find(
    (target) => currentSeconds >= target.startSeconds && currentSeconds < target.startSeconds + 5 * 60,
  );

  const overlayTarget = adhanTargets.find(
    (target) => currentSeconds >= target.startSeconds && currentSeconds < target.startSeconds + 60,
  );

  return {
    blinkingKey: blinkingTarget?.key ?? null,
    overlayKey: overlayTarget?.key ?? null,
  };
}

function adhanLabelFromKey(key: PrayerKey | null) {
  if (!key) {
    return '';
  }
  const map: Record<PrayerKey, string> = {
    imsak: 'IMSAK',
    subuh: 'FAJR',
    dzuhur: 'DHUHR',
    ashar: 'ASR',
    maghrib: 'MAGHRIB',
    isya: 'ISHA',
  };
  return map[key];
}

export function PrayerTimesPanel({ prayerTimes, initialNextPrayer }: PrayerTimesPanelProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timerId = window.setInterval(update, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const imsakTime = useMemo(() => getImsakTime(prayerTimes), [prayerTimes]);
  const nextPrayer = useMemo(() => {
    if (!now) {
      return initialNextPrayer;
    }
    return getNextPrayer(prayerTimes, now, { includeImsak: false });
  }, [initialNextPrayer, now, prayerTimes]);

  const { blinkingKey, overlayKey } = useMemo(() => getAdhanRuntimeState(prayerTimes, now), [now, prayerTimes]);

  if (!prayerTimes) {
    return <p className="fallback-note">Prayer schedule could not be loaded.</p>;
  }

  return (
    <>
      <ul className="time-list">
        {[
          { key: 'imsak', label: 'Imsak', value: imsakTime },
          { key: 'subuh', label: 'Fajr', value: prayerTimes.subuh },
          { key: 'dzuhur', label: 'Dhuhr', value: prayerTimes.dzuhur },
          { key: 'ashar', label: 'Asr', value: prayerTimes.ashar },
          { key: 'maghrib', label: 'Maghrib', value: prayerTimes.maghrib },
          { key: 'isya', label: 'Isha', value: prayerTimes.isya },
        ]
          .filter((entry): entry is { key: PrayerKey; label: string; value: string } => Boolean(entry.value))
          .map((entry) => (
            <li
              key={entry.key}
              className={`time-row ${nextPrayer?.key === entry.key ? 'is-next' : ''} ${
                blinkingKey === entry.key ? 'is-adhan-active' : ''
              }`}
            >
              <span>{entry.label}</span>
              <strong>{entry.value}</strong>
            </li>
          ))}
      </ul>

      <div className="next-prayer-card">
        <span>Next Prayer</span>
        <strong>{nextPrayer ? `${nextPrayer.label} - ${nextPrayer.time}` : 'Unavailable'}</strong>
      </div>

      {overlayKey ? (
        <div className="adhan-overlay" aria-live="polite">
          <div className="adhan-overlay__kicker">ADHAN TIME</div>
          <div className="adhan-overlay__title">{adhanLabelFromKey(overlayKey)}</div>
        </div>
      ) : null}
    </>
  );
}
