'use server';

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { ensureDatabase, getDb, upsertSetting } from '@/lib/db';

const settingSchema = z.object({
  cityName: z.string().min(1).max(80),
  cityId: z.string().min(1).max(20),
  theme: z.string().min(1).max(40),
  runningText: z.string().max(300),
  enableAdhan: z.enum(['true', 'false']),
  bootAnimationUrl: z.string().max(500).optional(),
  introImageUrl: z.string().max(500).optional(),
  eventSoundUrl: z.string().max(500).optional(),
  adhanSoundUrl: z.string().max(500).optional(),
  sponsors: z.string().max(1000).optional(),
  backgroundImageUrl: z.string().max(500).optional(),
});

const eventSchema = z.object({
  title: z.string().min(1).max(120),
  day: z.string().min(1).max(20),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().optional().or(z.literal('')),
  soundUrl: z.string().max(500).optional().or(z.literal('')),
  note: z.string().optional().or(z.literal('')),
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
  arabic: z.string().min(1).max(120),
  translation: z.string().min(1).max(160),
});

const mufrodatVideoSettingsSchema = z.object({
  playbackMode: z.enum(['sequential', 'random']),
  scheduleTimes: z.string().max(1000),
});

const tickerSchema = z.object({
  items: z.string().min(1).max(2000),
});

const MAX_EVENT_SOUND_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
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

function requireDatabase() {
  ensureDatabase();
}

