import {
  createVocabItem,
  createVocabSlot,
  deleteVocabItem,
  deleteVocabSlot,
  moveVocabItem,
  stepManualVocab,
  stopManualVocab,
  updateVocabItem,
  updateVocabSlot,
} from './actions';

import { SubmitButton } from '@/components/SubmitButton';
import { getEventSounds, getVocabItems, getVocabSlots } from '@/lib/db';
import { readNoticeDetail, resolveNotice } from '@/lib/panel-notice';
import { getVocabLive } from '@/lib/vocab-live';

export const dynamic = 'force-dynamic';

/**
 * Design Read: the counterpart of the admin console, for the one feature that
 * owns the whole screen for a scheduled window. Same workbench shell, so the
 * operator moves between the two pages without relearning anything. Dials:
 * ENERGY 1 / RHYTHM 2 / MOTION 1.
 */

const WEEK_DAYS = [
  { value: 'senin', label: 'Senin' },
  { value: 'selasa', label: 'Selasa' },
  { value: 'rabu', label: 'Rabu' },
  { value: 'kamis', label: 'Kamis' },
  { value: 'jumat', label: 'Jumat' },
  { value: 'sabtu', label: 'Sabtu' },
  { value: 'minggu', label: 'Minggu' },
] as const;

const SECTIONS = [
  { href: '#kartu', label: 'Kartu' },
  { href: '#slot', label: 'Slot tayang' },
  { href: '#manual', label: 'Kendali manual' },
] as const;

type VocabPageProps = {
  searchParams?: Promise<{ notice?: string; detail?: string }>;
};

function daySummary(days: string) {
  const selected = days.split(',').map((day) => day.trim()).filter(Boolean);
  if (!selected.length) {
    return 'tanpa hari';
  }
  return WEEK_DAYS.filter((day) => selected.includes(day.value))
    .map((day) => day.label)
    .join(', ');
}

function audioLabel(url: string, eventSounds: Array<{ soundUrl: string; originalName: string }>) {
  if (!url) {
    return '';
  }
  return eventSounds.find((sound) => sound.soundUrl === url)?.originalName || url;
}

