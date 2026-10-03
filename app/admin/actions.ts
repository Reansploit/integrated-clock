'use server';

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';

import { bumpRevision, ensureDatabase, getDb, upsertSetting } from '@/lib/db';
import { describeIssues, panelRedirect } from '@/lib/panel-notice';

const WEEK_DAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'] as const;

const citySchema = z.object({
  cityName: z.string().min(1, 'nama kota wajib diisi').max(80),
  cityId: z.string().min(1, 'id kota wajib diisi').max(20),
});

const displaySchema = z.object({
  eventSoundUrl: z.string().max(500),
  backgroundImageUrl: z.string().max(500),
});

const eventSchema = z.object({
  title: z.string().min(1, 'nama kegiatan wajib diisi').max(120),
  day: z.enum(WEEK_DAYS, { message: 'pilih salah satu hari' }),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'format jam harus HH:MM'),
  end: z.string().regex(/^(\d{2}:\d{2})?$/, 'format jam harus HH:MM'),
  soundUrl: z.string().max(500),
  note: z.string().max(500),
});

const importEventSchema = z.object({
  title: z.string().max(120).optional(),
  tittle: z.string().max(120).optional(),
  start: z.string().max(20),
  end: z.string().max(20).optional().or(z.literal('')),
  day: z.string().max(20).optional().or(z.literal('')),
  soundUrl: z.string().max(500).optional().or(z.literal('')),
  sound_url: z.string().max(500).optional().or(z.literal('')),
  sound: z.string().max(500).optional().or(z.literal('')),
  audio: z.string().max(500).optional().or(z.literal('')),
});

const mufrodatSchema = z.object({
  arabic: z.string().min(1, 'teks Arab wajib diisi').max(120),
  translation: z.string().min(1, 'arti wajib diisi').max(160),
});

const mufrodatVideoSettingsSchema = z.object({
  playbackMode: z.enum(['sequential', 'random']),
  scheduleTimes: z.string().max(1000),
});

const MAX_EVENT_SOUND_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_BACKGROUND_SIZE_BYTES = 10 * 1024 * 1024;
const allowedEventSoundExtensions = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac']);
const eventSoundMimeByExtension: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};
const allowedEventSoundMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/x-aac',
]);
const allowedVideoExtensions = new Set(['.mp4', '.webm']);
const videoMimeByExtension: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};
const allowedVideoMimeTypes = new Set(['video/mp4', 'video/webm']);
const allowedBackgroundExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const backgroundMimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const allowedBackgroundMimeTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * A rejected upload or a failed validation, kept apart from a crash so the
 * operator reads the reason instead of a generic failure line.
 */
class PanelError extends Error {
  constructor(
    readonly notice: string,
    readonly detail = '',
  ) {
    super(detail || notice);
  }
}

function back(notice: string, anchor: string, detail = '', formData?: FormData): never {
  panelRedirect('/admin', notice, { anchor, detail, page: readPageParam(formData) });
}

function requireDatabase() {
  ensureDatabase();
}

/**
 * The event list is paginated but every other section is not, so the current
 * page rides along in a hidden input on every form. Only values above 1 travel:
 * page 1 is the default URL and stays clean.
 */
function readPageParam(formData?: FormData): number | undefined {
  if (!formData) {
    return undefined;
  }
  const page = Number.parseInt(String(formData.get('page') ?? '1'), 10);
  return Number.isFinite(page) && page > 1 ? page : undefined;
}

/**
 * Every write funnels through here: run the work, and whether it succeeded or
 * was rejected, leave for the page with a notice and the section anchor so the
 * operator lands back where they were typing.
 *
 * Callers must `return guard(...)`. Started but not awaited, the work escapes
 * the action's call stack, the `redirect()` throw lands in a detached promise,
 * and the page reloads itself with no notice at all.
 */
