import { mapRutubeVideo, mapRutubeVideoList, normalizeTimestamp } from '../rutubeMappers';

describe('mapRutubeVideo', () => {
  it('приводит реальный ответ поиска к доменной модели', () => {
    const video = mapRutubeVideo({
      id: '4ceb9757e7eec396856b7c7b08b7565a',
      title: 'Котенок Котэ Сборник',
      description: 'Большой сборник',
      thumbnail_url: 'https://pic.rtbcdn.ru/video/x.jpg',
      duration: 2659,
      hits: 7180693,
      publication_ts: '2025-09-14T18:00:08',
      author: { id: 31168197, name: 'Котёнок Котэ', avatar_url: 'https://a.jpg' },
      video_url: 'https://rutube.ru/video/4ceb9757e7eec396856b7c7b08b7565a/',
    });

    expect(video).toMatchObject({
      uid: 'rutube:4ceb9757e7eec396856b7c7b08b7565a',
      providerId: 'rutube',
      title: 'Котенок Котэ Сборник',
      durationSec: 2659,
      viewCount: 7180693,
      isLive: false,
      access: 'free',
    });
    expect(video?.author?.name).toBe('Котёнок Котэ');
  });

  it('отбрасывает элемент без id', () => {
    expect(mapRutubeVideo({ title: 'без id' })).toBeNull();
  });

  it('у прямого эфира не показывает длительность', () => {
    const video = mapRutubeVideo({ id: 'x', is_livestream: true, duration: 10 });
    expect(video?.isLive).toBe(true);
    expect(video?.durationSec).toBeUndefined();
  });

  it('помечает платное и возрастное', () => {
    expect(mapRutubeVideo({ id: 'a', is_paid: true })?.access).toBe('paid');
    expect(mapRutubeVideo({ id: 'b', is_club: true })?.access).toBe('paid');
    expect(mapRutubeVideo({ id: 'c', is_adult: true })?.access).toBe('restricted');
  });
});

describe('mapRutubeVideoList', () => {
  it('выбрасывает скрытые и удалённые', () => {
    const items = mapRutubeVideoList([
      { id: 'ok' },
      { id: 'hidden', is_hidden: true },
      { id: 'deleted', is_deleted: true },
      { title: 'без id' },
    ]);
    expect(items.map((item) => item.id)).toEqual(['ok']);
  });

  it('переживает отсутствие списка', () => {
    expect(mapRutubeVideoList(undefined)).toEqual([]);
  });
});

describe('normalizeTimestamp', () => {
  it('дописывает московскую зону, если её нет', () => {
    expect(normalizeTimestamp('2025-09-14T18:00:08')).toBe('2025-09-14T18:00:08+03:00');
  });

  it('не трогает строку с зоной', () => {
    expect(normalizeTimestamp('2025-09-14T18:00:08Z')).toBe('2025-09-14T18:00:08Z');
    expect(normalizeTimestamp('2025-09-14T18:00:08+05:00')).toBe('2025-09-14T18:00:08+05:00');
  });
});
