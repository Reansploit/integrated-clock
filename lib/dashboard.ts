import {
  getEventSounds,
  getEvents,
  getMufrodat,
  getMufrodatVideos,
  getSettings,
  getStats,
  getTicker,
  getVocabItems,
  getVocabSlots,
  isDatabaseConfigured,
  normalizeDayOrder,
  type VocabItemRow,
  type VocabSlotRow,
} from '@/lib/db';

export type DashboardSettings = Awaited<ReturnType<typeof getSettings>>;
export type EventItem = Awaited<ReturnType<typeof getEvents>>[number];
export type EventSoundItem = Awaited<ReturnType<typeof getEventSounds>>[number];
export type MufrodatItem = Awaited<ReturnType<typeof getMufrodat>>[number];
export type MufrodatVideoItem = Awaited<ReturnType<typeof getMufrodatVideos>>[number];
export type VocabItem = VocabItemRow;
export type VocabSlot = VocabSlotRow;
export type DashboardData = {
  settings: DashboardSettings;
  events: EventItem[];
  eventSounds: EventSoundItem[];
  mufrodat: MufrodatItem[];
  mufrodatVideos: MufrodatVideoItem[];
  ticker: string[];
  stats: Awaited<ReturnType<typeof getStats>>;
  vocabItems: VocabItem[];
  vocabSlots: VocabSlot[];
  isDatabaseConfigured: boolean;
};

type GetDashboardDataOptions = {
  includeAdminData?: boolean;
};

export async function getDashboardData(options?: GetDashboardDataOptions): Promise<DashboardData> {
  const includeAdminData = options?.includeAdminData ?? false;
  const [settings, events, mufrodat, ticker, vocabItems, vocabSlots] = await Promise.all([
    getSettings(),
    getEvents(),
    getMufrodat(),
    getTicker(),
    getVocabItems(),
    getVocabSlots(),
  ]);
  const [eventSounds, mufrodatVideos, stats] = includeAdminData
    ? await Promise.all([getEventSounds(), getMufrodatVideos(), getStats()])
    : await Promise.all([
        Promise.resolve([] as EventSoundItem[]),
        Promise.resolve([] as MufrodatVideoItem[]),
        Promise.resolve({
          settings: 0,
          events: 0,
          mufrodat: 0,
          ticker: 0,
        }),
      ]);

  return {
    settings,
    events: [...events].sort((left, right) => {
      const leftOrder = normalizeDayOrder(left.day);
      const rightOrder = normalizeDayOrder(right.day);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.start.localeCompare(right.start);
    }),
    eventSounds,
    mufrodat,
    mufrodatVideos,
    ticker,
    stats,
    vocabItems,
    vocabSlots,
    isDatabaseConfigured: isDatabaseConfigured(),
  };
}
