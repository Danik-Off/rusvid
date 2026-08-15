/**
 * Контракт видеоплатформы.
 *
 * Добавление новой платформы = один каталог в `src/providers/<id>/`,
 * реализующий этот интерфейс, плюс одна строка регистрации в
 * `src/providers/registerProviders.ts`. Ни один файл в `src/features/`
 * или `src/app/` при этом не меняется — см. `docs/PROVIDERS.md`.
 */

import type {
  Category,
  Cursor,
  Page,
  PlaybackSource,
  ProviderId,
  VideoDetails,
  VideoSummary,
} from '../model/media';
import type { ProviderAuthSpec } from './auth';

/** Описание платформы для UI (плашки, экран настроек, фильтры). */
export interface ProviderMeta {
  readonly id: ProviderId;
  /** Отображаемое имя. */
  readonly title: string;
  /** Короткая метка для бейджа на карточке (2–3 символа). */
  readonly badge: string;
  /** Фирменный цвет — им красится бейдж и чип фильтра. */
  readonly accentColor: string;
  readonly homepage: string;
  /** Пояснение под переключателем в настройках. */
  readonly description: string;
}

export interface ProviderCapabilities {
  readonly search: boolean;
  readonly trendingFeed: boolean;
  /** Лента подписок — доступна только после входа. */
  readonly subscriptionsFeed: boolean;
  readonly categories: boolean;
  /** Умеет отдать прямой HLS/MP4 — играем нативно. */
  readonly nativePlayback: boolean;
  /** Играется только во встроенном веб-плеере платформы. */
  readonly embedPlayback: boolean;
  /** Требует пользовательский токен, иначе провайдер выключен. */
  readonly requiresCredentials: boolean;
}

export interface RequestContext {
  readonly signal?: AbortSignal;
}

export interface SearchRequest {
  readonly query: string;
  /** `undefined` — первая страница. */
  readonly cursor?: Cursor;
}

export type FeedKind = 'trending' | 'category' | 'subscriptions';

export interface PlaybackRequest {
  readonly id: string;
  /**
   * Просить встроенный веб-плеер платформы вместо прямого потока.
   * Используется, когда пользователь отключил нативный плеер в настройках
   * или когда нативное воспроизведение уже сорвалось на этом устройстве.
   * Провайдер без `capabilities.embedPlayback` вправе проигнорировать флаг.
   */
  readonly preferEmbed?: boolean;
}

export interface FeedRequest {
  readonly kind: FeedKind;
  /** Обязателен при `kind === 'category'`. */
  readonly categoryId?: string;
  readonly cursor?: Cursor;
}

export interface VideoProvider {
  readonly meta: ProviderMeta;
  readonly capabilities: ProviderCapabilities;
  /** Как платформа авторизует пользователя (или почему это не нужно). */
  readonly auth: ProviderAuthSpec;

  /**
   * Готов ли провайдер обслуживать запросы прямо сейчас.
   * Для VK — есть ли сохранённый access token.
   * Агрегатор молча пропускает неготовые провайдеры.
   */
  isConfigured(): boolean;

  /**
   * Вошёл ли пользователь в аккаунт платформы.
   *
   * Отличается от `isConfigured()`: Rutube и Sasflix прекрасно работают
   * анонимно (`isConfigured() === true`), но вход открывает подписки и
   * материалы по подписке.
   */
  isSignedIn(): boolean;

  /**
   * Проверить сессию живым запросом и запомнить результат.
   * Реализуется платформами с `auth.kind !== 'none'`.
   */
  verifySession?(context: RequestContext): Promise<boolean>;

  search(request: SearchRequest, context: RequestContext): Promise<Page<VideoSummary>>;

  feed(request: FeedRequest, context: RequestContext): Promise<Page<VideoSummary>>;

  getDetails(id: string, context: RequestContext): Promise<VideoDetails>;

  /** Разрешение ссылки на воспроизведение. Может быть недолговечной (подписанной). */
  resolvePlayback(request: PlaybackRequest, context: RequestContext): Promise<PlaybackSource>;

  /** Реализуется, только если `capabilities.categories === true`. */
  listCategories?(context: RequestContext): Promise<readonly Category[]>;
}
