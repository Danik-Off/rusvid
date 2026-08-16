/**
 * Тонкий HTTP-клиент поверх `fetch`: таймаут, повторы с экспоненциальной
 * задержкой, сборка query-строки и нормализация ошибок в {@link ProviderError}.
 *
 * Провайдеры не вызывают `fetch` напрямую — это гарантирует единое поведение
 * при таймаутах/ретраях и один общий User-Agent.
 */

import { httpStatusToCode, isAbortError, ProviderError } from '../../core/errors/ProviderError';

export type QueryValue = string | number | boolean | undefined | null;

export interface HttpClientOptions {
  readonly baseUrl: string;
  /** Идентификатор провайдера — попадёт в ошибку для диагностики. */
  readonly providerId?: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /** Количество ПОВТОРОВ (0 — только одна попытка). */
  readonly maxRetries?: number;
}

export interface RequestOptions {
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  /** Переопределить таймаут для конкретного запроса. */
  readonly timeoutMs?: number;
}

/** Тело и метод для запросов, отличных от GET. */
interface RequestPayload {
  readonly method: 'POST';
  readonly body: string;
  readonly contentType: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

export class HttpClient {
  private readonly baseUrl: string;
  private readonly providerId?: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.providerId = options.providerId;
    this.defaultHeaders = { Accept: 'application/json', ...options.defaultHeaders };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /** GET + разбор JSON. Тип возврата не валидируется — это делают мапперы. */
  async getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.get(path, options);
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new ProviderError({
        code: 'PARSE',
        providerId: this.providerId,
        message: 'Не удалось разобрать JSON-ответ',
        cause,
      });
    }
  }

  async get(path: string, options: RequestOptions = {}): Promise<Response> {
    return this.request(path, options);
  }

  /**
   * POST формой `application/x-www-form-urlencoded`.
   *
   * Нужен для внутренних endpoint'ов веб-клиентов платформ: они принимают
   * только форму и только POST. Тело собирается здесь, чтобы вызывающий
   * не занимался экранированием.
   */
  async postForm(
    path: string,
    body: Readonly<Record<string, QueryValue>>,
    options: RequestOptions = {},
  ): Promise<Response> {
    return this.request(path, options, {
      method: 'POST',
      // Тело формы кодируется тем же способом, что и query-строка.
      body: buildQueryString(body),
      contentType: 'application/x-www-form-urlencoded; charset=utf-8',
    });
  }

  private async request(
    path: string,
    options: RequestOptions,
    payload?: RequestPayload,
  ): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.executeOnce(url, options, payload);
      } catch (error) {
        const providerError = ProviderError.from(error, this.providerId);
        if (providerError.code === 'CANCELLED' || !providerError.isRetryable) {
          throw providerError;
        }
        lastError = providerError;
        if (attempt < this.maxRetries) {
          await delay(RETRY_BASE_DELAY_MS * 2 ** attempt, options.signal);
        }
      }
    }

    throw lastError ?? new ProviderError({ code: 'UNKNOWN', providerId: this.providerId });
  }

  private async executeOnce(
    url: string,
    options: RequestOptions,
    payload?: RequestPayload,
  ): Promise<Response> {
    // Если вызывающий уже отменил запрос, слушатель 'abort' ниже не сработает
    // (событие произошло раньше подписки) — проверяем явно.
    if (options.signal?.aborted) {
      throw new ProviderError({ code: 'CANCELLED', providerId: this.providerId });
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromCaller);

    try {
      const response = await fetch(url, {
        method: payload?.method ?? 'GET',
        headers: {
          ...this.defaultHeaders,
          ...(payload ? { 'Content-Type': payload.contentType } : {}),
          ...options.headers,
        },
        body: payload?.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderError({
          code: httpStatusToCode(response.status),
          providerId: this.providerId,
          httpStatus: response.status,
          message: `HTTP ${response.status} для ${url}`,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      if (isAbortError(error)) {
        // Отличаем «пользователь ушёл с экрана» от «сервер не ответил».
        if (options.signal?.aborted) {
          throw new ProviderError({ code: 'CANCELLED', providerId: this.providerId, cause: error });
        }
        throw new ProviderError({
          code: 'TIMEOUT',
          providerId: this.providerId,
          message: `Таймаут ${timeoutMs} мс для ${url}`,
          cause: error,
        });
      }
      throw new ProviderError({
        code: 'NETWORK',
        providerId: this.providerId,
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private buildUrl(path: string, query?: Readonly<Record<string, QueryValue>>): string {
    const absolute = /^https?:\/\//i.test(path);
    const base = absolute ? path : `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
    const search = buildQueryString(query);
    if (!search) {
      return base;
    }
    return base.includes('?') ? `${base}&${search}` : `${base}?${search}`;
  }
}

export function buildQueryString(query?: Readonly<Record<string, QueryValue>>): string {
  if (!query) {
    return '';
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('&');
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new ProviderError({ code: 'CANCELLED' }));
    }
    signal?.addEventListener('abort', onAbort);
  });
}
