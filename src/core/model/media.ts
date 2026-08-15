/**
 * Единая доменная модель приложения.
 *
 * Любой провайдер (Rutube, VK, Sasflix, ...) обязан привести свой нативный
 * ответ к этим типам. UI-слой не знает ни одного поля конкретной платформы —
 * только эти интерфейсы. Это и есть граница модульности.
 */

/** Идентификаторы всех зарегистрированных платформ. */
export const PROVIDER_IDS = ['rutube', 'vk', 'sasflix'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * Доступность контента для текущего пользователя.
 * - `free`       — можно смотреть без ограничений;
 * - `paid`       — контент за деньги/подписку у платформы (мы его показываем,
 *                  но не пытаемся обойти оплату — открываем на сайте);
 * - `restricted` — возрастное/региональное ограничение или требуется авторизация.
 */
export type AccessState = 'free' | 'paid' | 'restricted';

export interface Author {
  /** Нативный id автора у платформы (может отсутствовать). */
  readonly id?: string;
  readonly name: string;
  readonly avatarUrl?: string;
  /** Ссылка на канал/страницу автора в вебе. */
  readonly url?: string;
}

export interface Category {
  readonly id: string;
  readonly title: string;
}

/** Карточка видео — то, что показывается в списках. */
export interface VideoSummary {
  /**
   * Глобально уникальный ключ вида `rutube:4ceb97...`.
   * Собирается через {@link makeVideoUid}; используется как React key,
   * ключ кэша, ключ истории и избранного.
   */
  readonly uid: string;
  readonly providerId: ProviderId;
  /** Нативный id внутри платформы. */
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly thumbnailUrl?: string;
  readonly durationSec?: number;
  readonly viewCount?: number;
  /** ISO-8601. */
  readonly publishedAt?: string;
  readonly isLive: boolean;
  readonly author?: Author;
  readonly access: AccessState;
  /** Страница видео в вебе — нужна для «Открыть в браузере» и шаринга. */
  readonly webUrl?: string;
}

/** Детальная карточка (экран видео). */
export interface VideoDetails extends VideoSummary {
  readonly categories?: readonly Category[];
  readonly tags?: readonly string[];
}

/**
 * Способ воспроизведения.
 *
 * `hls`/`progressive` играются нативно (ExoPlayer через react-native-video),
 * `embed` — только через WebView с официальным плеером платформы.
 */
export type PlaybackSource =
  | {
      readonly kind: 'hls' | 'progressive';
      readonly url: string;
      /** Заголовки, обязательные для CDN (например Referer). */
      readonly headers?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'embed';
      readonly url: string;
      readonly headers?: Readonly<Record<string, string>>;
    };

/**
 * Непрозрачный курсор пагинации. Каждый провайдер кодирует в него что хочет
 * (номер страницы, offset, токен) — агрегатор его не интерпретирует.
 */
export type Cursor = string;

export interface Page<T> {
  readonly items: readonly T[];
  /** `null` — страниц больше нет. */
  readonly nextCursor: Cursor | null;
  /** Общее количество, если платформа его сообщает. */
  readonly total?: number;
}

export function makeVideoUid(providerId: ProviderId, id: string): string {
  return `${providerId}:${id}`;
}

export function parseVideoUid(uid: string): { providerId: ProviderId; id: string } {
  const separatorIndex = uid.indexOf(':');
  if (separatorIndex <= 0) {
    throw new Error(`Некорректный uid видео: "${uid}"`);
  }
  return {
    providerId: uid.slice(0, separatorIndex) as ProviderId,
    id: uid.slice(separatorIndex + 1),
  };
}

export function emptyPage<T>(): Page<T> {
  return { items: [], nextCursor: null, total: 0 };
}
