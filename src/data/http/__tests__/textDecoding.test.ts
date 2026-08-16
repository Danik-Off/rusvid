import {
  charsetFromContentType,
  decodeCp1251,
  isCp1251,
  readResponseText,
} from '../textDecoding';

/** Кодирует строку в windows-1251 — обратная операция к проверяемой. */
function encodeCp1251(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes[index] = code;
    } else if (code >= 0x0410 && code <= 0x044f) {
      bytes[index] = 0xc0 + (code - 0x0410);
    } else {
      const known: Record<number, number> = {
        0x0401: 0xa8, // Ё
        0x0451: 0xb8, // ё
        0x2116: 0xb9, // №
        0x00ab: 0xab, // «
        0x00bb: 0xbb, // »
        0x2014: 0x97, // —
        0x00a0: 0xa0, // неразрывный пробел
      };
      bytes[index] = known[code] ?? 0x3f;
    }
  }
  return bytes;
}

describe('decodeCp1251', () => {
  it('возвращает кириллицу, которую UTF-8 превратил бы в «?»', () => {
    const source = 'Ошибка доступа (1)';
    expect(decodeCp1251(encodeCp1251(source))).toBe(source);
  });

  it('покрывает весь алфавит, Ё и ё', () => {
    // Ё и ё стоят вне непрерывного ряда, поэтому ломаются первыми при
    // ошибке в таблице — и заметить это на глаз в чужом ответе трудно.
    const source = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
    expect(decodeCp1251(encodeCp1251(source))).toBe(source);
  });

  it('не трогает ASCII и структуру JSON', () => {
    const source = '{"title":"Кино","id":42}';
    expect(decodeCp1251(encodeCp1251(source))).toBe(source);
  });

  it('разбирает типографику из таблицы 0x80–0xBF', () => {
    const source = '«Тест» — №1';
    expect(decodeCp1251(encodeCp1251(source))).toBe(source);
  });

  it('переживает длинное тело', () => {
    // Разбор идёт кусками по 4096 символов — проверяем стык.
    const source = 'я'.repeat(10_000);
    expect(decodeCp1251(encodeCp1251(source))).toBe(source);
  });

  it('пустое тело — пустая строка', () => {
    expect(decodeCp1251(new Uint8Array(0))).toBe('');
  });
});

describe('charsetFromContentType', () => {
  it('достаёт кодировку из заголовка', () => {
    expect(charsetFromContentType('application/json; charset=windows-1251')).toBe('windows-1251');
    expect(charsetFromContentType('text/html;charset="UTF-8"')).toBe('utf-8');
  });

  it('без кодировки и без заголовка — null', () => {
    expect(charsetFromContentType('application/json')).toBeNull();
    expect(charsetFromContentType(null)).toBeNull();
  });

  it('узнаёт написания cp1251', () => {
    expect(isCp1251('windows-1251')).toBe(true);
    expect(isCp1251('cp1251')).toBe(true);
    expect(isCp1251('utf-8')).toBe(false);
    expect(isCp1251(null)).toBe(false);
  });
});

describe('readResponseText', () => {
  const fakeResponse = (contentType: string | null, body: () => Promise<ArrayBuffer>) =>
    ({
      headers: { get: () => contentType },
      arrayBuffer: body,
      text: async () => 'текст через text()',
    }) as unknown as Response;

  it('для windows-1251 читает байты и раскодирует сам', async () => {
    const bytes = encodeCp1251('Ошибка доступа');
    const response = fakeResponse(
      'application/json; charset=windows-1251',
      async () => bytes.buffer as ArrayBuffer,
    );
    await expect(readResponseText(response)).resolves.toBe('Ошибка доступа');
  });

  it('для остальных кодировок не трогает тело', async () => {
    const response = fakeResponse('application/json; charset=utf-8', async () => {
      throw new Error('arrayBuffer не должен вызываться');
    });
    await expect(readResponseText(response)).resolves.toBe('текст через text()');
  });

  it('без arrayBuffer деградирует к text(), а не падает', async () => {
    // Латиница, цифры и структура JSON при этом выживают: список видео
    // покажется, пусть и с испорченными заголовками.
    const response = fakeResponse('application/json; charset=windows-1251', async () => {
      throw new Error('arrayBuffer недоступен');
    });
    await expect(readResponseText(response)).resolves.toBe('текст через text()');
  });
});
