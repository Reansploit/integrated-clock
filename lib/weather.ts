import 'server-only';

const WONOSALAM_LAT = '-7.7089';
const WONOSALAM_LON = '112.3709';
const REQUEST_TIMEOUT_MS = 3000;
const FRESH_CACHE_MS = 30 * 60 * 1000;
const STALE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export type WeatherData = {
  temp: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
};

type WeatherCacheEntry = {
  data: WeatherData | null;
  fetchedAt: number;
};

const weatherCache = new Map<string, WeatherCacheEntry>();

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Cerah',
  1: 'Cerah Berawan',
  2: 'Berawan',
  3: 'Mendung',
  45: 'Berkabut',
  48: 'Kabut Es',
  51: 'Gerimis',
  53: 'Gerimis Sedang',
  55: 'Gerimis Lebat',
  56: 'Gerimis Beku',
  57: 'Gerimis Beku Lebat',
  61: 'Hujan Ringan',
  63: 'Hujan Sedang',
  65: 'Hujan Lebat',
  66: 'Hujan Beku',
  67: 'Hujan Beku Lebat',
  71: 'Salju Ringan',
  73: 'Salju Sedang',
  75: 'Salju Lebat',
  77: 'Butiran Salju',
  80: 'Hujan Deras',
  81: 'Hujan Lebat',
  82: 'Hujan Sangat Lebat',
  85: 'Hujan Salju',
  86: 'Hujan Salju Lebat',
  95: 'Badai Petir',
  96: 'Badai Petir & Hujan Es',
  99: 'Badai Petir & Hujan Es Lebat',
};

const WMO_ICONS: Record<number, string> = {
  0: '01d',
  1: '02d',
  2: '03d',
  3: '04d',
  45: '50d',
  48: '50d',
  51: '09d',
  53: '09d',
  55: '09d',
  56: '09d',
  57: '09d',
  61: '10d',
  63: '10d',
  65: '10d',
  66: '10d',
  67: '10d',
  71: '13d',
  73: '13d',
  75: '13d',
  77: '13d',
  80: '09d',
  81: '09d',
  82: '09d',
  85: '13d',
  86: '13d',
  95: '11d',
  96: '11d',
  99: '11d',
};

export async function getWeather(): Promise<WeatherData | null> {
  const cacheKey = `wonosalam:${WONOSALAM_LAT}:${WONOSALAM_LON}`;
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);

  if (cached && now - cached.fetchedAt <= FRESH_CACHE_MS) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${WONOSALAM_LAT}&longitude=${WONOSALAM_LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code`;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 900 },
    }).finally(() => {
      clearTimeout(timeout);
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      current?: {
        temperature_2m: number;
        relative_humidity_2m: number;
        apparent_temperature: number;
        weather_code: number;
      };
    };

    if (!data.current) {
      return null;
    }

    const code = data.current.weather_code;

    const result: WeatherData = {
      temp: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      humidity: data.current.relative_humidity_2m,
      description: WMO_DESCRIPTIONS[code] ?? '',
      icon: WMO_ICONS[code] ?? '',
    };

    weatherCache.set(cacheKey, { data: result, fetchedAt: now });
    return result;
  } catch {
    if (cached && now - cached.fetchedAt <= STALE_CACHE_MS) {
      return cached.data;
    }
    return null;
  }
}
