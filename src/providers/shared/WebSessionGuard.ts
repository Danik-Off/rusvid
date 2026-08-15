/**
 * Учёт cookie-сессии сайта для варианта авторизации `webLogin`.
 *
 * Сессию хранит система: на Android `WebView` и сетевой стек React Native
 * используют общий `android.webkit.CookieManager`, поэтому после входа на
 * сайте во встроенном браузере обычные запросы провайдера автоматически
 * уходят авторизованными. Приложению остаётся только знать, состоялся ли
 * вход, — это и делает `WebSessionGuard`.
 *
 * В `CredentialsStore` лежит лишь отметка «вход был» (для мгновенного
 * ответа UI). Источник истины — живой запрос `verify()`.
 */

import { ProviderError } from '../../core/errors/ProviderError';
import type { ProviderId } from '../../core/model/media';
import type { RequestContext } from '../../core/provider/VideoProvider';
import type { CredentialsStore } from '../../data/credentials/CredentialsStore';
import type { HttpClient } from '../../data/http/HttpClient';

export class WebSessionGuard {
  constructor(
    private readonly providerId: ProviderId,
    private readonly http: HttpClient,
    private readonly credentials: CredentialsStore,
    /** Путь, отвечающий 401/403 без сессии и 200 с ней. */
    private readonly verifyPath: string,
  ) {}

  isSignedIn(): boolean {
    return this.credentials.hasSession(this.providerId);
  }

  /** Живая проверка сессии; результат запоминается для UI. */
  async verify(context: RequestContext = {}): Promise<boolean> {
    const active = await this.probe(context);
    await this.credentials.setSession(this.providerId, active);
    return active;
  }

  /** Забыть сессию локально. Cookie сайта чистит экран входа. */
  async forget(): Promise<void> {
    await this.credentials.setSession(this.providerId, false);
  }

  private async probe(context: RequestContext): Promise<boolean> {
    try {
      await this.http.getJson<unknown>(this.verifyPath, {
        signal: context.signal,
        // Проверка сессии не должна заставлять пользователя ждать:
        // при недоступной сети честнее быстро ответить «не вошёл».
        timeoutMs: 8000,
      });
      return true;
    } catch (cause) {
      const error = ProviderError.from(cause, this.providerId);
      if (error.code === 'AUTH_REQUIRED') {
        return false;
      }
      // Сеть легла или платформа отвечает 5xx — это не «пользователь вышел».
      // Оставляем прежнюю отметку, чтобы вход не «слетал» на ровном месте.
      if (error.isRetryable) {
        return this.isSignedIn();
      }
      return false;
    }
  }
}
