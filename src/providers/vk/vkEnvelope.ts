/**
 * Конверт ответа API ВКонтакте и перевод его ошибок в ошибки приложения.
 *
 * Ключевая особенность платформы: **ошибка приходит с HTTP 200** и телом
 * `{"error": {...}}`. Проверять статус-код недостаточно — без разбора тела
 * отказ «нужен вход» выглядел бы как успешный пустой список.
 */

import { ProviderError } from '../../core/errors/ProviderError';
import type { VkEnvelopeDto, VkErrorDto } from './vkApiTypes';

const PROVIDER_ID = 'vk';

/**
 * Коды ошибок ВКонтакте, значимые для приложения.
 *
 * `5` и `28` — это ровно граница «анонимно / только с входом»: их отдают
 * методы, которым нужен пользовательский токен. Остальные коды переводим,
 * чтобы UI показал причину, а не «неизвестная ошибка».
 */
const VK_ERROR_CODES = {
  /** Пользовательская авторизация не прошла (сессии нет или она истекла). */
  userAuthFailed: 5,
  /** Слишком много запросов. */
  tooManyRequests: 6,
  /** Доступ запрещён (например, метод недоступен анонимному клиенту). */
  accessDenied: 15,
  /** Страница удалена или заблокирована. */
  deletedOrBanned: 18,
  /** Лимит на количество вызовов. */
  rateLimit: 29,
  /** Метод недоступен с анонимным токеном — нужен вход. */
  anonymousNotAllowed: 28,
  /** Доступ к видео закрыт. */
  videoAccessDenied: 204,
} as const;

/** Нужен ли для этой ошибки именно вход (а не что-то другое). */
export function isVkAuthError(error: VkErrorDto | undefined): boolean {
  return (
    error?.error_code === VK_ERROR_CODES.userAuthFailed ||
    error?.error_code === VK_ERROR_CODES.anonymousNotAllowed
  );
}

export function vkErrorToProviderError(error: VkErrorDto): ProviderError {
  const message = error.error_msg?.trim();
  switch (error.error_code) {
    case VK_ERROR_CODES.userAuthFailed:
    case VK_ERROR_CODES.anonymousNotAllowed:
      return new ProviderError({
        code: 'AUTH_REQUIRED',
        providerId: PROVIDER_ID,
        message: 'Войдите во ВКонтакте — этот раздел платформа отдаёт только своим пользователям',
        cause: error,
      });
    case VK_ERROR_CODES.tooManyRequests:
    case VK_ERROR_CODES.rateLimit:
      return new ProviderError({ code: 'RATE_LIMITED', providerId: PROVIDER_ID, cause: error });
    case VK_ERROR_CODES.deletedOrBanned:
    case VK_ERROR_CODES.videoAccessDenied:
    case VK_ERROR_CODES.accessDenied:
      return new ProviderError({
        code: 'NOT_FOUND',
        providerId: PROVIDER_ID,
        message: message || 'Видео недоступно',
        cause: error,
      });
    default:
      return new ProviderError({
        code: 'UNKNOWN',
        providerId: PROVIDER_ID,
        message: message || 'ВКонтакте отклонил запрос',
        cause: error,
      });
  }
}

/**
 * Достать полезную нагрузку из конверта.
 *
 * Пустой `response` — это не «ничего не нашлось», а изменившийся формат:
 * успешный ответ у VK всегда содержит объект. Отличать важно, потому что
 * в первом случае надо показать «ничего не найдено», а во втором —
 * честно сказать, что сломалось.
 */
export function unwrapVkEnvelope<T>(body: string): T {
  let envelope: VkEnvelopeDto<T>;
  try {
    envelope = JSON.parse(body) as VkEnvelopeDto<T>;
  } catch (cause) {
    throw new ProviderError({
      code: 'PARSE',
      providerId: PROVIDER_ID,
      message: 'ВКонтакте вернул ответ в неизвестном формате',
      cause,
    });
  }

  if (envelope.error) {
    throw vkErrorToProviderError(envelope.error);
  }
  if (envelope.response === undefined || envelope.response === null) {
    throw new ProviderError({
      code: 'PARSE',
      providerId: PROVIDER_ID,
      message: 'ВКонтакте ответил без данных',
    });
  }
  return envelope.response;
}