async function guard(
  anchor: string,
  success: string,
  work: () => Promise<string | void> | string | void,
  formData?: FormData,
): Promise<never> {
  let detail = '';

  try {
    const result = await work();
    if (typeof result === 'string') {
      detail = result;
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof PanelError) {
      back(error.notice, anchor, error.detail, formData);
    }
    console.error('Aksi panel gagal:', error);
    back('write-failed', anchor, '', formData);
  }

  revalidatePath('/');
  revalidatePath('/admin');
  bumpRevision();
  back(success, anchor, detail, formData);
}

function readForm<T extends z.ZodTypeAny>(schema: T, formData: FormData, fields: string[]): z.infer<T> {
  const values = Object.fromEntries(fields.map((field) => [field, String(formData.get(field) ?? '')]));
  const result = schema.safeParse(values);

  if (result.success) {
    return result.data;
  }

  throw new PanelError('invalid', describeIssues(result.error.issues));
}

function sanitizeFileName(name: string, fallback = 'file') {
  const base = path.basename(name || fallback);
  return base.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
}

function normalizeClockTime(value: string) {
  const compact = value.trim().replace('.', ':');
  const match = compact.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return '';
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return '';
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return '';
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeScheduleTimes(raw: string) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const chunk of raw.split(/[\n,;]+/g)) {
    const normalized = normalizeClockTime(chunk);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result.sort((left, right) => left.localeCompare(right));
}

async function normalizeEventSoundReference(rawValue: string) {
  const value = rawValue.trim();
  if (!value) {
    return '';
  }

  if (/^\/api\/event-sounds\/\d+$/i.test(value)) {
    return value;
  }

  const filename = path.basename(value);
  if (!filename) {
    return value;
  }

  const row = getDb()
    .prepare('SELECT id FROM event_sounds WHERE lower(original_name) = lower(?) LIMIT 1')
    .get(filename) as { id: number } | undefined;
  const matchedId = Number(row?.id || 0);
  if (Number.isFinite(matchedId) && matchedId > 0) {
    return `/api/event-sounds/${matchedId}`;
  }

  return value;
}

async function acceptEventSoundFile(formData: FormData) {
  const payload = formData.get('eventSound');
  if (!(payload instanceof File) || !payload.size) {
    throw new PanelError('sound-no-file');
  }
  if (payload.size > MAX_EVENT_SOUND_SIZE_BYTES) {
    throw new PanelError('sound-too-large');
  }

  const originalName = sanitizeFileName(payload.name || 'suara.mp3', 'suara');
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedEventSoundExtensions.has(ext)) {
    throw new PanelError('sound-type-invalid');
  }

  const uploadedMime = String(payload.type || '').toLowerCase();
  const resolvedMime =
    uploadedMime && allowedEventSoundMimeTypes.has(uploadedMime)
      ? uploadedMime
      : eventSoundMimeByExtension[ext] || 'application/octet-stream';
  if (!resolvedMime.startsWith('audio/')) {
    throw new PanelError('sound-type-invalid');
  }

  return { originalName, ext, resolvedMime, buffer: Buffer.from(await payload.arrayBuffer()) };
}

async function acceptVideoFile(formData: FormData) {
  const payload = formData.get('mufrodatVideo');
  if (!(payload instanceof File) || !payload.size) {
    throw new PanelError('video-no-file');
  }
  if (payload.size > MAX_VIDEO_SIZE_BYTES) {
    throw new PanelError('video-too-large');
  }

  const originalName = sanitizeFileName(payload.name || 'video.mp4', 'video');
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedVideoExtensions.has(ext)) {
    throw new PanelError('video-type-invalid');
  }

  const mime = String(payload.type || '').toLowerCase();
  const resolvedMime =
    mime && allowedVideoMimeTypes.has(mime) ? mime : videoMimeByExtension[ext] || 'video/mp4';

  return { originalName, ext, resolvedMime, buffer: Buffer.from(await payload.arrayBuffer()) };
}

