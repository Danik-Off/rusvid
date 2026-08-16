import { create } from 'zustand';

import { getAppContainer } from '../../app/container/AppContainer';
import type { CursorMap, ProviderFailure } from '../../core/aggregator/AggregatorService';
import { ProviderError, type ProviderErrorCode } from '../../core/errors/ProviderError';
import type { Category, ProviderId, VideoSummary } from '../../core/model/media';
import type { VideoProvider } from '../../core/provider/VideoProvider';
import { useSettingsStore } from '../settings/settingsStore';

/**
 * Область ленты. `all` — тренды всех платформ, поддерживающих ленту;
 * конкретный `ProviderId` — только эта платформа, с её категориями.
 *
 * Категории по платформам не пересекаются (id у Rutube и Sasflix свои),
 * поэтому фильтр по категории доступен только при выбранной платформе.
 */
export type FeedScope = 'all' | 'subscriptions' | ProviderId;

type Status = 'idle' | 'loading' | 'loadingMore' | 'ready' | 'error';

interface FeedState {
  readonly scope: FeedScope;
  readonly categoryId: string | null;
  readonly categories: readonly Category[];
  readonly items: readonly VideoSummary[];
  readonly cursors: CursorMap;
  readonly failures: readonly ProviderFailure[];
  readonly status: Status;
  readonly error: string | null;
  readonly errorCode: ProviderErrorCode | null;
  readonly hasMore: boolean;

  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  setScope: (scope: FeedScope) => Promise<void>;
  setCategory: (categoryId: string | null) => Promise<void>;
}

let inFlight: AbortController | null = null;

export const useFeedStore = create<FeedState>((set, get) => ({
  scope: 'all',
  categoryId: null,
  categories: [],
  items: [],
  cursors: {},
  failures: [],
  status: 'idle',
  error: null,
  errorCode: null,
  hasMore: false,

  refresh: async () => {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    set({ status: 'loading', error: null, errorCode: null, items: [], cursors: {}, failures: [] });

    try {
      const result = await runFeed(get(), {}, controller.signal);
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
      const failure = ProviderError.from(error);
      set({ status: 'error', error: failure.message, errorCode: failure.code });
    }
  },

  loadMore: async () => {
    const state = get();
    if (!state.hasMore || state.status === 'loading' || state.status === 'loadingMore') {
      return;
    }
    const controller = new AbortController();
    inFlight = controller;
    set({ status: 'loadingMore' });

    try {
      const result = await runFeed(state, state.cursors, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      const seen = new Set(state.items.map((item) => item.uid));
      set({
        items: [...state.items, ...result.items.filter((item) => !seen.has(item.uid))],
        cursors: result.cursors,
        failures: result.failures,
        hasMore: result.hasMore,
        status: 'ready',
      });
    } catch {
      if (controller.signal.aborted) {
        return;
      }
      set({ status: 'ready' });
    }
  },

  setScope: async (scope) => {
    set({ scope, categoryId: null, categories: [] });
    if (scope !== 'all' && scope !== 'subscriptions') {
      await loadCategories(scope, set);
    }
    await get().refresh();
  },

  setCategory: async (categoryId) => {
    set({ categoryId });
    await get().refresh();
  },
}));

function selectProviders(scope: FeedScope): readonly VideoProvider[] {
  const { registry } = getAppContainer();
  const enabled = useSettingsStore.getState().settings.enabledProviders;
  const active = registry.active(enabled);
  if (scope === 'all' || scope === 'subscriptions') {
    return active;
  }
  return active.filter((provider) => provider.meta.id === scope);
}

function runFeed(
  state: Pick<FeedState, 'scope' | 'categoryId'>,
  cursors: CursorMap,
  signal: AbortSignal,
) {
  const { aggregator } = getAppContainer();
  const providers = selectProviders(state.scope);
  const options = { providers, cursors, context: { signal } };

  if (state.scope === 'subscriptions') {
    return aggregator.feed({ kind: 'subscriptions' }, options);
  }
  // Категории у платформ свои, поэтому фильтр по ним доступен только
  // когда выбрана конкретная платформа.
  const useCategory = state.scope !== 'all' && state.categoryId !== null;
  return aggregator.feed(
    useCategory ? { kind: 'category', categoryId: state.categoryId as string } : { kind: 'trending' },
    options,
  );
}

async function loadCategories(
  providerId: ProviderId,
  set: (partial: Partial<FeedState>) => void,
): Promise<void> {
  const provider = getAppContainer().registry.get(providerId);
  if (!provider.capabilities.categories || !provider.listCategories) {
    return;
  }
  try {
    set({ categories: await provider.listCategories({}) });
  } catch {
    // Категории — необязательная надстройка: без них лента всё равно работает.
    set({ categories: [] });
  }
}
