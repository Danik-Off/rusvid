/**
 * Провайдер VK Видео.
 *
 * Работает в двух режимах, и оба полноценные:
 *
 * 1. **Без входа.** Поиск, витрина, разделы и карточки видео берутся из того
 *    же API, которым пользуется сайт `vkvideo.ru`, по анонимному токену —
 *    его выдаёт `auth.getAnonymToken` кому угодно и без секрета
 *    (см. vkTokens.ts). Ни cookie, ни регистрации приложения не нужно.
 * 2. **С входом.** Cookie-сессия сайта меняется на пользовательский токен, и
 *    те же самые методы начинают отвечать персонально: в витрине появляются
 *    разделы вошедшего человека, выдача учитывает его подписки.
 *
 * Воспроизведение не зависит ни от того, ни от другого: встроенный плеер VK
 * (`video_ext.php`) открывается по одному идентификатору видео, поэтому
 * ролик из истории или избранного откроется, даже если API недоступен.
 *
 * Прямые ссылки на файлы (`files.hls`, `files.mp4_*`) в ответах платформы
 * присутствуют, но намеренно не используются: видео играется в официальном
 * плеере. Карта эндпоинтов — docs/API-RESEARCH.md#vk-видео.
 */

import { ProviderError } from '../../core/errors/ProviderError';
import type {
  Category,
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
import { TtlCache } from '../../data/cache/TtlCache';
import type { CredentialsStore } from '../../data/credentials/CredentialsStore';
import { VkApiClient } from './VkApiClient';
import type { VkCatalogResponseDto, VkVideoListDto } from './vkApiTypes';
import { vkAuthSpec } from './vkAuth';
import {
  decodeVkCursor,
  encodeVkCursor,
  readVkCatalogPage,
  readVkSections,
  type VkCatalogPage,
} from './vkCatalog';
import { mapVkVideo, mapVkVideoList } from './vkMappers';
import {
  buildVkEmbedUrl,
  buildVkWebUrl,
  extractVkPlayerHash,
  parseVkVideoId,
} from './vkVideoId';

const SECTIONS_TTL_MS = 6 * 60 * 60 * 1000;

export class VkProvider implements VideoProvider {
  readonly meta: ProviderMeta = {
    id: 'vk',
    title: 'VK Видео',
    badge: 'VK',
    accentColor: '#0077FF',
    homepage: 'https://vkvideo.ru',
    description:
      'Поиск и витрина работают без входа. Вход обычной сессией сайта добавляет ' +
      'персональную выдачу; регистрировать приложение и вводить ключи не нужно.',
  };

  readonly auth = vkAuthSpec;

  readonly capabilities: ProviderCapabilities = {
    search: true,
    trendingFeed: true,
    /**
     * Отдельной ленты подписок платформа сторонним клиентам не отдаёт
     * (`video.getSubscriptions` не существует), зато вошедшему пользователю
     * витрина сама подмешивает его разделы — они появляются в категориях.
     */
    subscriptionsFeed: false,
    categories: true,
    // Прямые ссылки платформа отдаёт, но играем в официальном плеере —
    // см. заголовок файла.
    nativePlayback: false,
    embedPlayback: true,
    // Провайдер полностью работоспособен анонимно.
    requiresCredentials: false,
  };

  private readonly sectionsCache = new TtlCache<readonly Category[]>(SECTIONS_TTL_MS, 4);

  constructor(
    private readonly credentials: CredentialsStore,
    private readonly api: VkApiClient = new VkApiClient(),
  ) {}

  isConfigured(): boolean {
    return true;
  }

  isSignedIn(): boolean {
    return this.credentials.hasSession('vk');
  }

  /**
   * Проверка входа — попытка обменять cookie сайта на пользовательский токен.
   * Получилось — сессия жива; отказ авторизации — её нет.
   */
  async verifySession(context: RequestContext): Promise<boolean> {
    try {
      await this.api.tokens.requireUser(context.signal);
      await this.credentials.setSession('vk', true);
      return true;
    } catch (cause) {
      const error = ProviderError.from(cause, 'vk');
      if (error.code === 'AUTH_REQUIRED') {
        this.api.tokens.forget();
        await this.credentials.setSession('vk', false);
        return false;
      }
      // Сеть или сам VK недоступны — это не «пользователь вышел».
      // Оставляем прежнюю отметку, чтобы вход не слетал на ровном месте.
      return this.isSignedIn();
    }
  }

  async search(request: SearchRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    const next = decodeVkCursor(request.cursor);
    // Вторая и последующие страницы поиска — это тот же раздел витрины:
    // платформа заводит его под конкретный запрос и дальше листает по нему.
    const dto = next
      ? await this.callSection(next.sectionId, next.startFrom, context)
      : await this.call('catalog.getVideoSearch', { q: request.query }, context);

    return this.toPage(dto);
  }

  async feed(request: FeedRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    if (request.kind === 'subscriptions') {
      throw new ProviderError({
        code: 'UNSUPPORTED',
        providerId: 'vk',
        message: 'Отдельной ленты подписок VK Видео не отдаёт',
      });
    }

    const next = decodeVkCursor(request.cursor);
    if (next) {
      return this.toPage(await this.callSection(next.sectionId, next.startFrom, context));
    }

    const sectionId = request.categoryId ?? (await this.defaultSectionId(context));
    return this.toPage(await this.callSection(sectionId, undefined, context));
  }

  /** Разделы витрины: у вошедшего пользователя в них попадают и его собственные. */
  async listCategories(context: RequestContext): Promise<readonly Category[]> {
    return this.sectionsCache.getOrLoad(this.isSignedIn() ? 'user' : 'anonymous', async () => {
      const dto = await this.call('catalog.getVideo', {}, context);
      const sections = readVkSections(dto).map((section) => ({
        id: section.id as string,
        title: section.title as string,
      }));
      if (sections.length === 0) {
        throw new ProviderError({
          code: 'PARSE',
          providerId: 'vk',
          message: 'ВКонтакте не отдал разделы витрины',
        });
      }
      return sections;
    });
  }

  /**
   * Детали видео.
   *
   * Если карточку получить не удалось (нет сети, ролик скрыт от анонимного
   * клиента), возвращается заготовка, собранная из идентификатора: экран
   * видео должен открываться из истории и избранного при любой погоде,
   * а плееру, кроме id, ничего не нужно.
   */
  async getDetails(id: string, context: RequestContext): Promise<VideoDetails> {
    const parsed = parseVkVideoId(id);
    const dto = await this.fetchVideo(id, context);
    const summary = dto ? mapVkVideo(dto) : null;

    return (
      summary ?? {
        uid: `vk:${id}`,
        providerId: 'vk',
        id,
        title: 'Видео ВКонтакте',
        isLive: false,
        access: 'free',
        webUrl: buildVkWebUrl(parsed),
      }
    );
  }

  /**
   * Ссылка на встроенный плеер.
   *
   * Карточка спрашивается ради `hash` — без него часть видео не открывается,
   * а вывести его из идентификатора нельзя. Но зависимости от ответа нет:
   * не получилось — играем по идентификатору.
   */
  async resolvePlayback(
    request: PlaybackRequest,
    context: RequestContext,
  ): Promise<PlaybackSource> {
    const parsed = parseVkVideoId(request.id);
    const dto = await this.fetchVideo(request.id, context);
    return { kind: 'embed', url: buildVkEmbedUrl(parsed, extractVkPlayerHash(dto?.player)) };
  }

  // -------------------------------------------------------------------------

  private call(
    method: string,
    params: Readonly<Record<string, string | undefined>>,
    context: RequestContext,
  ): Promise<VkCatalogResponseDto> {
    return this.api.call<VkCatalogResponseDto>(method, params, {
      signedIn: this.isSignedIn(),
      signal: context.signal,
    });
  }

  /** Страница раздела витрины — и для лент, и для продолжения поиска. */
  private callSection(
    sectionId: string,
    startFrom: string | undefined,
    context: RequestContext,
  ): Promise<VkCatalogResponseDto> {
    return this.call('catalog.getSection', { section_id: sectionId, start_from: startFrom }, context);
  }

  private toPage(dto: VkCatalogResponseDto): Page<VideoSummary> {
    const page: VkCatalogPage = readVkCatalogPage(dto);
    return {
      items: mapVkVideoList(page.videos, page.owners),
      nextCursor: encodeVkCursor(page),
    };
  }

  private async defaultSectionId(context: RequestContext): Promise<string> {
    const categories = await this.listCategories(context);
    return categories[0].id;
  }

  /** Карточка видео или `null`, если платформа её не отдала. */
  private async fetchVideo(id: string, context: RequestContext) {
    try {
      const dto = await this.api.call<VkVideoListDto>(
        'video.get',
        { videos: id },
        { signedIn: this.isSignedIn(), signal: context.signal },
      );
      return dto.items?.[0] ?? null;
    } catch (cause) {
      // Отмену пробрасываем: пользователь ушёл с экрана, и «заготовка»
      // вместо карточки была бы не запасным планом, а мусором в списке.
      if (ProviderError.from(cause, 'vk').code === 'CANCELLED') {
        throw cause;
      }
      return null;
    }
  }
}
