/**
 * Провайдер VK Video.
 *
 * В отличие от Rutube и Sasflix, VK требует access token: публичного
 * поиска по видео без него нет. Токен вводит пользователь в настройках
 * (см. docs/PROVIDERS.md#vk-token) и хранится в CredentialsStore.
 *
 * Воспроизведение — ТОЛЬКО через официальный embed-плеер `video_ext.php`.
 * VK не отдаёт прямые ссылки на файлы сторонним приложениям, и мы их
 * не извлекаем: это нарушало бы условия платформы.
 */

import { ProviderError } from '../../core/errors/ProviderError';
import type {
  Cursor,
  Page,
  PlaybackSource,
  VideoDetails,
  VideoSummary,
} from '../../core/model/media';
import type {
  FeedRequest,
  PlaybackRequest,
  ProviderCapabilities,
  ProviderMeta,
  RequestContext,
  SearchRequest,
  VideoProvider,
} from '../../core/provider/VideoProvider';
import type { CredentialsStore } from '../../data/credentials/CredentialsStore';
import { VkApiClient } from './VkApiClient';
import { vkAuthSpec } from './vkAuth';
import type { VkVideoListDto } from './vkApiTypes';
import { mapVkVideo, mapVkVideoList } from './vkMappers';

const PAGE_SIZE = 20;
/** `video.search`: 0 — по дате, 2 — по релевантности. */
const SORT_BY_RELEVANCE = 2;

export class VkProvider implements VideoProvider {
  readonly meta: ProviderMeta = {
    id: 'vk',
    title: 'VK Видео',
    badge: 'VK',
    accentColor: '#0077FF',
    homepage: 'https://vk.com/video',
    description:
      'Официальное API. Нужен access token с правом «video». Воспроизведение — во встроенном плеере VK.',
  };

  readonly auth = vkAuthSpec;

  readonly capabilities: ProviderCapabilities = {
    search: true,
    // Публичной «ленты трендов» в API нет: video.getCatalog доступен
    // не всем токенам, поэтому VK участвует только в поиске.
    trendingFeed: false,
    subscriptionsFeed: false,
    categories: false,
    nativePlayback: false,
    embedPlayback: true,
    requiresCredentials: true,
  };

  constructor(
    private readonly credentials: CredentialsStore,
    private readonly api: VkApiClient = new VkApiClient(),
  ) {}

  /** Без токена провайдер бесполезен: публичного поиска у VK нет. */
  isConfigured(): boolean {
    return this.credentials.getToken('vk') !== null;
  }

  isSignedIn(): boolean {
    return this.isConfigured();
  }

  /** Проверка «жив ли токен» дешёвым запросом. */
  async verifySession(context: RequestContext): Promise<boolean> {
    const token = this.credentials.getToken('vk');
    if (!token) {
      return false;
    }
    try {
      await this.api.call<VkVideoListDto>(
        'video.search',
        token,
        { q: 'а', count: 1 },
        context.signal,
      );
      return true;
    } catch {
      return false;
    }
  }

  async search(request: SearchRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    const token = this.requireToken();
    const offset = cursorToOffset(request.cursor);

    const response = await this.api.call<VkVideoListDto>(
      'video.search',
      token,
      {
        q: request.query,
        count: PAGE_SIZE,
        offset,
        sort: SORT_BY_RELEVANCE,
        adult: 0,
      },
      context.signal,
    );

    const items = mapVkVideoList(response.items);
    const received = response.items?.length ?? 0;
    const nextOffset = offset + received;
    const hasNext = received >= PAGE_SIZE && nextOffset < (response.count ?? Infinity);

    return {
      items,
      nextCursor: hasNext ? String(nextOffset) : null,
      total: response.count,
    };
  }

  async feed(_request: FeedRequest, _context: RequestContext): Promise<Page<VideoSummary>> {
    throw new ProviderError({
      code: 'UNSUPPORTED',
      providerId: 'vk',
      message: 'VK API не предоставляет публичную ленту видео',
    });
  }

  async getDetails(id: string, context: RequestContext): Promise<VideoDetails> {
    const token = this.requireToken();
    const response = await this.api.call<VkVideoListDto>(
      'video.get',
      token,
      { videos: id, count: 1 },
      context.signal,
    );

    const dto = response.items?.[0];
    const summary = dto ? mapVkVideo(dto) : null;
    if (!summary) {
      throw new ProviderError({ code: 'NOT_FOUND', providerId: 'vk' });
    }
    return summary;
  }

  /** VK всегда играется в своём embed-плеере, поэтому `preferEmbed` не влияет. */
  async resolvePlayback(
    request: PlaybackRequest,
    context: RequestContext,
  ): Promise<PlaybackSource> {
    const token = this.requireToken();
    const response = await this.api.call<VkVideoListDto>(
      'video.get',
      token,
      { videos: request.id, count: 1 },
      context.signal,
    );

    const dto = response.items?.[0];
    if (!dto) {
      throw new ProviderError({ code: 'NOT_FOUND', providerId: 'vk' });
    }
    if (dto.restriction) {
      throw new ProviderError({
        code: 'GEO_BLOCKED',
        providerId: 'vk',
        message: dto.restriction.title || 'Видео ограничено платформой',
      });
    }
    if (!dto.player) {
      throw new ProviderError({
        code: 'NOT_FOUND',
        providerId: 'vk',
        message: 'VK не вернул ссылку на плеер для этого видео',
      });
    }

    return { kind: 'embed', url: dto.player };
  }

  private requireToken(): string {
    const token = this.credentials.getToken('vk');
    if (!token) {
      throw new ProviderError({
        code: 'AUTH_REQUIRED',
        providerId: 'vk',
        message: 'Добавьте access token VK в настройках',
      });
    }
    return token;
  }
}

function cursorToOffset(cursor: Cursor | undefined): number {
  const parsed = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
