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
import { uploadEventSound } from '@/app/admin/actions';

import { getEventSounds, getVocabItems, getVocabSlots } from '@/lib/db';
import { getVocabLive } from '@/lib/vocab-live';

export const dynamic = 'force-dynamic';

const DAY_OPTIONS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];

export default async function VocabControlPage() {
  const [items, slots, eventSounds] = await Promise.all([
    Promise.resolve(getVocabItems()),
    Promise.resolve(getVocabSlots()),
    Promise.resolve(getEventSounds()),
  ]);
  const live = getVocabLive();
  const manualSlots = slots.filter((slot) => slot.mode === 'manual' && slot.enabled);

  return (
    <main className="admin-page">
      <section className="admin-hero glass-panel">
        <div>
          <p className="eyebrow">Vocab Control</p>
          <h1>Kartu & jadwal tayang vocab</h1>
          <p className="hero-text">
            Isi kartu English / Arab / arti / contoh di sini. Atur jam tayang per hari di bawah;
            display otomatis fullscreen saat slot aktif. Mode manual bisa diNext/Prev dari sini.
          </p>
        </div>
        <div className="admin-status ok">
          <strong>{items.length} kartu • {slots.filter((slot) => slot.enabled).length} slot aktif</strong>
          <span>{manualSlots.length ? `Live manual: slot #${live?.slotId ?? '—'} index ${live?.index ?? '—'}` : 'Tidak ada slot manual aktif'}</span>
        </div>
      </section>

      <section className="admin-grid">
        <article className="admin-card glass-panel">
          <h2>Kartu Vocab</h2>
          <form action={createVocabItem} className="admin-form compact">
            <label>
              English
              <input name="english" placeholder="Prayer" />
            </label>
            <label>
              Arab
              <input name="arabic" placeholder="صَلَاة" dir="rtl" />
            </label>
            <label>
              Meaning
              <input name="meaning" placeholder="Shalat" />
            </label>
            <label>
              Contoh (Arab, opsional)
              <input name="exampleAr" placeholder="المثال" dir="rtl" />
            </label>
            <label>
              Arti contoh (opsional)
              <input name="exampleMeaning" placeholder="Meaning 2" />
            </label>
            <label>
              Audio dari library
              <select name="audioPreset" defaultValue="">
                <option value="">Tanpa audio</option>
                {eventSounds.map((sound) => (
                  <option key={sound.id} value={sound.soundUrl}>
                    {sound.originalName}
                  </option>
                ))}
              </select>
            </label>
            <details className="admin-edit-details">
              <summary className="admin-edit-summary">URL manual</summary>
              <label>
                Tempel URL audio sendiri (menang atas pilihan library)
                <input name="audioUrl" placeholder="/assets/audio/vocab/kata.mp3" />
              </label>
            </details>
            <button type="submit">Tambah kartu</button>
          </form>

          <div className="admin-list">
            {items.map((item) => (
              <div key={item.id} className="admin-list-item">
                <div className="admin-list-item__head">
                  <div>
                    <strong>{item.english || '—'} / {item.arabic || '—'}</strong>
                    <p>{item.meaning || '—'}</p>
                    {item.exampleAr || item.exampleMeaning ? (
                      <p>Contoh: {item.exampleAr} — {item.exampleMeaning}</p>
                    ) : null}
                    {item.audioUrl ? (
                      <p>
                        audio: {eventSounds.find((sound) => sound.soundUrl === item.audioUrl)?.originalName || item.audioUrl}
                      </p>
                    ) : null}
                    {item.audioUrl ? <audio controls preload="none" src={item.audioUrl} /> : null}
                  </div>
                  <div className="admin-list-item__actions">
                    <form action={moveVocabItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" aria-label={`Naikkan ${item.english}`}>↑</button>
                    </form>
                    <form action={moveVocabItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button type="submit" aria-label={`Turunkan ${item.english}`}>↓</button>
                    </form>
                    <details className="admin-edit-details">
                      <summary className="admin-edit-summary">Edit</summary>
                      <form action={updateVocabItem} className="admin-form compact admin-inline-edit-form">
                        <input type="hidden" name="id" value={item.id} />
                        <label>
                          English
                          <input name="english" defaultValue={item.english} />
                        </label>
                        <label>
                          Arab
                          <input name="arabic" defaultValue={item.arabic} dir="rtl" />
                        </label>
                        <label>
                          Meaning
                          <input name="meaning" defaultValue={item.meaning} />
                        </label>
                        <label>
                          Contoh (Arab)
                          <input name="exampleAr" defaultValue={item.exampleAr} dir="rtl" />
                        </label>
                        <label>
                          Arti contoh
                          <input name="exampleMeaning" defaultValue={item.exampleMeaning} />
                        </label>
                        <label>
                          Audio dari library
                          <select name="audioPreset" defaultValue={eventSounds.some((sound) => sound.soundUrl === item.audioUrl) ? item.audioUrl : ''}>
                            <option value="">Tanpa audio</option>
                            {eventSounds.map((sound) => (
                              <option key={sound.id} value={sound.soundUrl}>
                                {sound.originalName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <details className="admin-edit-details">
                          <summary className="admin-edit-summary">URL manual</summary>
                          <label>
                            Tempel URL audio sendiri (menang atas pilihan library)
                            <input
                              name="audioUrl"
                              defaultValue={eventSounds.some((sound) => sound.soundUrl === item.audioUrl) ? '' : item.audioUrl}
                              placeholder="/assets/audio/vocab/kata.mp3"
                            />
                          </label>
                        </details>
                        <button type="submit">Simpan</button>
                      </form>
                    </details>
                    <form action={deleteVocabItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="danger">Hapus</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!items.length ? <p className="fallback-note">Belum ada kartu. Tambahkan dulu lewat form di atas.</p> : null}
        </article>

        <article className="admin-card glass-panel">
          <h2>Jadwal Tayang (multi-slot)</h2>
          <form action={createVocabSlot} className="admin-form compact">
            <label>
              Nama slot
              <input name="title" placeholder="Halaqah Malam" required />
            </label>
            <fieldset className="admin-form compact">
              <legend>Hari</legend>
              {DAY_OPTIONS.map((day) => (
                <label key={day}>
                  <input type="checkbox" name="days" value={day} /> {day}
                </label>
              ))}
            </fieldset>
            <label>
              Mulai (HH:MM)
              <input name="start" placeholder="21:00" required />
            </label>
            <label>
              Selesai (HH:MM)
              <input name="end" placeholder="21:15" required />
            </label>
            <label>
              Mode putar
              <select name="mode" defaultValue="auto">
                <option value="auto">Auto (interval detik)</option>
                <option value="manual">Manual (Next/Prev dari sini)</option>
              </select>
            </label>
            <label>
              Interval auto (detik)
              <input name="intervalSec" type="number" min={3} max={120} defaultValue={10} />
            </label>
            <label>
              Urutan
              <select name="orderMode" defaultValue="sequential">
                <option value="sequential">Urut</option>
                <option value="random">Acak</option>
              </select>
            </label>
            <label>
              <input type="checkbox" name="enabled" value="on" defaultChecked /> Aktif
            </label>
            <button type="submit">Tambah slot</button>
          </form>

          <div className="admin-list">
            {slots.map((slot) => (
              <div key={slot.id} className="admin-list-item">
                <div className="admin-list-item__head">
                  <div>
                    <strong>{slot.title}</strong>
                    <p>{slot.days} • {slot.start}–{slot.end} • {slot.mode} • {slot.intervalSec}d • {slot.orderMode}</p>
                    <p>{slot.enabled ? 'Aktif' : 'Nonaktif'}</p>
                  </div>
                  <div className="admin-list-item__actions">
                    <details className="admin-edit-details">
                      <summary className="admin-edit-summary">Edit</summary>
                      <form action={updateVocabSlot} className="admin-form compact admin-inline-edit-form">
                        <input type="hidden" name="id" value={slot.id} />
                        <label>
                          Nama slot
                          <input name="title" defaultValue={slot.title} />
                        </label>
                        <fieldset className="admin-form compact">
                          <legend>Hari</legend>
                          {DAY_OPTIONS.map((day) => (
                            <label key={day}>
                              <input
                                type="checkbox"
                                name="days"
                                value={day}
                                defaultChecked={slot.days.split(',').includes(day)}
                              /> {day}
                            </label>
                          ))}
                        </fieldset>
                        <label>
                          Mulai (HH:MM)
                          <input name="start" defaultValue={slot.start} />
                        </label>
                        <label>
                          Selesai (HH:MM)
                          <input name="end" defaultValue={slot.end} />
                        </label>
                        <label>
                          Mode putar
                          <select name="mode" defaultValue={slot.mode}>
                            <option value="auto">Auto</option>
                            <option value="manual">Manual</option>
                          </select>
                        </label>
                        <label>
                          Interval auto (detik)
                          <input name="intervalSec" type="number" min={3} max={120} defaultValue={slot.intervalSec} />
                        </label>
                        <label>
                          Urutan
                          <select name="orderMode" defaultValue={slot.orderMode}>
                            <option value="sequential">Urut</option>
                            <option value="random">Acak</option>
                          </select>
                        </label>
                        <label>
                          <input type="checkbox" name="enabled" value="on" defaultChecked={slot.enabled} /> Aktif
                        </label>
                        <button type="submit">Simpan</button>
                      </form>
                    </details>
                    <form action={deleteVocabSlot}>
                      <input type="hidden" name="id" value={slot.id} />
                      <button type="submit" className="danger">Hapus</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!slots.length ? <p className="fallback-note">Belum ada slot. Contoh: Halaqah Malam 21:00–21:15.</p> : null}
        </article>

        <article className="admin-card glass-panel">
          <h2>Library Audio</h2>
          <form action={uploadEventSound} className="admin-form compact">
            <label>
              Upload suara (mp3/wav/ogg/m4a/aac, maks 20MB)
              <input name="eventSound" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac" required />
            </label>
            <p className="fallback-note">
              Nama mengikuti file asli. Upload ulang nama sama akan mengganti isi lama.
              Setelah upload, suara langsung bisa dipilih di dropdown kartu.
            </p>
            <button type="submit">Upload ke library</button>
          </form>

          {eventSounds.length ? (
            <div className="admin-list">
              {eventSounds.map((sound) => (
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
            <p className="fallback-note">Library masih kosong. Upload dulu, lalu dengarkan di sini sebelum dipasang ke kartu.</p>
          )}
        </article>

        <article className="admin-card glass-panel span-full">
          <h2>Kendali Manual</h2>
          {!manualSlots.length ? (
            <p className="fallback-note">Tidak ada slot manual yang aktif. Ubah slot ke mode manual untuk mengendalikan kartu dari sini.</p>
          ) : (
            <div className="admin-list">
              {manualSlots.map((slot) => (
                <div key={slot.id} className="admin-list-item">
                  <div className="admin-list-item__head">
                    <div>
                      <strong>{slot.title}</strong>
                      <p>Index live: {live?.slotId === slot.id ? live.index + 1 : '—'} / {items.length}</p>
                    </div>
                    <div className="admin-list-item__actions">
                      <form action={stepManualVocab}>
                        <input type="hidden" name="slotId" value={slot.id} />
                        <input type="hidden" name="direction" value="prev" />
                        <button type="submit">← Prev</button>
                      </form>
                      <form action={stepManualVocab}>
                        <input type="hidden" name="slotId" value={slot.id} />
                        <input type="hidden" name="direction" value="next" />
                        <button type="submit">Next →</button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form action={stopManualVocab} className="admin-form compact">
            <button type="submit" className="danger">Hentikan live manual</button>
          </form>
        </article>
      </section>

    </main>
  );
}
