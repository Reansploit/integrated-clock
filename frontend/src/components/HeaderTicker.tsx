import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useSignageStore } from '../store/signageStore';

export function HeaderTicker(): JSX.Element {
  const prayerTimes = useSignageStore((s) => s.state?.prayer_times);

  const typedLines = useMemo(
    () => [
      'SMK Future Islamic School',
      dayjs().format('dddd, DD MMMM YYYY'),
      'Hijri: 12 Syawal 1447 H',
    ],
    [],
  );

  const prayerText = `Imsak ${prayerTimes?.imsak ?? '--:--'} | Subuh ${prayerTimes?.subuh ?? '--:--'} | Dzuhur ${prayerTimes?.dzuhur ?? '--:--'} | Ashar ${prayerTimes?.ashar ?? '--:--'} | Maghrib ${prayerTimes?.maghrib ?? '--:--'} | Isya ${prayerTimes?.isya ?? '--:--'}`;

  return (
    <header>
      <div className="typing-loop">{typedLines.join(' • ')}</div>
      <div className="running-text"><span>{prayerText}</span></div>
    </header>
  );
}