export default async function VocabControlPage({ searchParams }: VocabPageProps) {
  const [items, slots, eventSounds] = await Promise.all([
    Promise.resolve(getVocabItems()),
    Promise.resolve(getVocabSlots()),
    Promise.resolve(getEventSounds()),
  ]);
  const live = getVocabLive();
  const manualSlots = slots.filter((slot) => slot.mode === 'manual' && slot.enabled);
  const activeSlots = slots.filter((slot) => slot.enabled);

  const params = (await searchParams) || {};
  const notice = resolveNotice(params.notice);
  const noticeDetail = readNoticeDetail(params.detail);

  return (
    <main className="console">
      <header className="console__head">
        <div className="console__headline">
          <h1>Kosakata tayang</h1>
          <p>
            Kartu kosakata yang mengambil alih layar papan penuh selama jam yang ditentukan di bawah. Di luar jam
            itu papan kembali normal.
          </p>
        </div>

        <dl className="console__facts">
          <div>
            <dt>Kartu tersimpan</dt>
            <dd>{items.length} kartu</dd>
          </div>
          <div>
            <dt>Slot aktif</dt>
            <dd>
              {activeSlots.length} dari {slots.length}
            </dd>
          </div>
          <div>
            <dt>Slot manual aktif</dt>
            <dd>{manualSlots.length}</dd>
          </div>
        </dl>

        <nav className="console__links" aria-label="Halaman lain">
          <a className="btn btn--quiet" href="/">
            Buka papan
          </a>
          <a className="btn btn--quiet" href="/admin">
            Panel admin
          </a>
        </nav>
      </header>

      <div className="console__sticky">
        <nav className="console__index" aria-label="Daftar bagian">
          <span className="console__index-title">Bagian</span>
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <a href={section.href}>{section.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        {notice ? (
          <p className="console__notice" data-tone={notice.tone} role="status">
            <strong>{notice.text}</strong>
            {noticeDetail ? <span>{noticeDetail}</span> : null}
          </p>
        ) : null}
      </div>

      <section className="panel" id="kartu">
        <div className="panel__head">
          <h2>Kartu</h2>
          <p>
            Satu baris = satu kartu. Urutan baris di daftar ini ikut dipakai saat mode putar Urut, jadi
            perpindahan kartu bisa diatur dengan tombol naik dan turun.
          </p>
        </div>

        <form action={createVocabItem} className="field-grid">
          <label className="field">
            <span>Inggris</span>
            <input name="english" placeholder="Prayer" />
          </label>

          <label className="field">
            <span>Arab</span>
            <input name="arabic" dir="rtl" placeholder="صَلَاة" />
          </label>

          <label className="field">
            <span>Arti</span>
            <input name="meaning" placeholder="Shalat" />
          </label>

          <label className="field">
            <span>Contoh, bahasa Arab</span>
            <input name="exampleAr" dir="rtl" placeholder="المثال" />
          </label>

          <label className="field">
            <span>Arti contoh</span>
            <input name="exampleMeaning" placeholder="Contoh kalimat" />
          </label>

          <label className="field">
            <span>Audio</span>
            <select name="audioPreset" defaultValue="">
              <option value="">Tanpa audio</option>
              {eventSounds.map((sound) => (
                <option key={sound.id} value={sound.soundUrl}>
                  {sound.originalName}
                </option>
              ))}
            </select>
            <small>
              Daftar ini isi dari perpustakaan suara di panel admin.{' '}
              <a href="/admin#suara">Kelola perpustakaan suara</a>.
            </small>
          </label>

          <label className="field field--wide">
            <span>URL audio manual</span>
            <input name="audioUrl" placeholder="/assets/audio/vocab/kata.mp3" />
            <small>Kalau diisi, URL ini menang atas pilihan audio di atas.</small>
          </label>

          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Tambah kartu</SubmitButton>
          </div>
        </form>

        {items.length ? (
          <ul className="rows">
            {items.map((item, index) => (
              <li key={item.id} className="row">
                <div className="row__body">
                  <div className="row__title">
                    <span className="row__day">{index + 1}</span>
                    <strong>{item.english || 'Tanpa teks Inggris'}</strong>
                    {item.arabic ? (
                      <strong className="arabic" dir="rtl">
                        {item.arabic}
                      </strong>
                    ) : null}
                  </div>
                  {item.meaning ? <p className="row__meta">{item.meaning}</p> : null}
                  {item.exampleAr || item.exampleMeaning ? (
                    <p className="row__meta">
                      Contoh: {item.exampleAr || 'tanpa teks Arab'} | {item.exampleMeaning || 'tanpa arti'}
                    </p>
                  ) : null}
                  {item.audioUrl ? (
                    <p className="row__meta">Audio: {audioLabel(item.audioUrl, eventSounds)}</p>
                  ) : null}
                  {item.audioUrl ? <audio controls preload="none" src={item.audioUrl} /> : null}
                </div>

                <div className="row__actions">
                  <form action={moveVocabItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      className="btn btn--quiet"
                      disabled={index === 0}
                      aria-label={`Naikkan ${item.english || 'kartu tanpa teks Inggris'} satu urutan`}
                    >
                      Naik
                    </button>
                  </form>

                  <form action={moveVocabItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      className="btn btn--quiet"
                      disabled={index === items.length - 1}
                      aria-label={`Turunkan ${item.english || 'kartu tanpa teks Inggris'} satu urutan`}
                    >
                      Turun
                    </button>
                  </form>

                  <details className="disclosure disclosure--inline">
                    <summary>Ubah</summary>
                    <form action={updateVocabItem} className="field-grid">
                      <input type="hidden" name="id" value={item.id} />
                      <label className="field">
                        <span>Inggris</span>
                        <input name="english" defaultValue={item.english} />
                      </label>
                      <label className="field">
                        <span>Arab</span>
                        <input name="arabic" defaultValue={item.arabic} dir="rtl" />
                      </label>
                      <label className="field">
                        <span>Arti</span>
                        <input name="meaning" defaultValue={item.meaning} />
                      </label>
                      <label className="field">
                        <span>Contoh, bahasa Arab</span>
                        <input name="exampleAr" defaultValue={item.exampleAr} dir="rtl" />
                      </label>
                      <label className="field">
                        <span>Arti contoh</span>
                        <input name="exampleMeaning" defaultValue={item.exampleMeaning} />
                      </label>
                      <label className="field">
                        <span>Audio</span>
                        <select
                          name="audioPreset"
                          defaultValue={
                            eventSounds.some((sound) => sound.soundUrl === item.audioUrl) ? item.audioUrl : ''
                          }
                        >
                          <option value="">Tanpa audio</option>
                          {eventSounds.map((sound) => (
                            <option key={sound.id} value={sound.soundUrl}>
                              {sound.originalName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field field--wide">
                        <span>URL audio manual</span>
                        <input
                          name="audioUrl"
                          defaultValue={
                            eventSounds.some((sound) => sound.soundUrl === item.audioUrl) ? '' : item.audioUrl
                          }
                        />
                      </label>
                      <div className="field-grid__actions">
                        <SubmitButton pendingLabel="Menyimpan">Simpan kartu</SubmitButton>
                      </div>
                    </form>
                  </details>

                  <form action={deleteVocabItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <SubmitButton
                      pendingLabel="Menghapus"
                      confirmMessage={`Hapus kartu "${item.english || item.arabic || 'tanpa nama'}"?`}
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
            Belum ada kartu. Isi form di atas untuk menambah yang pertama, minimal satu dari kolom Inggris atau
            Arab.
          </p>
        )}
      </section>

      <section className="panel" id="slot">
        <div className="panel__head">
          <h2>Slot tayang</h2>
          <p>
            Jendela waktu kartu tampil, per hari. Selama slot aktif, papan menampilkan kartu mode Otomatis atau
            mengikuti kendali manual di bawah.
          </p>
        </div>

        <form action={createVocabSlot} className="field-grid">
          <label className="field">
            <span>Nama slot</span>
            <input name="title" placeholder="Halaqah malam" required />
          </label>

          <fieldset className="field field--wide field--checks">
            <legend>Hari</legend>
            {WEEK_DAYS.map((day) => (
              <label key={day.value}>
                <input type="checkbox" name="days" value={day.value} />
                <span>{day.label}</span>
              </label>
            ))}
          </fieldset>

          <label className="field">
            <span>Mulai</span>
            <input name="start" type="time" required />
          </label>

          <label className="field">
            <span>Selesai</span>
            <input name="end" type="time" required />
          </label>

          <label className="field">
            <span>Mode putar</span>
            <select name="mode" defaultValue="auto">
              <option value="auto">Otomatis, ganti kartu tiap interval</option>
              <option value="manual">Manual, dikendalikan dari bawah</option>
            </select>
          </label>

          <label className="field">
            <span>Interval, detik</span>
            <input name="intervalSec" type="number" min={3} max={120} defaultValue={10} />
          </label>

          <label className="field">
            <span>Urutan kartu</span>
            <select name="orderMode" defaultValue="sequential">
              <option value="sequential">Ikuti urutan daftar</option>
              <option value="random">Acak</option>
            </select>
          </label>

          <label className="field field--check">
            <span>Aktif</span>
            <input type="checkbox" name="enabled" value="on" defaultChecked />
          </label>

          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Tambah slot</SubmitButton>
          </div>
        </form>

        {slots.length ? (
          <ul className="rows">
            {slots.map((slot) => (
              <li key={slot.id} className="row">
                <div className="row__body">
                  <div className="row__title">
                    <strong>{slot.title}</strong>
                    <span className="tag" data-off={slot.enabled ? undefined : 'true'}>
                      {slot.enabled ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  <p className="row__meta">
                    {daySummary(slot.days)}, {slot.start} sampai {slot.end} | mode{' '}
                    {slot.mode === 'manual' ? 'manual' : 'otomatis'} | tiap {slot.intervalSec} detik | urutan{' '}
                    {slot.orderMode === 'random' ? 'acak' : 'mengikuti daftar'}
                  </p>
                </div>

                <div className="row__actions">
                  <details className="disclosure disclosure--inline">
                    <summary>Ubah</summary>
                    <form action={updateVocabSlot} className="field-grid">
                      <input type="hidden" name="id" value={slot.id} />
                      <label className="field field--wide">
                        <span>Nama slot</span>
                        <input name="title" defaultValue={slot.title} required />
                      </label>
                      <fieldset className="field field--wide field--checks">
                        <legend>Hari</legend>
                        {WEEK_DAYS.map((day) => (
                          <label key={day.value}>
                            <input
                              type="checkbox"
                              name="days"
                              value={day.value}
                              defaultChecked={slot.days.split(',').includes(day.value)}
                            />
                            <span>{day.label}</span>
                          </label>
                        ))}
                      </fieldset>
                      <label className="field">
                        <span>Mulai</span>
                        <input name="start" type="time" defaultValue={slot.start} required />
                      </label>
                      <label className="field">
                        <span>Selesai</span>
                        <input name="end" type="time" defaultValue={slot.end} required />
                      </label>
                      <label className="field">
                        <span>Mode putar</span>
                        <select name="mode" defaultValue={slot.mode}>
                          <option value="auto">Otomatis</option>
                          <option value="manual">Manual</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Interval, detik</span>
                        <input name="intervalSec" type="number" min={3} max={120} defaultValue={slot.intervalSec} />
                      </label>
                      <label className="field">
                        <span>Urutan kartu</span>
                        <select name="orderMode" defaultValue={slot.orderMode}>
                          <option value="sequential">Ikuti urutan daftar</option>
                          <option value="random">Acak</option>
                        </select>
                      </label>
                      <label className="field field--check">
                        <span>Aktif</span>
                        <input type="checkbox" name="enabled" value="on" defaultChecked={Boolean(slot.enabled)} />
                      </label>
                      <div className="field-grid__actions">
                        <SubmitButton pendingLabel="Menyimpan">Simpan slot</SubmitButton>
                      </div>
                    </form>
                  </details>

                  <form action={deleteVocabSlot}>
                    <input type="hidden" name="id" value={slot.id} />
                    <SubmitButton
                      pendingLabel="Menghapus"
                      confirmMessage={`Hapus slot "${slot.title}"? Kalau slot ini sedang tampil, papan langsung berhenti.`}
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
            Belum ada slot. Contoh yang sering dipakai: Halaqah malam, hari Senin sampai Kamis, 21:00 sampai
            21:15.
          </p>
        )}
      </section>

      <section className="panel" id="manual">
        <div className="panel__head">
          <h2>Kendali manual</h2>
          <p>
            Untuk waktu di luar jadwal, misalnya hafalan dadakan. Slot harus berstatus aktif dan mode putar
            Manual.
          </p>
        </div>

        {manualSlots.length ? (
          <ul className="rows">
            {manualSlots.map((slot) => {
              const isLive = live?.slotId === slot.id;
              return (
                <li key={slot.id} className="row">
                  <div className="row__body">
                    <div className="row__title">
                      <strong>{slot.title}</strong>
                      <span className="tag" data-off={isLive ? undefined : 'true'}>
                        {isLive ? 'Sedang tampil' : 'Belum tampil'}
                      </span>
                    </div>
                    <p className="row__meta">
                      Kartu {(isLive ? live.index : 0) + 1} dari {items.length}, jam {slot.start} sampai {slot.end}
                    </p>
                  </div>

                  <div className="row__actions">
                    <form action={stepManualVocab}>
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="direction" value="prev" />
                      <button
                        type="submit"
                        className="btn btn--quiet"
                        aria-label={`Tampilkan kartu sebelumnya di ${slot.title}`}
                      >
                        Sebelumnya
                      </button>
                    </form>
                    <form action={stepManualVocab}>
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="direction" value="next" />
                      <button
                        type="submit"
                        className="btn btn--quiet"
                        aria-label={`Tampilkan kartu berikutnya di ${slot.title}`}
                      >
                        Berikutnya
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">
            Tidak ada slot manual yang aktif. Ubah mode putar salah satu slot di atas menjadi Manual dan
            centang Aktif.
          </p>
        )}

        {live ? (
          <form action={stopManualVocab} className="field-grid">
            <div className="field-grid__actions">
              <SubmitButton pendingLabel="Menghentikan" variant="danger">
                Hentikan tampilan manual
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
