import { create } from 'zustand';

import { getAppContainer } from '../../app/container/AppContainer';
import { getProviderMeta } from '../../app/container/providerMeta';
import type { CursorMap, ProviderFailure } from '../../core/aggregator/AggregatorService';
import { ProviderError } from '../../core/errors/ProviderError';
import type { VideoSummary } from '../../core/model/media';
import { useSettingsStore } from '../settings/settingsStore';

type Status = 'idle' | 'loading' | 'loadingMore' | 'ready' | 'error';

interface SearchState {
  readonly query: string;
  readonly items: readonly VideoSummary[];
  readonly cursors: CursorMap;
  readonly failures: readonly ProviderFailure[];
  readonly status: Status;
  readonly error: string | null;
  readonly hasMore: boolean;

  setQuery: (query: string) => void;
  submit: (query: string) => Promise<void>;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
}

/**
 * Каждый новый поиск отменяет предыдущий: пользователь печатает быстрее,
 * чем отвечает сеть, и «догнавший» старый ответ подменил бы выдачу.
 */
let inFlight: AbortController | null = null;

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  items: [],
  cursors: {},
  failures: [],
  status: 'idle',
  error: null,
  hasMore: false,

  setQuery: (query) => set({ query }),

  submit: async (query) => {
    const trimmed = query.trim();
    inFlight?.abort();

    if (trimmed.length === 0) {
      inFlight = null;
      set({ query, items: [], cursors: {}, failures: [], status: 'idle', error: null, hasMore: false });
      return;
    }

    const controller = new AbortController();
    inFlight = controller;
    set({ query: trimmed, status: 'loading', error: null, items: [], cursors: {}, failures: [] });

    try {
      const result = await runSearch(trimmed, {}, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      set({
        items: result.items,
        cursors: result.cursors,
        failures: result.failures,
        hasMore: result.hasMore,
        status: 'ready',
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      set({ status: 'error', error: ProviderError.from(error).message });
    }
  },

  loadMore: async () => {
    const { status, hasMore, query, cursors, items } = get();
    if (!hasMore || status === 'loading' || status === 'loadingMore' || query.length === 0) {
      return;
    }

    const controller = new AbortController();
    inFlight = controller;
    set({ status: 'loadingMore' });

    try {
      const result = await runSearch(query, cursors, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      set({
        items: [...items, ...dedupe(items, result.items)],
        cursors: result.cursors,
        failures: result.failures,
        hasMore: result.hasMore,
        status: 'ready',
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      // Ошибка «ещё одной страницы» не должна стирать уже показанные результаты:
      // возвращаемся в 'ready' и показываем причину полосой над списком.
      const failure = toFailure(error);
      set({ status: 'ready', failures: failure ? [...get().failures, failure] : get().failures });
    }
  },

  retry: async () => {
    await get().submit(get().query);
  },

  reset: () => {
    inFlight?.abort();
    inFlight = null;
    set({ query: '', items: [], cursors: {}, failures: [], status: 'idle', error: null, hasMore: false });
  },
}));

function runSearch(query: string, cursors: CursorMap, signal: AbortSignal) {
  const { aggregator, registry } = getAppContainer();
  const enabled = useSettingsStore.getState().settings.enabledProviders;
  return aggregator.search(query, {
    providers: registry.active(enabled),
    cursors,
    context: { signal },
  });
}

/** Платформы иногда возвращают одно и то же видео на соседних страницах. */
function dedupe(existing: readonly VideoSummary[], incoming: readonly VideoSummary[]): VideoSummary[] {
  const seen = new Set(existing.map((item) => item.uid));
  return incoming.filter((item) => !seen.has(item.uid));
}

/**
 * Ошибка без известной платформы (сбой самого агрегатора) не имеет
 * осмысленного заголовка для полосы — такую молча проглатываем.
 */
function toFailure(error: unknown): ProviderFailure | null {
  const providerError = ProviderError.from(error);
  if (!providerError.providerId) {
    return null;
  }
  const providerId = providerError.providerId as ProviderFailure['providerId'];
  return {
    providerId,
    providerTitle: getProviderMeta(providerId).title,
    error: providerError,
  };
}
