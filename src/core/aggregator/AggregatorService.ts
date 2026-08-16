/**
 * Агрегатор — веерный опрос нескольких платформ с деградацией по одной.
 *
 * Ключевые свойства:
 *  1. Падение одной платформы никогда не роняет выдачу остальных
 *     (`Promise.allSettled` + список `failures` для UI).
 *  2. Пагинация независима: у каждой платформы свой курсор. Курсор `null`
 *     означает «страницы кончились» — на следующей подгрузке платформа
 *     не опрашивается.
 *  3. Результаты перемешиваются round-robin, чтобы одна платформа
 *     не занимала весь первый экран.
 */

import { ProviderError } from '../errors/ProviderError';
import type { Cursor, ProviderId, VideoSummary } from '../model/media';
import type {
  FeedRequest,
  RequestContext,
  SearchRequest,
  VideoProvider,
} from '../provider/VideoProvider';

/** Курсоры по платформам. `null` — платформа исчерпана, `undefined` — ещё не опрашивалась. */
export type CursorMap = Partial<Record<ProviderId, Cursor | null>>;

export interface ProviderFailure {
  readonly providerId: ProviderId;
  readonly providerTitle: string;
  readonly error: ProviderError;
}

export interface AggregatedResult {
  readonly items: readonly VideoSummary[];
  readonly cursors: CursorMap;
  readonly failures: readonly ProviderFailure[];
  /** Есть ли хоть одна платформа, у которой остались страницы. */
  readonly hasMore: boolean;
}

export interface AggregateOptions {
  readonly providers: readonly VideoProvider[];
  readonly cursors?: CursorMap;
  readonly context?: RequestContext;
}

export class AggregatorService {
  async search(query: string, options: AggregateOptions): Promise<AggregatedResult> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { items: [], cursors: {}, failures: [], hasMore: false };
    }
    return this.fanOut(options, (provider, cursor, context) => {
      if (!provider.capabilities.search) {
        return null;
      }
      const request: SearchRequest = { query: trimmed, cursor };
      return provider.search(request, context);
    });
  }

  async feed(request: FeedRequest, options: AggregateOptions): Promise<AggregatedResult> {
    return this.fanOut(options, (provider, cursor, context) => {
      const supported = supportsFeed(provider, request.kind);
      if (!supported) {
        return null;
      }
      return provider.feed({ ...request, cursor }, context);
    });
  }

  /**
   * @param call возвращает `null`, если платформа не умеет эту операцию —
   *             тогда она молча исключается из выдачи (это не ошибка).
   */
  private async fanOut(
    options: AggregateOptions,
    call: (
      provider: VideoProvider,
      cursor: Cursor | undefined,
      context: RequestContext,
    ) => Promise<{ items: readonly VideoSummary[]; nextCursor: Cursor | null }> | null,
  ): Promise<AggregatedResult> {
    const context = options.context ?? {};
    const previousCursors = options.cursors ?? {};

    // Исключаем исчерпанные платформы (курсор явно равен null).
    const queried = options.providers.filter(
      (provider) => previousCursors[provider.meta.id] !== null,
    );

    const settled = await Promise.allSettled(
      queried.map(async (provider) => {
        const cursor = previousCursors[provider.meta.id] ?? undefined;
        const promise = call(provider, cursor, context);
        if (promise === null) {
          return { provider, page: null };
        }
        const page = await promise;
        return { provider, page };
      }),
    );

    const cursors: CursorMap = { ...previousCursors };
    const failures: ProviderFailure[] = [];
    const buckets: VideoSummary[][] = [];

    settled.forEach((outcome, index) => {
      const provider = queried[index];
      if (outcome.status === 'rejected') {
        const error = ProviderError.from(outcome.reason, provider.meta.id);
        // Отмена — это не сбой платформы, её незачем показывать пользователю.
        if (error.code !== 'CANCELLED') {
          failures.push({
            providerId: provider.meta.id,
            providerTitle: provider.meta.title,
            error,
          });
        }
        // Курсор не двигаем: при «Повторить» платформа переспросит ту же страницу.
        return;
      }

      const { page } = outcome.value;
      if (page === null) {
        cursors[provider.meta.id] = null; // операция не поддерживается — больше не спрашиваем
        return;
      }
      cursors[provider.meta.id] = page.nextCursor;
      if (page.items.length > 0) {
        buckets.push([...page.items]);
      }
    });

    return {
      items: interleave(buckets),
      cursors,
      failures,
      /**
       * Следующая страница есть только там, где платформа сама вернула курсор.
       *
       * Строгая проверка на строку, а не `!== null`: у платформы, которая
       * упала, курсор так и остаётся `undefined`, и прежнее условие считало
       * это «есть ещё». Список при каждой прокрутке до низа снова дёргал
       * упавшую платформу, показывал спиннер и снова падал — бесконечно.
       * Повторить попытку пользователь может явно, кнопкой в полосе ошибок.
       */
      hasMore: options.providers.some(
        (provider) => typeof cursors[provider.meta.id] === 'string',
      ),
    };
  }
}

/** Умеет ли платформа отдавать ленту этого вида. */
function supportsFeed(provider: VideoProvider, kind: FeedRequest['kind']): boolean {
  switch (kind) {
    case 'category':
      return provider.capabilities.categories;
    case 'subscriptions':
      // Лента подписок без входа вернула бы 401 у каждой платформы —
      // не спрашиваем вовсе, чтобы не показывать ложную ошибку.
      return provider.capabilities.subscriptionsFeed && provider.isSignedIn();
    default:
      return provider.capabilities.trendingFeed;
  }
}

/**
 * Round-robin слияние: [a1,a2,a3] + [b1,b2] -> [a1,b1,a2,b2,a3].
 * Экспортируется ради юнит-теста.
 */
export function interleave<T>(buckets: readonly T[][]): T[] {
  const longest = buckets.reduce((max, bucket) => Math.max(max, bucket.length), 0);
  const merged: T[] = [];
  for (let index = 0; index < longest; index += 1) {
    for (const bucket of buckets) {
      if (index < bucket.length) {
        merged.push(bucket[index]);
      }
    }
  }
  return merged;
}
