/**
 * Самопроверка платформ.
 *
 * Прогоняет по каждой включённой платформе реальную цепочку вызовов API
 * (конфигурация → поиск → лента → категории → ссылка на видео) и показывает,
 * что именно сломалось. Нужна ровно потому, что API трёх платформ
 * недокументированы и меняются без предупреждения: вместо «ничего не
 * работает» пользователь получает конкретный шаг и текст ошибки.
 */

import { create } from 'zustand';

import { getAppContainer } from '../../app/container/AppContainer';
import { ProviderError } from '../../core/errors/ProviderError';
import type { ProviderId, VideoSummary } from '../../core/model/media';
import type { VideoProvider } from '../../core/provider/VideoProvider';
import { useSettingsStore } from '../settings/settingsStore';

export type StepStatus = 'ok' | 'failed' | 'skipped';

export interface CheckStep {
  readonly name: string;
  readonly status: StepStatus;
  /** Длительность вызова, мс (для пропущенных — 0). */
  readonly durationMs: number;
  /** Что получилось или почему не получилось. */
  readonly detail: string;
}

export interface ProviderReport {
  readonly providerId: ProviderId;
  readonly providerTitle: string;
  readonly steps: readonly CheckStep[];
  readonly ok: boolean;
}

interface DiagnosticsState {
  readonly reports: readonly ProviderReport[];
  readonly running: boolean;
  readonly finishedAt: number | null;
  run: () => Promise<void>;
}

/** Запрос, на котором проверяется поиск. Короткое частотное слово. */
const PROBE_QUERY = 'новости';

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  reports: [],
  running: false,
  finishedAt: null,

  run: async () => {
    set({ running: true, reports: [] });
    const { registry } = getAppContainer();
    const enabled = useSettingsStore.getState().settings.enabledProviders;

    // Проверяем все включённые платформы, даже несконфигурированные:
    // «нет токена» — это тоже диагноз, который надо показать.
    const providers = registry.all().filter((provider) => enabled.includes(provider.meta.id));
    const reports = await Promise.all(providers.map(checkProvider));

    set({ reports, running: false, finishedAt: Date.now() });
  },
}));

async function checkProvider(provider: VideoProvider): Promise<ProviderReport> {
  const steps: CheckStep[] = [];
  let sample: VideoSummary | undefined;

  const configured = provider.isConfigured();
  steps.push({
    name: 'Конфигурация',
    status: configured ? 'ok' : 'failed',
    durationMs: 0,
    detail: configured
      ? provider.capabilities.requiresCredentials
        ? 'Учётные данные заданы'
        : 'Авторизация не требуется'
      : 'Нет токена — платформа исключена из поиска и ленты',
  });

  if (configured && provider.capabilities.search) {
    const result = await timed(() => provider.search({ query: PROBE_QUERY }, {}));
    sample = result.value?.items[0];
    steps.push(
      toStep('Поиск', result, (page) => `Найдено карточек на странице: ${page.items.length}`),
    );
  } else {
    steps.push(skipped('Поиск', configured ? 'Платформа не поддерживает поиск' : 'Нет доступа'));
  }

  if (configured && provider.capabilities.trendingFeed) {
    const result = await timed(() => provider.feed({ kind: 'trending' }, {}));
    sample = sample ?? result.value?.items[0];
    steps.push(toStep('Лента', result, (page) => `Карточек в ленте: ${page.items.length}`));
  } else {
    steps.push(skipped('Лента', configured ? 'Платформа не отдаёт ленту' : 'Нет доступа'));
  }

  if (configured && provider.capabilities.categories && provider.listCategories) {
    const listCategories = provider.listCategories.bind(provider);
    const result = await timed(() => listCategories({}));
    steps.push(toStep('Категории', result, (list) => `Категорий: ${list.length}`));
  } else {
    steps.push(skipped('Категории', configured ? 'Категорий нет' : 'Нет доступа'));
  }

  if (sample) {
    const target = sample;
    const result = await timed(() => provider.resolvePlayback({ id: target.id }, {}));
    steps.push(
      toStep('Ссылка на видео', result, (source) =>
        source.kind === 'embed'
          ? 'Встроенный плеер платформы'
          : `Прямой поток (${source.kind.toUpperCase()})`,
      ),
    );
  } else {
    steps.push(skipped('Ссылка на видео', 'Нет карточки для проверки'));
  }

  return {
    providerId: provider.meta.id,
    providerTitle: provider.meta.title,
    steps,
    ok: steps.every((step) => step.status !== 'failed'),
  };
}

interface Timed<T> {
  readonly value: T | null;
  readonly error: ProviderError | null;
  readonly durationMs: number;
}

async function timed<T>(call: () => Promise<T>): Promise<Timed<T>> {
  const startedAt = Date.now();
  try {
    const value = await call();
    return { value, error: null, durationMs: Date.now() - startedAt };
  } catch (cause) {
    return { value: null, error: ProviderError.from(cause), durationMs: Date.now() - startedAt };
  }
}

function toStep<T>(name: string, result: Timed<T>, describe: (value: T) => string): CheckStep {
  if (result.error || result.value === null) {
    return {
      name,
      status: 'failed',
      durationMs: result.durationMs,
      detail: result.error?.message ?? 'Пустой ответ',
    };
  }
  return {
    name,
    status: 'ok',
    durationMs: result.durationMs,
    detail: describe(result.value),
  };
}

function skipped(name: string, detail: string): CheckStep {
  return { name, status: 'skipped', durationMs: 0, detail };
}
