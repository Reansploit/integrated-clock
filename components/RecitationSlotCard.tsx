import { formatDuration, formatWindowLength, previewSlot, type RecitationItem, type RecitationSlot } from '@/lib/recitation';
import {
  addRecitationItem,
  deleteRecitationItem,
  deleteRecitationSlot,
  moveRecitationItem,
  updateRecitationSlot,
} from '@/app/admin/actions';
import { SubmitButton } from '@/components/SubmitButton';

const WEEK_DAYS = [
  { value: 'senin', label: 'Senin' },
  { value: 'selasa', label: 'Selasa' },
  { value: 'rabu', label: 'Rabu' },
  { value: 'kamis', label: 'Kamis' },
  { value: 'jumat', label: 'Jumat' },
  { value: 'sabtu', label: 'Sabtu' },
  { value: 'minggu', label: 'Minggu' },
] as const;

const KIND_LABELS = {
  matan: 'Matan',
  murottal: 'Murottal',
  adhan: 'Adzan',
} as const;

type SoundOption = {
  url: string;
  label: string;
};

type Props = {
  slot: RecitationSlot;
  items: RecitationItem[];
  durations: Record<string, number>;
  sounds: SoundOption[];
  page: number;
};

function selectedDays(slot: RecitationSlot) {
  return new Set(
    String(slot.days || '')
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean),
  );
}

function daySummary(slot: RecitationSlot) {
  const days = selectedDays(slot);
  if (!days.size) return 'Setiap hari';
  return WEEK_DAYS.filter((day) => days.has(day.value))
    .map((day) => day.label)
    .join(', ');
}

