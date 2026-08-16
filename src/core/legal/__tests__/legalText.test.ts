import {
  LEGAL_HIGHLIGHTS,
  LEGAL_SECTIONS,
  LEGAL_SHORT_NOTICE,
  LEGAL_VERSION,
} from '../legalText';

/**
 * Тесты сторожат не формулировки, а сам факт наличия текста: пустой раздел
 * или потерянный дисклеймер должны падать в CI, а не обнаруживаться в споре.
 */
describe('правовые тексты', () => {
  it('версия условий — целое положительное число', () => {
    expect(Number.isInteger(LEGAL_VERSION)).toBe(true);
    expect(LEGAL_VERSION).toBeGreaterThan(0);
  });

  it('в каждом разделе есть заголовок и хотя бы один абзац', () => {
    expect(LEGAL_SECTIONS.length).toBeGreaterThan(0);
    for (const section of LEGAL_SECTIONS) {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) {
        expect(paragraph.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('короткая версия перечисляет все обязательные пункты', () => {
    const ids = LEGAL_HIGHLIGHTS.map((highlight) => highlight.id);
    expect(ids).toEqual(
      expect.arrayContaining(['unofficial', 'noncommercial', 'content', 'responsibility', 'privacy']),
    );
  });

  it('заявляет об отсутствии связи с платформами в короткой сноске', () => {
    // Сноска уходит на экран входа и в подвал настроек — там, где приложение
    // легче всего принять за официальный клиент платформы.
    expect(LEGAL_SHORT_NOTICE).toMatch(/[Нн]е связано/);
    for (const platform of ['Rutube', 'VK', 'Sasflix']) {
      expect(LEGAL_SHORT_NOTICE).toContain(platform);
    }
  });
});
