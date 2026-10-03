import { ClockStage } from '@/components/ClockStage';
import { EventSlotMachine } from '@/components/EventSlotMachine';
import { MufrodatFlip } from '@/components/MufrodatFlip';
import { PrayerTimesPanel } from '@/components/PrayerTimesPanel';
import { Ticker } from '@/components/Ticker';
import { MufrodatVideoOverlay } from '@/components/MufrodatVideoOverlay';
import { LiveAnnouncementOverlay } from '@/components/LiveAnnouncementOverlay';
import { VocabTakeoverOverlay } from '@/components/VocabTakeoverOverlay';
import { getDashboardData } from '@/lib/dashboard';
import { getNextPrayer, getPrayerTimes } from '@/lib/prayer';
import { getWeather } from '@/lib/weather';
import { listAssetUrls, resolveAssetUrl } from '@/lib/media';

export const revalidate = 60;

const gregorianFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

const hijriFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

export default async function Home() {
  const data = await getDashboardData();
  const prayerTimes = await getPrayerTimes(data.settings.cityId);
  const weather = await getWeather();
  const nextPrayer = getNextPrayer(prayerTimes, new Date(), { includeImsak: false });
  // Event days are stored as Indonesian values ('senin'..'minggu'), so the
  // match stays in id-ID even though the board reads English.
  const todayDay = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(new Date()).toLowerCase();
  const todayEvents = data.events
    .filter((event) => event.day.toLowerCase() === todayDay)
    .map((event) => ({
      ...event,
      soundUrl: resolveAssetUrl(event.soundUrl || '', ['audio/events']),
    }));

  const now = new Date();
  const gregorianDate = gregorianFormatter.format(now);
  // ICU's English Islamic output orders month first ("Rabiʻ II 22, 1448 AH",
  // US order). Readers here expect day first, so the parts are reassembled
  // from formatToParts instead of trusting .format() order. Month names use
  // the familiar Indonesian spellings rather than the CLDR English ones.
  const hijriDate = (() => {
    const monthNames: Record<string, string> = {
      Muharram: 'Muharram',
      Safar: 'Safar',
      'Rabiʻ I': 'Rabiul Awal',
      'Rabiʻ II': 'Rabiul Akhir',
      'Jumada I': 'Jumadil Awal',
      'Jumada II': 'Jumadil Akhir',
      Rajab: 'Rajab',
      'Shaʻban': 'Syakban',
      Ramadan: 'Ramadan',
      Shawwal: 'Syawal',
      'Dhuʻl-Qiʻdah': 'Zulkaidah',
      'Dhuʻl-Hijjah': 'Zulhijah',
    };
    const parts = new Map(hijriFormatter.formatToParts(now).map((part) => [part.type, part.value]));
    const day = parts.get('day') ?? '';
    const month = monthNames[parts.get('month') ?? ''] ?? parts.get('month') ?? '';
    const year = parts.get('year') ?? '';
    const era = parts.get('era') ?? '';
    return `${day} ${month} ${year} ${era}`.replace(/\s+/g, ' ').trim();
  })();

  const backgroundCandidates = listAssetUrls(['backgrounds'], ['.jpg', '.jpeg', '.png', '.gif', '.webp']);
  const resolvedBackgroundImageUrl = resolveAssetUrl(data.settings.backgroundImageUrl, ['backgrounds']);
  const backgroundImageUrl = resolvedBackgroundImageUrl || backgroundCandidates[0] || '';

  // The board sits on a photo the operator uploads. During the peek the photo
  // dominates: only a light scrim stays on so the wall clock keeps a ghost of
  // backing. The owner explicitly accepted the contrast cost for a sunlit room.
  const wallpaperStyle = backgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(5, 10, 18, 0.3), rgba(5, 10, 18, 0.4)), url(${backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : undefined;

  return (
    <main className="page-shell">
      {wallpaperStyle ? <div className="wallpaper-peek" style={wallpaperStyle} aria-hidden="true" /> : null}
      <MufrodatVideoOverlay src="" playbackNonce="" />
      <LiveAnnouncementOverlay />
      <VocabTakeoverOverlay slots={data.vocabSlots} items={data.vocabItems} />

      <header className="top-strip">
        <span className="top-strip__brand">Wonosalam Boarding School</span>
        <div className="top-strip__dates">
          <span className="date-lockup__gregorian">{gregorianDate}</span>
          <span className="date-lockup__hijri">{hijriDate}</span>
        </div>
      </header>

      <div className="board">
        <div className="board__main">
          <ClockStage temp={weather?.temp ?? null} prayerTimes={prayerTimes} />

          <div className="board__secondary">
            <section className="mini-panel">
              <h2 className="mini-panel__title">Current Event</h2>
              <EventSlotMachine
                events={todayEvents}
                soundUrl={resolveAssetUrl(data.settings.eventSoundUrl, ['audio/events'])}
              />
            </section>

            <section className="mini-panel">
              <h2 className="mini-panel__title">Vocabulary</h2>
              <MufrodatFlip items={data.mufrodat} />
            </section>
          </div>
        </div>

        <aside className="rail">
          <h2 className="rail__title">Prayer Times</h2>
          <PrayerTimesPanel prayerTimes={prayerTimes} initialNextPrayer={nextPrayer} />
        </aside>
      </div>

      <footer className="ticker-footer">
        <Ticker items={data.ticker} />
      </footer>
    </main>
  );
}