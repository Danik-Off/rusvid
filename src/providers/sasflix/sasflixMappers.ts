import type { AccessState, VideoDetails, VideoSummary } from '../../core/model/media';
import { makeVideoUid } from '../../core/model/media';
import type { SasflixTopicDto } from './sasflixApiTypes';

const PROVIDER_ID = 'sasflix' as const;
const BASE_URL = 'https://sasflix.ru';

/** Размер превью в списке — 2x от типичной ширины карточки. */
const THUMB_WIDTH = 640;
const THUMB_HEIGHT = 360;

export function mapSasflixTopic(dto: SasflixTopicDto): VideoSummary | null {
  // Sasflix отдаёт и не-видео материалы; в агрегаторе видео им не место.
  if (!dto.uuid || dto.has_video === false) {
    return null;
  }
  return {
    uid: makeVideoUid(PROVIDER_ID, dto.uuid),
    providerId: PROVIDER_ID,
    id: dto.uuid,
    title: dto.title?.trim() || 'Без названия',
    description: dto.teaser?.trim() || undefined,
    thumbnailUrl: buildThumbnailUrl(dto),
    durationSec: typeof dto.video?.duration === 'number' ? dto.video.duration : undefined,
    viewCount: typeof dto.views_count === 'number' ? dto.views_count : undefined,
    publishedAt: dto.published_at,
    isLive: false,
    author: { name: 'Sasflix' },
    access: mapAccess(dto),
    webUrl: `${BASE_URL}/topics/${dto.uuid}`,
  };
}

export function mapSasflixTopicDetails(dto: SasflixTopicDto): VideoDetails | null {
  const summary = mapSasflixTopic(dto);
  if (!summary) {
    return null;
  }
  return {
    ...summary,
    categories:
      dto.category?.id !== undefined && dto.category.title
        ? [{ id: String(dto.category.id), title: dto.category.title }]
        : undefined,
    tags: dto.tags
      ?.map((tag) => tag.title)
      .filter((title): title is string => Boolean(title)),
  };
}

export function mapSasflixTopicList(items: readonly SasflixTopicDto[] | undefined): VideoSummary[] {
  if (!items) {
    return [];
  }
  return items
    .filter((dto) => dto.active !== false)
    .map(mapSasflixTopic)
    .filter((video): video is VideoSummary => video !== null);
}

/** HLS-манифест медиафайла. */
export function buildSasflixManifestUrl(videoUuid: string): string {
  return `${BASE_URL}/api/video/${videoUuid}`;
}

function buildThumbnailUrl(dto: SasflixTopicDto): string | undefined {
  const size = `w=${THUMB_WIDTH}&h=${THUMB_HEIGHT}&fit=crop`;
  if (dto.cover?.uuid) {
    return `${BASE_URL}/api/image/${dto.cover.uuid}?${size}&fm=webp`;
  }
  // Постер генерируется сервисом из самого видео — запасной вариант.
  if (dto.video?.id) {
    return `${BASE_URL}/api/poster/${dto.video.id}?${size}`;
  }
  return undefined;
}

/**
 * `access` — «могу ли я это смотреть» с учётом сессии; `paid`/`closed`
 * описывают сам материал. Поэтому у вошедшего подписчика платный материал
 * помечается свободным, а не плашкой «ПОДПИСКА».
 */
function mapAccess(dto: SasflixTopicDto): AccessState {
  if (dto.access === false) {
    return 'paid';
  }
  if (dto.access === undefined && (dto.paid === true || dto.closed === true)) {
    return 'paid';
  }
  return 'free';
}
