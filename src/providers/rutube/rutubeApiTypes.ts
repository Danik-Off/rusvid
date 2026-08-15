/**
 * Формы ответов публичного веб-API Rutube (`https://rutube.ru/api/...`).
 *
 * API не документировано и может измениться без предупреждения, поэтому
 * ВСЕ поля описаны как необязательные: маппер обязан пережить отсутствие
 * любого из них. Подробности эндпоинтов — docs/API-RESEARCH.md.
 */

export interface RutubeAuthorDto {
  id?: number;
  name?: string;
  avatar_url?: string;
  site_url?: string;
}

export interface RutubeCategoryDto {
  id?: number;
  name?: string;
  short_name?: string;
  category_url?: string;
  for_kids?: boolean;
}

export interface RutubeVideoDto {
  id?: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  video_url?: string;
  embed_url?: string;
  duration?: number;
  hits?: number;
  created_ts?: string;
  publication_ts?: string;
  is_livestream?: boolean;
  is_on_air?: boolean;
  is_adult?: boolean;
  is_paid?: boolean;
  is_club?: boolean;
  is_hidden?: boolean;
  is_deleted?: boolean;
  author?: RutubeAuthorDto;
  category?: RutubeCategoryDto;
}

/** Общая форма постраничных списков Rutube. */
export interface RutubeListDto {
  results?: RutubeVideoDto[];
  has_next?: boolean;
  count?: number;
  page?: number;
  current_page?: number;
}

/** Ответ `/api/play/options/{id}/`. */
export interface RutubePlayOptionsDto {
  video_balancer?: {
    m3u8?: string;
    default?: string;
  };
  live_streams?: {
    hls?: string;
  };
  title?: string;
  duration?: number;
  thumbnail_url?: string;
  /** Присутствует у DRM-защищённого контента — такой мы играть не умеем. */
  drm_token?: string | null;
  acl_access?: {
    allowed?: boolean;
    err_text?: string;
  };
}
