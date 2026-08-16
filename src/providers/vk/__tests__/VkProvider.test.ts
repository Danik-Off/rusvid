import { ProviderError } from '../../../core/errors/ProviderError';
import { CredentialsStore } from '../../../data/credentials/CredentialsStore';
import { InMemoryKeyValueStore } from '../../../data/storage/KeyValueStore';
import type { VkApiClient } from '../VkApiClient';
import { VkProvider } from '../VkProvider';

interface Call {
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly signedIn: boolean;
}

/** Заглушка API: отвечает по имени метода, записывает, о чём спросили. */
function stubApi(responses: Readonly<Record<string, unknown>>): {
  api: VkApiClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const api = {
    tokens: { requireUser: jest.fn(), forget: jest.fn() },
    call: async (
      method: string,
      params: Readonly<Record<string, unknown>>,
      options: { signedIn?: boolean },
    ) => {
      calls.push({ method, params, signedIn: Boolean(options.signedIn) });
      const response = responses[method];
      if (response === undefined) {
        throw new ProviderError({ code: 'UNAVAILABLE', providerId: 'vk' });
      }
      return response;
    },
  } as unknown as VkApiClient;

  return { api, calls };
}

const credentials = (): CredentialsStore => new CredentialsStore(new InMemoryKeyValueStore());

const searchResponse = {
  catalog: {
    sections: [
      { id: 'sec-поиск', blocks: [{ videos_ids: ['-1_10'] }], next_from: 'позиция-2' },
    ],
  },
  videos: [{ owner_id: -1, id: 10, title: 'Ролик', duration: 30 }],
  groups: [{ id: 1, name: 'Клуб', screen_name: 'club' }],
};

describe('VkProvider', () => {
  it('работает без входа: провайдер готов и не требует учётных данных', () => {
    const provider = new VkProvider(credentials(), stubApi({}).api);

    expect(provider.isConfigured()).toBe(true);
    expect(provider.isSignedIn()).toBe(false);
    expect(provider.capabilities.requiresCredentials).toBe(false);
  });

  it('ищет через каталог и отдаёт курсор на следующую страницу', async () => {
    const { api, calls } = stubApi({ 'catalog.getVideoSearch': searchResponse });
    const page = await new VkProvider(credentials(), api).search({ query: 'кот' }, {});

    expect(calls[0]).toMatchObject({ method: 'catalog.getVideoSearch', params: { q: 'кот' } });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].author?.name).toBe('Клуб');
    expect(page.nextCursor).not.toBeNull();
  });

  /**
   * Вторая страница поиска — это уже раздел витрины: платформа заводит его
   * под конкретный запрос, и листается он не по `q`, а по разделу с позицией.
   */
  it('продолжает поиск по разделу из курсора, а не по тексту запроса', async () => {
    const { api, calls } = stubApi({
      'catalog.getVideoSearch': searchResponse,
      'catalog.getSection': { section: { id: 'sec-поиск' }, videos: [] },
    });
    const provider = new VkProvider(credentials(), api);

    const first = await provider.search({ query: 'кот' }, {});
    await provider.search({ query: 'кот', cursor: first.nextCursor as string }, {});

    expect(calls[1]).toMatchObject({
      method: 'catalog.getSection',
      params: { section_id: 'sec-поиск', start_from: 'позиция-2' },
    });
  });

  it('лента без категории берёт первый раздел витрины', async () => {
    const { api, calls } = stubApi({
      'catalog.getVideo': { catalog: { sections: [{ id: 'sec-все', title: 'Все' }] } },
      'catalog.getSection': searchResponse,
    });

    const page = await new VkProvider(credentials(), api).feed({ kind: 'trending' }, {});

    expect(calls.map((call) => call.method)).toEqual(['catalog.getVideo', 'catalog.getSection']);
    expect(calls[1].params).toMatchObject({ section_id: 'sec-все' });
    expect(page.items).toHaveLength(1);
  });

  it('честно говорит, что отдельной ленты подписок у платформы нет', async () => {
    const provider = new VkProvider(credentials(), stubApi({}).api);
    await expect(provider.feed({ kind: 'subscriptions' }, {})).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
  });

  /**
   * Экран видео открывается из истории и избранного — в том числе когда VK
   * недоступен. Плееру, кроме идентификатора, ничего не нужно, поэтому
   * недоступная карточка не должна закрывать экран.
   */
  it('без карточки собирает детали из идентификатора', async () => {
    const provider = new VkProvider(credentials(), stubApi({}).api);
    const details = await provider.getDetails('-1_10', {});

    expect(details.id).toBe('-1_10');
    expect(details.webUrl).toBe('https://vk.com/video-1_10');
  });

  it('берёт hash плеера из карточки, а без неё играет по идентификатору', async () => {
    const withCard = stubApi({
      'video.get': {
        items: [{ owner_id: -1, id: 10, player: 'https://vkvideo.ru/video_ext.php?hash=abc123' }],
      },
    });

    await expect(
      new VkProvider(credentials(), withCard.api).resolvePlayback({ id: '-1_10' }, {}),
    ).resolves.toEqual({
      kind: 'embed',
      url: 'https://vk.com/video_ext.php?oid=-1&id=10&hd=2&autoplay=1&js_api=1&hash=abc123',
    });

    await expect(
      new VkProvider(credentials(), stubApi({}).api).resolvePlayback({ id: '-1_10' }, {}),
    ).resolves.toMatchObject({ kind: 'embed', url: expect.not.stringContaining('hash') });
  });

  it('отмену запроса не подменяет заготовкой', async () => {
    const api = {
      call: async () => {
        throw new ProviderError({ code: 'CANCELLED', providerId: 'vk' });
      },
    } as unknown as VkApiClient;

    await expect(new VkProvider(credentials(), api).getDetails('-1_10', {})).rejects.toMatchObject({
      code: 'CANCELLED',
    });
  });

  it('после успешной проверки сессии запросы уходят от имени пользователя', async () => {
    const { api, calls } = stubApi({ 'catalog.getVideoSearch': searchResponse });
    const provider = new VkProvider(credentials(), api);

    await provider.verifySession({});
    expect(provider.isSignedIn()).toBe(true);

    await provider.search({ query: 'кот' }, {});
    expect(calls[0].signedIn).toBe(true);
  });

  it('отказ авторизации гасит отметку о входе и забывает токен', async () => {
    const { api } = stubApi({});
    (api.tokens.requireUser as jest.Mock).mockRejectedValue(
      new ProviderError({ code: 'AUTH_REQUIRED', providerId: 'vk' }),
    );
    const provider = new VkProvider(credentials(), api);

    await expect(provider.verifySession({})).resolves.toBe(false);
    expect(api.tokens.forget).toHaveBeenCalled();
  });

  /** Упавшая сеть — это не «пользователь вышел»: вход не должен слетать. */
  it('недоступность платформы не считает выходом из аккаунта', async () => {
    const { api } = stubApi({});
    (api.tokens.requireUser as jest.Mock).mockResolvedValueOnce({ kind: 'user' });
    const provider = new VkProvider(credentials(), api);
    await provider.verifySession({});

    (api.tokens.requireUser as jest.Mock).mockRejectedValue(
      new ProviderError({ code: 'NETWORK', providerId: 'vk' }),
    );

    await expect(provider.verifySession({})).resolves.toBe(true);
  });
});
