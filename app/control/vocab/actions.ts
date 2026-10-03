'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';

import { bumpRevision, ensureDatabase, getDb } from '@/lib/db';
import { describeIssues, panelRedirect } from '@/lib/panel-notice';
import { parseSlotDays, toMinutes } from '@/lib/vocab';
import { clearVocabLive, getVocabLive, setVocabLive } from '@/lib/vocab-live';

const VOCAB_PATH = '/control/vocab';

const itemSchema = z.object({
  english: z.string().max(160),
  arabic: z.string().max(160),
  meaning: z.string().max(300),
  exampleAr: z.string().max(300).optional().or(z.literal('')),
  exampleMeaning: z.string().max(300).optional().or(z.literal('')),
  audioUrl: z.string().max(500).optional().or(z.literal('')),
});

const slotSchema = z.object({
  title: z.string().min(1, 'nama slot wajib diisi').max(120),
  days: z.string().max(200),
  start: z.string().regex(/^\d{1,2}:\d{2}$/, 'format jam harus HH:MM'),
  end: z.string().regex(/^\d{1,2}:\d{2}$/, 'format jam harus HH:MM'),
  mode: z.enum(['auto', 'manual']),
  intervalSec: z.coerce.number().min(3).max(120),
  orderMode: z.enum(['sequential', 'random']),
  enabled: z.enum(['on', 'off']).optional(),
});

class VocabPanelError extends Error {
  constructor(
    readonly notice: string,
    readonly detail = '',
  ) {
    super(detail || notice);
  }
}

function back(notice: string, anchor: string, detail = ''): never {
  panelRedirect(VOCAB_PATH, notice, { anchor, detail });
}

/**
 * See the note on the same helper in `app/admin/actions.ts`: callers must
 * `return guard(...)`, or the redirect never reaches the router.
 */
async function guard(anchor: string, success: string, work: () => Promise<void> | void): Promise<never> {
  try {
    await work();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof VocabPanelError) {
      back(error.notice, anchor, error.detail);
    }
    console.error('Aksi kosakata gagal:', error);
    back('write-failed', anchor);
  }

  revalidatePath('/');
  revalidatePath(VOCAB_PATH);
  bumpRevision();
  back(success, anchor);
}

function requireDb() {
  ensureDatabase();
}

function readId(formData: FormData) {
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    throw new VocabPanelError('row-missing');
  }
  return id;
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

function readItem(formData: FormData) {
  const result = itemSchema.safeParse({
    english: String(formData.get('english') || ''),
    arabic: String(formData.get('arabic') || ''),
    meaning: String(formData.get('meaning') || ''),
    exampleAr: String(formData.get('exampleAr') || ''),
    exampleMeaning: String(formData.get('exampleMeaning') || ''),
    audioUrl: String(formData.get('audioUrl') || ''),
  });

  if (!result.success) {
    throw new VocabPanelError('invalid', describeIssues(result.error.issues));
  }

  return result.data;
}

function readSlot(formData: FormData) {
  const result = slotSchema.safeParse({
    title: String(formData.get('title') || ''),
    days: formData.getAll('days').map(String).join(','),
    start: String(formData.get('start') || ''),
    end: String(formData.get('end') || ''),
    mode: String(formData.get('mode') || 'auto'),
    intervalSec: String(formData.get('intervalSec') || '10'),
    orderMode: String(formData.get('orderMode') || 'sequential'),
    enabled: String(formData.get('enabled') || 'off'),
  });

  if (!result.success) {
    throw new VocabPanelError('invalid', describeIssues(result.error.issues));
  }

  const daysList = normalizeDays(result.data.days);
  if (!daysList.length) {
    throw new VocabPanelError('invalid', 'days (centang minimal satu hari)');
  }
  if (toMinutes(result.data.start) === null || toMinutes(result.data.end) === null) {
    throw new VocabPanelError('invalid', 'start / end (jam harus HH:MM yang valid)');
  }

  return { ...result.data, daysList };
}

function resolveAudioUrl(formData: FormData) {
  const manual = String(formData.get('audioUrl') || '').trim();
  if (manual) return manual.slice(0, 500);
  return String(formData.get('audioPreset') || '').trim().slice(0, 500);
}

export async function createVocabItem(formData: FormData) {
  return guard('kartu', 'vocab-item-added', () => {
    requireDb();
    const values = readItem(formData);

    if (!values.english.trim() && !values.arabic.trim()) {
      throw new VocabPanelError('invalid', 'english / arabic (salah satu wajib diisi)');
    }

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
      resolveAudioUrl(formData),
      Number(row?.next || 1),
    );
  });
}

