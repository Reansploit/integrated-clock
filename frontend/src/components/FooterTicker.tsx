import { useSignageStore } from '../store/signageStore';

export function FooterTicker(): JSX.Element {
  const prayer = useSignageStore((s) => s.state?.prayer_times);
  return (
    <footer className="running-text">
      <span>
        Jadwal Sholat Hari Ini — Imsak {prayer?.imsak ?? '--:--'} • Subuh {prayer?.subuh ?? '--:--'} • Dzuhur {prayer?.dzuhur ?? '--:--'} • Ashar {prayer?.ashar ?? '--:--'} • Maghrib {prayer?.maghrib ?? '--:--'} • Isya {prayer?.isya ?? '--:--'}
      </span>
    </footer>
  );
}
