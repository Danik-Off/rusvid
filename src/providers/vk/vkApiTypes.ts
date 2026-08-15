/**
 * Формы ответов официального VK API (`https://api.vk.com/method/...`, v5.199).
 *
 * Особенность VK: ошибки приходят с HTTP 200 и телом `{ "error": {...} }`,
 * поэтому статус-код проверять недостаточно — см. `VkApiClient`.
 */

export interface VkErrorDto {
  error_code?: number;
  error_msg?: string;
}

export interface VkResponseDto<T> {
  response?: T;
  error?: VkErrorDto;
}

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
  /** URL встроенного плеера `video_ext.php` — единственный легальный способ проигрывания. */
  player?: string;
  image?: VkImageDto[];
  /** `1` — идёт прямой эфир. */
  live?: number;
  is_private?: number;
  /** Нужен для повторного обращения к приватным/ограниченным видео. */
  access_key?: string;
  restriction?: VkRestrictionDto;
}

export interface VkVideoListDto {
  count?: number;
  items?: VkVideoDto[];
}
