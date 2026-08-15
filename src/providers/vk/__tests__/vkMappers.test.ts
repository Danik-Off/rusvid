import { buildVkVideoId, mapVkVideo } from '../vkMappers';

describe('buildVkVideoId', () => {
  it('склеивает owner_id и id', () => {
    expect(buildVkVideoId({ owner_id: -1, id: 456 })).toBe('-1_456');
  });

  it('добавляет access_key, когда он есть', () => {
    expect(buildVkVideoId({ owner_id: -1, id: 456, access_key: 'abc' })).toBe('-1_456_abc');
  });

  it('возвращает null без обязательных полей', () => {
    expect(buildVkVideoId({ id: 456 })).toBeNull();
    expect(buildVkVideoId({ owner_id: -1 })).toBeNull();
  });
});

describe('mapVkVideo', () => {
  it('берёт самое крупное превью без padding', () => {
    const video = mapVkVideo({
      owner_id: -1,
      id: 456,
      title: 'Ролик',
      image: [
        { url: 'small.jpg', width: 320 },
        { url: 'big.jpg', width: 1280 },
        { url: 'padded.jpg', width: 1920, with_padding: 1 },
      ],
    });
    expect(video?.thumbnailUrl).toBe('big.jpg');
  });

  it('переводит unix-время в ISO', () => {
    const video = mapVkVideo({ owner_id: 1, id: 2, date: 1_700_000_000 });
    expect(video?.publishedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('помечает видео с ограничением', () => {
    expect(mapVkVideo({ owner_id: 1, id: 2, restriction: { title: '18+' } })?.access).toBe(
      'restricted',
    );
    expect(mapVkVideo({ owner_id: 1, id: 2, is_private: 1 })?.access).toBe('restricted');
  });

  it('строит ссылку на веб-страницу без access_key', () => {
    expect(mapVkVideo({ owner_id: -1, id: 2, access_key: 'k' })?.webUrl).toBe(
      'https://vk.com/video-1_2',
    );
  });
});
