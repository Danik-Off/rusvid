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
import { readResponseText } from '../../data/http/textDecoding';
import { MOBILE_USER_AGENT } from '../shared/userAgent';
import type { VkVideoDto } from './vkApiTypes';
import { VK_WEB_ORIGIN } from './vkAuth';

/** Насколько глубоко ищем объекты видео в недокументированной нагрузке. */
const MAX_WALK_DEPTH = 12;

export class VkWebClient {
  private readonly http: HttpClient;

  constructor(http?: HttpClient) {
    this.http =
      http ??
      new HttpClient({
        baseUrl: VK_WEB_ORIGIN,
        providerId: 'vk',
        defaultHeaders: {
          Accept: '*/*',
          // Без этого заголовка VK уводит мобильный клиент на `m.vk.com`,
          // и вместо конверта `al_*` приходит HTML.
          'X-Requested-With': 'XMLHttpRequest',
          Origin: VK_WEB_ORIGIN,
          Referer: `${VK_WEB_ORIGIN}/video`,
          // Без этого заголовка VK отвечает анонимному клиенту по-английски:
          // «Access denied (1)» вместо «Ошибка доступа (1)». Приложение
          // русскоязычное, и показывать в нём чужие английские сообщения
          // платформы незачем.
          'Accept-Language': 'ru-RU,ru;q=0.9',
          // Тот же браузер, что и в WebView экрана входа: сессия заводилась
          // им, им же должны уходить и запросы. См. shared/userAgent.ts.
          'User-Agent': MOBILE_USER_AGENT,
        },
      });
  }

  /**
   * Есть ли живая сессия сайта.
   *
   * Признак — идентификатор пользователя, который VK кладёт в служебный блок
   * `statsMeta` **любого** ответа `al_*`: у анонимного клиента там ноль.
   * Это надёжнее, чем «ответ вообще пришёл»: анонимному клиенту VK охотно
   * отвечает валидным JSON — только с отказом внутри (`payload: ["3", …]`,
   * то есть «иди на страницу входа»), и прежняя проверка «разобралось —
   * значит вошли» считала бы такой ответ успехом.
   */
  async probeSession(signal?: AbortSignal): Promise<boolean> {
    return extractVkUserId(await this.call('search', { q: 'а', offset: 0 }, signal)) > 0;
  }

  /** Поиск по видео. Возвращает карточки в форме, знакомой мапперам VK. */
  async search(query: string, offset: number, signal?: AbortSignal): Promise<VkVideoDto[]> {
    const payload = await this.call('search', { q: query, offset }, signal);
    // Отказ из-за пропавшей сессии обязан выглядеть как отказ, а не как
    // «ничего не нашлось»: иначе пользователю предложат уточнить запрос
    // вместо того, чтобы предложить войти заново.
    if (extractVkUserId(payload) <= 0) {
      throw new ProviderError({
        code: 'AUTH_REQUIRED',
        providerId: 'vk',
        message: 'Сессия ВКонтакте истекла — войдите на сайте ещё раз',
      });
    }
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
    // Не `response.text()`: VK отвечает в windows-1251 сырыми байтами, и
    // разбор как UTF-8 необратимо съедает кириллицу в заголовках видео.
    return parseAlEnvelope(await readResponseText(response));
  }
}

/**
 * Разбор конверта `al_*`-ответа.
 *
 * Исторически VK отдавал `<!--` и следом JSON; сейчас — чистый JSON, но
 * префикс всё ещё встречается на части endpoint'ов, поэтому поддерживаем оба.
 * Без сессии вместо конверта иногда приходит обычная HTML-страница входа —
 * по этому и отличаем «не авторизован» от «сломался формат»: разница важна,
 * потому что в первом случае пользователю надо предложить войти, а во
 * втором — сообщить о поломке.
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
 * Идентификатор пользователя из служебного блока ответа (`statsMeta.id`).
 * Ноль — анонимный клиент.
 *
 * Отсутствие самого поля — это не «не вошёл», а «VK поменял формат»: молча
 * считать такой ответ выходом означало бы выкидывать пользователя из
 * аккаунта при первом же изменении на стороне платформы.
 */
export function extractVkUserId(payload: unknown): number {
  const meta = asRecord(asRecord(payload)?.statsMeta);
  const id = meta?.id;
  if (typeof id !== 'number' || !Number.isFinite(id)) {
    throw new ProviderError({
      code: 'PARSE',
      providerId: 'vk',
      message: 'ВКонтакте не сообщил, кто вошёл, — формат ответа изменился',
    });
  }
  return id;
}

function asRecord(node: unknown): Record<string, unknown> | null {
  return node !== null && typeof node === 'object' ? (node as Record<string, unknown>) : null;
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
