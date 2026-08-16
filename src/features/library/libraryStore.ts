import { useMemo } from 'react';
import { create } from 'zustand';

import { getAppContainer } from '../../app/container/AppContainer';
import type { VideoSummary } from '../../core/model/media';
import {
  mergeWatch,
  type FavoriteEntry,
  type HistoryEntry,
} from '../../data/library/LibraryRepository';
import { useSettingsStore } from '../settings/settingsStore';

/**
 * Как часто позиция просмотра доезжает до диска.
 *
 * Плеер зовёт {@link LibraryState.noteProgress} несколько раз в секунду.
 * Писать журнал целиком на каждый тик — это перезапись всего JSON в
 * AsyncStorage 4 раза в секунду, поэтому запись троттлится, а память
 * обновляется всегда: прогресс-полоски на карточках должны быть живыми.
 */
const PERSIST_INTERVAL_MS = 10_000;

/**
 * Как часто позиция обновляется в памяти.
 *
 * Тоже троттлится, хотя запись в память дешёвая: обновление стора
 * перерисовывает всех подписчиков, в том числе список библиотеки, а он может
 * быть открыт, пока в свёрнутом плеере идёт видео. Двух секунд точности
 * прогресс-полоскам хватает с запасом.
 */
const MEMORY_INTERVAL_MS = 2_000;

/** Ниже этой позиции продолжать нечего — проще начать сначала. */
const MIN_RESUME_SEC = 15;

/** У самого конца тоже не предлагаем «продолжить»: там титры. */
const RESUME_TAIL_SEC = 20;

interface LibraryState {
  readonly history: readonly HistoryEntry[];
  readonly favorites: readonly FavoriteEntry[];
  readonly hydrated: boolean;

  hydrate: () => Promise<void>;
  /**
   * Отметить позицию просмотра. `flush` заставляет записать на диск сразу —
   * так делается на паузе, при закрытии плеера и при уходе в фон, потому что
   * следующего тика может уже не быть.
   */
  noteProgress: (video: VideoSummary, positionSec: number, flush?: boolean) => Promise<void>;
  /**
   * Отметить факт открытия видео, не трогая сохранённую позицию.
   *
   * Отдельно от {@link LibraryState.noteProgress}, потому что позиция при
   * открытии ещё не известна, а `noteProgress(video, 0)` затёр бы прошлую:
   * достаточно было выключить «продолжать с места остановки», чтобы каждое
   * повторное открытие обнуляло прогресс на карточках.
   */
  noteOpened: (video: VideoSummary) => Promise<void>;
  toggleFavorite: (video: VideoSummary) => Promise<void>;
  isFavorite: (uid: string) => boolean;
  /** Прогресс просмотра 0..1 для полоски на карточке. */
  progressOf: (video: VideoSummary) => number | undefined;
  /** С какой секунды предложить продолжить просмотр, или `null`. */
  resumePositionOf: (video: VideoSummary) => number | null;
  clearHistory: () => Promise<void>;
  clearFavorites: () => Promise<void>;
}

let lastPersistAt = 0;
let lastMemoryAt = 0;

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

  noteProgress: async (video, positionSec, flush = false) => {
    const { historyEnabled, historyLimit } = useSettingsStore.getState().settings;
    if (!historyEnabled) {
      return;
    }
    const now = Date.now();
    if (!flush && now - lastMemoryAt < MEMORY_INTERVAL_MS) {
      return;
    }
    lastMemoryAt = now;

    const history = mergeWatch(get().history, video, positionSec, historyLimit);
    set({ history });

    if (!flush && now - lastPersistAt < PERSIST_INTERVAL_MS) {
      return;
    }
    lastPersistAt = now;
    await getAppContainer().library.saveHistory(history);
  },

  noteOpened: async (video) => {
    const { historyEnabled, historyLimit } = useSettingsStore.getState().settings;
    if (!historyEnabled) {
      return;
    }
    const previous = get().history.find((entry) => entry.video.uid === video.uid);
    const history = mergeWatch(get().history, video, previous?.positionSec ?? 0, historyLimit);
    set({ history });

    // Троттлинг сбрасываем: запись только что ушла на диск, и следующий тик
    // прогресса не должен считать, что писать «ещё рано».
    lastPersistAt = Date.now();
    lastMemoryAt = lastPersistAt;
    await getAppContainer().library.saveHistory(history);
  },

  toggleFavorite: async (video) => {
    const favorites = await getAppContainer().library.toggleFavorite(video);
    set({ favorites });
  },

  isFavorite: (uid) => isFavoriteIn(get().favorites, uid),

  progressOf: (video) => progressIn(get().history, video),

  resumePositionOf: (video) => {
    const entry = get().history.find((item) => item.video.uid === video.uid);
    if (!entry || entry.completed || entry.positionSec < MIN_RESUME_SEC) {
      return null;
    }
    const duration = video.durationSec ?? entry.video.durationSec;
    if (duration && entry.positionSec > duration - RESUME_TAIL_SEC) {
      return null;
    }
    return entry.positionSec;
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

// ---------------------------------------------------------------------------
// Пометки на карточках списка
// ---------------------------------------------------------------------------

/** Прогресс просмотра 0..1, или `undefined`, если считать не из чего. */
export function progressIn(
  history: readonly HistoryEntry[],
  video: VideoSummary,
): number | undefined {
  const entry = history.find((item) => item.video.uid === video.uid);
  if (!entry) {
    return undefined;
  }
  if (entry.completed) {
    return 1;
  }
  const duration = video.durationSec ?? entry.video.durationSec;
  if (!duration || duration <= 0) {
    return undefined;
  }
  return Math.min(1, entry.positionSec / duration);
}

export function isFavoriteIn(favorites: readonly FavoriteEntry[], uid: string): boolean {
  return favorites.some((entry) => entry.video.uid === uid);
}

export interface LibraryMarks {
  readonly progressOf: (video: VideoSummary) => number | undefined;
  readonly isFavorite: (uid: string) => boolean;
}

/**
 * Пометки для списков: полоска досмотра и звёздочка избранного.
 *
 * Существует именно как хук, а не как пара методов стора, из-за подписки.
 * `useLibraryStore((state) => state.progressOf)` возвращает ссылку на функцию,
 * которая НИКОГДА не меняется, — значит, экран не перерисовывается при
 * изменении истории. Полоски досмотра из-за этого замирали: посмотрел видео,
 * свернул плеер, а карточка в ленте всё ещё показывает старую позицию (или
 * ничего). Здесь подписка идёт на сами данные, поэтому список обновляется.
 */
export function useLibraryMarks(): LibraryMarks {
  const history = useLibraryStore((state) => state.history);
  const favorites = useLibraryStore((state) => state.favorites);

  return useMemo(
    () => ({
      progressOf: (video: VideoSummary) => progressIn(history, video),
      isFavorite: (uid: string) => isFavoriteIn(favorites, uid),
    }),
    [history, favorites],
  );
}
