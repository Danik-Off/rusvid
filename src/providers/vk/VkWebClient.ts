/**
 * Клиент внутренних endpoint'ов веб-клиента ВКонтакте (`al_*.php`).
 *
 * Публичного API для видео без регистрации приложения у VK нет, а анонимный
 * заход на сайт заканчивается редиректом на вход (`errorCode=11300`).
 * Поэтому данные берутся тем же способом, каким их берёт сам сайт, —
 * POST-ом на `al_video.php` с cookie-сессией пользователя.
 *
 * Формат ответа недокументирован, поэтому разбор здесь принципиально
 * оборонительный: мы не полагаемся на позиции элементов в массивах, а ищем
 * в полезной нагрузке объекты, похожие на видео. Если VK поменяет раскладку,
 * поиск вернёт пусто и понятную ошибку, а не упадёт и не покажет мусор.
 */

import { ProviderError } from '../../core/errors/ProviderError';
import { HttpClient, type QueryValue } from '../../data/http/HttpClient';
import type { VkVideoDto } from './vkApiTypes';
import { VK_VIDEO_ORIGIN } from './vkAuth';

/** Насколько глубоко ищем объекты видео в недокументированной нагрузке. */
const MAX_WALK_DEPTH = 12;

export class VkWebClient {
  private readonly http: HttpClient;

  constructor(http?: HttpClient) {
    this.http =
      http ??
      new HttpClient({
        baseUrl: VK_VIDEO_ORIGIN,
        providerId: 'vk',
        defaultHeaders: {
          Accept: '*/*',
          'X-Requested-With': 'XMLHttpRequest',
          Origin: VK_VIDEO_ORIGIN,
          Referer: `${VK_VIDEO_ORIGIN}/`,
        },
      });
  }

  /** Есть ли живая сессия сайта. */
  async probeSession(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.call('search', { q: 'а', offset: 0 }, signal);
      return true;
    } catch (cause) {
      const error = ProviderError.from(cause, 'vk');
      if (error.code === 'AUTH_REQUIRED') {
        return false;
      }
      // Сеть легла — это не «пользователь вышел»; пусть решает вызывающий.
      throw error;
    }
  }

  /** Поиск по видео. Возвращает карточки в форме, знакомой мапперам VK. */
  async search(query: string, offset: number, signal?: AbortSignal): Promise<VkVideoDto[]> {
    const payload = await this.call('search', { q: query, offset }, signal);
    return collectVideoObjects(payload);
  }

  private async call(
    act: string,
    params: Readonly<Record<string, QueryValue>>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await this.http.postForm(
      '/al_video.php',
      { act, al: 1, ...params },
      { query: { act }, signal },
    );
    return parseAlEnvelope(await response.text());
  }
}

/**
 * Разбор конверта `al_*`-ответа.
 *
 * VK отдаёт `<!--` и следом JSON. Без сессии вместо конверта приходит обычная
 * HTML-страница входа — по этому и отличаем «не авторизован» от «сломался
 * формат»: разница важна, потому что в первом случае пользователю надо
 * предложить войти, а во втором — сообщить о поломке.
 */
export function parseAlEnvelope(body: string): unknown {
  const start = body.indexOf('{');
  const looksLikeHtml = /^\s*<(?:!doctype|html)/i.test(body);

  if (looksLikeHtml || start < 0) {
    throw new ProviderError({
      code: 'AUTH_REQUIRED',
      providerId: 'vk',
      message: 'Сессия ВКонтакте истекла — войдите на сайте ещё раз',
    });
  }
  try {
    return JSON.parse(body.slice(start)) as unknown;
  } catch (cause) {
    throw new ProviderError({
      code: 'PARSE',
      providerId: 'vk',
      message: 'ВКонтакте вернул ответ в неизвестном формате',
      cause,
    });
  }
}

/**
 * Рекурсивно собирает из нагрузки объекты, похожие на видео.
 *
 * Признак — пара `owner_id` + `id` рядом с чем-то содержательным
 * (заголовок или длительность). Именно эти имена полей VK использует и в
 * API, и в веб-клиенте, поэтому найденные объекты можно отдать уже
 * существующим и покрытым тестами мапперам.
 */
export function collectVideoObjects(payload: unknown): VkVideoDto[] {
  const found = new Map<string, VkVideoDto>();

  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_WALK_DEPTH || node === null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth + 1);
      }
      return;
    }
    const candidate = node as Record<string, unknown>;
    if (isVideoObject(candidate)) {
      const dto = candidate as VkVideoDto;
      // Одно и то же видео встречается в нагрузке по нескольку раз
      // (список, «похожие», предзагрузка плеера) — схлопываем по ключу.
      found.set(`${dto.owner_id}_${dto.id}`, dto);
      return;
    }
    for (const value of Object.values(candidate)) {
      walk(value, depth + 1);
    }
  };

  walk(payload, 0);
  return [...found.values()];
}

function isVideoObject(node: Record<string, unknown>): boolean {
  const hasIdentity = typeof node.owner_id === 'number' && typeof node.id === 'number';
  const hasContent = typeof node.title === 'string' || typeof node.duration === 'number';
  return hasIdentity && hasContent;
}
