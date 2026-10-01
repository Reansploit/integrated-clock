'use client';

import { useEffect, useState } from 'react';
import { WeatherBadge } from '@/components/WeatherBadge';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
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
    const timer = window.setInterval(() => {
      update();
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const timeParts = now ? formatTime(now) : { main: '--:--', seconds: '--' };
  const dateText = now ? formatDate(now) : 'Loading date...';

  return (
    <div className="live-clock" suppressHydrationWarning>
      <div className="live-clock__time">
        <span className="live-clock__time-main">{timeParts.main}</span>
        <span className="live-clock__time-seconds">{timeParts.seconds}</span>
      </div>
      <div className="live-clock__date">
        <span className="live-clock__date-text">{dateText}</span>
        {temp !== undefined && temp !== null && (
          <WeatherBadge temp={temp} />
        )}
      </div>
    </div>
  );
}
