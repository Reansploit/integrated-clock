import {
  clearBackgroundImage,
  createEvent,
  createMufrodat,
  deleteEvent,
  deleteMufrodat,
  deleteMufrodatVideo,
  importEvents,
  playMufrodatVideoOnce,
  saveCitySettings,
  saveCountdowns,
  saveDisplaySettings,
  saveLanguageWeek,
  saveMufrodatVideoSettings,
  saveTicker,
  stopMufrodatVideoPlayback,
  updateEvent,
  uploadBackgroundImage,
  uploadEventSound,
  uploadMufrodatVideoToPlaylist,
} from './actions';

import { AdminAnnouncementControl } from '@/components/AdminAnnouncementControl';
import { EventPager } from '@/components/EventPager';
import { SubmitButton } from '@/components/SubmitButton';
import { getDashboardData } from '@/lib/dashboard';
import { getDbWriteInfo } from '@/lib/db';
import { listAssetUrls, resolveAssetUrl } from '@/lib/media';
import { readNoticeDetail, resolveNotice } from '@/lib/panel-notice';

export const dynamic = 'force-dynamic';

/**
 * Design Read: a control console for one staff member editing what a wall
 * display shows, on a laptop or a phone over the LAN. The decision it exists
 * for is change one thing, then see that it changed. It is a workbench, so it
 * reads top to bottom as a document with a table of contents, not as a grid of
 * identical cards.
 *
 * Dials: ENERGY 1 / RHYTHM 2 / MOTION 1.
 */

const EVENTS_PER_PAGE = 8;

const WEEK_DAYS = [
  { value: 'senin', label: 'Senin' },
  { value: 'selasa', label: 'Selasa' },
  { value: 'rabu', label: 'Rabu' },
  { value: 'kamis', label: 'Kamis' },
  { value: 'jumat', label: 'Jumat' },
  { value: 'sabtu', label: 'Sabtu' },
  { value: 'minggu', label: 'Minggu' },
] as const;

const SECTION_GROUPS = [
  {
    title: 'Papan',
    links: [
      { href: '#ticker', label: 'Teks berjalan' },
      { href: '#sholat', label: 'Kota dan jadwal sholat' },
      { href: '#layar', label: 'Layar dan suara bawaan' },
      { href: '#hitung', label: 'Hitung mundur' },
    ],
  },
  {
    title: 'Jadwal',
    links: [{ href: '#kegiatan', label: 'Kegiatan' }],
  },
  {
    title: 'Audio',
    links: [{ href: '#suara', label: 'Perpustakaan suara' }],
  },
  {
    title: 'Bahasa',
    links: [
      { href: '#mufrodat', label: 'Mufrodat' },
      { href: '#video', label: 'Video mufrodat' },
      { href: '#kosakata', label: 'Kosakata (halaman sendiri)' },
    ],
  },
  {
    title: 'Siaran',
    links: [{ href: '#pengumuman', label: 'Pengumuman langsung' }],
  },
] as const;

type AdminPageProps = {
  searchParams?: Promise<{ page?: string; notice?: string; detail?: string }>;
};

function fileNameOf(url: string) {
  const clean = url.split('?')[0] || url;
  const segments = clean.split('/');
  return segments[segments.length - 1] || clean;
}

/**
 * Older rows stored a bare path such as "audio/events/alarm.mp3" while the
 * options carry "/assets/...". Resolving first lets those land on a real option,
 * so reopening and saving migrates the value instead of stranding it under
 * "Tidak ditemukan". An unresolvable value comes back unchanged, which is what
 * keeps the fallback option selectable.
 */
function normalizeSoundValue(value: string | null | undefined) {
  return value ? resolveAssetUrl(value, ['audio/events']) : '';
}

/**
 * The sound picker offers both places a file can live: rows uploaded to the
 * library (served out of the database) and recordings already sitting in
 * assets/audio/events. The library starts empty on a fresh install while the
 * folder already holds the school's own files, so listing only one of the two
 * would leave the picker with nothing to pick in one of those states. A value
 * that is in neither list is kept as its own option, so opening the edit form
 * never silently drops a setting that used to work.
 */
