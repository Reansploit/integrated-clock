import type { VocabSlotRow } from '@/lib/db';

export type VocabSlot = VocabSlotRow;

export function parseSlotDays(days: string): string[] {
  return days
    .split(/[,;\n]+/g)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function toMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export type JakartaNow = {
  day: string;
  hhmm: string;
  minutes: number;
};

export function getJakartaNow(date = new Date()): JakartaNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const weekday = String(byType.get('weekday') || '').toLowerCase();
  const dayMap: Record<string, string> = {
    monday: 'senin',
    tuesday: 'selasa',
    wednesday: 'rabu',
    thursday: 'kamis',
    friday: 'jumat',
    saturday: 'sabtu',
    sunday: 'minggu',
  };
  const hour = Number(byType.get('hour') || '0');
  const minute = Number(byType.get('minute') || '0');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return {
    day: dayMap[weekday] || weekday,
    hhmm: `${hh}:${mm}`,
    minutes: hour * 60 + minute,
  };
}

function isNowInRange(nowMinutes: number, startMinutes: number, endMinutes: number) {
  if (endMinutes <= startMinutes) {
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

export function findActiveSlot(slots: VocabSlot[], now: JakartaNow): VocabSlot | null {
  const candidates = slots.filter((slot) => {
    if (!slot.enabled) return false;
    if (!parseSlotDays(slot.days).includes(now.day)) return false;
    const startMinutes = toMinutes(slot.start);
    const endMinutes = toMinutes(slot.end);
    if (startMinutes === null || endMinutes === null) return false;
    return isNowInRange(now.minutes, startMinutes, endMinutes);
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const startA = toMinutes(a.start) ?? 0;
    const startB = toMinutes(b.start) ?? 0;
    if (startA !== startB) return startB - startA;
    return b.id - a.id;
  });
  return candidates[0];
}

export function pickNextIndex(current: number, length: number, orderMode: 'sequential' | 'random'): number {
  if (length <= 1) return 0;
  if (orderMode === 'random') {
    let next = Math.floor(Math.random() * length);
    if (next === current % length) {
      next = (next + 1) % length;
    }
    return next;
  }
  return (current + 1) % length;
}
