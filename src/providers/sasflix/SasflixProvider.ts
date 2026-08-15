/**
 * Провайдер Sasflix.
 *
 * Внутреннее API сайта, ключ не нужен. Отдаёт HLS — играем нативно.
 * Платный контент (`access: false` / `paid: true`) показывается в списках,
 * но воспроизведение не подбирается: пользователь отправляется на сайт.
 * Карта эндпоинтов: docs/API-RESEARCH.md#sasflix.
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
import type {
  SasflixCategoryDto,
  SasflixListDto,
  SasflixTopicDto,
} from './sasflixApiTypes';
import {
  buildSasflixManifestUrl,
  mapSasflixTopicDetails,
  mapSasflixTopicList,
} from './sasflixMappers';

const BASE_URL = 'https://sasflix.ru';
const PAGE_SIZE = 20;
const TOPIC_TTL_MS = 5 * 60 * 1000;
const CATEGORIES_TTL_MS = 6 * 60 * 60 * 1000;

export class SasflixProvider implements VideoProvider {
  readonly meta: ProviderMeta = {
    id: 'sasflix',
    title: 'Sasflix',
    badge: 'SF',
    accentColor: '#E4572E',
    homepage: BASE_URL,
    description: 'Внутреннее API сайта, авторизация не требуется. Видео играется нативно.',
  };

  /**
   * У Sasflix есть собственный `POST /api/security/login`, но он принимает
   * пароль в открытом виде. Вводить чужой пароль в наше поле не хочется,
   * поэтому вход идёт через форму на самом сайте во встроенном браузере —
   * тот же механизм, что и у Rutube.
   */
  readonly auth: ProviderAuthSpec = {
    kind: 'webLogin',
    benefit: 'Материалы по вашей подписке начнут открываться прямо в приложении',
    loginUrl: `${BASE_URL}/`,
    instructions:
      'Откройте меню профиля на сайте и войдите в свой аккаунт Sasflix. ' +
      'После входа вернитесь — приложение подхватит сессию.',
    verifySessionPath: '/api/user/profile',
  };

  readonly capabilities: ProviderCapabilities = {
    search: true,
    trendingFeed: true,
    subscriptionsFeed: false,
    categories: true,
    nativePlayback: true,
    embedPlayback: false,
    requiresCredentials: false,
  };

  private readonly http: HttpClient;
  private readonly topicCache = new TtlCache<SasflixTopicDto>(TOPIC_TTL_MS, 100);
  private readonly categoriesCache = new TtlCache<readonly Category[]>(CATEGORIES_TTL_MS, 4);
  private readonly session: WebSessionGuard;

  constructor(credentials: CredentialsStore, http?: HttpClient) {
    this.http =
      http ??
      new HttpClient({
        baseUrl: BASE_URL,
        providerId: 'sasflix',
        defaultHeaders: { Referer: `${BASE_URL}/` },
      });
    this.session = new WebSessionGuard(
      'sasflix',
      this.http,
      credentials,
      this.auth.kind === 'webLogin' ? this.auth.verifySessionPath : '/api/user/profile',
    );
  }

  /** Анонимно открытая часть каталога полностью работоспособна. */
  isConfigured(): boolean {
    return true;
  }

  isSignedIn(): boolean {
    return this.session.isSignedIn();
  }

  async verifySession(context: RequestContext): Promise<boolean> {
    const wasSignedIn = this.session.isSignedIn();
    const active = await this.session.verify(context);
    // Поле `access` в ответах зависит от сессии, поэтому закэшированные
    // анонимные ответы после входа (и наоборот) становятся неверными.
    if (active !== wasSignedIn) {
      this.topicCache.clear();
    }
    return active;
  }

  async search(request: SearchRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    const page = cursorToPage(request.cursor);
    const dto = await this.http.getJson<SasflixListDto<SasflixTopicDto>>('/api/web/search', {
      query: { query: request.query, page, limit: PAGE_SIZE },
      signal: context.signal,
    });
    return toPage(dto, page);
  }

  async feed(request: FeedRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    const page = cursorToPage(request.cursor);
    const dto = await this.http.getJson<SasflixListDto<SasflixTopicDto>>('/api/web/topics', {
      query: {
        page,
        limit: PAGE_SIZE,
        category_id: request.kind === 'category' ? request.categoryId : undefined,
      },
      signal: context.signal,
    });
    return toPage(dto, page);
  }

  async getDetails(id: string, context: RequestContext): Promise<VideoDetails> {
    const dto = await this.loadTopic(id, context);
    const details = mapSasflixTopicDetails(dto);
    if (!details) {
      throw new ProviderError({ code: 'NOT_FOUND', providerId: 'sasflix' });
    }
    return details;
  }

  /** Флаг `preferEmbed` игнорируется: у Sasflix нет публичного embed-плеера. */
  async resolvePlayback(
    request: PlaybackRequest,
    context: RequestContext,
  ): Promise<PlaybackSource> {
    const topic = await this.loadTopic(request.id, context);

    // `access` — авторитетное поле «могу ли я это смотреть»: у вошедшего
    // подписчика оно приходит true даже для платного материала.
    if (topic.access === false) {
      throw new ProviderError({
        code: 'AUTH_REQUIRED',
        providerId: 'sasflix',
        message: this.isSignedIn()
          ? 'Материал не входит в вашу подписку Sasflix'
          : 'Материал по подписке Sasflix — войдите в аккаунт в настройках',
      });
    }

    const videoUuid = topic.video?.id;
    if (!videoUuid) {
      throw new ProviderError({
        code: 'NOT_FOUND',
        providerId: 'sasflix',
        message: 'У материала нет видеодорожки',
      });
    }

    return {
      kind: 'hls',
      url: buildSasflixManifestUrl(videoUuid),
      headers: { Referer: `${BASE_URL}/` },
    };
  }

  async listCategories(context: RequestContext): Promise<readonly Category[]> {
    return this.categoriesCache.getOrLoad('all', async () => {
      const dto = await this.http.getJson<SasflixListDto<SasflixCategoryDto>>(
        '/api/web/categories',
        { signal: context.signal },
      );
      return (dto.rows ?? [])
        .filter((item) => item.id !== undefined && Boolean(item.title) && item.hidden !== true)
        .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
        .map((item) => ({ id: String(item.id), title: item.title as string }));
    });
  }

  /** Детали топика нужны и для карточки, и для playback — поэтому кэшируем. */
  private loadTopic(uuid: string, context: RequestContext): Promise<SasflixTopicDto> {
    return this.topicCache.getOrLoad(uuid, () =>
      this.http.getJson<SasflixTopicDto>(`/api/web/topics/${uuid}`, { signal: context.signal }),
    );
  }
}

function cursorToPage(cursor: Cursor | undefined): number {
  const parsed = cursor ? Number.parseInt(cursor, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function toPage(dto: SasflixListDto<SasflixTopicDto>, currentPage: number): Page<VideoSummary> {
  const rows = dto.rows ?? [];
  const items = mapSasflixTopicList(rows);
  // Отфильтрованные (не-видео) записи всё равно занимают место на странице,
  // поэтому конец списка определяем по длине сырого ответа, а не items.
  const hasNext = rows.length >= PAGE_SIZE && currentPage * PAGE_SIZE < (dto.total ?? Infinity);
  return {
    items,
    nextCursor: hasNext ? String(currentPage + 1) : null,
    total: dto.total,
  };
}
