/**
 * Провайдер Rutube.
 *
 * Публичное веб-API, ключ не нужен. Отдаёт подписанный HLS-манифест —
 * играем нативно. Карта эндпоинтов: docs/API-RESEARCH.md#rutube.
 */

import { ProviderError } from '../../core/errors/ProviderError';
import type {
  Category,
  Cursor,
  Page,
  PlaybackSource,
  VideoDetails,
  VideoSummary,
} from '../../core/model/media';
import type { ProviderAuthSpec } from '../../core/provider/auth';
import type {
  FeedRequest,
  PlaybackRequest,
  ProviderCapabilities,
  ProviderMeta,
  RequestContext,
  SearchRequest,
  VideoProvider,
} from '../../core/provider/VideoProvider';
import { TtlCache } from '../../data/cache/TtlCache';
import type { CredentialsStore } from '../../data/credentials/CredentialsStore';
import { HttpClient } from '../../data/http/HttpClient';
import { WebSessionGuard } from '../shared/WebSessionGuard';
import type { RutubeListDto, RutubePlayOptionsDto, RutubeVideoDto } from './rutubeApiTypes';
import { mapRutubeVideoDetails, mapRutubeVideoList } from './rutubeMappers';

const BASE_URL = 'https://rutube.ru';
const PAGE_SIZE = 20;
const CATEGORIES_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * У Rutube нет эндпоинта «популярное видео» в виде плоского списка:
 * `/api/feeds/popular/` возвращает конфигурацию витрины, а не карточки.
 * Поэтому лента «Тренды» — это самая просматриваемая часть категории
 * «Развлечения». Пользователь всегда может переключить категорию.
 */
const TRENDING_CATEGORY_ID = '57';

interface RutubeCategoryDto {
  id?: number;
  name?: string;
  short_name?: string;
}

export class RutubeProvider implements VideoProvider {
  readonly meta: ProviderMeta = {
    id: 'rutube',
    title: 'Rutube',
    badge: 'RT',
    accentColor: '#00A1E0',
    homepage: 'https://rutube.ru',
    description: 'Публичное API, авторизация не требуется. Видео играется нативно.',
  };

  /**
   * OAuth для сторонних клиентов Rutube не предоставляет, а форма входа
   * живёт внутри SPA (отдельного `/login` нет — он отвечает 404). Поэтому
   * вход — через обычный сайт во встроенном браузере.
   */
  readonly auth: ProviderAuthSpec = {
    kind: 'webLogin',
    benefit: 'Лента подписок и доступ к вашим приватным видео',
    loginUrl: `${BASE_URL}/`,
    instructions:
      'Нажмите «Войти» в шапке сайта и войдите как обычно — по номеру телефона, ' +
      'почте или через соцсеть. Приложение подхватит сессию само.',
    verifySessionPath: '/api/profile/user/',
    sessionOrigins: [BASE_URL],
    logoutUrl: `${BASE_URL}/logout/`,
  };

  readonly capabilities: ProviderCapabilities = {
    search: true,
    trendingFeed: true,
    subscriptionsFeed: true,
    categories: true,
    nativePlayback: true,
    embedPlayback: true,
    requiresCredentials: false,
  };

  private readonly http: HttpClient;
  private readonly categoriesCache = new TtlCache<readonly Category[]>(CATEGORIES_TTL_MS, 4);
  private readonly session: WebSessionGuard;

  constructor(credentials: CredentialsStore, http?: HttpClient) {
    this.http =
      http ??
      new HttpClient({
        baseUrl: BASE_URL,
        providerId: 'rutube',
        defaultHeaders: { Referer: `${BASE_URL}/` },
      });
    this.session = new WebSessionGuard(
      'rutube',
      this.http,
      credentials,
      this.auth.kind === 'webLogin' ? this.auth.verifySessionPath : '/api/profile/user/',
    );
  }

  /** Анонимно платформа полностью работоспособна. */
  isConfigured(): boolean {
    return true;
  }

  isSignedIn(): boolean {
    return this.session.isSignedIn();
  }

  verifySession(context: RequestContext): Promise<boolean> {
    return this.session.verify(context);
  }

