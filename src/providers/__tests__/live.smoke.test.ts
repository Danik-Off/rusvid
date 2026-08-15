/**
 * Живой смоук-тест провайдеров: реальные запросы к Rutube и Sasflix.
 *
 * По умолчанию ПРОПУСКАЕТСЯ — обычный `npm test` не ходит в сеть.
 * Запуск вручную, когда нужно проверить, не сломалось ли чужое API:
 *
 *     $env:RUSVID_LIVE = '1'; npm test -- live.smoke
 *
 * VK сюда не включён: он требует пользовательский токен.
 */

import { CredentialsStore } from '../../data/credentials/CredentialsStore';
import { InMemoryKeyValueStore } from '../../data/storage/KeyValueStore';
import { RutubeProvider } from '../rutube/RutubeProvider';
import { SasflixProvider } from '../sasflix/SasflixProvider';

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

// Заглушка, чтобы Jest не ругался на файл без тестов при пропуске.
if (!live) {
  it('живые тесты пропущены (установите RUSVID_LIVE=1)', () => {
    expect(live).toBe(false);
  });
}
