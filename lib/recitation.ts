/**
 * Scheduled recitation: matan, murottal, or the adhan in a slot of its own.
 *
 * The deadline is a planning constraint, not a stop button. A run is laid out
 * before its first file sounds and only files that fit whole go on it, so a
 * recitation already playing is never paused, seeked or cut - it cannot stop
 * between two ayat. The failure mode is the other one: a file that never
 * starts, listed with its reason in the console days before the slot arrives.
 *
 * Pure module - no database, no clock read beyond the Date the caller passes -
 * so the console lays out a slot with exactly the code the board will run.
 */

const JAKARTA_TIME_ZONE = 'Asia/Jakarta';
const JAKARTA_OFFSET_GUESS_MS = 7 * 3600_000;

export const RECITATION_KINDS = ['matan', 'murottal', 'adhan'] as const;
export type RecitationKind = (typeof RECITATION_KINDS)[number];

export const RECITATION_RUN_STATUSES = ['planned', 'running', 'done', 'missed', 'empty', 'overrun', 'skipped'] as const;
export type RecitationRunStatus = (typeof RECITATION_RUN_STATUSES)[number];

export type RecitationSlot = {
  id: number;
  label: string;
  startTime: string;
  deadlineTime: string;
  days: string;
  gapSec: number;
  graceMin: number;
  enabled: boolean;
  sortOrder: number;
};

export type RecitationItem = {
  id: number;
  slotId: number;
  kind: RecitationKind;
  url: string;
  durationMs: number;
  sortOrder: number;
};

export type PlannedRecitation = {
  itemId: number;
  kind: RecitationKind;
  url: string;
  durationMs: number;
  /** Seconds from the window open; the board walks these in order. */
  offsetSec: number;
  /** Seconds from the window open when the audio is expected to end. */
  endsAtSec: number;
};

export type DroppedRecitation = {
  itemId: number;
  url: string;
  kind: RecitationKind;
  reason: 'no-duration' | 'too-long';
  /** Operator-facing, Indonesian, one sentence. */
  detail: string;
  /** Seconds past the deadline; only set for `too-long`. */
  overBySec: number;
};

export type RecitationPlan = {
  status: 'planned' | 'missed' | 'empty';
  reason: string;
  planned: PlannedRecitation[];
  dropped: DroppedRecitation[];
  windowSec: number;
};

export type SlotWindow = {
  startMs: number;
  deadlineMs: number;
  windowSec: number;
};

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallClockAt(date: Date): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JAKARTA_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number(byType.get('hour') || '0');

  return {
    year: Number(byType.get('year')),
    month: Number(byType.get('month')),
    day: Number(byType.get('day')),
    // Intl hands back 24 for midnight under hour12: false, which would roll the
    // date key over a day.
    hour: hour === 24 ? 0 : hour,
    minute: Number(byType.get('minute')),
    second: Number(byType.get('second')),
  };
}

function jakartaOffsetMs(date: Date): number {
  const wall = wallClockAt(date);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Epoch for a Jakarta wall clock. Jakarta runs UTC+7 with no daylight saving,
 * so one offset sample taken at the first guess settles it; the second pass is
 * a guard for the day the zone ever gains a rule.
 */
function wallClockToEpoch(dateKey: string, hhmm: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);

  const offset = jakartaOffsetMs(new Date(naive - JAKARTA_OFFSET_GUESS_MS));
  const corrected = naive - offset;
  const verified = jakartaOffsetMs(new Date(corrected));

  return verified === offset ? corrected : naive - verified;
}

