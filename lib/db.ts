import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

export type SettingRow = {
  key: string;
  value: string;
};

export type EventRow = {
  id: number;
  title: string;
  day: string;
  start: string;
  endTime: string | null;
  note: string | null;
  soundUrl: string | null;
};

export type MufrodatRow = {
  id: number;
  arabic: string;
  translation: string;
};

export type EventSoundRow = {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  soundUrl: string;
};

export type MufrodatVideoRow = {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  videoUrl: string;
  sortOrder: number;
  createdAt: string;
};

export type VocabItemRow = {
  id: number;
  english: string;
  arabic: string;
  meaning: string;
  exampleAr: string;
  exampleMeaning: string;
  audioUrl: string;
  sortOrder: number;
};

export type VocabSlotRow = {
  id: number;
  title: string;
  days: string;
  start: string;
  end: string;
  mode: 'auto' | 'manual';
  intervalSec: number;
  orderMode: 'sequential' | 'random';
  enabled: boolean;
};

export type DashboardSettings = {
  cityName: string;
  cityId: string;
  eventSoundUrl: string;
  backgroundImageUrl: string;
  languageWeek: 'arab' | 'english';
  mufrodatVideoUrl: string;
  mufrodatVideoPlaybackNonce: string;
  mufrodatVideoPlaybackRequestedAt: string;
  mufrodatVideoScheduleTimes: string;
  mufrodatVideoPlaybackMode: string;
  mufrodatVideoLastSlotKey: string;
  mufrodatVideoPlaylistCursor: string;
};

let db: DatabaseSync | null = null;
let bootstrapped = false;

function plain<T extends object>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

const defaultSettings: SettingRow[] = [
  { key: 'cityName', value: 'Jombang' },
  { key: 'cityId', value: '1608' },
  { key: 'eventSoundUrl', value: '' },
  { key: 'backgroundImageUrl', value: '' },
  { key: 'languageWeek', value: 'arab' },
  { key: 'mufrodatVideoUrl', value: '' },
  { key: 'mufrodatVideoPlaybackNonce', value: '' },
  { key: 'mufrodatVideoPlaybackRequestedAt', value: '' },
  { key: 'mufrodatVideoScheduleTimes', value: '09:00' },
  { key: 'mufrodatVideoPlaybackMode', value: 'sequential' },
  { key: 'mufrodatVideoLastSlotKey', value: '' },
  { key: 'mufrodatVideoPlaylistCursor', value: '0' },
];

const defaultEvents = [
  {
    title: 'Fajr Study Circle',
    day: 'senin',
    start: '05:15',
    endTime: '06:00',
    note: 'Every Monday morning',
    soundUrl: null,
  },
  {
    title: 'Youth Tajwid Class',
    day: 'rabu',
    start: '19:30',
    endTime: '20:45',
    note: 'Multipurpose hall',
    soundUrl: null,
  },
  {
    title: 'Blessed Friday Charity',
    day: 'jumat',
    start: '13:00',
    endTime: '14:00',
    note: 'For the neighborhood congregation',
    soundUrl: null,
  },
];

const defaultMufrodat = [
  { arabic: 'صَلَاة', translation: 'Prayer' },
  { arabic: 'مَسْجِد', translation: 'Mosque' },
  { arabic: 'عِلْم', translation: 'Knowledge' },
];

const defaultTicker = [
  'Welcome To Wonosalam Boarding School',
  'The Future Boarding School',
  'أهلًا وسهلًا في معهد وونوسالام الإسلامي',
];

const weekdayOrder = new Map([
  ['senin', 1],
  ['selasa', 2],
  ['rabu', 3],
  ['kamis', 4],
  ['jumat', 5],
  ['sabtu', 6],
  ['minggu', 7],
]);

export function getDbFilePath() {
  const configured = process.env.DB_FILE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), 'data', 'clock.db');
}

/**
 * The file mtime, not a hardcoded "connected". SQLite runs in WAL mode, so a
 * write lands in the `-wal` sibling first and the main file can lag behind by
 * minutes; the newest of the two is the honest answer to "when did my save
 * land".
 */
