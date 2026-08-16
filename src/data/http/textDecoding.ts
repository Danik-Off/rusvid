/**
 * Чтение тела ответа с учётом кодировки, объявленной платформой.
 *
 * Нужно из-за ВКонтакте: внутренние endpoint'ы веб-клиента до сих пор отвечают
 * `Content-Type: application/json; charset=windows-1251`, причём кириллица там
 * лежит сырыми байтами, а не `\uXXXX`-экранированием. `response.text()`
 * разбирает тело как UTF-8, каждый такой байт становится U+FFFD, и заголовки
 * видео превращаются в «????». Хуже того, восстановить их потом нельзя:
 * замена на U+FFFD необратима, исходный байт уже потерян. Поэтому решение
 * принимается ДО чтения тела.
 *
 * `TextDecoder` не используется: в Hermes его нет.
 */

/**
 * Windows-1251, диапазон 0x80–0xBF (ровно 64 позиции).
 *
 * Только он и задаётся таблицей: 0x00–0x7F совпадает с ASCII, а 0xC0–0xFF —
 * это непрерывный ряд «А»…«я» (U+0410…U+044F), который считается формулой.
 *
 * Escape-последовательностями, а не буквами: в таблице есть неразрывный
 * пробел (0xA0), мягкий перенос (0xAD) и неопределённая в стандарте позиция
 * 0x98 — в виде литералов они невидимы в редакторе, и правка рядом молча
 * сдвинула бы индекс, испортив половину алфавита. 0x98 отображается в U+0098
 * вслед за WHATWG. Таблица сверена с эталонной cp1251.
 */
const CP1251_HIGH =
  '\u0402\u0403\u201A\u0453\u201E\u2026\u2020\u2021' + // 0x80
  '\u20AC\u2030\u0409\u2039\u040A\u040C\u040B\u040F' + // 0x88
  '\u0452\u2018\u2019\u201C\u201D\u2022\u2013\u2014' + // 0x90
  '\u0098\u2122\u0459\u203A\u045A\u045C\u045B\u045F' + // 0x98
  '\u00A0\u040E\u045E\u0408\u00A4\u0490\u00A6\u00A7' + // 0xA0
  '\u0401\u00A9\u0404\u00AB\u00AC\u00AD\u00AE\u0407' + // 0xA8
  '\u00B0\u00B1\u0406\u0456\u0491\u00B5\u00B6\u00B7' + // 0xB0
  '\u0451\u2116\u0454\u00BB\u0458\u0405\u0455\u0457'; // 0xB8

/** Сколько символов декодируем за раз: `String.fromCharCode` не любит длинных списков аргументов. */
const CHUNK = 4096;

export function decodeCp1251(bytes: Uint8Array): string {
  const parts: string[] = [];
  const codes: number[] = [];

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte < 0x80) {
      codes.push(byte);
    } else if (byte < 0xc0) {
      codes.push(CP1251_HIGH.charCodeAt(byte - 0x80));
    } else {
      // 0xC0 -> U+0410 («А»), дальше подряд до 0xFF -> U+044F («я»).
      codes.push(0x0410 + (byte - 0xc0));
    }
    if (codes.length >= CHUNK) {
      parts.push(String.fromCharCode(...codes));
      codes.length = 0;
    }
  }
  if (codes.length > 0) {
    parts.push(String.fromCharCode(...codes));
  }
  return parts.join('');
}

/** `application/json; charset=windows-1251` -> `windows-1251`. */
export function charsetFromContentType(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }
  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType);
  return match ? match[1].toLowerCase() : null;
}

/** Кодировки, которые мы умеем разбирать сами. */
export function isCp1251(charset: string | null): boolean {
  return charset === 'windows-1251' || charset === 'cp1251' || charset === 'x-cp1251';
}

/**
 * Текст ответа в правильной кодировке.
 *
 * Если платформа объявила windows-1251 — читаем байты и раскодируем сами.
 * Во всех остальных случаях (в том числе когда charset не объявлен) —
 * обычный `text()`, то есть UTF-8.
 *
 * `arrayBuffer()` обёрнут в try/catch не из перестраховки: он есть не во всех
 * средах, где может оказаться этот код (Hermes без Blob-модуля, тестовые
 * заглушки fetch). Если его нет, честнее отдать текст с потерянной кириллицей,
 * чем уронить запрос целиком — латиница, цифры и структура JSON выживают,
 * то есть список видео покажется, пусть и с испорченными заголовками.
 */
export async function readResponseText(response: Response): Promise<string> {
  const charset = charsetFromContentType(response.headers.get('content-type'));
  if (!isCp1251(charset)) {
    return response.text();
  }
  try {
    return decodeCp1251(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return response.text();
  }
}
