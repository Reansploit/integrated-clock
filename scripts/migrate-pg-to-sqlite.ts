/**
 * Merge database lama (PostgreSQL) ke SQLite lokal tanpa menghapus data yang sudah ada.
 * Aturan gabung: baris yang sudah ada (berdasar kunci natural) dilewati, yang baru diinsert.
 * Settings dari PG menimpa key yang sama.
 *
 * Pakai:  PG_SOURCE_URL=postgresql://user:pass@host:5432/db npm run db:merge
 *          npm run db:merge -- --dry-run   (hanya hitung, tanpa menulis)
 */
import postgres from 'postgres';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

import { ensureDatabase, getDb } from '../lib/db';

const DRY_RUN = process.argv.includes('--dry-run');

type Counters = Record<string, { skipped: number; merged: number }>;

function blank(): Counters {
  return {
    settings: { skipped: 0, merged: 0 },
    events: { skipped: 0, merged: 0 },
    mufrodat: { skipped: 0, merged: 0 },
    ticker_items: { skipped: 0, merged: 0 },
    event_sounds: { skipped: 0, merged: 0 },
    mufrodat_videos: { skipped: 0, merged: 0 },
  };
}

async function readTable<T>(sql: ReturnType<typeof postgres>, table: string, query: string): Promise<T[]> {
  try {
    return (await sql.unsafe(query)) as T[];
  } catch (error) {
    console.warn(`  ! tabel PG "${table}" tidak terbaca, dilewati (${error instanceof Error ? error.message.split('\n')[0] : error})`);
    return [];
  }
}

