import { ProviderError } from '../../../core/errors/ProviderError';
import { buildQueryString, HttpClient } from '../HttpClient';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function mockFetch(implementation: jest.Mock): jest.Mock {
  globalThis.fetch = implementation as unknown as typeof fetch;
  return implementation;
}

function client(maxRetries = 0): HttpClient {
  return new HttpClient({
    baseUrl: 'https://example.test',
    providerId: 'rutube',
    maxRetries,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('buildQueryString', () => {
  it('пропускает пустые значения', () => {
    expect(
      buildQueryString({ page: 1, query: undefined, sort: null, empty: '', flag: false }),
    ).toBe('page=1&flag=false');
  });

  it('экранирует значения', () => {
    expect(buildQueryString({ query: 'кот и пёс' })).toBe(
      'query=%D0%BA%D0%BE%D1%82%20%D0%B8%20%D0%BF%D1%91%D1%81',
    );
  });
});

describe('HttpClient', () => {
  it('собирает URL из baseUrl, пути и query', async () => {
    const fetchMock = mockFetch(jest.fn().mockResolvedValue(jsonResponse({ ok: true })));

    await client().getJson('/api/search/', { query: { page: 2 } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/api/search/?page=2',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('не повторяет запрос на 404 и отдаёт код NOT_FOUND', async () => {
    const fetchMock = mockFetch(jest.fn().mockResolvedValue(jsonResponse({}, 404)));

    await expect(client(2).getJson('/x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('повторяет запрос на 5xx и отдаёт UNAVAILABLE после исчерпания попыток', async () => {
    const fetchMock = mockFetch(jest.fn().mockResolvedValue(jsonResponse({}, 503)));

    await expect(client(1).getJson('/x')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(2); // первая попытка + один повтор
  });

  it('переводит 401 в AUTH_REQUIRED', async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse({}, 401)));

    await expect(client().getJson('/x')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('не идёт в сеть, если запрос уже отменён', async () => {
    const fetchMock = mockFetch(jest.fn());
    const controller = new AbortController();
    controller.abort();

    await expect(client().getJson('/x', { signal: controller.signal })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('превращает битый JSON в ошибку PARSE', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'не json',
      } as Response),
    );

    await expect(client().getJson('/x')).rejects.toMatchObject({ code: 'PARSE' });
  });

  it('оборачивает сетевой сбой в ProviderError NETWORK', async () => {
    mockFetch(jest.fn().mockRejectedValue(new TypeError('Network request failed')));

    const error: unknown = await client()
      .getJson('/x')
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe('NETWORK');
    expect((error as ProviderError).isRetryable).toBe(true);
  });
});
