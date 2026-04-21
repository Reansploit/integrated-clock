import type { DisplayState, PrayerTimes } from '../types/signage';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json() as Promise<T>;
}

export const signageApi = {
  getDisplayState: () => request<DisplayState>('/display/state'),
  getPrayerToday: () => request<PrayerTimes>('/prayer-times/today'),
};
