import { ProviderError } from '../../../core/errors/ProviderError';
import {
  buildVkEmbedUrl,
  buildVkWebUrl,
  extractVkPlayerHash,
  formatVkVideoId,
  parseVkVideoId,
} from '../vkVideoId';

describe('parseVkVideoId', () => {
  it('разбирает видео сообщества с отрицательным владельцем', () => {
    expect(parseVkVideoId('-22822305_456241864')).toEqual({
      ownerId: '-22822305',
      videoId: '456241864',
      accessKey: undefined,
    });
  });

  it('разбирает видео пользователя с ключом доступа', () => {
    expect(parseVkVideoId('1_456239017_a1b2C3')).toEqual({
      ownerId: '1',
      videoId: '456239017',
      accessKey: 'a1b2C3',
    });
  });

  it('отвергает мусор понятной ошибкой, а не падением', () => {
    expect(() => parseVkVideoId('rutube-id')).toThrow(ProviderError);
    expect(() => parseVkVideoId('123')).toThrow(ProviderError);
    expect(() => parseVkVideoId('')).toThrow(ProviderError);
  });

  it('собирается обратно без потерь', () => {
    for (const id of ['-1_2', '-1_2_abc']) {
      expect(formatVkVideoId(parseVkVideoId(id))).toBe(id);
    }
  });
});

describe('buildVkEmbedUrl', () => {
  it('собирает ссылку на плеер без обращения к сети', () => {
    const url = buildVkEmbedUrl(parseVkVideoId('-22822305_456241864'));
    expect(url).toBe(
      'https://vk.com/video_ext.php?oid=-22822305&id=456241864&hd=2&autoplay=1&js_api=1',
    );
  });

  it('передаёт ключ доступа как hash — так его называет embed', () => {
    expect(buildVkEmbedUrl(parseVkVideoId('1_2_key123'))).toContain('&hash=key123');
  });

  /**
   * Ключ из карточки точнее выведенного из идентификатора: часть видео
   * открывается только с ним, а в id его может не быть вовсе.
   */
  it('предпочитает hash из карточки ключу из идентификатора', () => {
    expect(buildVkEmbedUrl(parseVkVideoId('1_2_fromId'), 'fromCard')).toContain('&hash=fromCard');
    expect(buildVkEmbedUrl(parseVkVideoId('1_2'), 'fromCard')).toContain('&hash=fromCard');
  });
});

describe('extractVkPlayerHash', () => {
  it('достаёт hash из ссылки на плеер, которую отдаёт API', () => {
    expect(
      extractVkPlayerHash(
        'https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=82494be189c14302&__ref=vk.web2',
      ),
    ).toBe('82494be189c14302');
  });

  it('молчит без hash: видео всё равно должно открыться по идентификатору', () => {
    expect(extractVkPlayerHash('https://vkvideo.ru/video_ext.php?oid=-1&id=2')).toBeUndefined();
    expect(extractVkPlayerHash(undefined)).toBeUndefined();
  });
});

describe('buildVkWebUrl', () => {
  it('ведёт на страницу видео, а не на плеер', () => {
    expect(buildVkWebUrl(parseVkVideoId('-1_2_abc'))).toBe('https://vk.com/video-1_2');
  });
});
