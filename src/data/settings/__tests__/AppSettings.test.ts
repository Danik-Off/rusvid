import { DEFAULT_SETTINGS, normalizeSettings } from '../AppSettings';

describe('normalizeSettings', () => {
  it('возвращает дефолты для пустого значения', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('выбрасывает неизвестные платформы, оставшиеся от старой версии', () => {
    const settings = normalizeSettings({
      enabledProviders: ['rutube', 'youtube' as never, 'vk'],
    });
    expect(settings.enabledProviders).toEqual(['rutube', 'vk']);
  });

  it('не даёт остаться без единой платформы', () => {
    expect(normalizeSettings({ enabledProviders: [] }).enabledProviders).toEqual(
      DEFAULT_SETTINGS.enabledProviders,
    );
  });

  it('считает непринятыми условия, если версии на диске нет или она испорчена', () => {
    expect(normalizeSettings({}).acceptedLegalVersion).toBe(0);
    expect(normalizeSettings({ acceptedLegalVersion: '1' as never }).acceptedLegalVersion).toBe(0);
    expect(normalizeSettings({ acceptedLegalVersion: -1 }).acceptedLegalVersion).toBe(0);
  });

  it('сохраняет принятую версию условий', () => {
    expect(normalizeSettings({ acceptedLegalVersion: 1 }).acceptedLegalVersion).toBe(1);
  });

  it('ограничивает размер истории', () => {
    expect(normalizeSettings({ historyLimit: 100_000 }).historyLimit).toBe(1000);
    expect(normalizeSettings({ historyLimit: -5 }).historyLimit).toBe(
      DEFAULT_SETTINGS.historyLimit,
    );
  });
});
