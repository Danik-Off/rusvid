/**
 * Формы ответов внутреннего API Sasflix (`https://sasflix.ru/api/web/...`).
 *
 * Бэкенд — Laravel, фронт — Nuxt; публичной документации нет, схема выведена
 * из реальных ответов (docs/API-RESEARCH.md#sasflix). Поля необязательные.
 */

export interface SasflixListDto<T> {
  total?: number;
  rows?: T[];
}

export interface SasflixTagDto {
  id?: number;
  title?: string;
}

export interface SasflixCategoryDto {
  id?: number;
  title?: string;
  uri?: string;
  rank?: number;
  active?: boolean;
  hidden?: boolean;
}

export interface SasflixFileDto {
  id?: number;
  uuid?: string;
  updated_at?: string;
}

export interface SasflixVideoDto {
  /** UUID медиафайла — по нему строится HLS-манифест и постер. */
  id?: string;
  duration?: number;
}

/** «Топик» — единица контента Sasflix (видео, статья и т.п.). */
export interface SasflixTopicDto {
  id?: number;
  uuid?: string;
  title?: string;
  teaser?: string;
  type?: string;
  price?: number | null;
  closed?: boolean;
  views_count?: number;
  comments_count?: number;
  published_at?: string;
  active?: boolean;
  tags?: SasflixTagDto[];
  cover?: SasflixFileDto;
  category?: SasflixCategoryDto | null;
  /** `false` — контент за подпиской/оплатой у платформы. */
  access?: boolean;
  paid?: boolean;
  has_video?: boolean;
  video?: SasflixVideoDto;
}