async function main() {
  const source = process.env.PG_SOURCE_URL?.trim();
  if (!source) {
    console.error('PG_SOURCE_URL belum diisi. Contoh:\n  PG_SOURCE_URL=postgresql://user:pass@host:5432/db npm run db:merge');
    process.exitCode = 1;
    return;
  }

  console.log(`Menghubungi Postgres sumber...${DRY_RUN ? ' (DRY RUN, tanpa menulis)' : ''}`);
  const sql = postgres(source, { max: 2, connect_timeout: 15, prepare: false });
  try {
    await sql`SELECT 1`;
  } catch (error) {
    console.error(`Tidak bisa konek ke Postgres: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    process.exitCode = 1;
    return;
  }

  ensureDatabase();
  const db = getDb();
  const counters = blank();

  // 1. settings — PG menimpa key yang sama
  const pgSettings = await readTable<{ key: string; value: string }>(sql, 'settings', 'SELECT key, value FROM settings');
  if (!DRY_RUN) {
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    for (const row of pgSettings) {
      upsert.run(row.key, row.value);
      counters.settings.merged += 1;
    }
  } else {
    counters.settings.merged = pgSettings.length;
  }

  // 2. events — dedupe (title, day, start)
  const pgEvents = await readTable<{ title: string; day: string; start: string; end_time: string | null; sound_url: string | null; note: string | null }>(
    sql, 'events', 'SELECT title, day, start, end_time, sound_url, note FROM events',
  );
  const hasEvent = db.prepare('SELECT 1 FROM events WHERE title = ? AND day = ? AND start = ? LIMIT 1');
  const insertEvent = db.prepare('INSERT INTO events (title, day, start, end_time, sound_url, note) VALUES (?, ?, ?, ?, ?, ?)');
  for (const row of pgEvents) {
    if (hasEvent.get(row.title, row.day, row.start)) {
      counters.events.skipped += 1;
      continue;
    }
    counters.events.merged += 1;
    if (!DRY_RUN) insertEvent.run(row.title, row.day, row.start, row.end_time, row.sound_url, row.note);
  }

  // 3. mufrodat — dedupe (arabic, translation)
  const pgMufrodat = await readTable<{ arabic: string; translation: string }>(
    sql, 'mufrodat', 'SELECT arabic, translation FROM mufrodat',
  );
  const hasMufrodat = db.prepare('SELECT 1 FROM mufrodat WHERE arabic = ? AND translation = ? LIMIT 1');
  const insertMufrodat = db.prepare('INSERT INTO mufrodat (arabic, translation) VALUES (?, ?)');
  for (const row of pgMufrodat) {
    if (hasMufrodat.get(row.arabic, row.translation)) {
      counters.mufrodat.skipped += 1;
      continue;
    }
    counters.mufrodat.merged += 1;
    if (!DRY_RUN) insertMufrodat.run(row.arabic, row.translation);
  }

  // 4. ticker_items — dedupe (text)
  const pgTicker = await readTable<{ text: string }>(sql, 'ticker_items', 'SELECT text FROM ticker_items ORDER BY sort_order ASC, id ASC');
  const hasTicker = db.prepare('SELECT 1 FROM ticker_items WHERE text = ? LIMIT 1');
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM ticker_items').get() as { m: number };
  let nextSort = Number(maxSort?.m || 0) + 1;
  const insertTicker = db.prepare('INSERT INTO ticker_items (text, sort_order) VALUES (?, ?)');
  for (const row of pgTicker) {
    if (hasTicker.get(row.text)) {
      counters.ticker_items.skipped += 1;
      continue;
    }
    counters.ticker_items.merged += 1;
    if (!DRY_RUN) insertTicker.run(row.text, nextSort++);
  }

  // 5. event_sounds — upsert by original_name (termasuk BLOB audio)
  const pgSounds = await readTable<{ original_name: string; mime_type: string; file_ext: string; size_bytes: number; audio_data: Buffer }>(
    sql, 'event_sounds', 'SELECT original_name, mime_type, file_ext, size_bytes, audio_data FROM event_sounds',
  );
  const upsertSound = db.prepare(
    `INSERT INTO event_sounds (original_name, mime_type, file_ext, size_bytes, audio_data)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(original_name) DO UPDATE SET mime_type = excluded.mime_type, file_ext = excluded.file_ext,
       size_bytes = excluded.size_bytes, audio_data = excluded.audio_data, updated_at = datetime('now')`,
  );
  for (const row of pgSounds) {
    const exists = db.prepare('SELECT 1 FROM event_sounds WHERE original_name = ? LIMIT 1').get(row.original_name);
    if (exists) counters.event_sounds.skipped += 1;
    else counters.event_sounds.merged += 1;
    if (!DRY_RUN) {
      upsertSound.run(row.original_name, row.mime_type, row.file_ext, row.size_bytes, Buffer.from(row.audio_data));
    }
  }

  // 6. mufrodat_videos — metadata saja (file fisik harus dicopy manual, lihat pesan di bawah)
  const pgVideos = await readTable<{ original_name: string; relative_path: string; mime_type: string; size_bytes: number; sort_order: number }>(
    sql, 'mufrodat_videos', 'SELECT original_name, relative_path, mime_type, size_bytes, sort_order FROM mufrodat_videos ORDER BY sort_order ASC, id ASC',
  );
  const missingFiles: string[] = [];
  const upsertVideo = db.prepare(
    `INSERT INTO mufrodat_videos (original_name, relative_path, mime_type, size_bytes, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(relative_path) DO NOTHING`,
  );
  for (const row of pgVideos) {
    const exists = db.prepare('SELECT 1 FROM mufrodat_videos WHERE relative_path = ? LIMIT 1').get(row.relative_path);
    if (exists) {
      counters.mufrodat_videos.skipped += 1;
      continue;
    }
    counters.mufrodat_videos.merged += 1;
    if (!DRY_RUN) {
      upsertVideo.run(row.original_name, row.relative_path, row.mime_type, row.size_bytes, row.sort_order);
      const fs = await import('fs');
      const { default: path } = await import('path');
      if (!fs.existsSync(path.join(process.cwd(), 'assets', row.relative_path))) {
        missingFiles.push(row.relative_path);
      }
    }
  }

  await sql.end({ timeout: 5 }).catch(() => undefined);

  console.log('\nHasil gabung:');
  for (const [table, c] of Object.entries(counters)) {
    console.log(`  ${table}: ${c.merged} digabung, ${c.skipped} sudah ada (dilewati)`);
  }
  if (missingFiles.length) {
    console.log('\nFile video ini tercatat di DB tapi belum ada di assets/ — copy manual ke folder yang sama:');
    for (const file of missingFiles) console.log(`  - assets/${file}`);
  }
  if (DRY_RUN) console.log('\nDry run selesai, tidak ada yang ditulis.');
  else console.log('\nMerge selesai. Cek display + /admin + /control/vocab sebelum memakai.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
