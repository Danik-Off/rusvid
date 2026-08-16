import type { AccessState, VideoSummary } from '../../core/model/media';
import { makeVideoUid } from '../../core/model/media';
import type { VkImageDto, VkVideoDto } from './vkApiTypes';
import type { VkOwnerIndex } from './vkCatalog';

const PROVIDER_ID = 'vk' as const;

/**
 * Нативный id видео во VK — это тройка `owner_id_videoId_accessKey`
 * (access_key опционален). Именно в таком виде его принимает `video.get`,
 * поэтому храним id целиком, а не по частям.
 */
export function buildVkVideoId(dto: VkVideoDto): string | null {
  if (dto.owner_id === undefined || dto.id === undefined) {
    return null;
  }
  const base = `${dto.owner_id}_${dto.id}`;
  return dto.access_key ? `${base}_${dto.access_key}` : base;
}

export function mapVkVideo(dto: VkVideoDto, owners?: VkOwnerIndex): VideoSummary | null {
  const id = buildVkVideoId(dto);
  if (!id) {
    return null;
  }
  const isLive = dto.live === 1;
  return {
    uid: makeVideoUid(PROVIDER_ID, id),
    providerId: PROVIDER_ID,
    id,
    title: dto.title?.trim() || 'Без названия',
    description: dto.description?.trim() || undefined,
    // `first_frame` — запасной кадр: у части эфиров и свежих загрузок обложки
    // ещё нет, и без него карточка осталась бы серым прямоугольником.
    thumbnailUrl: pickLargestImage(dto.image) ?? pickLargestImage(dto.first_frame),
    durationSec: !isLive && typeof dto.duration === 'number' ? dto.duration : undefined,
    viewCount: typeof dto.views === 'number' ? dto.views : undefined,
    publishedAt:
      typeof dto.date === 'number' ? new Date(dto.date * 1000).toISOString() : undefined,
    isLive,
    // Авторов платформа отдаёт отдельными списками `groups`/`profiles`,
    // а в самом видео есть только `owner_id`, по которому они и находятся.
    author: dto.owner_id !== undefined ? owners?.get(dto.owner_id) : undefined,
    access: mapAccess(dto),
    webUrl:
      dto.owner_id !== undefined && dto.id !== undefined
        ? `https://vk.com/video${dto.owner_id}_${dto.id}`
        : undefined,
  };
}

export function mapVkVideoList(
  items: readonly VkVideoDto[] | undefined,
  owners?: VkOwnerIndex,
): VideoSummary[] {
  if (!items) {
    return [];
  }
  return items
    .map((item) => mapVkVideo(item, owners))
    .filter((video): video is VideoSummary => video !== null);
}

/**
 * VK присылает набор превью разных размеров. Берём самое крупное без padding:
 * версии с padding имеют поля-заглушки по бокам и выглядят хуже в сетке.
 */
function pickLargestImage(images: readonly VkImageDto[] | undefined): string | undefined {
  if (!images || images.length === 0) {
    return undefined;
  }
  const candidates = images.filter((image) => image.url && image.with_padding !== 1);
  const pool = candidates.length > 0 ? candidates : images.filter((image) => image.url);
  if (pool.length === 0) {
    return undefined;
  }
  return pool.reduce((best, current) => ((current.width ?? 0) > (best.width ?? 0) ? current : best))
    .url;
}

function mapAccess(dto: VkVideoDto): AccessState {
  if (dto.restriction || dto.is_private === 1) {
    return 'restricted';
  }
  return 'free';
}
