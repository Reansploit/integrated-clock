'use client';

import { useEffect, useState } from 'react';

function getTimeParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 12;
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  const seconds = Number(parts.find((part) => part.type === 'second')?.value ?? '0');

  return {
    hourDeg: hours * 30 + minutes * 0.5,
    minuteDeg: minutes * 6 + seconds * 0.1,
    secondDeg: seconds * 6,
  };
}

export function AnalogClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { hourDeg, minuteDeg, secondDeg } = getTimeParts(now ?? new Date(0));
  const ticks = Array.from({ length: 60 }, (_, tick) => tick);

  return (
    <div className="analog-clock" aria-label="Analog clock">
      <div className="analog-clock__face">
        {ticks.map((tick) => (
          <div
            key={tick}
            aria-hidden="true"
            className={`analog-clock__tick${tick % 5 === 0 ? ' analog-clock__tick--major' : ''}`}
            style={{ transform: `rotate(${tick * 6}deg)` }}
          />
        ))}

        <div className="analog-clock__hand analog-clock__hand--hour" style={{ transform: `rotate(${hourDeg}deg)` }} />
        <div className="analog-clock__hand analog-clock__hand--minute" style={{ transform: `rotate(${minuteDeg}deg)` }} />
        <div className="analog-clock__hand analog-clock__hand--second" style={{ transform: `rotate(${secondDeg}deg)` }} />
        <div className="analog-clock__cap" />
      </div>
    </div>
  );
}
