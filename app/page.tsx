import { ClockStage } from '@/components/ClockStage';
import { AdhanCountdown } from '@/components/AdhanCountdown';
import { EventSlotMachine } from '@/components/EventSlotMachine';
import { MufrodatFlip } from '@/components/MufrodatFlip';
import { PrayerTimesPanel } from '@/components/PrayerTimesPanel';
import { BootSequence } from '@/components/BootSequence';
import { MufrodatVideoOverlay } from '@/components/MufrodatVideoOverlay';
import { LiveAnnouncementOverlay } from '@/components/LiveAnnouncementOverlay';
import { VocabTakeoverOverlay } from '@/components/VocabTakeoverOverlay';
import { getDashboardData } from '@/lib/dashboard';
import { getNextPrayer, getPrayerTimes } from '@/lib/prayer';
import { getWeather } from '@/lib/weather';
import { listAssetUrls, resolveAssetUrl } from '@/lib/media';

export const revalidate = 60;

const gregorianFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

const hijriFormatter = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
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
  const tickerItems = [...data.ticker, data.settings.runningText, ...data.ticker];
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
  const hijriDate = `${hijriFormatter.format(now)} H`;
  const visibleMufrodat = data.mufrodat.length ? data.mufrodat : [];
  const backgroundCandidates = listAssetUrls(['backgrounds'], ['.jpg', '.jpeg', '.png', '.gif', '.webp']);
  const resolvedBackgroundImageUrl = resolveAssetUrl(data.settings.backgroundImageUrl, ['backgrounds']);
  const backgroundImageUrl = resolvedBackgroundImageUrl || backgroundCandidates[0] || '';
  const bootAnimationUrl = resolveAssetUrl(data.settings.bootAnimationUrl, ['boot']);
  const introImageUrl = resolveAssetUrl(data.settings.introImageUrl, ['logos', 'sponsors', 'boot']);
  const shellStyle = backgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(4, 7, 13, 0.76), rgba(4, 7, 13, 0.76)), url(${backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : undefined;

  return (
    <main className="page-shell" style={shellStyle}>
      <div className="page-noise" />
      <BootSequence bootAnimationUrl={bootAnimationUrl} introImageUrl={introImageUrl} />
      <MufrodatVideoOverlay src="" playbackNonce="" />
      <LiveAnnouncementOverlay />
      <VocabTakeoverOverlay slots={data.vocabSlots} items={data.vocabItems} />

      <header className="top-strip glass-panel">
        <div className="top-strip__left date-lockup">
          <div className="date-lockup__gregorian">{gregorianDate}</div>
          <div className="date-lockup__hijri">{hijriDate}</div>
        </div>
        <div className="top-strip__right brand-lockup">
          Wonosalam Boarding School
        </div>
      </header>

      <section className="dashboard-grid">
        <article className="glass-panel panel-surface clock-panel">
          <ClockStage temp={weather?.temp ?? null} />
          <div className="clock-mini">
            <AdhanCountdown prayerTimes={prayerTimes} soundUrl={resolveAssetUrl(data.settings.adhanSoundUrl, ['audio/adhan'])} />
          </div>
        </article>

        <article className="glass-panel panel-surface prayer-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Prayer Times</p>
              <h2>Prayer Schedule</h2>
            </div>
          </div>
          <PrayerTimesPanel prayerTimes={prayerTimes} initialNextPrayer={nextPrayer} />
        </article>

        <article className="glass-panel panel-surface events-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Events</p>
              <h2>Today's Events</h2>
            </div>
          </div>

          <EventSlotMachine
            events={todayEvents}
            soundUrl={resolveAssetUrl(data.settings.eventSoundUrl, ['audio/events'])}
          />
        </article>

        <article className="glass-panel panel-surface mufrodat-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Vocabulary</p>
              <h2>Vocabulary</h2>
            </div>
          </div>

          <MufrodatFlip items={visibleMufrodat} />
        </article>
      </section>

      <footer className="footer-stack">
        <section className="ticker-shell glass-panel">
          <div className="ticker-track">
            {tickerItems.map((item, index) => (
              <span key={`${item}-${index}`} className="ticker-item">
                {item}
              </span>
            ))}
          </div>
        </section>
      </footer>
    </main>
  );
}
