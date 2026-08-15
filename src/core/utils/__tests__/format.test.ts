import { formatDuration, formatPublishedAt, formatViews, plural } from '../format';

describe('formatDuration', () => {
  it('показывает часы только когда они есть', () => {
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('возвращает null для отсутствующей и нулевой длительности', () => {
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });
});

describe('formatViews', () => {
  it('сокращает большие числа', () => {
    expect(formatViews(999)).toBe('999');
    expect(formatViews(1234)).toBe('1,2 тыс.');
    expect(formatViews(7_180_693)).toBe('7,2 млн');
  });

  it('убирает незначащий ноль после запятой', () => {
    expect(formatViews(2000)).toBe('2 тыс.');
  });
});

describe('plural', () => {
  it('склоняет по русским правилам', () => {
    expect(plural(1, 'день', 'дня', 'дней')).toBe('день');
    expect(plural(3, 'день', 'дня', 'дней')).toBe('дня');
    expect(plural(11, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(21, 'день', 'дня', 'дней')).toBe('день');
  });
});

describe('formatPublishedAt', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  it('отдаёт относительную дату для свежих видео', () => {
    expect(formatPublishedAt('2026-08-15T09:00:00Z', now)).toBe('сегодня');
    expect(formatPublishedAt('2026-08-14T09:00:00Z', now)).toBe('вчера');
    expect(formatPublishedAt('2026-08-12T09:00:00Z', now)).toBe('3 дня назад');
  });

  it('отдаёт null на мусорной строке', () => {
    expect(formatPublishedAt('не дата', now)).toBeNull();
    expect(formatPublishedAt(undefined, now)).toBeNull();
  });
});
