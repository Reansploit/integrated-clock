'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ensureDatabase, getDb } from '@/lib/db';
import { parseSlotDays, toMinutes } from '@/lib/vocab';
import { clearVocabLive, getVocabLive, setVocabLive } from '@/lib/vocab-live';

const itemSchema = z.object({
  english: z.string().max(160),
  arabic: z.string().max(160),
  meaning: z.string().max(300),
  exampleAr: z.string().max(300).optional().or(z.literal('')),
  exampleMeaning: z.string().max(300).optional().or(z.literal('')),
  audioUrl: z.string().max(500).optional().or(z.literal('')),
});

const slotSchema = z.object({
  title: z.string().min(1).max(120),
  days: z.string().max(200),
  start: z.string().regex(/^\d{1,2}:\d{2}$/),
  end: z.string().regex(/^\d{1,2}:\d{2}$/),
  mode: z.enum(['auto', 'manual']),
  intervalSec: z.coerce.number().min(3).max(120),
  orderMode: z.enum(['sequential', 'random']),
  enabled: z.enum(['on', 'off']).optional(),
});

function requireDb() {
  ensureDatabase();
}

function normalizeDays(raw: string) {
  const valid = new Set(['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu']);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const day of parseSlotDays(raw)) {
    if (valid.has(day) && !seen.has(day)) {
      seen.add(day);
      result.push(day);
    }
  }
  return result;
}

function revalidateVocab() {
  revalidatePath('/');
  revalidatePath('/control/vocab');
}

function resolveAudioUrl(formData: FormData) {
  const manual = String(formData.get('audioUrl') || '').trim();
  if (manual) return manual.slice(0, 500);
  return String(formData.get('audioPreset') || '').trim().slice(0, 500);
}

export async function createVocabItem(formData: FormData) {
  requireDb();
  const values = itemSchema.parse({
    english: String(formData.get('english') || ''),
    arabic: String(formData.get('arabic') || ''),
    meaning: String(formData.get('meaning') || ''),
    exampleAr: String(formData.get('exampleAr') || ''),
    exampleMeaning: String(formData.get('exampleMeaning') || ''),
    audioUrl: String(formData.get('audioUrl') || ''),
  });
  if (!values.english.trim() && !values.arabic.trim()) return;
  const audioUrl = resolveAudioUrl(formData);

  const db = getDb();
  const row = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM vocab_items').get() as {
    next: number;
  };
  db.prepare(
    'INSERT INTO vocab_items (english, arabic, meaning, example_ar, example_meaning, audio_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    values.english.trim(),
    values.arabic.trim(),
    values.meaning.trim(),
    String(values.exampleAr || '').trim(),
    String(values.exampleMeaning || '').trim(),
    audioUrl,
    Number(row?.next || 1),
  );
  revalidateVocab();
}

export async function updateVocabItem(formData: FormData) {
  requireDb();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  const values = itemSchema.parse({
    english: String(formData.get('english') || ''),
    arabic: String(formData.get('arabic') || ''),
    meaning: String(formData.get('meaning') || ''),
    exampleAr: String(formData.get('exampleAr') || ''),
    exampleMeaning: String(formData.get('exampleMeaning') || ''),
    audioUrl: String(formData.get('audioUrl') || ''),
  });
  getDb()
    .prepare(
      "UPDATE vocab_items SET english = ?, arabic = ?, meaning = ?, example_ar = ?, example_meaning = ?, audio_url = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(
      values.english.trim(),
      values.arabic.trim(),
      values.meaning.trim(),
      String(values.exampleAr || '').trim(),
      String(values.exampleMeaning || '').trim(),
      resolveAudioUrl(formData),
      id,
    );
  revalidateVocab();
}

export async function deleteVocabItem(formData: FormData) {
  requireDb();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  getDb().prepare('DELETE FROM vocab_items WHERE id = ?').run(id);
  revalidateVocab();
}