export function getDbWriteInfo() {
  const filePath = getDbFilePath();
  const candidates = [filePath, `${filePath}-wal`];
  const times = candidates
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => fs.statSync(candidate).mtimeMs);

  if (!times.length) {
    return null;
  }

  return {
    relativePath: path.relative(process.cwd(), filePath).split(path.sep).join('/'),
    modifiedAt: new Date(Math.max(...times)).toISOString(),
  };
}

export function getDb(): DatabaseSync {
  if (!db) {
    const filePath = getDbFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    db = new DatabaseSync(filePath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
  }
  return db;
}

function bootstrapDatabase() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      day TEXT NOT NULL,
      start TEXT NOT NULL,
      end_time TEXT,
      sound_url TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS event_sounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      file_ext TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      audio_data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS mufrodat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arabic TEXT NOT NULL,
      translation TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS mufrodat_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      relative_path TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS mufrodat_videos_sort_order_idx ON mufrodat_videos (sort_order, id);
    CREATE TABLE IF NOT EXISTS ticker_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vocab_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english TEXT NOT NULL DEFAULT '',
      arabic TEXT NOT NULL,
      meaning TEXT NOT NULL DEFAULT '',
      example_ar TEXT NOT NULL DEFAULT '',
      example_meaning TEXT NOT NULL DEFAULT '',
      audio_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vocab_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      days TEXT NOT NULL DEFAULT '',
      start TEXT NOT NULL DEFAULT '',
      end TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'auto',
      interval_sec INTEGER NOT NULL DEFAULT 10,
      order_mode TEXT NOT NULL DEFAULT 'sequential',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const upsert = database.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
  );
  for (const row of defaultSettings) {
    upsert.run(row.key, row.value);
  }

  const eventCount = (database.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c;
  if (eventCount === 0) {
    const insert = database.prepare(
      'INSERT INTO events (title, day, start, end_time, sound_url, note) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const row of defaultEvents) {
      insert.run(row.title, row.day, row.start, row.endTime, row.soundUrl, row.note);
    }
  }

  const mufrodatCount = (database.prepare('SELECT COUNT(*) AS c FROM mufrodat').get() as { c: number })
    .c;
  if (mufrodatCount === 0) {
    const insert = database.prepare('INSERT INTO mufrodat (arabic, translation) VALUES (?, ?)');
    for (const row of defaultMufrodat) {
      insert.run(row.arabic, row.translation);
    }
  }

  const tickerCount = (database.prepare('SELECT COUNT(*) AS c FROM ticker_items').get() as {
    c: number;
  }).c;
  if (tickerCount === 0) {
    const insert = database.prepare('INSERT INTO ticker_items (text, sort_order) VALUES (?, ?)');
    defaultTicker.forEach((text, index) => {
      insert.run(text, index + 1);
    });
  }

  const vocabCount = (database.prepare('SELECT COUNT(*) AS c FROM vocab_items').get() as { c: number })
    .c;
  if (vocabCount === 0) {
    const insert = database.prepare(
      'INSERT INTO vocab_items (english, arabic, meaning, example_ar, example_meaning, audio_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const seedVocab = [
      { english: 'Prayer', arabic: 'صَلَاة', meaning: 'Prayer', exampleAr: '', exampleMeaning: '' },
      { english: 'Mosque', arabic: 'مَسْجِد', meaning: 'Mosque', exampleAr: '', exampleMeaning: '' },
      { english: 'Knowledge', arabic: 'عِلْم', meaning: 'Knowledge', exampleAr: '', exampleMeaning: '' },
    ];
    seedVocab.forEach((row, index) => {
      insert.run(row.english, row.arabic, row.meaning, row.exampleAr, row.exampleMeaning, '', index + 1);
    });
  }

  const slotCount = (database.prepare('SELECT COUNT(*) AS c FROM vocab_slots').get() as { c: number })
    .c;
  if (slotCount === 0) {
    database
      .prepare(
        "INSERT INTO vocab_slots (title, days, start, end, mode, interval_sec, order_mode, enabled) VALUES ('Contoh Halaqah Malam', 'senin,selasa,rabu,kamis,jumat,sabtu,minggu', '21:00', '21:15', 'auto', 10, 'sequential', 0)",
      )
      .run();
  }
}

