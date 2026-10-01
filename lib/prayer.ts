type PrayerResponse = {
  shubuh?: string;
  subuh?: string;
  dzuhur?: string;
  dhuhur?: string;
  ashar?: string;
  maghrib?: string;
  isya?: string;
};

export type PrayerTimes = {
  subuh: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
};

export type PrayerKey = 'imsak' | 'subuh' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';

export type NextPrayer = {
  key: PrayerKey;
  label: string;
  time: string;
};

type PrayerCacheEntry = {
  data: PrayerTimes | null;
  fetchedAt: number;
};

const REQUEST_TIMEOUT_MS = 2500;
const FRESH_CACHE_MS = 60 * 60 * 1000;
const STALE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const prayerCache = new Map<string, PrayerCacheEntry>();

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizePrayerPayload(payload: unknown): PrayerTimes | null {
  const data = payload as {
    data?: {
      jadwal?: PrayerResponse;
    };
  };

  const jadwal = data?.data?.jadwal;
  if (!jadwal) return null;

  const subuh = jadwal.subuh || jadwal.shubuh || '';
  const dzuhur = jadwal.dzuhur || jadwal.dhuhur || '';
  const ashar = jadwal.ashar || '';
  const maghrib = jadwal.maghrib || '';
  const isya = jadwal.isya || '';

  if (![subuh, dzuhur, ashar, maghrib, isya].some(Boolean)) return null;

  return { subuh, dzuhur, ashar, maghrib, isya };
}

export function getImsakTime(prayerTimes: PrayerTimes | null) {
  if (!prayerTimes) {
    return null;
  }

  const subuhMinutes = toMinutes(prayerTimes.subuh);
  if (subuhMinutes === null) {
    return null;
  }

  return formatMinutes(Math.max(0, subuhMinutes - 15));
}

export async function getPrayerTimes(cityId: string): Promise<PrayerTimes | null> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const endpoint = `https://api.myquran.com/v2/sholat/jadwal/${cityId}/${today}`;
  const cacheKey = `${cityId}:${today}`;
  const now = Date.now();
  const cached = prayerCache.get(cacheKey);

  if (cached && now - cached.fetchedAt <= FRESH_CACHE_MS) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      signal: controller.signal,
      next: {
        revalidate: 900,
      },
    }).finally(() => {
      clearTimeout(timeout);
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    const normalized = normalizePrayerPayload(payload);
    prayerCache.set(cacheKey, { data: normalized, fetchedAt: now });
    return normalized;
  } catch {
    if (cached && now - cached.fetchedAt <= STALE_CACHE_MS) {
      return cached.data;
    }
    return null;
  }
}

function toMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getJakartaCurrentMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return hours * 60 + minutes;
}

export function getNextPrayer(
  prayerTimes: PrayerTimes | null,
  now = new Date(),
  options?: { includeImsak?: boolean },
): NextPrayer | null {
  if (!prayerTimes) {
    return null;
  }

  const currentMinutes = getJakartaCurrentMinutes(now);
  const subuhMinutes = toMinutes(prayerTimes.subuh);
  const order: Array<{ key: PrayerKey; label: string; time: string; minutes: number }> = [];
  const includeImsak = options?.includeImsak ?? true;

  if (subuhMinutes !== null && includeImsak) {
    order.push({
      key: 'imsak',
      label: 'Imsak',
      time: formatMinutes(Math.max(0, subuhMinutes - 15)),
      minutes: Math.max(0, subuhMinutes - 15),
    });
  }

  if (subuhMinutes !== null) {
    order.push({
      key: 'subuh',
      label: 'Fajr',
      time: prayerTimes.subuh,
      minutes: subuhMinutes,
    });
  }

  const dzuhurMinutes = toMinutes(prayerTimes.dzuhur);
  const asharMinutes = toMinutes(prayerTimes.ashar);
  const maghribMinutes = toMinutes(prayerTimes.maghrib);
  const isyaMinutes = toMinutes(prayerTimes.isya);

  if (dzuhurMinutes !== null) {
    order.push({ key: 'dzuhur', label: 'Dhuhr', time: prayerTimes.dzuhur, minutes: dzuhurMinutes });
  }

  if (asharMinutes !== null) {
    order.push({ key: 'ashar', label: 'Asr', time: prayerTimes.ashar, minutes: asharMinutes });
  }

  if (maghribMinutes !== null) {
    order.push({ key: 'maghrib', label: 'Maghrib', time: prayerTimes.maghrib, minutes: maghribMinutes });
  }

  if (isyaMinutes !== null) {
    order.push({ key: 'isya', label: 'Isha', time: prayerTimes.isya, minutes: isyaMinutes });
  }

  for (const entry of order) {
    if (entry.minutes > currentMinutes) {
      return { key: entry.key, label: entry.label, time: entry.time };
    }
  }

  return order[0] ? { key: order[0].key, label: order[0].label, time: order[0].time } : null;
}