export async function updateVocabItem(formData: FormData) {
  return guard('kartu', 'vocab-item-updated', () => {
    requireDb();
    const id = readId(formData);
    const values = readItem(formData);

    const result = getDb()
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

    if (!result.changes) {
      throw new VocabPanelError('row-missing');
    }
  });
}

export async function deleteVocabItem(formData: FormData) {
  return guard('kartu', 'vocab-item-deleted', () => {
    requireDb();
    const id = readId(formData);
    const result = getDb().prepare('DELETE FROM vocab_items WHERE id = ?').run(id);

    if (!result.changes) {
      throw new VocabPanelError('row-missing');
    }
  });
}

export async function moveVocabItem(formData: FormData) {
  return guard('kartu', 'vocab-item-moved', () => {
    requireDb();
    const id = readId(formData);
    const direction = String(formData.get('direction') || '');
    if (direction !== 'up' && direction !== 'down') {
      throw new VocabPanelError('invalid', 'direction (harus up atau down)');
    }

    const db = getDb();
    const rows = db.prepare('SELECT id FROM vocab_items ORDER BY sort_order ASC, id ASC').all() as Array<{
      id: number;
    }>;
    const pos = rows.findIndex((row) => row.id === id);
    const swapPos = direction === 'up' ? pos - 1 : pos + 1;
    if (pos < 0) {
      throw new VocabPanelError('row-missing');
    }
    if (swapPos < 0 || swapPos >= rows.length) {
      throw new VocabPanelError('vocab-move-edge', `Kartu ini sudah di urutan ${direction === 'up' ? 'pertama' : 'terakhir'}.`);
    }

    const current = db.prepare('SELECT sort_order AS sortOrder FROM vocab_items WHERE id = ?').get(id) as {
      sortOrder: number;
    };
    const other = db.prepare('SELECT sort_order AS sortOrder FROM vocab_items WHERE id = ?').get(rows[swapPos].id) as {
      sortOrder: number;
    };
    db.prepare('UPDATE vocab_items SET sort_order = ? WHERE id = ?').run(other.sortOrder, id);
    db.prepare('UPDATE vocab_items SET sort_order = ? WHERE id = ?').run(current.sortOrder, rows[swapPos].id);
  });
}

export async function createVocabSlot(formData: FormData) {
  return guard('slot', 'vocab-slot-saved', () => {
    requireDb();
    const values = readSlot(formData);

    getDb()
      .prepare(
        'INSERT INTO vocab_slots (title, days, start, end, mode, interval_sec, order_mode, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        values.title.trim(),
        values.daysList.join(','),
        values.start,
        values.end,
        values.mode,
        values.intervalSec,
        values.orderMode,
        values.enabled === 'on' ? 1 : 0,
      );
  });
}

export async function updateVocabSlot(formData: FormData) {
  return guard('slot', 'vocab-slot-saved', () => {
    requireDb();
    const id = readId(formData);
    const values = readSlot(formData);

    const result = getDb()
      .prepare(
        "UPDATE vocab_slots SET title = ?, days = ?, start = ?, end = ?, mode = ?, interval_sec = ?, order_mode = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(
        values.title.trim(),
        values.daysList.join(','),
        values.start,
        values.end,
        values.mode,
        values.intervalSec,
        values.orderMode,
        values.enabled === 'on' ? 1 : 0,
        id,
      );

    if (!result.changes) {
      throw new VocabPanelError('row-missing');
    }
  });
}

export async function deleteVocabSlot(formData: FormData) {
  return guard('slot', 'vocab-slot-deleted', () => {
    requireDb();
    const id = readId(formData);
    const result = getDb().prepare('DELETE FROM vocab_slots WHERE id = ?').run(id);

    if (!result.changes) {
      throw new VocabPanelError('row-missing');
    }

    if (getVocabLive()?.slotId === id) {
      clearVocabLive();
    }
  });
}

export async function stepManualVocab(formData: FormData) {
  return guard('manual', 'vocab-live-set', () => {
    requireDb();
    const slotId = Number(formData.get('slotId'));
    const direction = String(formData.get('direction') || 'next');
    if (!Number.isFinite(slotId) || slotId <= 0) {
      throw new VocabPanelError('row-missing');
    }

    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) AS c FROM vocab_items').get() as { c: number }).c;
    if (count === 0) {
      throw new VocabPanelError('invalid', 'Kartu masih kosong, jadi belum ada yang bisa ditampilkan.');
    }

    const live = getVocabLive();
    const current = live?.slotId === slotId ? live.index : 0;
    const next = direction === 'prev' ? (current - 1 + count) % count : (current + 1) % count;
    setVocabLive({ slotId, index: next, nonce: `manual-${Date.now()}` });
  });
}

export async function stopManualVocab() {
  return guard('manual', 'vocab-live-stopped', () => {
    clearVocabLive();
  });
}
