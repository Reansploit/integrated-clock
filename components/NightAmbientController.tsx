'use client';

import { useEffect } from 'react';

function isNightAmbientHour(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  return hour >= 21 || hour < 3;
}

export function NightAmbientController() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      root.classList.toggle('night-mode', isNightAmbientHour(new Date()));
    };

    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
