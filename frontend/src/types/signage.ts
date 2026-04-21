export type SignageMode = 'boot' | 'clock' | 'video';

export interface MufrodatItem {
  id: number;
  arabic_word: string;
  translation: string;
  sort_order: number;
  is_active: boolean;
}

export interface EventItem {
  id: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
}

export interface MediaAsset {
  id: number;
  type: string;
  title?: string;
  path: string;
  duration_seconds?: number;
  start_time?: string;
  end_time?: string;
}

export interface PrayerTimes {
  imsak?: string;
  subuh?: string;
  dzuhur?: string;
  ashar?: string;
  maghrib?: string;
  isya?: string;
}

export interface DisplayState {
  server_time: string;
  theme: { mode: 'dark' | 'light' | 'auto' };
  boot_video?: MediaAsset;
  background: {
    image?: MediaAsset;
    video?: MediaAsset;
  };
  active_video?: MediaAsset;
  active_event?: EventItem;
  mufrodat: MufrodatItem[];
  prayer_times: PrayerTimes;
  night_mode: boolean;
}
