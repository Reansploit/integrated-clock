'use client';

import { useEffect, useState } from 'react';
import { WeatherBadge } from '@/components/WeatherBadge';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

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
};

export function LiveClock({ temp }: LiveClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const timeParts = now ? formatTime(now) : { main: '--:--', seconds: '--' };
  const dateText = now ? formatDate(now) : 'Syncing time...';
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
        <span className="live-clock__date-text">{dateText}</span>
        {temp !== undefined && temp !== null && <WeatherBadge temp={temp} />}
      </div>
    </div>
  );
}