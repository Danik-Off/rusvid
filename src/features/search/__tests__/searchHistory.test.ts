import { addQuery } from '../searchHistory';

describe('addQuery', () => {
  it('кладёт новый запрос первым', () => {
    expect(addQuery(['кино'], 'сериал')).toEqual(['сериал', 'кино']);
  });

  it('повтор поднимает наверх, а не дублирует', () => {
    expect(addQuery(['кино', 'сериал'], 'сериал')).toEqual(['сериал', 'кино']);
  });

  it('регистр не создаёт второй записи', () => {
    expect(addQuery(['кино'], 'КИНО')).toEqual(['КИНО']);
  });

  it('нормализует пробелы', () => {
    expect(addQuery([], '  два   слова ')).toEqual(['два слова']);
  });

  it('пустой запрос и повтор первого не меняют список', () => {
    const queries = ['кино'];
    // Возврат исходной ссылки — часть контракта: по нему вызывающий понимает,
    // что писать на диск не нужно.
    expect(addQuery(queries, '   ')).toBe(queries);
    expect(addQuery(queries, 'кино')).toBe(queries);
  });

  it('список не растёт бесконечно', () => {
    const many = Array.from({ length: 12 }, (_, index) => `запрос ${index}`);
    const next = addQuery(many, 'свежий');
    expect(next).toHaveLength(12);
    expect(next[0]).toBe('свежий');
    expect(next).not.toContain('запрос 11');
  });
});
