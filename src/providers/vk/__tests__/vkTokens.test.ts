import type { ProviderError } from '../../../core/errors/ProviderError';
import type { HttpClient } from '../../../data/http/HttpClient';
import { VkTokenStore } from '../vkTokens';

const NOW = 1_800_000_000_000;

/** Ответ VK: и токен, и отказ приезжают с HTTP 200 — см. vkEnvelope.ts. */
function reply(body: unknown): Response {
  return { text: async () => JSON.stringify(body) } as Response;
}

function tokenReply(value: string, livesForSec = 24 * 60 * 60): Response {
  return reply({ response: { token: value, expired_at: NOW / 1000 + livesForSec } });
}

const AUTH_FAILED = reply({ error: { error_code: 5, error_msg: 'User authorization failed' } });

interface Call {
  readonly path: string;
  readonly body: Readonly<Record<string, unknown>>;
}

function stubHttp(replies: readonly Response[]): { http: HttpClient; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...replies];
  const http = {
    postForm: async (path: string, body: Readonly<Record<string, unknown>>) => {
      calls.push({ path, body });
      const next = queue.shift();
      if (!next) {
        throw new Error(`Незапланированный запрос: ${path}`);
      }
      return next;
    },
  } as unknown as HttpClient;

  return { http, calls };
}

const methodsOf = (calls: readonly Call[]): string[] => calls.map((call) => call.path);

describe('VkTokenStore', () => {
  it('без входа берёт анонимный токен — ни cookie, ни секрета для этого не нужно', async () => {
    const { http, calls } = stubHttp([tokenReply('anonym.aaa')]);

    const token = await new VkTokenStore(http, () => NOW).get('anonymous');

    expect(token).toMatchObject({ value: 'anonym.aaa', kind: 'anonymous' });
    expect(methodsOf(calls)).toEqual(['/method/auth.getAnonymToken']);
    expect(calls[0].body).toMatchObject({ client_id: 52461373 });
  });

  it('со входом меняет cookie-сессию сайта на пользовательский токен', async () => {
    const { http, calls } = stubHttp([tokenReply('user.bbb')]);

    const token = await new VkTokenStore(http, () => NOW).get('user');

    expect(token.kind).toBe('user');
    expect(methodsOf(calls)).toEqual(['/method/video.getWebToken']);
  });

  /**
   * Сессия могла истечь, пока приложение было закрыто. Поиск и витрина
   * работают анонимно, и терять их из-за протухшей cookie незачем.
   */
  it('истёкшая сессия не ломает запрос, а переводит его в анонимный', async () => {
    const { http, calls } = stubHttp([AUTH_FAILED, tokenReply('anonym.ccc')]);

    const token = await new VkTokenStore(http, () => NOW).get('user');

    expect(token.kind).toBe('anonymous');
    expect(methodsOf(calls)).toEqual([
      '/method/video.getWebToken',
      '/method/auth.getAnonymToken',
    ]);
  });

  /**
   * Проверка входа подмены не терпит: с анонимным запасным вариантом она
   * всегда отвечала бы «вошли».
   */
  it('requireUser не подменяет отказ анонимным токеном', async () => {
    const { http } = stubHttp([AUTH_FAILED]);

    const error = (await new VkTokenStore(http, () => NOW)
      .requireUser()
      .catch((cause: unknown) => cause)) as ProviderError;

    expect(error.code).toBe('AUTH_REQUIRED');
  });

  it('переиспользует живой токен, а не просит новый на каждый запрос', async () => {
    const { http, calls } = stubHttp([tokenReply('anonym.aaa')]);
    const store = new VkTokenStore(http, () => NOW);

    await store.get('anonymous');
    await store.get('anonymous');

    expect(calls).toHaveLength(1);
  });

  /** Три экрана, открывшихся разом, не должны заводить три токена. */
  it('склеивает одновременные запросы токена', async () => {
    const { http, calls } = stubHttp([tokenReply('anonym.aaa')]);
    const store = new VkTokenStore(http, () => NOW);

    await Promise.all([store.get('anonymous'), store.get('anonymous'), store.get('anonymous')]);

    expect(calls).toHaveLength(1);
  });

  /** Запас перед истечением страхует от расхождения часов устройства с сервером. */
  it('токен, доживающий последние минуты, обновляет заранее', async () => {
    const { http, calls } = stubHttp([tokenReply('anonym.aaa', 60), tokenReply('anonym.ddd')]);
    const store = new VkTokenStore(http, () => NOW);

    await store.get('anonymous');
    const second = await store.get('anonymous');

    expect(second.value).toBe('anonym.ddd');
    expect(calls).toHaveLength(2);
  });

  /**
   * Выход обязан быть настоящим: переиспользуй анонимный запрос токен
   * вышедшего человека — приложение до самого истечения токена продолжало бы
   * ходить в VK от его имени, хотя cookie уже погашены.
   */
  it('после выхода не ходит в VK по пользовательскому токену', async () => {
    const { http, calls } = stubHttp([tokenReply('user.bbb'), tokenReply('anonym.aaa')]);
    const store = new VkTokenStore(http, () => NOW);

    await store.get('user');
    expect((await store.get('anonymous')).kind).toBe('anonymous');
    expect(methodsOf(calls)).toEqual([
      '/method/video.getWebToken',
      '/method/auth.getAnonymToken',
    ]);
  });

  it('forget стирает оба токена', async () => {
    const { http, calls } = stubHttp([tokenReply('anonym.aaa'), tokenReply('anonym.ddd')]);
    const store = new VkTokenStore(http, () => NOW);

    await store.get('anonymous');
    store.forget();
    expect((await store.get('anonymous')).value).toBe('anonym.ddd');
    expect(calls).toHaveLength(2);
  });

  /**
   * Отметка «вход был» обновляется не сразу, поэтому после отказа список
   * ещё какое-то время просит пользовательский режим. Без паузы каждый
   * такой запрос начинался бы с заведомо провального круга в сеть.
   */
  it('после отказа не долбит сессию на каждом запросе', async () => {
    const { http, calls } = stubHttp([
      AUTH_FAILED,
      tokenReply('anonym.aaa', 60),
      tokenReply('anonym.ddd'),
    ]);
    const store = new VkTokenStore(http, () => NOW);

    await store.get('user');
    await store.get('user');

    expect(methodsOf(calls)).toEqual([
      '/method/video.getWebToken',
      '/method/auth.getAnonymToken',
      '/method/auth.getAnonymToken',
    ]);
  });

  /** Проверку входа запускает сам пользователь — ей пауза не указ. */
  it('requireUser пробует сессию даже сразу после отказа', async () => {
    const { http, calls } = stubHttp([AUTH_FAILED, tokenReply('anonym.aaa'), tokenReply('user.bbb')]);
    const store = new VkTokenStore(http, () => NOW);

    await store.get('user');
    expect((await store.requireUser()).kind).toBe('user');
    expect(methodsOf(calls)).toEqual([
      '/method/video.getWebToken',
      '/method/auth.getAnonymToken',
      '/method/video.getWebToken',
    ]);
  });

  it('ответ без токена — это поломка формата, а не пустой результат', async () => {
    const { http } = stubHttp([reply({ response: { expired_at: 1 } })]);

    const error = (await new VkTokenStore(http, () => NOW)
      .get('anonymous')
      .catch((cause: unknown) => cause)) as ProviderError;

    expect(error.code).toBe('PARSE');
  });
});
