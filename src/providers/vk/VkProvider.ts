/**
 * Провайдер VK Видео.
 *
 * Два свойства, отличающие его от Rutube и Sasflix:
 *
 * 1. **Воспроизведение не требует ничего.** Встроенный плеер VK
 *    (`video_ext.php`) открывается по одному только идентификатору видео —
 *    без сессии, без токена и без единого обращения к API. Поэтому
 *    `resolvePlayback` вообще не ходит в сеть: пока карточка есть, видео
 *    откроется, даже если пользователь не входил.
 * 2. **Списки требуют сессии сайта.** Публичного поиска у VK нет: анонимный
 *    заход отвечает `errorCode=11300 invalid user`. Данные берутся так же,
 *    как их берёт сам сайт, — через cookie-сессию, которую пользователь
 *    заводит обычным входом во встроенном браузере (см. vkAuth.ts).
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
import { vkAuthSpec } from './vkAuth';
import { mapVkVideoList } from './vkMappers';
import { buildVkEmbedUrl, buildVkWebUrl, parseVkVideoId } from './vkVideoId';
import { VkWebClient } from './VkWebClient';

const PAGE_SIZE = 20;

export class VkProvider implements VideoProvider {
  readonly meta: ProviderMeta = {
    id: 'vk',
    title: 'VK Видео',
    badge: 'VK',
    accentColor: '#0077FF',
    homepage: 'https://vkvideo.ru',
    description:
      'Вход обычной сессией сайта — регистрировать приложение и вводить ключи не нужно. ' +
      'Воспроизведение — во встроенном плеере VK.',
  };

  readonly auth = vkAuthSpec;

  readonly capabilities: ProviderCapabilities = {
    search: true,
    // Ленту VK отдаёт только персонализированную и только веб-клиенту;
    // разбирать её раскладку ради вкладки «тренды» пока не за чем.
    trendingFeed: false,
    subscriptionsFeed: false,
    categories: false,
    // Прямые ссылки на файлы VK сторонним клиентам не отдаёт, и мы их
    // не извлекаем: играем в официальном встроенном плеере.
    nativePlayback: false,
    embedPlayback: true,
    // Провайдер полезен и без входа: по ссылке из истории или избранного
    // видео откроется, потому что плееру авторизация не нужна.
    requiresCredentials: false,
  };

  constructor(
    private readonly credentials: CredentialsStore,
    private readonly web: VkWebClient = new VkWebClient(),
  ) {}

  /** Плеер работает всегда, поэтому провайдер готов и без входа. */
  isConfigured(): boolean {
    return true;
  }

  isSignedIn(): boolean {
    return this.credentials.hasSession('vk');
  }

  async verifySession(context: RequestContext): Promise<boolean> {
    try {
      const active = await this.web.probeSession(context.signal);
      await this.credentials.setSession('vk', active);
      return active;
    } catch (cause) {
      const error = ProviderError.from(cause, 'vk');
      if (error.code === 'AUTH_REQUIRED') {
        // VK явно показал страницу входа — это и есть «не вошёл».
        await this.credentials.setSession('vk', false);
        return false;
      }
      // Сеть или сам VK недоступны — это не «пользователь вышел».
      // Оставляем прежнюю отметку, чтобы вход не слетал на ровном месте.
      return this.isSignedIn();
    }
  }

  async search(request: SearchRequest, context: RequestContext): Promise<Page<VideoSummary>> {
    this.requireSession();
    const offset = cursorToOffset(request.cursor);
    const items = mapVkVideoList(await this.web.search(request.query, offset, context.signal));

    return {
      items,
      // VK не сообщает общее количество результатов веб-клиенту, поэтому
      // «есть ли ещё» определяется по наполненности страницы.
      nextCursor: items.length >= PAGE_SIZE ? String(offset + items.length) : null,
    };
  }

  async feed(_request: FeedRequest, _context: RequestContext): Promise<Page<VideoSummary>> {
    throw new ProviderError({
      code: 'UNSUPPORTED',
      providerId: 'vk',
      message: 'Лента VK доступна только в веб-клиенте платформы',
    });
  }

  /**
   * Детали берутся из уже известной карточки: отдельного запроса ради
   * заголовка и превью не нужно — они пришли вместе с результатом поиска,
   * а всё, что нужно плееру, выводится из идентификатора.
   */
  async getDetails(id: string, _context: RequestContext): Promise<VideoDetails> {
    const parsed = parseVkVideoId(id);
    return {
      uid: `vk:${id}`,
      providerId: 'vk',
      id,
      title: 'Видео ВКонтакте',
      isLive: false,
      access: 'free',
      webUrl: buildVkWebUrl(parsed),
    };
  }

  /** Ни сети, ни авторизации: ссылка на плеер собирается из идентификатора. */
  async resolvePlayback(
    request: PlaybackRequest,
    _context: RequestContext,
  ): Promise<PlaybackSource> {
    return { kind: 'embed', url: buildVkEmbedUrl(parseVkVideoId(request.id)) };
  }

  private requireSession(): void {
    if (!this.isSignedIn()) {
      throw new ProviderError({
        code: 'AUTH_REQUIRED',
        providerId: 'vk',
        message: 'Войдите во ВКонтакте в настройках — поиск по видео работает только с входом',
      });
    }
  }
}

function cursorToOffset(cursor: Cursor | undefined): number {
  const parsed = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