function redirectToAdminWithNotice(notice: string): never {
  redirect(`/admin?notice=${encodeURIComponent(notice)}`);
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

export async function stopMufrodatVideoPlayback() {
  requireDatabase();

  upsertSetting('mufrodatVideoUrl', '');
  upsertSetting('mufrodatVideoPlaybackNonce', '');
  upsertSetting('mufrodatVideoPlaybackRequestedAt', '');

  revalidatePath('/');
  revalidatePath('/admin');
}

function getJakartaDay() {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(new Date()).toLowerCase();
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

function normalizeImportTime(value: string) {
  const compact = value.trim().replace('.', ':');
  const parts = compact.split(':');
  if (parts.length !== 2) {
    return '';
  }

  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return '';
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return '';
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

export async function saveSettings(formData: FormData) {
  requireDatabase();

  const values = settingSchema.parse({
    cityName: String(formData.get('cityName') || ''),
    cityId: String(formData.get('cityId') || ''),
    theme: String(formData.get('theme') || ''),
    runningText: String(formData.get('runningText') || ''),
    enableAdhan: String(formData.get('enableAdhan') || 'false'),
    bootAnimationUrl: String(formData.get('bootAnimationUrl') || ''),
    introImageUrl: String(formData.get('introImageUrl') || ''),
    eventSoundUrl: String(formData.get('eventSoundUrl') || ''),
    adhanSoundUrl: String(formData.get('adhanSoundUrl') || ''),
    sponsors: String(formData.get('sponsors') || ''),
    backgroundImageUrl: String(formData.get('backgroundImageUrl') || ''),
  });

  const sql = getDb();
  for (const [key, value] of Object.entries(values)) {
    sql
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, String(value));
  }

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function uploadEventSound(formData: FormData) {
  requireDatabase();

  const payload = formData.get('eventSound');
  if (!(payload instanceof File)) {
    console.warn('Upload suara event gagal: file tidak valid.');
    revalidatePath('/admin');
    return;
  }

  if (!payload.size || payload.size > MAX_EVENT_SOUND_SIZE_BYTES) {
    console.warn('Upload suara event gagal: ukuran file tidak valid atau melebihi 20MB.');
    revalidatePath('/admin');
    return;
  }

  const originalName = sanitizeFileName(payload.name || 'event-sound.mp3', 'event-sound');
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedEventSoundExtensions.has(ext)) {
    console.warn('Upload suara event gagal: ekstensi file tidak didukung.');
    revalidatePath('/admin');
    return;
  }

  const uploadedMime = String(payload.type || '').toLowerCase();
  const fallbackMime = eventSoundMimeByExtension[ext] || 'application/octet-stream';
  const resolvedMime = uploadedMime && allowedEventSoundMimeTypes.has(uploadedMime) ? uploadedMime : fallbackMime;
  if (!resolvedMime.startsWith('audio/')) {
    console.warn('Upload suara event gagal: MIME type tidak didukung.');
    revalidatePath('/admin');
    return;
  }

  const buffer = Buffer.from(await payload.arrayBuffer());
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

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function createEvent(formData: FormData) {
  requireDatabase();

  const values = eventSchema.parse({
    title: String(formData.get('title') || ''),
    day: String(formData.get('day') || ''),
    start: String(formData.get('start') || ''),
    end: String(formData.get('end') || ''),
    soundUrl: String(formData.get('soundUrl') || ''),
    note: String(formData.get('note') || ''),
  });
  const normalizedSoundUrl = await normalizeEventSoundReference(values.soundUrl || '');

  getDb()
    .prepare('INSERT INTO events (title, day, start, end_time, sound_url, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(values.title, values.day, values.start, values.end || null, normalizedSoundUrl || null, values.note || null);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function deleteEvent(formData: FormData) {
  requireDatabase();

  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  getDb().prepare('DELETE FROM events WHERE id = ?').run(id);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function updateEvent(formData: FormData) {
  requireDatabase();

  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  const values = eventSchema.parse({
    title: String(formData.get('title') || ''),
    day: String(formData.get('day') || ''),
    start: String(formData.get('start') || ''),
    end: String(formData.get('end') || ''),
    soundUrl: String(formData.get('soundUrl') || ''),
    note: String(formData.get('note') || ''),
  });
  const normalizedSoundUrl = await normalizeEventSoundReference(values.soundUrl || '');

  getDb()
    .prepare(
      `UPDATE events SET title = ?, day = ?, start = ?, end_time = ?, sound_url = ?, note = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(values.title, values.day, values.start, values.end || null, normalizedSoundUrl || null, values.note || null, id);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function importEvents(formData: FormData) {
  requireDatabase();

  const raw = String(formData.get('eventsJson') || '').trim();
  if (!raw) return;

  const rawPayload = await resolveImportPayload(raw);
  const defaultDay = getJakartaDay();

  const normalizeJsonText = (value: string) =>
    value
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');

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
            return objectPayload.events || objectPayload.data || objectPayload.items || objectPayload.jadwal || [value];
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

  if (!payload.length) {
    console.warn('Import events skipped: no readable rows found.');
    revalidatePath('/admin');
    return;
  }

  const db = getDb();
  const insert = db.prepare('INSERT INTO events (title, day, start, end_time, sound_url, note) VALUES (?, ?, ?, ?, ?, NULL)');
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

  if (inserted === 0) {
    console.warn('Import events skipped: no valid rows found.');
  }

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function createMufrodat(formData: FormData) {
  requireDatabase();

  const values = mufrodatSchema.parse({
    arabic: String(formData.get('arabic') || ''),
    translation: String(formData.get('translation') || ''),
  });

  const sql = getDb();
  sql.prepare('INSERT INTO mufrodat (arabic, translation) VALUES (?, ?)').run(values.arabic, values.translation);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function deleteMufrodat(formData: FormData) {
  requireDatabase();

  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  getDb().prepare('DELETE FROM mufrodat WHERE id = ?').run(id);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function saveTicker(formData: FormData) {
  requireDatabase();

  const values = tickerSchema.parse({
    items: String(formData.get('items') || ''),
  });

  const items = values.items
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const db = getDb();
  db.prepare('DELETE FROM ticker_items').run();
  const insert = db.prepare('INSERT INTO ticker_items (text, sort_order) VALUES (?, ?)');
  for (const [index, text] of items.entries()) {
    insert.run(text, index + 1);
  }

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function saveMufrodatVideoSettings(formData: FormData) {
  requireDatabase();

  const values = mufrodatVideoSettingsSchema.parse({
    playbackMode: String(formData.get('playbackMode') || 'sequential'),
    scheduleTimes: String(formData.get('scheduleTimes') || ''),
  });

  const normalizedTimes = normalizeScheduleTimes(values.scheduleTimes);
  upsertSetting('mufrodatVideoPlaybackMode', values.playbackMode);
  upsertSetting('mufrodatVideoScheduleTimes', normalizedTimes.join(','));

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function uploadMufrodatVideo(formData: FormData) {
  try {
    requireDatabase();
    await ensureDatabase();

    const payload = formData.get('mufrodatVideo');
    if (!(payload instanceof File)) {
      redirectToAdminWithNotice('mufrodat-upload-no-file');
    }

    if (!payload.size || payload.size > MAX_VIDEO_SIZE_BYTES) {
      redirectToAdminWithNotice('mufrodat-upload-size-limit');
    }

    const originalName = sanitizeFileName(payload.name || 'mufrodat-video.mp4', 'mufrodat-video');
    const ext = path.extname(originalName).toLowerCase();
    if (!allowedVideoExtensions.has(ext)) {
      redirectToAdminWithNotice('mufrodat-upload-ext-invalid');
    }

    const mime = String(payload.type || '').toLowerCase();
    if (mime && !allowedVideoMimeTypes.has(mime)) {
      redirectToAdminWithNotice('mufrodat-upload-mime-invalid');
    }

    const nonce = randomUUID();
    const fileName = `${Date.now()}-${nonce}${ext}`;
    const relativePath = path.posix.join('videos', 'mufrodat', fileName);
    const destinationDir = path.join(process.cwd(), 'assets', 'videos', 'mufrodat');
    const destinationPath = path.join(destinationDir, fileName);

    await fs.mkdir(destinationDir, { recursive: true });
    const buffer = Buffer.from(await payload.arrayBuffer());
    await fs.writeFile(destinationPath, buffer);

    upsertSetting('mufrodatVideoUrl', `/assets/${relativePath}`);
    upsertSetting('mufrodatVideoPlaybackNonce', nonce);
    upsertSetting('mufrodatVideoPlaybackRequestedAt', new Date().toISOString());

    revalidatePath('/');
    revalidatePath('/admin');
    redirectToAdminWithNotice('mufrodat-upload-ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (message === 'NEXT_REDIRECT') {
      throw error;
    }
    console.error('Upload mufrodat video gagal:', error);
    redirectToAdminWithNotice('mufrodat-upload-failed');
  }
}

export async function uploadMufrodatVideoToPlaylist(formData: FormData) {
  requireDatabase();

  const payload = formData.get('mufrodatVideo');
  if (!(payload instanceof File)) {
    console.warn('Upload mufrodat video playlist gagal: file tidak valid.');
    revalidatePath('/admin');
    return;
  }

  if (!payload.size || payload.size > MAX_VIDEO_SIZE_BYTES) {
    console.warn('Upload mufrodat video playlist gagal: ukuran file tidak valid atau melebihi 100MB.');
    revalidatePath('/admin');
    return;
  }

  const originalName = sanitizeFileName(payload.name || 'mufrodat-video.mp4', 'mufrodat-video');
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedVideoExtensions.has(ext)) {
    console.warn('Upload mufrodat video playlist gagal: ekstensi file tidak didukung.');
    revalidatePath('/admin');
    return;
  }

  const mime = String(payload.type || '').toLowerCase();
  if (mime && !allowedVideoMimeTypes.has(mime)) {
    console.warn('Upload mufrodat video playlist gagal: MIME type tidak didukung.');
    revalidatePath('/admin');
    return;
  }

  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const relativePath = path.posix.join('videos', 'mufrodat', fileName);
  const destinationDir = path.join(process.cwd(), 'assets', 'videos', 'mufrodat');
  const destinationPath = path.join(destinationDir, fileName);

  await fs.mkdir(destinationDir, { recursive: true });
  const buffer = Buffer.from(await payload.arrayBuffer());
  await fs.writeFile(destinationPath, buffer);

  const db = getDb();
  const nextSortRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextSortOrder FROM mufrodat_videos').get() as { nextSortOrder: number };
  const nextSortOrder = Number(nextSortRow?.nextSortOrder || 1);
  const resolvedMime = mime && allowedVideoMimeTypes.has(mime) ? mime : videoMimeByExtension[ext] || 'video/mp4';

  db.prepare('INSERT INTO mufrodat_videos (original_name, relative_path, mime_type, size_bytes, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(originalName, relativePath, resolvedMime, buffer.length, nextSortOrder);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function deleteMufrodatVideo(formData: FormData) {
  requireDatabase();

  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return;
  }

  const db = getDb();
  const target = db.prepare('SELECT relative_path AS relativePath FROM mufrodat_videos WHERE id = ? LIMIT 1').get(id) as { relativePath: string } | undefined;
  if (!target?.relativePath) {
    return;
  }

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

  revalidatePath('/');
  revalidatePath('/admin');
}
