import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { ensureDatabase, getDb, upsertSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SETTINGS_KEYS = [
  'mufrodatVideoUrl',
  'mufrodatVideoPlaybackNonce',
  'mufrodatVideoPlaybackRequestedAt',
  'mufrodatVideoScheduleTimes',
  'mufrodatVideoPlaybackMode',
  'mufrodatVideoLastSlotKey',
  'mufrodatVideoPlaylistCursor',
] as const;

type SchedulerSettings = Partial<Record<(typeof SETTINGS_KEYS)[number], string>>;

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

function getJakartaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year') || '1970';
  const month = byType.get('month') || '01';
  const day = byType.get('day') || '01';
  const hour = byType.get('hour') || '00';
  const minute = byType.get('minute') || '00';
  return {
    dateKey: `${year}-${month}-${day}`,
    hhmm: `${hour}:${minute}`,
  };
}

function emptyPayload() {
  return NextResponse.json(
    { ok: true, videoUrl: '', playbackNonce: '' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  try {
    ensureDatabase();
    const db = getDb();
    const settingsRows = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const videos = db
      .prepare(
        `SELECT id, ('/assets/' || relative_path) AS videoUrl
         FROM mufrodat_videos
         ORDER BY sort_order ASC, id ASC`,
      )
      .all() as Array<{ id: number; videoUrl: string }>;

    const map: SchedulerSettings = {};
    for (const row of settingsRows) {
      if ((SETTINGS_KEYS as readonly string[]).includes(row.key)) {
        map[row.key as (typeof SETTINGS_KEYS)[number]] = row.value || '';
      }
    }
    const activeVideoUrl = String(map.mufrodatVideoUrl || '');
    const activePlaybackNonce = String(map.mufrodatVideoPlaybackNonce || '');
    if (activeVideoUrl && activePlaybackNonce) {
      return NextResponse.json(
        { ok: true, videoUrl: activeVideoUrl, playbackNonce: activePlaybackNonce },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!videos.length) {
      return emptyPayload();
    }

    const scheduleTimes = normalizeScheduleTimes(String(map.mufrodatVideoScheduleTimes || ''));
    if (!scheduleTimes.length) {
      return emptyPayload();
    }

    const { dateKey, hhmm } = getJakartaDateParts();
    if (!scheduleTimes.includes(hhmm)) {
      return emptyPayload();
    }

    const currentSlotKey = `${dateKey} ${hhmm}`;
    const lastSlotKey = String(map.mufrodatVideoLastSlotKey || '');
    if (lastSlotKey === currentSlotKey) {
      return emptyPayload();
    }

    const playbackMode = String(map.mufrodatVideoPlaybackMode || 'sequential') === 'random' ? 'random' : 'sequential';
    const currentCursor = Math.max(0, Number.parseInt(String(map.mufrodatVideoPlaylistCursor || '0'), 10) || 0);
    let pickedIndex = 0;

    if (playbackMode === 'random') {
      if (videos.length === 1) {
        pickedIndex = 0;
      } else {
        const previousIndex = currentCursor % videos.length;
        pickedIndex = Math.floor(Math.random() * videos.length);
        if (pickedIndex === previousIndex) {
          pickedIndex = (pickedIndex + 1) % videos.length;
        }
      }
    } else {
      pickedIndex = currentCursor % videos.length;
    }

    const nextCursor = playbackMode === 'random' ? pickedIndex : (pickedIndex + 1) % videos.length;
    const selected = videos[pickedIndex];
    const playbackNonce = randomUUID();

    upsertSetting('mufrodatVideoUrl', selected.videoUrl);
    upsertSetting('mufrodatVideoPlaybackNonce', playbackNonce);
    upsertSetting('mufrodatVideoPlaybackRequestedAt', new Date().toISOString());
    upsertSetting('mufrodatVideoLastSlotKey', currentSlotKey);
    upsertSetting('mufrodatVideoPlaylistCursor', String(nextCursor));

    return NextResponse.json(
      { ok: true, videoUrl: selected.videoUrl || '', playbackNonce: playbackNonce || '' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return emptyPayload();
  }
}