function EventSoundChoices({
  library,
  files,
  current,
  emptyLabel = 'Tanpa suara khusus',
}: {
  library: Array<{ id: number; originalName: string; soundUrl: string }>;
  files: string[];
  current?: string | null;
  emptyLabel?: string;
}) {
  const libraryUrls = new Set(library.map((sound) => sound.soundUrl));
  const resolved = normalizeSoundValue(current);
  const known = !resolved || libraryUrls.has(resolved) || files.includes(resolved);

  return (
    <>
      <option value="">{emptyLabel}</option>
      {library.length ? (
        <optgroup label={`Perpustakaan (${library.length})`}>
          {library.map((sound) => (
            <option key={sound.id} value={sound.soundUrl}>
              {sound.originalName}
            </option>
          ))}
        </optgroup>
      ) : null}
      {files.length ? (
        <optgroup label="Folder assets/audio/events">
          {files.map((src) => (
            <option key={src} value={src}>
              {fileNameOf(src)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {!known ? (
        <optgroup label="Tidak ditemukan">
          <option value={resolved}>Lama: {fileNameOf(resolved)}</option>
        </optgroup>
      ) : null}
    </>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function formatClock(iso: string | null) {
  if (!iso) {
    return 'belum pernah ditulis';
  }
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso));
}

function dayLabel(value: string) {
  return WEEK_DAYS.find((day) => day.value === value)?.label ?? value;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const data = await getDashboardData({ includeAdminData: true });
  const params = (await searchParams) || {};
  const notice = resolveNotice(params.notice);
  const noticeDetail = readNoticeDetail(params.detail);

  const dbWrite = getDbWriteInfo();
  const eventSoundUrl = resolveAssetUrl(data.settings.eventSoundUrl, ['audio/events']);
  const backgroundImageUrl = resolveAssetUrl(data.settings.backgroundImageUrl, ['backgrounds']);
  const eventSoundFiles = listAssetUrls(['audio/events'], ['.mp3', '.wav', '.ogg', '.m4a', '.aac']);
  const eventSoundNameByUrl = new Map(data.eventSounds.map((sound) => [sound.soundUrl, sound.originalName]));
  const activeVideoUrl = resolveAssetUrl(data.settings.mufrodatVideoUrl, ['videos/mufrodat']);
  const scheduleValue = String(data.settings.mufrodatVideoScheduleTimes || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
  const playbackMode = data.settings.mufrodatVideoPlaybackMode === 'random' ? 'random' : 'sequential';
  const activeVocabSlots = data.vocabSlots.filter((slot) => slot.enabled);
  const manualSlot = data.vocabSlots.find((slot) => slot.enabled && slot.mode === 'manual');

  const totalEventPages = Math.max(1, Math.ceil(data.events.length / EVENTS_PER_PAGE));
  const requestedPage = Number.parseInt(String(params.page || '1'), 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalEventPages) : 1;

  const announcementToken =
    process.env.ANNOUNCEMENT_ADMIN_TOKEN || process.env.NEXT_PUBLIC_ANNOUNCEMENT_ADMIN_TOKEN || '';

  return (
    <main className="console">
      <header className="console__head">
        <div className="console__headline">
          <h1>Panel admin</h1>
          <p>
            Semua isi papan disimpan di satu file SQLite lokal, <code>{dbWrite?.relativePath ?? 'data/clock.db'}</code>.
            Setelah menyimpan, papan memuat ulang sendiri dalam hitungan detik.
          </p>
        </div>

        <dl className="console__facts">
          <div>
            <dt>Status</dt>
            <dd>{dbWrite ? 'Database siap' : 'Database belum ada'}</dd>
          </div>
          <div>
            <dt>Terakhir ditulis</dt>
            <dd>{formatClock(dbWrite?.modifiedAt ?? null)}</dd>
          </div>
          <div>
            <dt>Isi papan</dt>
            <dd>
              {data.events.length} kegiatan, {data.ticker.length} baris teks, {data.mufrodat.length} mufrodat
            </dd>
          </div>
        </dl>

        <nav className="console__links" aria-label="Halaman lain">
          <a className="btn btn--quiet" href="/" target="_blank" rel="noreferrer">
            Buka papan
          </a>
          <a className="btn btn--quiet" href="/control/vocab">
            Kelola kosakata
          </a>
        </nav>
      </header>

      <div className="console__sticky">
        <nav className="console__index" aria-label="Daftar bagian">
          <span className="console__index-title">Bagian</span>
          <ol className="console__groups">
            {SECTION_GROUPS.map((group) => (
              <li key={group.title} className="console__group">
                <span className="console__group-title">{group.title}</span>
                <ul>
                  {group.links.map((section) => (
                    <li key={section.href}>
                      <a href={section.href}>{section.label}</a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </nav>

        {notice ? (
          <p className="console__notice" data-tone={notice.tone} role="status">
            <strong>{notice.text}</strong>
            {noticeDetail ? <span>{noticeDetail}</span> : null}
          </p>
        ) : null}
      </div>

      <section className="panel" id="ticker">
        <div className="panel__head">
          <h2>Teks berjalan</h2>
          <p>
            Baris paling bawah papan, berjalan dari kanan ke kiri. Satu baris di papan ini = satu baris di
            kotak bawah.
          </p>
        </div>

        <form action={saveTicker} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field field--wide">
            <span>Daftar baris</span>
            <textarea name="items" rows={6} defaultValue={data.ticker.join('\n')} required />
            <small>
              Baris kosong diabaikan. Teks yang terlalu panjang keluar papan lebih cepat daripada teks pendek.
            </small>
          </label>
          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Simpan teks berjalan</SubmitButton>
          </div>
        </form>
      </section>

      <section className="panel" id="sholat">
        <div className="panel__head">
          <h2>Kota dan jadwal sholat</h2>
          <p>Kota menentukan jadwal sholat yang diambil papan. Papan hanya menghitung sisa waktunya, tidak memutar suara.</p>
        </div>

        <form action={saveCitySettings} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field">
            <span>Nama kota</span>
            <input name="cityName" defaultValue={data.settings.cityName} required />
          </label>

          <label className="field">
            <span>ID kota</span>
            <input name="cityId" defaultValue={data.settings.cityId} required inputMode="numeric" />
            <small>Nomor kota di myquran.com. Jombang 1608.</small>
          </label>

          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Simpan pengaturan</SubmitButton>
          </div>
        </form>
      </section>

      <section className="panel" id="layar">
        <div className="panel__head">
          <h2>Layar dan suara bawaan</h2>
          <p>
            Gambar latar disembunyikan, lalu mengintip pudar 5 detik setiap 20 detik. Pilih lewat browse file
            di bawah, file tersimpan di folder assets/backgrounds dan langsung terpasang.
          </p>
        </div>

        <form action={uploadBackgroundImage} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field field--wide">
            <span>Unggah gambar latar</span>
            <input
              name="backgroundImage"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              required
            />
            <small>
              PNG, JPG, GIF, atau WebP, maksimal 10 MB. GIF animasi ikut bergerak di papan.
            </small>
          </label>
          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Mengunggah">Unggah dan pasang</SubmitButton>
          </div>
        </form>

        <form action={saveDisplaySettings} className="media-grid">
          <input type="hidden" name="page" value={currentPage} />
          <input type="hidden" name="backgroundImageUrl" value={data.settings.backgroundImageUrl} />
          <label className="field">
            <span>Suara bawaan kegiatan</span>
            <select
              name="eventSoundUrl"
              defaultValue={normalizeSoundValue(data.settings.eventSoundUrl)}
            >
              <EventSoundChoices
                library={data.eventSounds}
                files={eventSoundFiles}
                current={data.settings.eventSoundUrl}
                emptyLabel="Tanpa suara bawaan"
              />
            </select>
            <small>Berbunyi untuk kegiatan yang kolom suara penandanya dikosongkan.</small>
          </label>

          <div className="media-grid__strip">
            <figure>
              <span>Latar belakang</span>
              {backgroundImageUrl ? (
                <img className="shot" src={backgroundImageUrl} alt="Pratinjau latar belakang papan" />
              ) : (
                <div className="shot shot--empty">kosong</div>
              )}
            </figure>
            <figure>
              <span>Suara bawaan</span>
              {eventSoundUrl ? (
                <audio controls preload="none" src={eventSoundUrl} />
              ) : (
                <div className="shot shot--empty">kosong</div>
              )}
            </figure>
          </div>

          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Simpan suara bawaan</SubmitButton>
          </div>
        </form>

        {backgroundImageUrl ? (
          <form action={clearBackgroundImage} className="field-grid">
            <input type="hidden" name="page" value={currentPage} />
            <div className="field-grid__actions">
              <SubmitButton
                pendingLabel="Melepas"
                variant="quiet"
                confirmMessage="Lepas gambar latar? Papan kembali ke warna gelap bawaan."
              >
                Lepas gambar latar
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </section>

      <section className="panel" id="hitung">
        <div className="panel__head">
          <h2>Hitung mundur</h2>
          <p>
            Dua tanggal penghitung di panel jam papan: perpulangan dan ujian. Dihitung mundur dalam hari
            dari hari ini. Dikosongkan berarti tidak ada tanggal, papan hanya menampilkan strip.
          </p>
        </div>

        <form action={saveCountdowns} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field">
            <span>Tanggal perpulangan</span>
            <input name="homecomingDate" type="date" defaultValue={data.settings.homecomingDate} />
          </label>
          <label className="field">
            <span>Tanggal ujian</span>
            <input name="examDate" type="date" defaultValue={data.settings.examDate} />
          </label>
          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Simpan tanggal</SubmitButton>
          </div>
        </form>
      </section>

      <section className="panel" id="kegiatan">
        <div className="panel__head">
          <h2>Kegiatan</h2>
          <p>
            Satu baris = satu kegiatan pada hari tertentu. Papan menampilkan kegiatan yang sedang berjalan di
            kotak kiri bawah.
          </p>
        </div>

        <EventPager totalItems={data.events.length} pageSize={EVENTS_PER_PAGE} initialPage={currentPage}>
          <form action={createEvent} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field field--span-2">
            <span>Nama kegiatan</span>
            <input name="title" placeholder="Kajian Subuh" required />
          </label>

          <label className="field">
            <span>Hari</span>
            <select name="day" defaultValue="senin" required>
              {WEEK_DAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Mulai</span>
            <input name="start" type="time" required />
          </label>

          <label className="field">
            <span>Selesai</span>
            <input name="end" type="time" />
          </label>

          <label className="field">
            <span>Suara penanda</span>
            <select name="soundUrl" defaultValue="">
              <EventSoundChoices library={data.eventSounds} files={eventSoundFiles} />
            </select>
            <small>
              Bunyi tepat saat kegiatan ini mulai. Kosongkan untuk memakai suara bawaan di bawah.
            </small>
          </label>

          <label className="field field--span-2">
            <span>Catatan</span>
            <input name="note" placeholder="Ruang serbaguna" />
          </label>

          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Tambah kegiatan</SubmitButton>
          </div>
        </form>

        <details className="disclosure">
          <summary>Impor jadwal dari file atau teks</summary>
          <form action={importEvents} className="field-grid">
            <input type="hidden" name="page" value={currentPage} />
            <label className="field field--wide">
              <span>Isian impor</span>
              <textarea
                name="eventsJson"
                rows={9}
                defaultValue={`[senin]
05:15-06:00 Kajian Subuh

[rabu]
19:30-20:45 Tahsin Remaja`}
              />
              <small>
                Cara template: baris <code>[hari]</code> mulai blok baru, lalu{' '}
                <code>05:15-06:00 Nama kegiatan</code>. Cara JSON: tempel isi file, atau tulis nama file yang
                ada di folder assets, misalnya <code>jadwal.json</code>.
              </small>
            </label>
            <div className="field-grid__actions">
              <SubmitButton pendingLabel="Mengimpor" variant="quiet">
                Impor jadwal
              </SubmitButton>
            </div>
          </form>
        </details>

        {data.events.length ? (
          <ul className="rows">
            {data.events.map((event) => (
              <li key={event.id} className="row">
                <div className="row__body">
                  <div className="row__title">
                    <span className="row__day">{dayLabel(event.day)}</span>
                    <strong>{event.title}</strong>
                  </div>
                  <p className="row__meta">
                    {event.start}
                    {event.endTime ? ` sampai ${event.endTime}` : ''}
                    {event.soundUrl ? ` | suara ${eventSoundNameByUrl.get(event.soundUrl) || fileNameOf(event.soundUrl)}` : ''}
                    {event.note ? ` | ${event.note}` : ''}
                  </p>
                </div>

                <div className="row__actions">
                  <details className="disclosure disclosure--inline">
                    <summary>Ubah</summary>
                    <form action={updateEvent} className="field-grid">
                      <input type="hidden" name="page" value={currentPage} />
                      <input type="hidden" name="id" value={event.id} />
                      <label className="field field--span-2">
                        <span>Nama kegiatan</span>
                        <input name="title" defaultValue={event.title} required />
                      </label>
                      <label className="field">
                        <span>Hari</span>
                        <select name="day" defaultValue={event.day} required>
                          {WEEK_DAYS.map((day) => (
                            <option key={day.value} value={day.value}>
                              {day.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Mulai</span>
                        <input name="start" type="time" defaultValue={event.start} required />
                      </label>
                      <label className="field">
                        <span>Selesai</span>
                        <input name="end" type="time" defaultValue={event.endTime || ''} />
                      </label>
                      <label className="field">
                        <span>Suara penanda</span>
                        <select
                          name="soundUrl"
                          defaultValue={normalizeSoundValue(event.soundUrl)}
                        >
                          <EventSoundChoices
                            library={data.eventSounds}
                            files={eventSoundFiles}
                            current={event.soundUrl}
                          />
                        </select>
                      </label>
                      <label className="field field--span-2">
                        <span>Catatan</span>
                        <input name="note" defaultValue={event.note || ''} />
                      </label>
                      <div className="field-grid__actions">
                        <SubmitButton pendingLabel="Menyimpan">Simpan perubahan</SubmitButton>
                      </div>
                    </form>
                  </details>

                  <form action={deleteEvent}>
                    <input type="hidden" name="page" value={currentPage} />
                    <input type="hidden" name="id" value={event.id} />
                    <SubmitButton
                      pendingLabel="Menghapus"
                      confirmMessage={`Hapus kegiatan "${event.title}"? Baris ini hilang dari papan.`}
                      variant="danger"
                    >
                      Hapus
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            Belum ada kegiatan sama sekali. Isi form di atas untuk menambah yang pertama.
          </p>
        )}

        </EventPager>
      </section>

      <section className="panel" id="suara">
        <div className="panel__head">
          <h2>Perpustakaan suara</h2>
          <p>
            Satu tempat untuk semua file audio pendek. Pilih dari daftar ini saat mengisi kolom Suara pada
            kegiatan dan kartu kosakata.
          </p>
        </div>

        <form action={uploadEventSound} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field field--wide">
            <span>Unggah file audio</span>
            <input
              name="eventSound"
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac"
              required
            />
            <small>mp3, wav, ogg, m4a, atau aac, maksimal 20 MB. Mengunggah lagi dengan nama sama akan menimpa.</small>
          </label>
          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Mengunggah">Unggah suara</SubmitButton>
          </div>
        </form>

        {data.eventSounds.length ? (
          <ul className="rows">
            {data.eventSounds.map((sound) => (
              <li key={sound.id} className="row">
                <div className="row__body">
                  <div className="row__title">
                    <strong>{sound.originalName}</strong>
                  </div>
                  <p className="row__meta">{formatBytes(sound.sizeBytes)}</p>
                </div>
                <audio controls preload="none" src={sound.soundUrl} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            Belum ada suara di perpustakaan. Unggah satu file mp3 di atas, lalu pilih di kolom Suara pada
            kegiatan.
          </p>
        )}
      </section>

      <section className="panel" id="mufrodat">
        <div className="panel__head">
          <h2>Mufrodat</h2>
          <p>Daftar kata Arab yang bergantian di kotak kanan bawah papan.</p>
        </div>

        <form action={saveLanguageWeek} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field">
            <span>Minggu bahasa</span>
            <select name="languageWeek" defaultValue={data.settings.languageWeek}>
              <option value="arab">Arab — bendera Saudi, tulisan أسبوع العربية</option>
              <option value="english">Inggris — bendera British, tulisan english week</option>
            </select>
            <small>Bendera dan tulisan tampil di atas daftar kata di kotak kosakata papan.</small>
          </label>
          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Simpan minggu bahasa</SubmitButton>
          </div>
        </form>

        <form action={createMufrodat} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field">
            <span>Teks Arab</span>
            <input name="arabic" dir="rtl" placeholder="مسجد" required />
          </label>
          <label className="field">
            <span>Arti</span>
            <input name="translation" placeholder="Masjid" required />
          </label>
          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Tambah mufrodat</SubmitButton>
          </div>
        </form>

        {data.mufrodat.length ? (
          <ul className="rows">
            {data.mufrodat.map((item) => (
              <li key={item.id} className="row">
                <div className="row__body">
                  <div className="row__title">
                    <strong className="arabic" dir="rtl">
                      {item.arabic}
                    </strong>
                    <span>{item.translation}</span>
                  </div>
                </div>
                <form action={deleteMufrodat}>
                  <input type="hidden" name="page" value={currentPage} />
                  <input type="hidden" name="id" value={item.id} />
                  <SubmitButton
                    pendingLabel="Menghapus"
                    confirmMessage={`Hapus mufrodat "${item.translation}"?`}
                    variant="danger"
                  >
                    Hapus
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Belum ada mufrodat. Tambah satu lewat form di atas.</p>
        )}
      </section>

      <section className="panel" id="video">
        <div className="panel__head">
          <h2>Video mufrodat</h2>
          <p>Video pendek yang mengambil alih layar penuh saat jadwalnya tiba.</p>
        </div>

        <div className="status-line" data-live={activeVideoUrl ? 'true' : undefined}>
          <span className="status-line__label">Yang tampil sekarang</span>
          {activeVideoUrl ? (
            <span className="status-line__value">
              {fileNameOf(activeVideoUrl)} (diminta{' '}
              {formatClock(data.settings.mufrodatVideoPlaybackRequestedAt || null)})
            </span>
          ) : (
            <span className="status-line__value">Tidak ada video aktif.</span>
          )}
          {activeVideoUrl ? (
            <form action={stopMufrodatVideoPlayback}>
              <input type="hidden" name="page" value={currentPage} />
              <SubmitButton pendingLabel="Menghentikan" variant="danger">
                Hentikan sekarang
              </SubmitButton>
            </form>
          ) : null}
        </div>

        <form action={saveMufrodatVideoSettings} className="field-grid">
          <input type="hidden" name="page" value={currentPage} />
          <label className="field">
            <span>Urutan tayang</span>
            <select name="playbackMode" defaultValue={playbackMode}>
              <option value="sequential">Ikuti urutan playlist</option>
              <option value="random">Acak</option>
            </select>
          </label>

          <label className="field field--wide">
            <span>Jam tayang</span>
            <textarea name="scheduleTimes" rows={4} defaultValue={scheduleValue} placeholder={'09:00\n12:00\n15:30'} />
            <small>
              Satu jam per baris, zona waktu Asia/Jakarta. Tiap jam yang kena akan memutar tepat satu video dari
              playlist, lalu mengunci slot itu sampai lewat.
            </small>
          </label>

          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Simpan jadwal tayang</SubmitButton>
          </div>
        </form>

        <div className="two-up">
          <form action={uploadMufrodatVideoToPlaylist} className="field-grid">
            <input type="hidden" name="page" value={currentPage} />
            <h3 className="field-set-title">Tambah ke playlist</h3>
            <label className="field">
              <span>File video</span>
              <input name="mufrodatVideo" type="file" accept="video/mp4,video/webm" required />
              <small>mp4 atau webm, maksimal 100 MB. Urutan playlist mengikuti urutan unggah.</small>
            </label>
            <div className="field-grid__actions">
              <SubmitButton pendingLabel="Mengunggah">Tambah ke playlist</SubmitButton>
            </div>
          </form>

          <form action={playMufrodatVideoOnce} className="field-grid">
            <input type="hidden" name="page" value={currentPage} />
            <h3 className="field-set-title">Putar sekali, di luar jadwal</h3>
            <label className="field">
              <span>File video</span>
              <input name="mufrodatVideo" type="file" accept="video/mp4,video/webm" required />
              <small>Video ini langsung memutar penuh sekali, lalu papan kembali normal. Tidak masuk playlist.</small>
            </label>
            <div className="field-grid__actions">
              <SubmitButton pendingLabel="Mengunggah" variant="quiet">
                Unggah lalu putar sekali
              </SubmitButton>
            </div>
          </form>
        </div>

        {data.mufrodatVideos.length ? (
          <ul className="rows">
            {data.mufrodatVideos.map((video, index) => (
              <li key={video.id} className="row">
                <div className="row__body">
                  <div className="row__title">
                    <span className="row__day">{index + 1}</span>
                    <strong>{video.originalName}</strong>
                  </div>
                  <p className="row__meta">{formatBytes(video.sizeBytes)}</p>
                </div>
                <video className="row__video" controls muted playsInline preload="metadata" src={video.videoUrl} />
                <form action={deleteMufrodatVideo}>
                  <input type="hidden" name="page" value={currentPage} />
                  <input type="hidden" name="id" value={video.id} />
                  <SubmitButton
                    pendingLabel="Menghapus"
                    confirmMessage={`Hapus video "${video.originalName}"? File di disk ikut terhapus.`}
                    variant="danger"
                  >
                    Hapus
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            Playlist masih kosong. Unggah video lewat kolom Tambah ke playlist supaya jadwal di atas punya
            bahan tayang.
          </p>
        )}
      </section>

      <section className="panel" id="kosakata">
        <div className="panel__head">
          <h2>Kosakata (halaman sendiri)</h2>
          <p>
            Bagian ini hanya ringkasan. Kartu dan slot jadwal dikelola di halaman sendiri, karena isinya jauh
            lebih banyak daripada bagian lain di halaman ini.
          </p>
        </div>

        <dl className="console__facts console__facts--inline">
          <div>
            <dt>Kartu tersimpan</dt>
            <dd>{data.vocabItems.length} kartu</dd>
          </div>
          <div>
            <dt>Slot aktif</dt>
            <dd>
              {activeVocabSlots.length} dari {data.vocabSlots.length}
            </dd>
          </div>
          <div>
            <dt>Slot manual</dt>
            <dd>{manualSlot ? manualSlot.title : 'tidak ada'}</dd>
          </div>
        </dl>

        <a className="btn" href="/control/vocab">
          Kelola kartu dan slot kosakata
        </a>
      </section>

      <section className="panel" id="pengumuman">
        <div className="panel__head">
          <h2>Pengumuman langsung</h2>
          <p>Bicara langsung ke speaker papan, tanpa perlu menyiapkan file apa pun.</p>
        </div>

        <AdminAnnouncementControl authToken={announcementToken} />
      </section>

    </main>
  );
}