async function acceptBackgroundFile(formData: FormData) {
  const payload = formData.get('backgroundImage');
  if (!(payload instanceof File) || !payload.size) {
    throw new PanelError('background-no-file');
  }
  if (payload.size > MAX_BACKGROUND_SIZE_BYTES) {
    throw new PanelError('background-too-large');
  }

  const originalName = sanitizeFileName(payload.name || 'latar.png', 'latar');
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedBackgroundExtensions.has(ext)) {
    throw new PanelError('background-type-invalid');
  }

  const mime = String(payload.type || '').toLowerCase();
  const resolvedMime =
    mime && allowedBackgroundMimeTypes.has(mime) ? mime : backgroundMimeByExtension[ext] || 'image/png';

  return { originalName, ext, resolvedMime, buffer: Buffer.from(await payload.arrayBuffer()) };
}

async function writeBackgroundFile(buffer: Buffer, ext: string) {
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const relativePath = path.posix.join('backgrounds', fileName);
  const destinationDir = path.join(process.cwd(), 'assets', 'backgrounds');

  try {
    await fs.mkdir(destinationDir, { recursive: true });
    await fs.writeFile(path.join(destinationDir, fileName), buffer);
  } catch (error) {
    console.error('Gagal menulis file gambar latar:', error);
    throw new PanelError('background-write-failed');
  }

  return relativePath;
}

async function writeVideoFile(buffer: Buffer, ext: string) {
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const relativePath = path.posix.join('videos', 'mufrodat', fileName);
  const destinationDir = path.join(process.cwd(), 'assets', 'videos', 'mufrodat');

  try {
    await fs.mkdir(destinationDir, { recursive: true });
    await fs.writeFile(path.join(destinationDir, fileName), buffer);
  } catch (error) {
    console.error('Gagal menulis file video:', error);
    throw new PanelError('video-write-failed');
  }

  return relativePath;
}

function getJakartaDay() {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    timeZone: 'Asia/Jakarta',
  })
    .format(new Date())
    .toLowerCase();
}

function normalizeImportDay(day: string, fallback: string) {
  const normalized = day.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  const dayMap: Record<string, string> = {
    monday: 'senin',
    tuesday: 'selasa',
    wednesday: 'rabu',
    thursday: 'kamis',
    friday: 'jumat',
    saturday: 'sabtu',
    sunday: 'minggu',
    senin: 'senin',
    selasa: 'selasa',
    rabu: 'rabu',
    kamis: 'kamis',
    jumat: 'jumat',
    "jum'at": 'jumat',
    sabtu: 'sabtu',
    minggu: 'minggu',
  };

  return dayMap[normalized] ?? fallback;
}

function parseBracketScheduleTemplate(raw: string, fallbackDay: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results: Array<{ title: string; day: string; start: string; end: string; soundUrl?: string }> = [];
  let currentDay = fallbackDay;

  for (const line of lines) {
    const dayMatch = line.match(/^\[(.+)\]$/);
    if (dayMatch?.[1]) {
      currentDay = normalizeImportDay(dayMatch[1], fallbackDay);
      continue;
    }

    const eventMatch = line.match(/^(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})\s+(.+?)(?:\s*\|\s*(.+))?$/);
    if (!eventMatch) {
      continue;
    }

    const start = normalizeImportTime(eventMatch[1] || '');
    const end = normalizeImportTime(eventMatch[2] || '');
    const title = String(eventMatch[3] || '').trim();
    const soundUrl = String(eventMatch[4] || '').trim();
    if (!start || !end || !title) {
      continue;
    }

    results.push({
      title,
      day: currentDay,
      start,
      end,
      soundUrl: soundUrl || undefined,
    });
  }

  return results;
}

function normalizeImportTime(value: string) {
  return normalizeClockTime(value);
}

async function resolveImportPayload(raw: string) {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    return text;
  }

  if (!/\.json$/i.test(text)) {
    return text;
  }

  const assetsRoot = path.join(process.cwd(), 'assets');
  const normalized = text.replace(/^\/+/, '').replace(/^assets[\\/]/i, '');
  const targetPath = path.resolve(assetsRoot, normalized);
  if (!targetPath.startsWith(assetsRoot)) {
    return text;
  }

  try {
    return await fs.readFile(targetPath, 'utf8');
  } catch {
    return text;
  }
}

