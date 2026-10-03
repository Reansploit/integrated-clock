import {
  getEventSounds,
  getEvents,
  getMufrodat,
  getMufrodatVideos,
  getSettings,
  getTicker,
  getVocabItems,
  getVocabSlots,
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
  vocabItems: VocabItem[];
  vocabSlots: VocabSlot[];
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
  const [eventSounds, mufrodatVideos] = includeAdminData
    ? await Promise.all([getEventSounds(), getMufrodatVideos()])
    : await Promise.all([
        Promise.resolve([] as EventSoundItem[]),
        Promise.resolve([] as MufrodatVideoItem[]),
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
    vocabItems,
    vocabSlots,
  };
}