  async search(request: SearchRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    const page = cursorToPage(request.cursor);
    const dto = await this.http.getJson<RutubeListDto>('/api/search/video/', {
      query: { query: request.query, page, per_page: PAGE_SIZE },
      signal: context.signal,
    });
    return toPage(dto, page);
  }

  async feed(request: FeedRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    const page = cursorToPage(request.cursor);

    if (request.kind === 'subscriptions') {
      // Требует cookie-сессии; без неё Rutube отвечает 401, который
      // HttpClient превращает в AUTH_REQUIRED — агрегатор покажет это полосой.
      const dto = await this.http.getJson<RutubeListDto>('/api/subscription/video/', {
        query: { page },
        signal: context.signal,
      });
      return toPage(dto, page);
    }

    const categoryId =
      request.kind === 'category' ? request.categoryId ?? TRENDING_CATEGORY_ID : TRENDING_CATEGORY_ID;

    const dto = await this.http.getJson<RutubeListDto>(`/api/video/category/${categoryId}/`, {
      // `-hits` — сортировка по числу просмотров убыванием.
      query: { page, ordering: request.kind === 'trending' ? '-hits' : undefined },
      signal: context.signal,
    });
    return toPage(dto, page);
  }

  async getDetails(id: string, context: RequestContext): Promise<VideoDetails> {
    const dto = await this.http.getJson<RutubeVideoDto>(`/api/video/${id}/`, {
      signal: context.signal,
    });
    const details = mapRutubeVideoDetails(dto);
    if (!details) {
      throw new ProviderError({ code: 'NOT_FOUND', providerId: 'rutube' });
    }
    return details;
  }

  async resolvePlayback(
    request: PlaybackRequest,
    context: RequestContext,
  ): Promise<PlaybackSource> {
    const { id } = request;
    if (request.preferEmbed) {
      return { kind: 'embed', url: buildEmbedUrl(id) };
    }

    const options = await this.http.getJson<RutubePlayOptionsDto>(`/api/play/options/${id}/`, {
      query: { no_404: 'true', referer: `${BASE_URL}/`, pver: 'v2' },
      signal: context.signal,
    });

    if (options.acl_access && options.acl_access.allowed === false) {
      throw new ProviderError({
        code: 'GEO_BLOCKED',
        providerId: 'rutube',
        message: options.acl_access.err_text || 'Видео недоступно',
      });
    }

    // DRM-контент дешифровать не пытаемся — отдаём его официальному плееру.
    if (options.drm_token) {
      return { kind: 'embed', url: buildEmbedUrl(id) };
    }

    const manifest =
      options.live_streams?.hls ?? options.video_balancer?.m3u8 ?? options.video_balancer?.default;

    if (!manifest) {
      // Ссылки нет — но встроенный плеер обычно всё равно справляется.
      return { kind: 'embed', url: buildEmbedUrl(id) };
    }

    return {
      kind: 'hls',
      url: manifest,
      // CDN bl.rutube.ru проверяет Referer у подписанных ссылок.
      headers: { Referer: `${BASE_URL}/` },
    };
  }

  async listCategories(context: RequestContext): Promise<readonly Category[]> {
    return this.categoriesCache.getOrLoad('all', async () => {
      const dto = await this.http.getJson<RutubeCategoryDto[]>('/api/video/category/', {
        signal: context.signal,
      });
      if (!Array.isArray(dto)) {
        throw new ProviderError({ code: 'PARSE', providerId: 'rutube' });
      }
      return dto
        .filter((item) => item.id !== undefined && Boolean(item.name))
        .map((item) => ({ id: String(item.id), title: item.name as string }))
        .sort((left, right) => left.title.localeCompare(right.title, 'ru'));
    });
  }
}

function buildEmbedUrl(id: string): string {
  return `${BASE_URL}/play/embed/${id}`;
}

function cursorToPage(cursor: Cursor | undefined): number {
  const parsed = cursor ? Number.parseInt(cursor, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function toPage(dto: RutubeListDto, currentPage: number): Page<VideoSummary> {
  const items = mapRutubeVideoList(dto.results);
  // Rutube не всегда присылает has_next; пустая страница — надёжный признак конца.
  const hasNext = dto.has_next ?? items.length > 0;
  return {
    items,
    nextCursor: hasNext && items.length > 0 ? String(currentPage + 1) : null,
    total: dto.count,
  };
}
