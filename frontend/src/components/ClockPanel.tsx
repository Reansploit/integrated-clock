import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useSignageStore } from '../store/signageStore';

function isPrayerSoon(prayerTimes: Record<string, string | undefined>, now: dayjs.Dayjs): boolean {
  return Object.values(prayerTimes).some((value) => {
    if (!value) return false;
    const [hour, minute] = value.split(':').map(Number);
    const prayer = now.hour(hour).minute(minute).second(0);
    const diff = prayer.diff(now, 'minute');
    return diff >= 0 && diff <= 15;
  });
}

export function ClockPanel(): JSX.Element {
  const [now, setNow] = useState(dayjs());
  const prayerTimes = useSignageStore((s) => s.state?.prayer_times ?? {});
  const event = useSignageStore((s) => s.state?.active_event);
  const mufrodat = useSignageStore((s) => s.currentMufrodat());

  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const prayerSoon = useMemo(() => isPrayerSoon(prayerTimes, now), [now, prayerTimes]);

  return (
    <main className={`clock-panel ${prayerSoon ? 'prayer-warning' : ''}`}>
      <div className="analog-ring" />
      <h1 className="digital-time">{now.format('HH:mm:ss')}</h1>
      <div className="active-event">{event ? `${event.title} (${event.start_time} - ${event.end_time})` : 'Tidak ada agenda saat ini'}</div>
      <section className="mufrodat-card">
        <div className="arabic">{mufrodat?.arabic_word ?? '...'}</div>
        <div className="translation">{mufrodat?.translation ?? 'Mufrodat belum tersedia'}</div>
      </section>
    </main>
  );
}
