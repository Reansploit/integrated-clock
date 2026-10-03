'use client';

import { useEffect, useState } from 'react';
import { AdhanCountdown } from '@/components/AdhanCountdown';
import { WeatherBadge } from '@/components/WeatherBadge';
import type { PrayerTimes } from '@/lib/prayer';

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicIndic(value: string) {
  return value.replace(/[0-9]/g, (digit) => ARABIC_INDIC_DIGITS[Number(digit)]);
}

function getJakartaMinute(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
}

function formatTime(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === 'hour')?.value ?? '--';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '--';
  const second = parts.find((part) => part.type === 'second')?.value ?? '--';

  return {
    main: `${hour}:${minute}`,
    seconds: second,
  };
}

type LiveClockProps = {
  temp?: number | null;
  prayerTimes: PrayerTimes | null;
};

export function LiveClock({ temp, prayerTimes }: LiveClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const timeParts = now ? formatTime(now) : { main: '--:--', seconds: '--' };
  // The Gregorian date already lives in the top strip next to the Hijri one,
  // so the clock keeps only the temperature badge beside the time.
  // Odd Jakarta minutes read Arabic-Indic, even minutes Latin: the clock
  // changes script every minute and back again.
  const useArabic = now ? getJakartaMinute(now) % 2 === 1 : false;
  const [hours, minutes] = timeParts.main.split(':');

  const renderLayer = (script: 'latin' | 'arabic', hidden: boolean) => {
    const convert = script === 'arabic' ? toArabicIndic : (value: string) => value;
    return (
      <div
        className={`live-clock__time-layer live-clock__time-layer--${script}`}
        aria-hidden={hidden}
      >
        <span className="live-clock__time-main">{convert(hours ?? '--')}</span>
        <span className="live-clock__colon" aria-hidden="true">
          :
        </span>
        <span className="live-clock__time-main">{convert(minutes ?? '--')}</span>
        <span className="live-clock__time-seconds">{convert(timeParts.seconds)}</span>
      </div>
    );
  };

  return (
    <div className="live-clock" suppressHydrationWarning>
      <div
        className={`live-clock__time${useArabic ? ' live-clock__time--arabic' : ''}`}
        aria-label={`Time ${timeParts.main}`}
      >
        {renderLayer('latin', useArabic)}
        {renderLayer('arabic', !useArabic)}
      </div>
      <div className="live-clock__date">
        <AdhanCountdown prayerTimes={prayerTimes} />
        {temp !== undefined && temp !== null ? <WeatherBadge temp={temp} /> : null}
      </div>
    </div>
  );
}