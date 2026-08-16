/**
 * Формы объектов видео ВКонтакте.
 *
 * Имена полей у VK одни и те же и в API, и в нагрузке веб-клиента
 * (`al_video.php`): `owner_id`, `id`, `title`, `duration`, `date`, `views`,
 * `image`. Именно поэтому `VkWebClient` может отдавать найденные объекты
 * прямо в эти типы и переиспользовать уже покрытые тестами мапперы.
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
