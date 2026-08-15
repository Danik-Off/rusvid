/**
 * Единая ошибка слоя данных.
 *
 * Провайдеры не бросают наружу ни `TypeError` от `fetch`, ни сырые HTTP-коды:
 * всё нормализуется сюда, чтобы UI показывал понятный текст и мог решить,
 * есть ли смысл в повторе.
 */

export type ProviderErrorCode =
  | 'NETWORK' // нет сети / DNS / TLS
  | 'TIMEOUT' // превышен таймаут запроса
  | 'CANCELLED' // запрос отменён (пользователь ушёл с экрана)
  | 'AUTH_REQUIRED' // нужен токен/логин
  | 'RATE_LIMITED' // 429
  | 'NOT_FOUND' // 404
  | 'GEO_BLOCKED' // 451 / региональная блокировка
  | 'UNAVAILABLE' // 5xx
  | 'PARSE' // ответ не совпал с ожидаемой схемой
  | 'UNSUPPORTED' // провайдер не умеет эту операцию
  | 'UNKNOWN';

export interface ProviderErrorOptions {
  readonly code: ProviderErrorCode;
  readonly providerId?: string;
  readonly message?: string;
  readonly httpStatus?: number;
  readonly cause?: unknown;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly providerId?: string;
  readonly httpStatus?: number;
  readonly cause?: unknown;

  constructor(options: ProviderErrorOptions) {
    super(options.message ?? defaultMessage(options.code));
    this.name = 'ProviderError';
    this.code = options.code;
    this.providerId = options.providerId;
    this.httpStatus = options.httpStatus;
    this.cause = options.cause;
  }

  /** Есть ли смысл повторить запрос той же кнопкой «Повторить». */
  get isRetryable(): boolean {
    return (
      this.code === 'NETWORK' ||
      this.code === 'TIMEOUT' ||
      this.code === 'UNAVAILABLE' ||
      this.code === 'RATE_LIMITED'
    );
  }

  static from(error: unknown, providerId?: string): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }
    if (isAbortError(error)) {
      return new ProviderError({ code: 'CANCELLED', providerId, cause: error });
    }
    return new ProviderError({
      code: 'UNKNOWN',
      providerId,
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  );
}

export function httpStatusToCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) {
    return 'AUTH_REQUIRED';
  }
  if (status === 404 || status === 410) {
    return 'NOT_FOUND';
  }
  if (status === 429) {
    return 'RATE_LIMITED';
  }
  if (status === 451) {
    return 'GEO_BLOCKED';
  }
  if (status >= 500) {
    return 'UNAVAILABLE';
  }
  return 'UNKNOWN';
}

function defaultMessage(code: ProviderErrorCode): string {
  switch (code) {
    case 'NETWORK':
      return 'Нет соединения с сервером';
    case 'TIMEOUT':
      return 'Сервер не ответил вовремя';
    case 'CANCELLED':
      return 'Запрос отменён';
    case 'AUTH_REQUIRED':
      return 'Требуется авторизация';
    case 'RATE_LIMITED':
      return 'Слишком много запросов, попробуйте позже';
    case 'NOT_FOUND':
      return 'Видео не найдено или удалено';
    case 'GEO_BLOCKED':
      return 'Контент недоступен в вашем регионе';
    case 'UNAVAILABLE':
      return 'Платформа временно недоступна';
    case 'PARSE':
      return 'Платформа вернула неожиданный ответ';
    case 'UNSUPPORTED':
      return 'Платформа не поддерживает эту операцию';
    default:
      return 'Неизвестная ошибка';
  }
}
