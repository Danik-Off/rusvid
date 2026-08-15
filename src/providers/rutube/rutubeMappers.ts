import type { AccessState, Author, VideoDetails, VideoSummary } from '../../core/model/media';
import { makeVideoUid } from '../../core/model/media';
import type { RutubeAuthorDto, RutubeVideoDto } from './rutubeApiTypes';

const PROVIDER_ID = 'rutube' as const;

export function mapRutubeVideo(dto: RutubeVideoDto): VideoSummary | null {
  // Без id карточку не открыть — такой элемент бесполезен.
  if (!dto.id) {
    return null;
  }
  const isLive = Boolean(dto.is_livestream || dto.is_on_air);
  return {
    uid: makeVideoUid(PROVIDER_ID, dto.id),
    providerId: PROVIDER_ID,
    id: dto.id,
    title: dto.title?.trim() || 'Без названия',
    description: dto.description?.trim() || undefined,
    thumbnailUrl: dto.thumbnail_url || undefined,
    // У прямых эфиров длительность не имеет смысла.
    durationSec: !isLive && typeof dto.duration === 'number' ? dto.duration : undefined,
    viewCount: typeof dto.hits === 'number' ? dto.hits : undefined,
    publishedAt: normalizeTimestamp(dto.publication_ts ?? dto.created_ts),
    isLive,
    author: mapAuthor(dto.author),
    access: mapAccess(dto),
    webUrl: dto.video_url || `https://rutube.ru/video/${dto.id}/`,
  };
}

export function mapRutubeVideoDetails(dto: RutubeVideoDto): VideoDetails | null {
  const summary = mapRutubeVideo(dto);
  if (!summary) {
    return null;
  }
  const category = dto.category;
  return {
    ...summary,
    categories:
      category?.id !== undefined && category.name
        ? [{ id: String(category.id), title: category.name }]
        : undefined,
  };
}

export function mapRutubeVideoList(items: readonly RutubeVideoDto[] | undefined): VideoSummary[] {
  if (!items) {
    return [];
  }
  return items
    .filter((dto) => !dto.is_deleted && !dto.is_hidden)
    .map(mapRutubeVideo)
    .filter((video): video is VideoSummary => video !== null);
}

function mapAuthor(dto: RutubeAuthorDto | undefined): Author | undefined {
  if (!dto?.name) {
    return undefined;
  }
  return {
    id: dto.id === undefined ? undefined : String(dto.id),
    name: dto.name,
    avatarUrl: dto.avatar_url || undefined,
    url: dto.site_url || undefined,
  };
}

function mapAccess(dto: RutubeVideoDto): AccessState {
  if (dto.is_paid || dto.is_club) {
    return 'paid';
  }
  if (dto.is_adult) {
    return 'restricted';
  }
  return 'free';
}

/**
 * Rutube отдаёт «2025-09-14T18:00:08» без таймзоны — это московское время.
 * Без явного смещения `new Date()` на устройстве интерпретировал бы строку
 * как локальную и сдвинул дату.
 */
export function normalizeTimestamp(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return hasZone ? value : `${value}+03:00`;
}
