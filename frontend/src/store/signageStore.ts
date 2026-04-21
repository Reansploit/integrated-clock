import { create } from 'zustand';
import { signageApi } from '../api/client';
import type { DisplayState, MufrodatItem, SignageMode } from '../types/signage';

interface SignageStore {
  mode: SignageMode;
  state?: DisplayState;
  loading: boolean;
  apiHealthy: boolean;
  activeMufrodatIndex: number;
  setMode: (mode: SignageMode) => void;
  setActiveMufrodatIndex: (index: number) => void;
  poll: () => Promise<void>;
  currentMufrodat: () => MufrodatItem | undefined;
}

export const useSignageStore = create<SignageStore>((set, get) => ({
  mode: 'boot',
  state: undefined,
  loading: true,
  apiHealthy: true,
  activeMufrodatIndex: 0,
  setMode: (mode) => set({ mode }),
  setActiveMufrodatIndex: (activeMufrodatIndex) => set({ activeMufrodatIndex }),
  poll: async () => {
    try {
      const state = await signageApi.getDisplayState();
      set({ state, loading: false, apiHealthy: true });

      if (get().mode !== 'boot') {
        set({ mode: state.active_video ? 'video' : 'clock' });
      }
    } catch {
      set({ loading: false, apiHealthy: false });
    }
  },
  currentMufrodat: () => {
    const state = get().state;
    if (!state?.mufrodat.length) return undefined;
    return state.mufrodat[get().activeMufrodatIndex % state.mufrodat.length];
  },
}));