export function ensureDatabase() {
  if (!bootstrapped) {
    bootstrapDatabase();
    bootstrapped = true;
  }
  return true;
}

export function upsertSetting(key: string, value: string) {
  ensureDatabase();
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

/**
 * Board revision: bumped once per successful console write. The wall board
 * polls it and reloads itself when it moves, so no operator action on the
 * board tab is needed after a save. A counter, not a timestamp: two quick
 * saves in the same second must still count as two changes.
 */
export function getRevision(): number {
  ensureDatabase();
  const row = getDb().prepare("SELECT value FROM meta WHERE key = 'boardRevision'").get() as
    | { value: string }
    | undefined;
  const revision = Number.parseInt(row?.value ?? '0', 10);
  return Number.isFinite(revision) && revision >= 0 ? revision : 0;
}

export function bumpRevision(): number {
  const next = getRevision() + 1;
  getDb()
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('boardRevision', String(next));
  return next;
}

function getDefaultSettingValue(key: string) {
  return defaultSettings.find((row) => row.key === key)?.value ?? '';
}

function getDefaultDashboardSettings(): DashboardSettings {
  return {
    cityName: 'Jombang',
    cityId: '1608',
    eventSoundUrl: '',
    backgroundImageUrl: '',
    languageWeek: 'arab',
    mufrodatVideoUrl: '',
    mufrodatVideoPlaybackNonce: '',
    mufrodatVideoPlaybackRequestedAt: '',
    mufrodatVideoScheduleTimes: getDefaultSettingValue('mufrodatVideoScheduleTimes'),
    mufrodatVideoPlaybackMode: getDefaultSettingValue('mufrodatVideoPlaybackMode'),
    mufrodatVideoLastSlotKey: '',
    mufrodatVideoPlaylistCursor: getDefaultSettingValue('mufrodatVideoPlaylistCursor'),
  };
}

export function getSettings(): DashboardSettings {
  ensureDatabase();
  const rows = plain(getDb().prepare('SELECT key, value FROM settings').all() as SettingRow[]);
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    cityName: map.get('cityName') || 'Jombang',
    cityId: map.get('cityId') || '1608',
    eventSoundUrl: map.get('eventSoundUrl') || '',
    backgroundImageUrl: map.get('backgroundImageUrl') || '',
    languageWeek: map.get('languageWeek') === 'english' ? 'english' : 'arab',
    mufrodatVideoUrl: map.get('mufrodatVideoUrl') || '',
    mufrodatVideoPlaybackNonce: map.get('mufrodatVideoPlaybackNonce') || '',
    mufrodatVideoPlaybackRequestedAt: map.get('mufrodatVideoPlaybackRequestedAt') || '',
    mufrodatVideoScheduleTimes:
      map.get('mufrodatVideoScheduleTimes') || getDefaultSettingValue('mufrodatVideoScheduleTimes'),
    mufrodatVideoPlaybackMode:
      map.get('mufrodatVideoPlaybackMode') || getDefaultSettingValue('mufrodatVideoPlaybackMode'),
    mufrodatVideoLastSlotKey: map.get('mufrodatVideoLastSlotKey') || '',
    mufrodatVideoPlaylistCursor:
      map.get('mufrodatVideoPlaylistCursor') || getDefaultSettingValue('mufrodatVideoPlaylistCursor'),
  };
}

const EVENT_ORDER_SQL = `
  CASE lower(day)
    WHEN 'senin' THEN 1
    WHEN 'selasa' THEN 2
    WHEN 'rabu' THEN 3
    WHEN 'kamis' THEN 4
    WHEN 'jumat' THEN 5
    WHEN 'sabtu' THEN 6
    WHEN 'minggu' THEN 7
    ELSE 99
  END
`;

