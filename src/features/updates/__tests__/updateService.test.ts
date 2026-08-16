import { compareVersions, parseRelease } from '../updateService';

describe('compareVersions', () => {
  it('сравнивает по числам, а не по строкам', () => {
    // Главная ловушка: как строки "1.10.0" < "1.9.0", и приложение перестало
    // бы замечать обновления начиная с десятого минорного релиза.
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
  });

  it('не спотыкается о префикс тега и пред-релизный хвост', () => {
    expect(compareVersions('v1.3.0', '1.3.0')).toBe(0);
    expect(compareVersions('1.3.0-rc.1', '1.2.9')).toBeGreaterThan(0);
  });

  it('мусор считает нулями, а не падает', () => {
    expect(compareVersions('', '0.0.0')).toBe(0);
    expect(compareVersions('1.x.3', '1.0.3')).toBe(0);
  });
});

describe('parseRelease', () => {
  const release = (extra: Record<string, unknown> = {}) => ({
    tag_name: 'v1.3.0',
    html_url: 'https://github.com/Danik-Off/rusvid/releases/tag/v1.3.0',
    body: 'Что нового\n\n* починили вход',
    published_at: '2026-08-16T10:00:00Z',
    ...extra,
  });

  it('разбирает обычный релиз', () => {
    const parsed = parseRelease(release());
    expect(parsed?.version).toBe('1.3.0');
    expect(parsed?.url).toContain('/releases/tag/v1.3.0');
    expect(parsed?.notes).toContain('починили вход');
    expect(parsed?.publishedAt).toBe(Date.parse('2026-08-16T10:00:00Z'));
  });

  it('черновики и пред-релизы пользователям не предлагает', () => {
    expect(parseRelease(release({ draft: true }))).toBeNull();
    expect(parseRelease(release({ prerelease: true }))).toBeNull();
  });

  it('вырезает служебную таблицу «какой APK кому»', () => {
    // В приложении она бессмысленна: туда ведёт одна кнопка.
    const parsed = parseRelease(
      release({ body: '## Установка\n\n| Файл | Кому |\n|---|---|\n| a.apk | все |\n\nПравки' }),
    );
    expect(parsed?.notes).not.toContain('|');
    expect(parsed?.notes).toContain('Правки');
  });

  it('чужой ответ не роняет приложение', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease('строка')).toBeNull();
    expect(parseRelease({})).toBeNull();
    expect(parseRelease(release({ tag_name: 'nightly' }))).toBeNull();
  });
});