export function normalizeClockTime(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function jakartaDateKey(date: Date): string {
  const wall = wallClockAt(date);
  return `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}

export function jakartaDayName(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TIME_ZONE,
    weekday: 'long',
  })
    .format(date)
    .toLowerCase();
}

/** An empty day list runs every day, matching how the event list reads. */
export function isScheduledDay(days: string, date: Date): boolean {
  const list = String(days || '')
    .split(/[\s,;]+/)
    .map((day) => day.trim().toLowerCase())
    .filter(Boolean);

  if (!list.length) return true;
  return list.includes(jakartaDayName(date));
}

/**
 * A deadline at or before the start means the slot is allowed to run past
 * midnight - Isha recitation finishing at 00:10 reads as `19:10` -> `00:10`.
 */
export function resolveSlotWindow(slot: Pick<RecitationSlot, 'startTime' | 'deadlineTime'>, now: Date): SlotWindow {
  const dateKey = jakartaDateKey(now);
  const startMs = wallClockToEpoch(dateKey, slot.startTime);
  let deadlineMs = wallClockToEpoch(dateKey, slot.deadlineTime);

  if (deadlineMs <= startMs) {
    deadlineMs += 24 * 3600_000;
  }

  return { startMs, deadlineMs, windowSec: Math.round((deadlineMs - startMs) / 1000) };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}j ${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatWindowLength(seconds: number): string {
  return formatDuration(seconds * 1000);
}

type PlanRunInput = {
  slot: RecitationSlot;
  items: RecitationItem[];
  /** Measured durations keyed by URL; a missing entry means "not measured yet". */
  durations: Record<string, number>;
  now: Date;
};

/**
 * Lay out one run. The gap only sits between two recordings, never after the
 * last one, so a recitation that ends exactly on the deadline still plays.
 */
export function planRun({ slot, items, durations, now }: PlanRunInput): RecitationPlan {
  const window = resolveSlotWindow(slot, now);
  const empty = (status: RecitationPlan['status'], reason: string): RecitationPlan => ({
    status,
    reason,
    planned: [],
    dropped: [],
    windowSec: window.windowSec,
  });

  const graceMs = Math.max(0, slot.graceMin) * 60_000;
  if (now.getTime() < window.startMs) {
    return empty('planned', 'Jendela belum dibuka.');
  }

  const lateBySec = Math.round((now.getTime() - window.startMs) / 1000);
  if (lateBySec > graceSec(graceMs)) {
    return empty(
      'missed',
      `Papan hidup ${formatWindowLength(lateBySec)} setelah mulai, lewat toleransi ${slot.graceMin} menit.`,
    );
  }

  const ordered = [...items].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const gapSec = Math.max(0, slot.gapSec);
  const planned: PlannedRecitation[] = [];
  const dropped: DroppedRecitation[] = [];
  let cursorMs = window.startMs;

  for (const item of ordered) {
    const durationMs = measuredDuration(item, durations);
    if (durationMs <= 0) {
      dropped.push({
        itemId: item.id,
        url: item.url,
        kind: item.kind,
        reason: 'no-duration',
        detail: 'Durasi belum diketahui, jadi tidak dimasukkan. Ukur dulu di konsol.',
        overBySec: 0,
      });
      continue;
    }

    const contentEndMs = cursorMs + durationMs;
    if (contentEndMs > window.deadlineMs) {
      const overBySec = Math.round((contentEndMs - window.deadlineMs) / 1000);
      dropped.push({
        itemId: item.id,
        url: item.url,
        kind: item.kind,
        reason: 'too-long',
        detail: `Butuh ${formatDuration(durationMs + gapSec * 1000)}, jendela tinggal ${formatWindowLength(
          Math.max(0, Math.round((window.deadlineMs - cursorMs) / 1000)),
        )}.`,
        overBySec,
      });
      continue;
    }

    planned.push({
      itemId: item.id,
      kind: item.kind,
      url: item.url,
      durationMs,
      offsetSec: Math.round((cursorMs - window.startMs) / 1000),
      endsAtSec: Math.round((contentEndMs - window.startMs) / 1000),
    });

    cursorMs = contentEndMs + gapSec * 1000;
  }

  if (!planned.length) {
    return empty('empty', 'Tidak ada file yang muat di jendela ini.');
  }

  return {
    status: 'planned',
    reason: '',
    planned,
    dropped,
    windowSec: window.windowSec,
  };
}

function graceSec(graceMs: number): number {
  return Math.round(graceMs / 1000);
}

function measuredDuration(item: RecitationItem, durations: Record<string, number>): number {
  const measured = Number(durations[item.url] ?? 0);
  if (Number.isFinite(measured) && measured > 0) return measured;

  const stored = Number(item.durationMs ?? 0);
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

/**
 * What the console draws: the same layout the board will play, laid out as if
 * the slot opened on time. The operator sees the misses before the day comes.
 */
export function previewSlot(slot: RecitationSlot, items: RecitationItem[], durations: Record<string, number>): RecitationPlan {
  const window = resolveSlotWindow(slot, new Date());
  return planRun({ slot, items, durations, now: new Date(window.startMs) });
}
