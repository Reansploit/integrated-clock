import {
  createEvent,
  createMufrodat,
  deleteEvent,
  deleteMufrodat,
  deleteMufrodatVideo,
  importEvents,
  saveMufrodatVideoSettings,
  saveSettings,
  saveTicker,
  stopMufrodatVideoPlayback,
  updateEvent,
  uploadEventSound,
  uploadMufrodatVideoToPlaylist,
} from './actions';

import { AdminAnnouncementControl } from '@/components/AdminAnnouncementControl';
import { getDashboardData } from '@/lib/dashboard';
import { isDatabaseConfigured } from '@/lib/db';
import { listAssetUrls, resolveAssetUrl } from '@/lib/media';

export const dynamic = 'force-dynamic';

function parseSponsorEntries(raw: string) {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [labelPart, srcPart] = entry.split('|').map((part) => part.trim());
      return {
        label: labelPart || 'Sponsor',
        src: resolveAssetUrl(srcPart || '', ['sponsors']),
      };
    })
    .filter((entry) => entry.src);
}

const EVENTS_PER_PAGE = 8;

type AdminPageProps = {
  searchParams?: Promise<{ page?: string; notice?: string }>;
};

function resolveAdminNotice(raw: string) {
  switch (raw) {
    case 'mufrodat-upload-ok':
      return { tone: 'ok', text: 'Upload video sekali putar berhasil dan playback sudah ditrigger.' };
    case 'mufrodat-upload-no-file':
      return { tone: 'warn', text: 'Upload gagal: file belum terpilih.' };
    case 'mufrodat-upload-size-limit':
      return { tone: 'warn', text: 'Upload gagal: ukuran file harus > 0 dan maksimal 100MB.' };
    case 'mufrodat-upload-ext-invalid':
      return { tone: 'warn', text: 'Upload gagal: format file harus .mp4 atau .webm.' };
    case 'mufrodat-upload-mime-invalid':
      return { tone: 'warn', text: 'Upload gagal: MIME type video tidak didukung browser/server.' };
    case 'mufrodat-upload-db-missing':
      return { tone: 'warn', text: 'Upload gagal: database lokal tidak bisa ditulis.' };
    case 'mufrodat-upload-failed':
      return { tone: 'warn', text: 'Upload gagal karena error server. Cek log terminal untuk detail.' };
    default:
      return null;
  }
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const data = await getDashboardData({ includeAdminData: true });
  const resolvedSearchParams = (await searchParams) || {};
  const notice = resolveAdminNotice(String(resolvedSearchParams.notice || ''));
  const configured = isDatabaseConfigured();
  const sponsorEntries = parseSponsorEntries(data.settings.sponsors);
  const bootAnimationUrl = resolveAssetUrl(data.settings.bootAnimationUrl, ['boot']);
  const introImageUrl = resolveAssetUrl(data.settings.introImageUrl, ['logos', 'sponsors', 'boot']);
  const eventSoundUrl = resolveAssetUrl(data.settings.eventSoundUrl, ['audio/events']);
  const adhanSoundUrl = resolveAssetUrl(data.settings.adhanSoundUrl, ['audio/adhan']);
  const backgroundImageUrl = resolveAssetUrl(data.settings.backgroundImageUrl, ['backgrounds']);
  const assetEventSoundOptions = listAssetUrls(['audio/events'], ['.mp3', '.wav', '.ogg', '.m4a', '.aac']);
  const dbEventSoundOptions = data.eventSounds.map((sound) => sound.soundUrl);
  const allEventSoundOptions = Array.from(new Set([...dbEventSoundOptions, ...assetEventSoundOptions]));
  const eventSoundNameByUrl = new Map(data.eventSounds.map((sound) => [sound.soundUrl, sound.originalName]));
  const adhanSoundOptions = listAssetUrls(['audio/adhan'], ['.mp3', '.wav', '.ogg', '.m4a', '.aac']);
  const mufrodatActiveVideoUrl = resolveAssetUrl(data.settings.mufrodatVideoUrl, ['videos/mufrodat']);
  const mufrodatScheduleValue = String(data.settings.mufrodatVideoScheduleTimes || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
  const mufrodatPlaybackMode = data.settings.mufrodatVideoPlaybackMode === 'random' ? 'random' : 'sequential';
  const totalEventPages = Math.max(1, Math.ceil(data.events.length / EVENTS_PER_PAGE));
  const requestedPage = Number.parseInt(String(resolvedSearchParams.page || '1'), 10);
  const currentEventPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalEventPages) : 1;
  const startEventIndex = (currentEventPage - 1) * EVENTS_PER_PAGE;
  const paginatedEvents = data.events.slice(startEventIndex, startEventIndex + EVENTS_PER_PAGE);
  const announcementAdminToken =
    process.env.ANNOUNCEMENT_ADMIN_TOKEN || process.env.NEXT_PUBLIC_ANNOUNCEMENT_ADMIN_TOKEN || '';

  return (
    <main className="admin-page">
      <section className="admin-hero glass-panel">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>Kelola database dari mana saja</h1>
          <p className="hero-text">
            Halaman ini menyimpan konten ke database lokal SQLite. Tanpa server tambahan,
            data tersimpan di file `data/clock.db` dan ikut ter-backup bersama folder project.
          </p>
        </div>
        <div className={`admin-status ${configured ? 'ok' : 'warn'}`}>
          <strong>{configured ? 'Database connected' : 'Database not configured'}</strong>
          <span>{configured ? 'SQLite lokal aktif' : 'Database lokal belum siap'}</span>
        </div>
      </section>

      <section className="admin-grid">
        <article className="admin-card glass-panel">
          <h2>Settings</h2>
          <form action={saveSettings} className="admin-form">
            <label>
              City name
              <input name="cityName" defaultValue={data.settings.cityName} />
            </label>
            <label>
              City ID
              <input name="cityId" defaultValue={data.settings.cityId} />
            </label>
            <label>
              Theme
              <input name="theme" defaultValue={data.settings.theme} />
            </label>
            <label>
              Running text
              <textarea name="runningText" rows={4} defaultValue={data.settings.runningText} />
            </label>
            <label>
              Enable adhan
              <select name="enableAdhan" defaultValue={String(data.settings.enableAdhan)}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>
              Boot animation URL (mp4)
              <input name="bootAnimationUrl" defaultValue={data.settings.bootAnimationUrl} placeholder="/boot.mp4" />
            </label>
            <label>
              Intro image URL (png/jpg/jpeg/gif)
              <input name="introImageUrl" defaultValue={data.settings.introImageUrl} placeholder="/logo.png" />
            </label>
            <label>
              Event sound URL
              <input
                name="eventSoundUrl"
                list="event-sound-options"
                defaultValue={data.settings.eventSoundUrl}
                placeholder="/audio/events/your-file.mp3"
              />
            </label>
            <label>
              Adhan sound URL
              <input
                name="adhanSoundUrl"
                list="adhan-sound-options"
                defaultValue={data.settings.adhanSoundUrl}
                placeholder="/audio/adhan/your-file.mp3"
              />
            </label>
            <label>
              Sponsors template
              <textarea
                name="sponsors"
                rows={3}
                defaultValue={data.settings.sponsors}
                placeholder="supported by | gra.png, developed by | stu.png"
              />
            </label>
            <label>
              Background image URL (jpeg/png/gif)
              <input
                name="backgroundImageUrl"
                defaultValue={data.settings.backgroundImageUrl}
                placeholder="backgrounds/background.gif or /assets/backgrounds/background.gif"
              />
            </label>
            <button type="submit">Save settings</button>
          </form>
        </article>

        <article className="admin-card glass-panel span-full">
          <h2>Media Preview</h2>
          <div className="media-preview-grid">
            <div className="media-preview-card">
              <strong>Boot animation</strong>
              {bootAnimationUrl ? (
                <video className="media-preview-video" controls muted playsInline loop src={bootAnimationUrl} />
              ) : (
                <p>No boot animation configured yet.</p>
              )}
            </div>

            <div className="media-preview-card">
              <strong>Intro image</strong>
              {introImageUrl ? (
                <img src={introImageUrl} alt="Intro preview" className="sponsor-preview-image" />
              ) : (
                <p>No intro image configured yet.</p>
              )}
            </div>

            <div className="media-preview-card">
              <strong>Event sound</strong>
              {eventSoundUrl ? (
                <audio controls src={eventSoundUrl} />
              ) : (
                <p>No event sound configured yet.</p>
              )}
            </div>

            <div className="media-preview-card">
              <strong>Adhan sound</strong>
              {adhanSoundUrl ? (
                <audio controls src={adhanSoundUrl} />
              ) : (
                <p>No adhan sound configured yet.</p>
              )}
            </div>

            <div className="media-preview-card media-preview-card--background">
              <strong>Background image</strong>
              {backgroundImageUrl ? (
                <div className="media-preview-background" style={{ backgroundImage: `url(${backgroundImageUrl})` }} />
              ) : (
                <p>No background image configured yet.</p>
              )}
            </div>
          </div>

          <div className="sponsor-preview-section">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Sponsors</p>
                <h2>Parsed preview</h2>
              </div>
              <div className="panel-badge">{sponsorEntries.length} items</div>
            </div>

            {sponsorEntries.length ? (
              <div className="sponsor-preview-grid">
                {sponsorEntries.map((entry) => (
                  <div key={`${entry.label}-${entry.src}`} className="sponsor-preview-card">
                    <img src={entry.src} alt={entry.label} className="sponsor-preview-image" />
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="fallback-note">No sponsor items configured yet.</p>
            )}
          </div>
        </article>

        <article className="admin-card glass-panel">
          <h2>Events</h2>
          <form action={uploadEventSound} className="admin-form compact">
            <label>
              Upload suara event (mp3/wav/ogg/m4a/aac)
              <input name="eventSound" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac" required />
            </label>
            <p className="fallback-note">
              Nama suara akan mengikuti nama file asli. Jika upload ulang dengan nama yang sama, file lama di database akan diganti.
            </p>
            <button type="submit">Upload suara ke DB</button>
          </form>

          {data.eventSounds.length ? (
            <div className="admin-list">
              {data.eventSounds.map((sound) => (
                <div key={sound.id} className="admin-list-item">
                  <div>
                    <strong>{sound.originalName}</strong>
                    <p>{sound.soundUrl}</p>
                  </div>
                  <audio controls preload="none" src={sound.soundUrl} />
                </div>
              ))}
            </div>
          ) : (
            <p className="fallback-note">Belum ada suara event di database.</p>
          )}

          <form action={createEvent} className="admin-form compact">
            <label>
              Title
              <input name="title" placeholder="Kajian malam" />
            </label>
            <label>
              Day
              <input name="day" placeholder="senin" />
            </label>
            <label>
              Start
              <input name="start" placeholder="19:30" />
            </label>
            <label>
              End
              <input name="end" placeholder="20:30" />
            </label>
            <label>
              Event sound (optional)
              <select name="soundUrl" defaultValue="">
                <option value="">Tanpa suara khusus</option>
                {data.eventSounds.map((sound) => (
                  <option key={sound.id} value={sound.soundUrl}>
                    {sound.originalName}
                  </option>
                ))}
              </select>
            </label>
            <p className="fallback-note">Pilih suara dari library upload database di atas.</p>
            <label>
              Note
              <input name="note" placeholder="Ruang utama" />
            </label>
            <button type="submit">Add event</button>
          </form>

          <form action={importEvents} className="admin-form compact">
            <label>
              Import events (JSON / template)
              <textarea
                name="eventsJson"
                rows={8}
                placeholder={`[senin]
03:00-04:00 tahajjud
04:00-05:00 shubuh

[selasa]
03:00-04:00 tahajjud
04:00-05:00 shubuh

atau JSON biasa / path file: jadwal.json
contoh JSON:
{"title":"KBM 1","start":"07:30","end":"08:15","day":"senin","soundUrl":"/audio/events/kbm1.mp3"}`}
              />
            </label>
            <button type="submit">Import events</button>
          </form>

          <div className="admin-list">
            {paginatedEvents.map((event) => (
              <div key={event.id} className="admin-list-item">
                <div className="admin-list-item__head">
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {event.day} - {event.start}
                      {event.endTime ? ` - ${event.endTime}` : ''}
                    </p>
                    {event.soundUrl ? <p>sound: {eventSoundNameByUrl.get(event.soundUrl) || event.soundUrl}</p> : null}
                    {event.note ? <p>note: {event.note}</p> : null}
                  </div>

                  <div className="admin-list-item__actions">
                    <details className="admin-edit-details">
                      <summary className="admin-edit-summary">Edit</summary>
                      <form action={updateEvent} className="admin-form compact admin-inline-edit-form">
                        <input type="hidden" name="id" value={event.id} />
                        <label>
                          Title
                          <input name="title" defaultValue={event.title} />
                        </label>
                        <label>
                          Day
                          <input name="day" defaultValue={event.day} />
                        </label>
                        <label>
                          Start
                          <input name="start" defaultValue={event.start} />
                        </label>
                        <label>
                          End
                          <input name="end" defaultValue={event.endTime || ''} />
                        </label>
                        <label>
                          Event sound (optional)
                          <select name="soundUrl" defaultValue={event.soundUrl || ''}>
                            <option value="">Tanpa suara khusus</option>
                            {data.eventSounds.map((sound) => (
                              <option key={sound.id} value={sound.soundUrl}>
                                {sound.originalName}
                              </option>
                            ))}
                            {event.soundUrl && !eventSoundNameByUrl.has(event.soundUrl) ? (
                              <option value={event.soundUrl}>{`Legacy: ${event.soundUrl}`}</option>
                            ) : null}
                          </select>
                        </label>
                        <label>
                          Note
                          <input name="note" defaultValue={event.note || ''} />
                        </label>
                        <button type="submit">Save edit</button>
                      </form>
                    </details>

                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={event.id} />
                      <button type="submit" className="danger">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.events.length > EVENTS_PER_PAGE ? (
            <nav className="admin-pagination" aria-label="Event pagination">
              <a
                href={`/admin?page=${Math.max(1, currentEventPage - 1)}`}
                className={`admin-pagination__link ${currentEventPage <= 1 ? 'is-disabled' : ''}`}
                aria-disabled={currentEventPage <= 1}
              >
                Prev
              </a>
              <span className="admin-pagination__meta">
                Page {currentEventPage} / {totalEventPages}
              </span>
              <a
                href={`/admin?page=${Math.min(totalEventPages, currentEventPage + 1)}`}
                className={`admin-pagination__link ${currentEventPage >= totalEventPages ? 'is-disabled' : ''}`}
                aria-disabled={currentEventPage >= totalEventPages}
              >
                Next
              </a>
            </nav>
          ) : null}
        </article>

        <article className="admin-card glass-panel">
          <h2>Mufrodat</h2>
          <form action={createMufrodat} className="admin-form compact">
            <label>
              Arabic
              <input name="arabic" placeholder="Masjid" />
            </label>
            <label>
              Translation
              <input name="translation" placeholder="Mosque" />
            </label>
            <button type="submit">Add mufrodat</button>
          </form>

          <div className="admin-list">
            {data.mufrodat.map((item) => (
              <div key={item.id} className="admin-list-item">
                <div>
                  <strong>{item.arabic}</strong>
                  <p>{item.translation}</p>
                </div>
                <form action={deleteMufrodat}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="danger">
                    Delete
                  </button>
                </form>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-card glass-panel">
          <h2>Vocabulary Takeover</h2>
          <div className="admin-list">
            <div className="admin-list-item">
              <div>
                <strong>{data.vocabItems.length} kartu • {data.vocabSlots.filter((slot) => slot.enabled).length} slot aktif</strong>
                {data.vocabSlots.map((slot) => (
                  <p key={slot.id}>
                    {slot.title}: {slot.days} {slot.start}–{slot.end} ({slot.mode}{slot.enabled ? '' : ', nonaktif'})
                  </p>
                ))}
              </div>
            </div>
          </div>
          <p className="fallback-note">
            Kelola kartu, jadwal multi-hari, dan kendali manual di halaman khusus.
          </p>
          <a className="admin-pagination__link" href="/control/vocab">Buka Vocab Control</a>
        </article>

        <article className="admin-card glass-panel">
          <h2>Mufrodat Video</h2>
          {notice ? (
            <p className={`fallback-note ${notice.tone === 'ok' ? 'notice-ok' : 'danger-note'}`}>
              {notice.text}
            </p>
          ) : null}
          <form action="/api/mufrodat-video/upload-legacy" method="post" className="admin-form compact" encType="multipart/form-data">
            <label>
              Manual playback (legacy) (mp4/webm)
              <input name="mufrodatVideo" type="file" accept="video/mp4,video/webm" required />
            </label>
            <p className="fallback-note">
              Upload akan langsung memutar fullscreen satu kali. Setelah selesai/gagal diputar, state playback dibersihkan dari database.
            </p>
            <button type="submit">Upload & trigger playback</button>
          </form>

          <div className="admin-list">
            <div className="admin-list-item">
              <div>
                <strong>Video aktif (manual/schedule)</strong>
                <p>{mufrodatActiveVideoUrl || 'Belum ada video aktif'}</p>
                {data.settings.mufrodatVideoPlaybackNonce ? <p>nonce: {data.settings.mufrodatVideoPlaybackNonce}</p> : null}
              </div>
            </div>
          </div>

          <form action={stopMufrodatVideoPlayback} className="admin-form compact">
            <p className="fallback-note">Klik jika perlu menghentikan video yang sedang tampil sekarang.</p>
            <button type="submit" className="danger">
              Stop video sekarang
            </button>
          </form>

          <form action={saveMufrodatVideoSettings} className="admin-form compact">
            <label>
              Playback mode
              <select name="playbackMode" defaultValue={mufrodatPlaybackMode}>
                <option value="sequential">Urut playlist</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label>
              Jam tayang (satu slot satu video)
              <textarea
                name="scheduleTimes"
                rows={5}
                defaultValue={mufrodatScheduleValue}
                placeholder={`09:00\n12:00\n15:30`}
              />
            </label>
            <p className="fallback-note">
              Format `HH:MM` (zona waktu Asia/Jakarta). Pada tiap jam slot, sistem memutar tepat 1 video dari playlist.
            </p>
            <button type="submit">Save schedule & mode</button>
          </form>

          <form action={uploadMufrodatVideoToPlaylist} className="admin-form compact">
            <label>
              Upload video mufrodat (mp4/webm)
              <input name="mufrodatVideo" type="file" accept="video/mp4,video/webm" required />
            </label>
            <p className="fallback-note">
              Video upload akan ditambahkan ke playlist database. Urutan playlist mengikuti urutan upload.
            </p>
            <button type="submit">Upload ke playlist</button>
          </form>

          {data.mufrodatVideos.length ? (
            <div className="admin-list">
              {data.mufrodatVideos.map((video) => (
                <div key={video.id} className="admin-list-item">
                  <div>
                    <strong>{video.originalName}</strong>
                    <p>{video.videoUrl}</p>
                    <p>{(video.sizeBytes / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <video className="media-preview-video" controls muted playsInline preload="metadata" src={video.videoUrl} />
                  <form action={deleteMufrodatVideo}>
                    <input type="hidden" name="id" value={video.id} />
                    <button type="submit" className="danger">
                      Delete
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-list">
              <div className="admin-list-item">
                <div>
                  <strong>Playlist kosong</strong>
                  <p>Upload video dulu agar jadwal mufrodat bisa berjalan.</p>
                </div>
              </div>
            </div>
          )}
        </article>

        <article className="admin-card glass-panel">
          <h2>Live Announcement</h2>
          <AdminAnnouncementControl authToken={announcementAdminToken} />
        </article>

        <article className="admin-card glass-panel span-full">
          <h2>Ticker</h2>
          <form action={saveTicker} className="admin-form">
            <label>
              Ticker lines
              <textarea name="items" rows={6} defaultValue={[...data.ticker, data.settings.runningText].join('\n')} />
            </label>
            <button type="submit">Save ticker</button>
          </form>
        </article>
      </section>

      <datalist id="event-sound-options">
        {allEventSoundOptions.map((src) => (
          <option key={src} value={src} />
        ))}
      </datalist>
      <datalist id="adhan-sound-options">
        {adhanSoundOptions.map((src) => (
          <option key={src} value={src} />
        ))}
      </datalist>
    </main>
  );
}