export async function moveVocabItem(formData: FormData) {
  requireDb();
  const id = Number(formData.get('id'));
  const direction = String(formData.get('direction') || '');
  if (!Number.isFinite(id) || (direction !== 'up' && direction !== 'down')) return;

  const db = getDb();
  const rows = db.prepare('SELECT id FROM vocab_items ORDER BY sort_order ASC, id ASC').all() as Array<{
    id: number;
  }>;
  const pos = rows.findIndex((row) => row.id === id);
  const swapPos = direction === 'up' ? pos - 1 : pos + 1;
  if (pos < 0 || swapPos < 0 || swapPos >= rows.length) return;

  const current = db.prepare('SELECT sort_order AS sortOrder FROM vocab_items WHERE id = ?').get(id) as {
    sortOrder: number;
  };
  const other = db.prepare('SELECT sort_order AS sortOrder FROM vocab_items WHERE id = ?').get(rows[swapPos].id) as {
    sortOrder: number;
  };
  db.prepare('UPDATE vocab_items SET sort_order = ? WHERE id = ?').run(other.sortOrder, id);
  db.prepare('UPDATE vocab_items SET sort_order = ? WHERE id = ?').run(current.sortOrder, rows[swapPos].id);
  revalidateVocab();
}

export async function createVocabSlot(formData: FormData) {
  requireDb();
  const days = formData.getAll('days').map(String).join(',');
  const parsed = slotSchema.safeParse({
    title: String(formData.get('title') || ''),
    days,
    start: String(formData.get('start') || ''),
    end: String(formData.get('end') || ''),
    mode: String(formData.get('mode') || 'auto'),
    intervalSec: String(formData.get('intervalSec') || '10'),
    orderMode: String(formData.get('orderMode') || 'sequential'),
    enabled: String(formData.get('enabled') || 'off'),
  });
  if (!parsed.success) return;
  const values = parsed.data;
  const daysList = normalizeDays(values.days);
  if (!daysList.length) return;
  if (toMinutes(values.start) === null || toMinutes(values.end) === null) return;

  getDb()
    .prepare(
      'INSERT INTO vocab_slots (title, days, start, end, mode, interval_sec, order_mode, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      values.title.trim(),
      daysList.join(','),
      values.start,
      values.end,
      values.mode,
      values.intervalSec,
      values.orderMode,
      values.enabled === 'on' ? 1 : 0,
    );
  revalidateVocab();
}

export async function updateVocabSlot(formData: FormData) {
  requireDb();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  const days = formData.getAll('days').map(String).join(',');
  const parsed = slotSchema.safeParse({
    title: String(formData.get('title') || ''),
    days,
    start: String(formData.get('start') || ''),
    end: String(formData.get('end') || ''),
    mode: String(formData.get('mode') || 'auto'),
    intervalSec: String(formData.get('intervalSec') || '10'),
    orderMode: String(formData.get('orderMode') || 'sequential'),
    enabled: String(formData.get('enabled') || 'off'),
  });
  if (!parsed.success) return;
  const values = parsed.data;
  const daysList = normalizeDays(values.days);
  if (!daysList.length) return;
  if (toMinutes(values.start) === null || toMinutes(values.end) === null) return;

  getDb()
    .prepare(
      "UPDATE vocab_slots SET title = ?, days = ?, start = ?, end = ?, mode = ?, interval_sec = ?, order_mode = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(
      values.title.trim(),
      daysList.join(','),
      values.start,
      values.end,
      values.mode,
      values.intervalSec,
      values.orderMode,
      values.enabled === 'on' ? 1 : 0,
      id,
    );
  revalidateVocab();
}

export async function deleteVocabSlot(formData: FormData) {
  requireDb();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  getDb().prepare('DELETE FROM vocab_slots WHERE id = ?').run(id);
  const live = getVocabLive();
  if (live?.slotId === id) {
    clearVocabLive();
  }
  revalidateVocab();
}

export async function stepManualVocab(formData: FormData) {
  requireDb();
  const slotId = Number(formData.get('slotId'));
  const direction = String(formData.get('direction') || 'next');
  if (!Number.isFinite(slotId)) return;

  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) AS c FROM vocab_items').get() as { c: number }).c;
  if (count === 0) return;

  const live = getVocabLive();
  const current = live?.slotId === slotId ? live.index : 0;
  const next = direction === 'prev' ? (current - 1 + count) % count : (current + 1) % count;
  setVocabLive({ slotId, index: next, nonce: `manual-${Date.now()}` });
  revalidatePath('/');
}

export async function stopManualVocab() {
  clearVocabLive();
  revalidatePath('/');
}
