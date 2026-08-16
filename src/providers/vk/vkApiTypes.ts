/**
 * Формы ответов API VK Видео (`api.vkvideo.ru/method/*`).
 *
 * Это тот же формат объектов, что и в публичном API ВКонтакте: `owner_id`,
 * `id`, `title`, `duration`, `date`, `views`, `image`. Отличается только
 * обёртка — вместо плоского `{count, items}` витрина отдаёт «каталог»
 * из секций и блоков, где блоки ссылаются на видео по строковым ключам
 * `"<owner_id>_<id>"`, а сами объекты лежат отдельными массивами.
 *
 * Все поля необязательные: схема выведена из живых ответов, публичной
 * документации у этих методов нет, и мапперы обязаны пережить пропажу любого.
 */

export interface VkImageDto {
  url?: string;
  width?: number;
  height?: number;
  with_padding?: number;
}

/** Возрастное/правовое ограничение на видео. */
export interface VkRestrictionDto {
  title?: string;
  text?: string;
  always_shown?: number;
}

export interface VkVideoDto {
  id?: number;
  owner_id?: number;
  title?: string;
  description?: string;
  duration?: number;
  /** Unix-время публикации, секунды. */
  date?: number;
  views?: number;
  /**
   * Готовая ссылка на встроенный плеер вместе с `hash` — единственный способ
   * открыть видео, у которого ключ доступа обязателен. Строить её самим по
   * идентификатору можно, но hash мы не знаем, см. `vkVideoId.ts`.
   */
  player?: string;
  image?: VkImageDto[];
  /** Кадр из видео; используется, если `image` не пришёл. */
  first_frame?: VkImageDto[];
  /** `1` — идёт прямой эфир. */
  live?: number;
  is_private?: number;
  /** Нужен для повторного обращения к приватным/ограниченным видео. */
  access_key?: string;
  restriction?: VkRestrictionDto;
}

/** Автор-сообщество. Отрицательный `owner_id` видео — это `-id` сообщества. */
export interface VkGroupDto {
  id?: number;
  name?: string;
  screen_name?: string;
  photo_200?: string;
  photo_100?: string;
  photo_50?: string;
}

/** Автор-пользователь. Положительный `owner_id` видео — это его `id`. */
export interface VkProfileDto {
  id?: number;
  first_name?: string;
  last_name?: string;
  screen_name?: string;
  photo_200?: string;
  photo_100?: string;
  photo_50?: string;
}

/**
 * Блок секции: полоса или сетка карточек. Нас интересуют только блоки
 * с `videos_ids` — остальные (фильтры, заголовки, разделители) пропускаем.
 */
export interface VkCatalogBlockDto {
  id?: string;
  data_type?: string;
  videos_ids?: string[];
}

export interface VkCatalogSectionDto {
  id?: string;
  title?: string;
  url?: string;
  blocks?: VkCatalogBlockDto[];
  /** Курсор следующей страницы; отсутствует — список кончился. */
  next_from?: string;
}

export interface VkCatalogDto {
  default_section?: string;
  sections?: VkCatalogSectionDto[];
}

/** Обёртка `catalog_videos[]`: карточка витрины с вложенным видео. */
export interface VkCatalogVideoDto {
  video?: VkVideoDto;
}

/**
 * Ответ любого каталожного метода.
 *
 * `catalog` приходит от `catalog.getVideo`/`catalog.getVideoSearch`
 * (несколько секций), `section` — от `catalog.getSection` (одна, следующая
 * страница). Видео лежат в `videos` и/или в `catalog_videos`, причём
 * в разных ответах по-разному: VK свободно меняет раскладку блоков.
 */
export interface VkCatalogResponseDto {
  catalog?: VkCatalogDto;
  section?: VkCatalogSectionDto;
  videos?: VkVideoDto[];
  catalog_videos?: VkCatalogVideoDto[];
  groups?: VkGroupDto[];
  profiles?: VkProfileDto[];
}

/** Ответ `video.get`. */
export interface VkVideoListDto {
  count?: number;
  items?: VkVideoDto[];
  groups?: VkGroupDto[];
  profiles?: VkProfileDto[];
}

/** Ответ `auth.getAnonymToken` и `video.getWebToken` — форма у них общая. */
export interface VkTokenDto {
  token?: string;
  /** Unix-время истечения, секунды. */
  expired_at?: number;
}

/** Ошибка VK: приходит с HTTP 200 внутри тела. */
export interface VkErrorDto {
  error_code?: number;
  error_msg?: string;
}

export interface VkEnvelopeDto<T> {
  response?: T;
  error?: VkErrorDto;
}
