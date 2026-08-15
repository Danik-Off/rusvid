/**
 * Клиент VK API: подстановка токена/версии и перевод VK-ошибок в ProviderError.
 */

import { ProviderError } from '../../core/errors/ProviderError';
import { HttpClient, type QueryValue } from '../../data/http/HttpClient';
import type { VkResponseDto } from './vkApiTypes';

export const VK_API_VERSION = '5.199';
const VK_API_BASE = 'https://api.vk.com/method';

/** Коды ошибок VK, которые нужно различать. Полный список — dev.vk.com/reference/errors. */
const VK_ERROR_AUTH_FAILED = 5;
const VK_ERROR_TOO_MANY_REQUESTS = 6;
const VK_ERROR_PERMISSION_DENIED = 7;
const VK_ERROR_ACCESS_DENIED = 15;
const VK_ERROR_RATE_LIMIT = 29;
const VK_ERROR_USER_BLOCKED = 18;

export class VkApiClient {
  private readonly http: HttpClient;

  constructor(http?: HttpClient) {
    this.http =
      http ??
      new HttpClient({
        baseUrl: VK_API_BASE,
        providerId: 'vk',
      });
  }

  async call<T>(
    method: string,
    token: string,
    params: Readonly<Record<string, QueryValue>>,
    signal?: AbortSignal,
  ): Promise<T> {
    const payload = await this.http.getJson<VkResponseDto<T>>(`/${method}`, {
      query: { ...params, access_token: token, v: VK_API_VERSION },
      signal,
    });

    if (payload.error) {
      throw toProviderError(payload.error.error_code, payload.error.error_msg);
    }
    if (payload.response === undefined) {
      throw new ProviderError({
        code: 'PARSE',
        providerId: 'vk',
        message: `Метод ${method} вернул пустой ответ`,
      });
    }
    return payload.response;
  }
}

function toProviderError(code: number | undefined, message: string | undefined): ProviderError {
  switch (code) {
    case VK_ERROR_AUTH_FAILED:
      return new ProviderError({
        code: 'AUTH_REQUIRED',
        providerId: 'vk',
        message: 'Токен VK недействителен или истёк — обновите его в настройках',
      });
    case VK_ERROR_PERMISSION_DENIED:
    case VK_ERROR_ACCESS_DENIED:
      return new ProviderError({
        code: 'AUTH_REQUIRED',
        providerId: 'vk',
        message: message ?? 'У токена нет прав на видео (нужен scope video)',
      });
    case VK_ERROR_TOO_MANY_REQUESTS:
    case VK_ERROR_RATE_LIMIT:
      return new ProviderError({ code: 'RATE_LIMITED', providerId: 'vk', message });
    case VK_ERROR_USER_BLOCKED:
      return new ProviderError({ code: 'GEO_BLOCKED', providerId: 'vk', message });
    default:
      return new ProviderError({
        code: 'UNKNOWN',
        providerId: 'vk',
        message: message ?? `Ошибка VK API${code === undefined ? '' : ` (код ${code})`}`,
      });
  }
}