export function getEvents(): EventRow[] {
  ensureDatabase();
  return plain(
    getDb()
      .prepare(
        `SELECT id, title, day, start, end_time AS endTime, sound_url AS soundUrl, note
       FROM events
       ORDER BY ${EVENT_ORDER_SQL}, start ASC, id ASC`,
      )
      .all() as EventRow[],
  );
}

export function getMufrodat(): MufrodatRow[] {
  ensureDatabase();
  return plain(getDb().prepare('SELECT id, arabic, translation FROM mufrodat ORDER BY id ASC').all() as MufrodatRow[]);
}

export function getEventSounds(): EventSoundRow[] {
  ensureDatabase();
  const rows = plain(
    getDb()
      .prepare(
        `SELECT id, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes
       FROM event_sounds
       ORDER BY lower(original_name) ASC, id ASC`,
      )
      .all() as Array<{ id: number; originalName: string; mimeType: string; sizeBytes: number }>,
  );
  return rows.map((row) => ({ ...row, soundUrl: `/api/event-sounds/${row.id}` }));
}

export function getEventSoundData(id: number): { mimeType: string; sizeBytes: number; audioData: Buffer } | null {
  ensureDatabase();
  const row = getDb()
    .prepare('SELECT mime_type AS mimeType, size_bytes AS sizeBytes, audio_data AS audioData FROM event_sounds WHERE id = ? LIMIT 1')
    .get(id) as { mimeType: string; sizeBytes: number; audioData: Uint8Array } | undefined;
  if (!row?.audioData) return null;
  return { mimeType: row.mimeType, sizeBytes: row.sizeBytes, audioData: Buffer.from(row.audioData) };
}

export function getMufrodatVideos(): MufrodatVideoRow[] {
  ensureDatabase();
  return plain(
    getDb()
      .prepare(
        `SELECT id, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes,
              sort_order AS sortOrder, created_at AS createdAt,
              ('/assets/' || relative_path) AS videoUrl
       FROM mufrodat_videos
       ORDER BY sort_order ASC, id ASC`,
      )
      .all() as MufrodatVideoRow[],
  );
}

export function getTicker(): string[] {
  ensureDatabase();
  const rows = plain(
    getDb()
      .prepare('SELECT text FROM ticker_items ORDER BY sort_order ASC, id ASC')
      .all() as Array<{ text: string }>,
  );
  return rows.map((row) => row.text);
}

export function getStats(): { settings: number; events: number; mufrodat: number; ticker: number } {
  ensureDatabase();
  const database = getDb();
  const count = (table: string) =>
    (database.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
  return {
    settings: count('settings'),
    events: count('events'),
    mufrodat: count('mufrodat'),
    ticker: count('ticker_items'),
  };
}

export function getVocabItems(): VocabItemRow[] {
  ensureDatabase();
  return plain(
    getDb()
      .prepare(
        `SELECT id, english, arabic, meaning,
              example_ar AS exampleAr, example_meaning AS exampleMeaning,
              audio_url AS audioUrl, sort_order AS sortOrder
       FROM vocab_items
       ORDER BY sort_order ASC, id ASC`,
      )
      .all() as VocabItemRow[],
  );
}

export function getVocabSlots(): VocabSlotRow[] {
  ensureDatabase();
  const rows = plain(
    getDb()
      .prepare(
        `SELECT id, title, days, start, end, mode,
              interval_sec AS intervalSec, order_mode AS orderMode, enabled
       FROM vocab_slots
       ORDER BY start ASC, id ASC`,
      )
      .all() as Array<Omit<VocabSlotRow, 'mode' | 'orderMode' | 'enabled'> & {
      mode: string;
      orderMode: string;
      enabled: number;
    }>,
  );
  return rows.map((row) => ({
    ...row,
    mode: row.mode === 'manual' ? 'manual' : 'auto',
    orderMode: row.orderMode === 'random' ? 'random' : 'sequential',
    enabled: row.enabled === 1,
  }));
}

export function normalizeDayOrder(day: string) {
  return weekdayOrder.get(day.toLowerCase()) ?? 99;
}
