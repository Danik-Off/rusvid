/**
 * Клиент API VK Видео (`api.vkvideo.ru/method/*`).
 *
 * Это тот же шлюз, которым пользуется сайт `vkvideo.ru`, и обращаемся мы к
 * нему так же: POST формой, версия API в параметрах, токен доступа — от
 * {@link VkTokenStore}. Внутренние endpoint'ы старого веб-клиента
 * (`vk.com/al_video.php`) здесь больше не используются: анонимному клиенту
 * они отвечают отказом `payload: ["3", …]` при любых заголовках и cookie,
 * а на `vkvideo.ru` их просто нет (404). Через этот шлюз, наоборот,
 * работают и анонимный, и вошедший пользователь.
 */

import { HttpClient, type QueryValue } from '../../data/http/HttpClient';
import { ProviderError } from '../../core/errors/ProviderError';
import { unwrapVkEnvelope } from './vkEnvelope';
import { VK_API_VERSION, VkTokenStore, type VkTokenKind } from './vkTokens';

export const VK_API_ORIGIN = 'https://api.vkvideo.ru';

export interface VkCallOptions {
  /**
   * Пользователь входил на сайте — значит, стоит попробовать его сессию.
   * Если она уже истекла, запрос всё равно уйдёт (анонимно): истёкшая
   * cookie не должна превращать работающий поиск в ошибку.
   */
  readonly signedIn?: boolean;
  readonly signal?: AbortSignal;
}

export class VkApiClient {
  private readonly http: HttpClient;
  readonly tokens: VkTokenStore;

  constructor(http?: HttpClient, tokens?: VkTokenStore) {
    this.http =
      http ??
      new HttpClient({
        baseUrl: VK_API_ORIGIN,
        providerId: 'vk',
        // Шлюз отвечает `application/json; charset=utf-8` и не требует ни
        // Origin, ни Referer, ни особого User-Agent: заголовки, которые
        // приходилось подделывать ради `al_video.php`, здесь не нужны.
        defaultHeaders: { Accept: 'application/json' },
      });
    this.tokens = tokens ?? new VkTokenStore(this.http);
  }

  /**
   * Вызов метода.
   *
   * Если пользовательский токен отвергнут (сессия истекла, пока приложение
   * было закрыто), запрос повторяется анонимно: для поиска и витрины вход
   * не обязателен, и терять их из-за протухшей cookie незачем.
   */
  async call<T>(
    method: string,
    params: Readonly<Record<string, QueryValue>>,
    options: VkCallOptions = {},
  ): Promise<T> {
    const prefer: VkTokenKind = options.signedIn ? 'user' : 'anonymous';
    try {
      return await this.callWith(prefer, method, params, options.signal);
    } catch (cause) {
      const error = ProviderError.from(cause, 'vk');
      if (prefer === 'user' && error.code === 'AUTH_REQUIRED') {
        this.tokens.forget();
        return this.callWith('anonymous', method, params, options.signal);
      }
      throw error;
    }
  }

  private async callWith<T>(
    prefer: VkTokenKind,
    method: string,
    params: Readonly<Record<string, QueryValue>>,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = await this.tokens.get(prefer, signal);
    const response = await this.http.postForm(
      `/method/${method}`,
      { ...params, v: VK_API_VERSION, lang: 'ru', access_token: token.value },
      { signal },
    );
    return unwrapVkEnvelope<T>(await response.text());
  }
}
