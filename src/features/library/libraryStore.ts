import { create } from 'zustand';

import { getAppContainer } from '../../app/container/AppContainer';
import type { VideoSummary } from '../../core/model/media';
import type { FavoriteEntry, HistoryEntry } from '../../data/library/LibraryRepository';
import { useSettingsStore } from '../settings/settingsStore';

interface LibraryState {
  readonly history: readonly HistoryEntry[];
  readonly favorites: readonly FavoriteEntry[];
  readonly hydrated: boolean;

  hydrate: () => Promise<void>;
  recordWatch: (video: VideoSummary, positionSec: number) => Promise<void>;
  toggleFavorite: (video: VideoSummary) => Promise<void>;
  isFavorite: (uid: string) => boolean;
  /** Прогресс просмотра 0..1 для полоски на карточке. */
  progressOf: (video: VideoSummary) => number | undefined;
  clearHistory: () => Promise<void>;
  clearFavorites: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  history: [],
  favorites: [],
  hydrated: false,

  hydrate: async () => {
    const { library } = getAppContainer();
    const [history, favorites] = await Promise.all([
      library.loadHistory(),
      library.loadFavorites(),
    ]);
    set({ history, favorites, hydrated: true });
  },

  recordWatch: async (video, positionSec) => {
    const { historyEnabled, historyLimit } = useSettingsStore.getState().settings;
    if (!historyEnabled) {
      return;
    }
    const history = await getAppContainer().library.recordWatch(video, positionSec, historyLimit);
    set({ history });
  },

  toggleFavorite: async (video) => {
    const favorites = await getAppContainer().library.toggleFavorite(video);
    set({ favorites });
  },

  isFavorite: (uid) => get().favorites.some((entry) => entry.video.uid === uid),

  progressOf: (video) => {
    const entry = get().history.find((item) => item.video.uid === video.uid);
    if (!entry || !video.durationSec || video.durationSec <= 0) {
      return undefined;
    }
    return Math.min(1, entry.positionSec / video.durationSec);
  },

  clearHistory: async () => {
    await getAppContainer().library.clearHistory();
    set({ history: [] });
  },

  clearFavorites: async () => {
    await getAppContainer().library.clearFavorites();
    set({ favorites: [] });
  },
}));
