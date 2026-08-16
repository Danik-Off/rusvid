/**
 * Живой смоук-тест провайдеров: реальные запросы к Rutube, Sasflix и VK.
 *
 * По умолчанию ПРОПУСКАЕТСЯ — обычный `npm test` не ходит в сеть.
 * Запуск вручную, когда нужно проверить, не сломалось ли чужое API:
 *
 *     $env:RUSVID_LIVE = '1'; npm test -- live.smoke
 */

import { CredentialsStore } from '../../data/credentials/CredentialsStore';
import { InMemoryKeyValueStore } from '../../data/storage/KeyValueStore';
import { RutubeProvider } from '../rutube/RutubeProvider';
import { SasflixProvider } from '../sasflix/SasflixProvider';
import { VkProvider } from '../vk/VkProvider';

/** Провайдерам нужен CredentialsStore; в смоуке он пустой — вход не проверяем. */
function anonymousCredentials(): CredentialsStore {
  return new CredentialsStore(new InMemoryKeyValueStore());
}

// Локальное объявление вместо @types/node: тянуть node-глобалы в типы
// React-Native-приложения ради одной переменной окружения не стоит.
declare const process: { readonly env: Record<string, string | undefined> };

const live = process.env.RUSVID_LIVE === '1';
const describeLive = live ? describe : describe.skip;

jest.setTimeout(45_000);

describeLive('Rutube (живое API)', () => {
  const provider = new RutubeProvider(anonymousCredentials());

  it('находит видео по запросу', async () => {
    const page = await provider.search({ query: 'кот' }, {});

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0].uid).toMatch(/^rutube:/);
    expect(page.items[0].title.length).toBeGreaterThan(0);
  });

  it('отдаёт список категорий', async () => {
    const categories = await provider.listCategories({});
    expect(categories.length).toBeGreaterThan(10);
  });

  it('отдаёт ленту трендов', async () => {
    const page = await provider.feed({ kind: 'trending' }, {});
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('разрешает ссылку на воспроизведение', async () => {
    const page = await provider.search({ query: 'кот' }, {});
    const source = await provider.resolvePlayback({ id: page.items[0].id }, {});

    expect(['hls', 'embed']).toContain(source.kind);
    expect(source.url).toMatch(/^https:\/\//);
  });
});

describeLive('Sasflix (живое API)', () => {
  const provider = new SasflixProvider(anonymousCredentials());

  it('отдаёт ленту', async () => {
    const page = await provider.feed({ kind: 'trending' }, {});

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0].uid).toMatch(/^sasflix:/);
  });

  it('находит материалы по запросу', async () => {
    const page = await provider.search({ query: 'стас' }, {});
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('отдаёт HLS-манифест для бесплатного материала', async () => {
    const page = await provider.feed({ kind: 'trending' }, {});
    const free = page.items.find((item) => item.access === 'free');
    expect(free).toBeDefined();

    const source = await provider.resolvePlayback({ id: (free as { id: string }).id }, {});
    expect(source.kind).toBe('hls');

    const manifest = await fetch(source.url).then((response) => response.text());
    expect(manifest.startsWith('#EXTM3U')).toBe(true);
  });
});

/**
 * Всё ниже выполняется БЕЗ входа: именно анонимный режим и есть то, что
 * легко сломать незаметно — у разработчика с живой сессией VK эти же вызовы
 * продолжали бы работать.
 */
describeLive('VK Видео (живое API, без входа)', () => {
  const provider = new VkProvider(anonymousCredentials());

  it('находит видео по запросу без всякой сессии', async () => {
    const page = await provider.search({ query: 'кот' }, {});

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0].uid).toMatch(/^vk:-?\d+_\d+/);
    // Кириллица в заголовках — сторож против возврата к windows-1251:
    // шлюз отвечает UTF-8, и «????» здесь означали бы смену кодировки.
    expect(page.items.some((item) => /[а-яё]/i.test(item.title))).toBe(true);
  });

  it('листает поиск дальше первой страницы', async () => {
    const first = await provider.search({ query: 'музыка' }, {});
    expect(first.nextCursor).not.toBeNull();

    const second = await provider.search(
      { query: 'музыка', cursor: first.nextCursor as string },
      {},
    );
    expect(second.items.length).toBeGreaterThan(0);

    const seen = new Set(first.items.map((item) => item.uid));
    expect(second.items.some((item) => !seen.has(item.uid))).toBe(true);
  });

  it('отдаёт разделы витрины', async () => {
    const categories = await provider.listCategories({});
    expect(categories.length).toBeGreaterThan(5);
  });

  it('отдаёт ленту с авторами карточек', async () => {
    const page = await provider.feed({ kind: 'trending' }, {});

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.some((item) => Boolean(item.author?.name))).toBe(true);
  });

  it('отдаёт детали видео', async () => {
    const page = await provider.feed({ kind: 'trending' }, {});
    const details = await provider.getDetails(page.items[0].id, {});

    expect(details.title).toBe(page.items[0].title);
  });

  it('разрешает ссылку на встроенный плеер', async () => {
    const page = await provider.feed({ kind: 'trending' }, {});
    const source = await provider.resolvePlayback({ id: page.items[0].id }, {});

    expect(source.kind).toBe('embed');
    expect(source.url).toMatch(/^https:\/\/vk\.com\/video_ext\.php\?/);

    // Плеер обязан открываться анонимно: на этом держится воспроизведение
    // без входа. Именно `vk.com` — `vkvideo.ru` уводит гостя на автологин.
    const response = await fetch(source.url);
    expect(response.status).toBe(200);
  });

  it('без сессии сайта опознаёт отсутствие входа, а не падает', async () => {
    await expect(provider.verifySession({})).resolves.toBe(false);
  });
});

// Заглушка, чтобы Jest не ругался на файл без тестов при пропуске.
if (!live) {
  it('живые тесты пропущены (установите RUSVID_LIVE=1)', () => {
    expect(live).toBe(false);
  });
}
