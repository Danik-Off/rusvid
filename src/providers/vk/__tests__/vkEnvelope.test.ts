import type { ProviderError } from '../../../core/errors/ProviderError';
import { isVkAuthError, unwrapVkEnvelope } from '../vkEnvelope';

describe('unwrapVkEnvelope', () => {
  it('достаёт полезную нагрузку', () => {
    expect(unwrapVkEnvelope<{ count: number }>('{"response":{"count":2}}')).toEqual({ count: 2 });
  });

  /**
   * Главная особенность платформы: отказ приезжает с HTTP 200. Без разбора
   * тела «войдите» выглядело бы как успешный пустой список.
   */
  it('ошибку внутри успешного HTTP-ответа считает ошибкой', () => {
    const error = catchError(() =>
      unwrapVkEnvelope('{"error":{"error_code":5,"error_msg":"User authorization failed"}}'),
    );
    expect(error.code).toBe('AUTH_REQUIRED');
  });

  it('«метод недоступен анонимному токену» — это тоже «нужен вход»', () => {
    const error = catchError(() => unwrapVkEnvelope('{"error":{"error_code":28}}'));
    expect(error.code).toBe('AUTH_REQUIRED');
  });

  it('различает лимит, недоступность видео и неизвестный отказ', () => {
    expect(catchError(() => unwrapVkEnvelope('{"error":{"error_code":29}}')).code).toBe(
      'RATE_LIMITED',
    );
    expect(catchError(() => unwrapVkEnvelope('{"error":{"error_code":204}}')).code).toBe(
      'NOT_FOUND',
    );
    expect(catchError(() => unwrapVkEnvelope('{"error":{"error_code":1337}}')).code).toBe(
      'UNKNOWN',
    );
  });

  /** Пустой `response` — смена формата, а не «ничего не нашлось». */
  it('отсутствие данных отличает от битого JSON', () => {
    expect(catchError(() => unwrapVkEnvelope('{"foo":1}')).code).toBe('PARSE');
    expect(catchError(() => unwrapVkEnvelope('<!DOCTYPE html>')).code).toBe('PARSE');
  });
});

describe('isVkAuthError', () => {
  it('отделяет «нужен вход» от прочих отказов', () => {
    expect(isVkAuthError({ error_code: 5 })).toBe(true);
    expect(isVkAuthError({ error_code: 28 })).toBe(true);
    expect(isVkAuthError({ error_code: 15 })).toBe(false);
    expect(isVkAuthError(undefined)).toBe(false);
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