export function RecitationSlotCard({ slot, items, durations, sounds, page }: Props) {
  const plan = previewSlot(slot, items, durations);
  const days = selectedDays(slot);
  const usedWindow = plan.planned.reduce((max, entry) => Math.max(max, entry.endsAtSec), 0);
  const fillPercent = plan.windowSec > 0 ? Math.min(100, Math.round((usedWindow / plan.windowSec) * 100)) : 0;
  const droppedByItemId = new Map(plan.dropped.map((entry) => [entry.itemId, entry]));
  const overBy = plan.dropped.filter((entry) => entry.reason === 'too-long').reduce((max, entry) => Math.max(max, entry.overBySec), 0);

  return (
    <article className="slot" data-enabled={slot.enabled ? 'true' : 'false'}>
      <header className="slot__head">
        <div>
          <h3>{slot.label}</h3>
          <p className="slot__meta">
            {slot.startTime}–{slot.deadlineTime} · {daySummary(slot)} · jeda {slot.gapSec} dtk · toleransi{' '}
            {slot.graceMin} mnt
          </p>
        </div>
        <span className="slot__state" data-tone={plan.status === 'planned' ? 'ok' : 'warn'}>
          {slot.enabled ? 'Aktif' : 'Nonaktif'}
        </span>
      </header>

      <div className="slot__timeline" role="img" aria-label={`Isi jendela ${formatWindowLength(plan.windowSec)}, terpakai ${formatWindowLength(usedWindow)}`}>
        <div className="slot__timeline-track">
          <div className="slot__timeline-fill" style={{ width: `${fillPercent}%` }} />
        </div>
        <p className="slot__timeline-caption">
          Jendela {formatWindowLength(plan.windowSec)} · terpakai {formatWindowLength(usedWindow)}
          {plan.dropped.length
            ? ` · ${plan.dropped.length} file tidak bunyi`
            : ` · semua file muat`}
        </p>
      </div>

      {plan.status !== 'planned' ? <p className="slot__empty">{plan.reason}</p> : null}

      {items.length ? (
        <ol className="recitation-items">
          {items.map((item, index) => {
            const dropped = droppedByItemId.get(item.id);
            const plannedEntry = plan.planned.find((entry) => entry.itemId === item.id);
            const label = sounds.find((sound) => sound.url === item.url)?.label ?? item.url;
            const measured = durations[item.url] ?? item.durationMs;

            return (
              <li key={item.id} className="recitation-item" data-dropped={dropped ? 'true' : 'false'}>
                <div className="recitation-item__body">
                  <span className="recitation-item__order">{index + 1}</span>
                  <div>
                    <strong>{label}</strong>
                    <p className="recitation-item__meta">
                      {KIND_LABELS[item.kind]} ·{' '}
                      {measured > 0 ? (
                        formatDuration(measured)
                      ) : (
                        <span className="recitation-item__unknown">durasi belum diketahui</span>
                      )}
                      {plannedEntry
                        ? ` · mulai ${slot.startTime} +${plannedEntry.offsetSec}s, selesai +${plannedEntry.endsAtSec}s`
                        : null}
                    </p>
                    {dropped ? <p className="recitation-item__dropped">{dropped.detail}</p> : null}
                  </div>
                </div>

                <div className="recitation-item__actions">
                  <form action={moveRecitationItem}>
                    <input type="hidden" name="page" value={page} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      className="btn btn--quiet"
                      disabled={index === 0}
                      aria-label={`Naikkan ${label}`}
                    >
                      ↑
                    </button>
                  </form>
                  <form action={moveRecitationItem}>
                    <input type="hidden" name="page" value={page} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      className="btn btn--quiet"
                      disabled={index === items.length - 1}
                      aria-label={`Turunkan ${label}`}
                    >
                      ↓
                    </button>
                  </form>
                  <form action={deleteRecitationItem}>
                    <input type="hidden" name="page" value={page} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <SubmitButton pendingLabel="…" variant="danger">
                      Hapus
                    </SubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">Belum ada rekaman di slot ini. Tambahkan dari perpustakaan suara di bawah.</p>
      )}

      <form action={addRecitationItem} className="slot__add">
        <input type="hidden" name="page" value={page} />
        <input type="hidden" name="slotId" value={slot.id} />
        <label className="field">
          <span>Jenis</span>
          <select name="kind" defaultValue="matan">
            <option value="matan">Matan</option>
            <option value="murottal">Murottal</option>
            <option value="adhan">Adzan</option>
          </select>
        </label>
        <label className="field field--wide">
          <span>Rekaman</span>
          <select name="url" required defaultValue="">
            <option value="">Pilih file dari perpustakaan suara</option>
            {sounds.map((sound) => (
              <option key={sound.url} value={sound.url}>
                {sound.label}
                {durations[sound.url] ? ` · ${formatDuration(durations[sound.url])}` : ' · durasi belum diketahui'}
              </option>
            ))}
          </select>
        </label>
        <div className="field-grid__actions">
          <SubmitButton pendingLabel="Menambah">Tambah rekaman</SubmitButton>
        </div>
      </form>

      <details className="slot__edit">
        <summary>Ubah slot</summary>
        <form action={updateRecitationSlot} className="field-grid">
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="slotId" value={slot.id} />
          <label className="field">
            <span>Nama slot</span>
            <input name="label" defaultValue={slot.label} required />
          </label>
          <label className="field">
            <span>Mulai</span>
            <input name="startTime" defaultValue={slot.startTime} required placeholder="05:30" />
          </label>
          <label className="field">
            <span>Harus selesai sebelum</span>
            <input name="deadlineTime" defaultValue={slot.deadlineTime} required placeholder="06:15" />
          </label>
          <label className="field">
            <span>Jeda antar rekaman (detik)</span>
            <input name="gapSec" type="number" min={0} max={600} defaultValue={slot.gapSec} />
          </label>
          <label className="field">
            <span>Toleransi telat (menit)</span>
            <input name="graceMin" type="number" min={1} max={120} defaultValue={slot.graceMin} />
            <small>Kalau papan menyala lebih lambat dari ini, slot dianggap terlewat dan tidak dibunyikan.</small>
          </label>
          <fieldset className="field field--wide">
            <legend>Hari</legend>
            <div className="day-picker">
              {WEEK_DAYS.map((day) => (
                <label key={day.value} className="day-picker__day">
                  <input type="checkbox" name="days" value={day.value} defaultChecked={days.has(day.value)} />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
            <small>Tidak ada yang dicentang berarti setiap hari.</small>
          </fieldset>
          <label className="field">
            <span>Status</span>
            <select name="enabled" defaultValue={slot.enabled ? '1' : '0'}>
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </label>
          <div className="field-grid__actions">
            <SubmitButton pendingLabel="Menyimpan">Simpan slot</SubmitButton>
          </div>
        </form>

        <form action={deleteRecitationSlot} className="slot__danger">
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="slotId" value={slot.id} />
          <SubmitButton pendingLabel="…" variant="danger">
            Hapus slot ini beserta seluruh rekamannya
          </SubmitButton>
        </form>
      </details>

      {overBy > 0 ? (
        <p className="slot__warning">
          Jendela butuh {formatWindowLength(overBy)} lebih panjang agar semua rekaman bunyi.
        </p>
      ) : null}
    </article>
  );
}
