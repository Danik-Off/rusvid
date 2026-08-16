/**
 * Недавние поисковые запросы.
 *
 * Экран поиска до этого не помнил ничего: закрыл приложение — набирай
 * «сериал про…» заново, буква за буквой, на телефоне. Подсказок платформы
 * агрегатор дать не может (у каждой они свои и несовместимые), а вот
 * собственные прошлые запросы — может, и это ровно то, что переиспользуют
 * чаще всего.
 *
 * Хранится только на устройстве и подчиняется тому же выключателю, что и
 * история просмотров: человек, выключивший историю в настройках, не ожидает,
 * что его запросы всё равно где-то копятся.
 */

import { create } from 'zustand';

import { getAppContainer } from '../../app/container/AppContainer';
import { useSettingsStore } from '../settings/settingsStore';

const STORAGE_KEY = 'search/recent/v1';

/** Больше десятка подсказок не помещается на экран и не читается. */
const MAX_QUERIES = 12;

interface SearchHistoryState {
  readonly queries: readonly string[];
  readonly hydrated: boolean;

  hydrate: () => Promise<void>;
  remember: (query: string) => Promise<void>;
  forget: (query: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  queries: [],
  hydrated: false,

  hydrate: async () => {
    const saved = await getAppContainer().store.read<readonly string[]>(STORAGE_KEY, []);
    set({ queries: normalize(saved), hydrated: true });
  },

  remember: async (query) => {
    if (!useSettingsStore.getState().settings.historyEnabled) {
      return;
    }
    const next = addQuery(get().queries, query);
    if (next === get().queries) {
      return;
    }
    set({ queries: next });
    await getAppContainer().store.write(STORAGE_KEY, next);
  },

  forget: async (query) => {
    const next = get().queries.filter((item) => item !== query);
    set({ queries: next });
    await getAppContainer().store.write(STORAGE_KEY, next);
  },

  clear: async () => {
    set({ queries: [] });
    await getAppContainer().store.remove(STORAGE_KEY);
  },
}));

/**
 * Добавление запроса в начало списка.
 *
 * Возвращает ИСХОДНЫЙ массив, если ничего не изменилось: так вызывающий
 * не пишет на диск при повторном поиске того же самого, а подписчики стора
 * не перерисовываются впустую.
 *
 * Экспортируется ради теста — вся ветвистость собрана здесь.
 */
export function addQuery(queries: readonly string[], raw: string): readonly string[] {
  const query = raw.trim().replace(/\s+/g, ' ');
  if (query.length === 0) {
    return queries;
  }
  // Уже первый и без изменений — трогать нечего.
  if (queries[0] === query) {
    return queries;
  }
  // Сравнение без учёта регистра: «Кино» и «кино» — один и тот же запрос,
  // и держать оба в списке из двенадцати строк расточительно.
  const folded = query.toLocaleLowerCase('ru-RU');
  const rest = queries.filter((item) => item.toLocaleLowerCase('ru-RU') !== folded);
  return [query, ...rest].slice(0, MAX_QUERIES);
}

function normalize(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, MAX_QUERIES);
}