/** Called by the display itself once a one-off video has finished. Not a panel action. */
export async function clearMufrodatVideoPlayback(playbackNonce: string) {
  requireDatabase();

  const nonce = playbackNonce.trim();
  if (!nonce) {
    return;
  }

  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'mufrodatVideoPlaybackNonce' LIMIT 1")
    .get() as { value: string } | undefined;

  const activeNonce = String(row?.value || '').trim();
  if (!activeNonce || activeNonce !== nonce) {
    return;
  }

  upsertSetting('mufrodatVideoUrl', '');
  upsertSetting('mufrodatVideoPlaybackNonce', '');
  upsertSetting('mufrodatVideoPlaybackRequestedAt', '');

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function saveCitySettings(formData: FormData) {
  return guard('sholat', 'settings-saved', () => {
    requireDatabase();

    const values = readForm(citySchema, formData, ['cityName', 'cityId']);
    writeSettings(values);
  }, formData);
}

export async function saveDisplaySettings(formData: FormData) {
  return guard('layar', 'settings-saved', () => {
    requireDatabase();

    const values = readForm(displaySchema, formData, ['eventSoundUrl', 'backgroundImageUrl']);
    writeSettings(values);
  }, formData);
}

export async function clearBackgroundImage(formData: FormData) {
  return guard('layar', 'background-cleared', () => {
    requireDatabase();

    upsertSetting('backgroundImageUrl', '');
  }, formData);
}

function writeSettings(values: Record<string, string>) {
  const db = getDb();
  for (const [key, value] of Object.entries(values)) {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, String(value));
  }
}

export async function uploadBackgroundImage(formData: FormData) {
  return guard('layar', 'background-added', async () => {
    requireDatabase();

    const { buffer, ext } = await acceptBackgroundFile(formData);
    const relativePath = await writeBackgroundFile(buffer, ext);
    upsertSetting('backgroundImageUrl', `/assets/${relativePath}`);
  }, formData);
}

export async function saveTicker(formData: FormData) {
  return guard('ticker', 'ticker-saved', () => {
    requireDatabase();

    const raw = String(formData.get('items') ?? '');
    if (raw.length > 2000) {
      throw new PanelError('invalid', 'items (teks berjalan maksimal 2000 karakter)');
    }

    const items = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!items.length) {
      throw new PanelError('ticker-empty');
    }

    const db = getDb();
    db.prepare('DELETE FROM ticker_items').run();
    const insert = db.prepare('INSERT INTO ticker_items (text, sort_order) VALUES (?, ?)');
    for (const [index, text] of items.entries()) {
      insert.run(text, index + 1);
    }
  }, formData);
}

export async function uploadEventSound(formData: FormData) {
  return guard('suara', 'sound-added', async () => {
    requireDatabase();

    const { originalName, ext, resolvedMime, buffer } = await acceptEventSoundFile(formData);

    getDb()
      .prepare(
        `INSERT INTO event_sounds (original_name, mime_type, file_ext, size_bytes, audio_data)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(original_name) DO UPDATE SET
           mime_type = excluded.mime_type,
           file_ext = excluded.file_ext,
           size_bytes = excluded.size_bytes,
           audio_data = excluded.audio_data,
           updated_at = datetime('now')`,
      )
      .run(originalName, resolvedMime, ext, buffer.length, buffer);
  }, formData);
}

