/**
 * Живой смоук-тест провайдеров: реальные запросы к Rutube и Sasflix.
 *
 * По умолчанию ПРОПУСКАЕТСЯ — обычный `npm test` не ходит в сеть.
 * Запуск вручную, когда нужно проверить, не сломалось ли чужое API:
 *
 *     $env:RUSVID_LIVE = '1'; npm test -- live.smoke
 *
 * Содержательные списки VK проверить отсюда нельзя — они требуют сессии
 * живого пользователя. Зато проверяется главное: что endpoint вообще на
 * месте и что анонимный клиент опознаётся как анонимный.
 */

import { CredentialsStore } from '../../data/credentials/CredentialsStore';
import { readResponseText } from '../../data/http/textDecoding';
import { InMemoryKeyValueStore } from '../../data/storage/KeyValueStore';
import { RutubeProvider } from '../rutube/RutubeProvider';
import { SasflixProvider } from '../sasflix/SasflixProvider';
import { VkWebClient } from '../vk/VkWebClient';

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

describeLive('VK (живой веб-клиент)', () => {
  /**
   * Сторож против поломки, которая уже случалась: пока запросы уходили на
   * `vkvideo.ru`, `POST /al_video.php` отвечал 404, и кнопка «Я вошёл» не
   * могла сработать ни при каких условиях. Тест падает и на исчезнувшем
   * endpoint'е (ошибка вместо ответа), и на смене формата (`statsMeta`
   * пропал), то есть ровно на том, что ломает вход.
   */
  it('опознаёт анонимного клиента, а не падает и не «входит»', async () => {
    await expect(new VkWebClient().probeSession()).resolves.toBe(false);
  });

  /**
   * Кодировка на живом ответе.
   *
   * VK отвечает в `windows-1251` сырыми байтами, и `response.text()` съедает
   * кириллицу необратимо. Проверяем на настоящем ответе, а не на своей
   * заготовке: юнит-тест декодера подтверждает таблицу, а этот — что платформа
   * всё ещё отвечает в этой кодировке и что заголовок с ней доезжает.
   *
   * `act=show` выбран потому, что анонимному клиенту он отвечает осмысленной
   * русской строкой — «Ошибка доступа (1)». `Accept-Language` обязателен:
   * без него VK отвечает по-английски, и кириллицы в ответе не будет вовсе —
   * тест проходил бы, ничего не проверив.
   */
  it('кириллица в ответе не превращается в «?»', async () => {
    const response = await fetch('https://vk.com/al_video.php?act=show', {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'https://vk.com',
        Referer: 'https://vk.com/video',
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
      body: 'act=show&al=1',
    });

    expect(response.headers.get('content-type')).toContain('windows-1251');

    const text = await readResponseText(response);

    expect(text).toContain('Ошибка доступа');
    // U+FFFD — след необратимо потерянного байта.
    expect(text).not.toContain('�');
  });
});

// Заглушка, чтобы Jest не ругался на файл без тестов при пропуске.
if (!live) {
  it('живые тесты пропущены (установите RUSVID_LIVE=1)', () => {
    expect(live).toBe(false);
  });
}
