import { ProviderError } from '../../../core/errors/ProviderError';
import { collectVideoObjects, extractVkUserId, parseAlEnvelope } from '../VkWebClient';

describe('parseAlEnvelope', () => {
  it('разбирает чистый JSON, который VK отдаёт сейчас', () => {
    expect(parseAlEnvelope('{"payload":[0,[]]}')).toEqual({ payload: [0, []] });
  });

  it('снимает исторический префикс `<!--`', () => {
    expect(parseAlEnvelope('<!--{"payload":[0,[]]}')).toEqual({ payload: [0, []] });
  });

  it('страницу входа считает истёкшей сессией, а не поломкой формата', () => {
    // Именно это VK отдаёт анонимному клиенту вместо конверта.
    const error = catchError(() => parseAlEnvelope('<!DOCTYPE html>\n<html><head>…'));
    expect(error.code).toBe('AUTH_REQUIRED');
  });

  it('битый конверт отличает от отсутствия сессии', () => {
    expect(catchError(() => parseAlEnvelope('<!--{ не json')).code).toBe('PARSE');
  });
});

describe('extractVkUserId', () => {
  /**
   * Отказ анонимному клиенту — это ВАЛИДНЫЙ JSON, а не HTML: `payload: ["3", …]`
   * означает «иди на страницу входа». Проверка «ответ разобрался — значит вошли»
   * принимала такой отказ за успех, поэтому смотрим именно на `statsMeta.id`.
   */
  it('у анонимного клиента идентификатор нулевой', () => {
    const anonymous = { payload: ['3', []], statsMeta: { platform: 'web2', id: 0 } };
    expect(extractVkUserId(anonymous)).toBe(0);
  });

  it('у вошедшего пользователя возвращает его id', () => {
    expect(extractVkUserId({ payload: [0, []], statsMeta: { id: 12345 } })).toBe(12345);
  });

  it('пропавшее поле — это смена формата, а не выход из аккаунта', () => {
    expect(catchError(() => extractVkUserId({ payload: [0, []] })).code).toBe('PARSE');
    expect(catchError(() => extractVkUserId({ statsMeta: { id: 'нет' } })).code).toBe('PARSE');
    expect(catchError(() => extractVkUserId(null)).code).toBe('PARSE');
  });
});

describe('collectVideoObjects', () => {
  const video = (id: number, title: string) => ({
    id,
    owner_id: -100,
    title,
    duration: 60,
    date: 1700000000,
  });

  it('находит видео на любой глубине недокументированной нагрузки', () => {
    const payload = {
      payload: [0, [{ list: { items: [video(1, 'первое')] } }, [[video(2, 'второе')]]]],
    };
    expect(collectVideoObjects(payload).map((item) => item.title)).toEqual(['первое', 'второе']);
  });

  it('схлопывает повторы одного видео', () => {
    const payload = [video(1, 'ролик'), { related: [video(1, 'ролик')] }];
    expect(collectVideoObjects(payload)).toHaveLength(1);
  });

  it('не принимает за видео посторонние объекты', () => {
    // У профилей есть id, но нет ни owner_id, ни длительности с заголовком.
    const payload = { profiles: [{ id: 5, first_name: 'Иван' }], groups: [{ id: 7, name: 'Клуб' }] };
    expect(collectVideoObjects(payload)).toEqual([]);
  });

  it('переживает пустую и странную нагрузку', () => {
    expect(collectVideoObjects(null)).toEqual([]);
    expect(collectVideoObjects('строка')).toEqual([]);
    expect(collectVideoObjects({})).toEqual([]);
  });
});

function catchError(run: () => unknown): ProviderError {
  try {
    run();
  } catch (error) {
    return error as ProviderError;
  }
  throw new Error('Ожидалась ошибка, но её не было');
}