export async function createEvent(formData: FormData) {
  return guard('kegiatan', 'event-added', async () => {
    requireDatabase();

    const values = readForm(eventSchema, formData, ['title', 'day', 'start', 'end', 'soundUrl', 'note']);
    const normalizedSoundUrl = await normalizeEventSoundReference(values.soundUrl);

    getDb()
      .prepare('INSERT INTO events (title, day, start, end_time, sound_url, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(values.title, values.day, values.start, values.end || null, normalizedSoundUrl || null, values.note || null);
  }, formData);
}

export async function updateEvent(formData: FormData) {
  return guard('kegiatan', 'event-updated', async () => {
    requireDatabase();

    const id = readEventId(formData);
    const values = readForm(eventSchema, formData, ['title', 'day', 'start', 'end', 'soundUrl', 'note']);
    const normalizedSoundUrl = await normalizeEventSoundReference(values.soundUrl);

    getDb()
      .prepare(
        `UPDATE events SET title = ?, day = ?, start = ?, end_time = ?, sound_url = ?, note = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(values.title, values.day, values.start, values.end || null, normalizedSoundUrl || null, values.note || null, id);
  }, formData);
}

export async function deleteEvent(formData: FormData) {
  return guard('kegiatan', 'event-deleted', () => {
    requireDatabase();

    const id = readEventId(formData);
    const result = getDb().prepare('DELETE FROM events WHERE id = ?').run(id);
    if (!result.changes) {
      throw new PanelError('row-missing');
    }
  }, formData);
}

function readEventId(formData: FormData) {
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    throw new PanelError('row-missing');
  }
  return id;
}

export async function importEvents(formData: FormData) {
  return guard('kegiatan', 'events-imported', async () => {
    requireDatabase();

    const raw = String(formData.get('eventsJson') || '').trim();
    if (!raw) {
      throw new PanelError('events-import-empty', 'Isian impor masih kosong.');
    }

    const rawPayload = await resolveImportPayload(raw);
    const defaultDay = getJakartaDay();

    const normalizeJsonText = (value: string) =>
      value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1');

    const toPayload = (value: unknown): unknown[] =>
      Array.isArray(value)
        ? value
        : value && typeof value === 'object'
          ? (() => {
              const objectPayload = value as {
                events?: unknown[];
                data?: unknown[];
                items?: unknown[];
                jadwal?: unknown[];
              };
              return (
                objectPayload.events || objectPayload.data || objectPayload.items || objectPayload.jadwal || [value]
              );
            })()
          : [value];

    let payload: unknown[] = [];
    let parsedJson = false;

    try {
      payload = toPayload(JSON.parse(rawPayload));
      parsedJson = true;
    } catch {
      try {
        payload = toPayload(JSON.parse(normalizeJsonText(rawPayload)));
        parsedJson = true;
      } catch {
        payload = parseBracketScheduleTemplate(rawPayload, defaultDay);
      }
    }

    const db = getDb();
    const insert = db.prepare(
      'INSERT INTO events (title, day, start, end_time, sound_url, note) VALUES (?, ?, ?, ?, ?, NULL)',
    );
    let inserted = 0;

    for (const rawEntry of payload) {
      const parsedEntry = parsedJson
        ? importEventSchema.safeParse(rawEntry)
        : importEventSchema.safeParse({
            title: (rawEntry as { title?: string }).title,
            start: (rawEntry as { start?: string }).start,
            end: (rawEntry as { end?: string }).end,
            day: (rawEntry as { day?: string }).day,
            soundUrl: (rawEntry as { soundUrl?: string }).soundUrl,
          });

      if (!parsedEntry.success) {
        continue;
      }

      const entry = parsedEntry.data;
      const title = String(entry.title || entry.tittle || '').trim();
      const start = normalizeImportTime(String(entry.start || ''));
      const end = entry.end ? normalizeImportTime(String(entry.end)) : '';
      const day = normalizeImportDay(String(entry.day || ''), defaultDay);
      const soundUrl = await normalizeEventSoundReference(
        String(entry.soundUrl || entry.sound_url || entry.sound || entry.audio || '').trim(),
      );

      if (!title || !start) {
        continue;
      }

      insert.run(title, day, start, end || null, soundUrl || null);
      inserted += 1;
    }

    if (!inserted) {
      throw new PanelError('events-import-empty');
    }

    return `${inserted} baris masuk.`;
  }, formData);
}

export async function createMufrodat(formData: FormData) {
  return guard('mufrodat', 'mufrodat-added', () => {
    requireDatabase();

    const values = readForm(mufrodatSchema, formData, ['arabic', 'translation']);
    getDb().prepare('INSERT INTO mufrodat (arabic, translation) VALUES (?, ?)').run(values.arabic, values.translation);
  }, formData);
}

export async function deleteMufrodat(formData: FormData) {
  return guard('mufrodat', 'mufrodat-deleted', () => {
    requireDatabase();

    const id = readEventId(formData);
    const result = getDb().prepare('DELETE FROM mufrodat WHERE id = ?').run(id);
    if (!result.changes) {
      throw new PanelError('row-missing');
    }
  }, formData);
}

export async function saveMufrodatVideoSettings(formData: FormData) {
  return guard('video', 'video-settings-saved', () => {
    requireDatabase();

    const values = readForm(mufrodatVideoSettingsSchema, formData, ['playbackMode', 'scheduleTimes']);
    const normalizedTimes = normalizeScheduleTimes(values.scheduleTimes);

    upsertSetting('mufrodatVideoPlaybackMode', values.playbackMode);
    upsertSetting('mufrodatVideoScheduleTimes', normalizedTimes.join(','));
  }, formData);
}

/** Upload and play a single video on the board right now, outside the playlist. */
export async function playMufrodatVideoOnce(formData: FormData) {
  return guard('video', 'video-play-once', async () => {
    requireDatabase();

    const { ext, buffer } = await acceptVideoFile(formData);
    const relativePath = await writeVideoFile(buffer, ext);
    const nonce = randomUUID();

    upsertSetting('mufrodatVideoUrl', `/assets/${relativePath}`);
    upsertSetting('mufrodatVideoPlaybackNonce', nonce);
    upsertSetting('mufrodatVideoPlaybackRequestedAt', new Date().toISOString());
  }, formData);
}

export async function uploadMufrodatVideoToPlaylist(formData: FormData) {
  return guard('video', 'video-added', async () => {
    requireDatabase();

    const { originalName, ext, resolvedMime, buffer } = await acceptVideoFile(formData);
    const relativePath = await writeVideoFile(buffer, ext);

    const db = getDb();
    const nextSortRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextSortOrder FROM mufrodat_videos')
      .get() as { nextSortOrder: number };
    const nextSortOrder = Number(nextSortRow?.nextSortOrder || 1);

    db.prepare(
      'INSERT INTO mufrodat_videos (original_name, relative_path, mime_type, size_bytes, sort_order) VALUES (?, ?, ?, ?, ?)',
    ).run(originalName, relativePath, resolvedMime, buffer.length, nextSortOrder);
  }, formData);
}

export async function deleteMufrodatVideo(formData: FormData) {
  return guard('video', 'video-deleted', async () => {
    requireDatabase();

    const id = readEventId(formData);
    const target = getDb()
      .prepare('SELECT relative_path AS relativePath FROM mufrodat_videos WHERE id = ? LIMIT 1')
      .get(id) as { relativePath: string } | undefined;

    if (!target?.relativePath) {
      throw new PanelError('row-missing');
    }

    const db = getDb();
    db.prepare('DELETE FROM mufrodat_videos WHERE id = ?').run(id);
    db.exec(`
      UPDATE mufrodat_videos SET sort_order = (
        SELECT next_sort FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order ASC, id ASC) AS next_sort
          FROM mufrodat_videos
        ) AS ordered WHERE ordered.id = mufrodat_videos.id
      )
    `);

    const assetsRoot = path.join(process.cwd(), 'assets');
    const absoluteVideoPath = path.resolve(assetsRoot, target.relativePath);
    if (absoluteVideoPath.startsWith(assetsRoot)) {
      await fs.unlink(absoluteVideoPath).catch(() => undefined);
    }
  }, formData);
}

export async function stopMufrodatVideoPlayback(formData?: FormData) {
  return guard('video', 'video-stopped', () => {
    requireDatabase();

    upsertSetting('mufrodatVideoUrl', '');
    upsertSetting('mufrodatVideoPlaybackNonce', '');
    upsertSetting('mufrodatVideoPlaybackRequestedAt', '');
  }, formData);
}
