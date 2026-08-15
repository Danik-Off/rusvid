import { buildSasflixManifestUrl, mapSasflixTopic, mapSasflixTopicList } from '../sasflixMappers';

const TOPIC = {
  id: 1111,
  uuid: '95030b17-defb-4961-b2ac-30c048d9e52f',
  title: 'Разговор с критиком-коммунистом',
  teaser: '',
  type: 'video',
  views_count: 8314,
  published_at: '2026-08-13T17:34:14.000000Z',
  active: true,
  cover: { id: 32769, uuid: '67bc4642-ce27-4458-9c92-f22d8d9f7e35' },
  access: true,
  paid: false,
  has_video: true,
  video: { id: '43b191b3-12c9-4778-bdca-e59271210010', duration: 5910 },
};

describe('mapSasflixTopic', () => {
  it('приводит реальный ответ к доменной модели', () => {
    const video = mapSasflixTopic(TOPIC);

    expect(video).toMatchObject({
      uid: 'sasflix:95030b17-defb-4961-b2ac-30c048d9e52f',
      providerId: 'sasflix',
      durationSec: 5910,
      viewCount: 8314,
      access: 'free',
      isLive: false,
    });
    expect(video?.thumbnailUrl).toContain('/api/image/67bc4642-ce27-4458-9c92-f22d8d9f7e35');
    expect(video?.webUrl).toBe('https://sasflix.ru/topics/95030b17-defb-4961-b2ac-30c048d9e52f');
  });

  it('падает на постер видео, если обложки нет', () => {
    const video = mapSasflixTopic({ ...TOPIC, cover: undefined });
    expect(video?.thumbnailUrl).toContain('/api/poster/43b191b3-12c9-4778-bdca-e59271210010');
  });

  it('помечает платным материал, к которому нет доступа', () => {
    expect(mapSasflixTopic({ ...TOPIC, access: false })?.access).toBe('paid');
  });

  it('не вешает плашку на платный материал, если доступ у пользователя есть', () => {
    // Вошедший подписчик получает access: true даже для платного топика —
    // показывать ему «ПОДПИСКА» было бы враньём.
    expect(mapSasflixTopic({ ...TOPIC, access: true, paid: true })?.access).toBe('free');
    expect(mapSasflixTopic({ ...TOPIC, access: true, closed: true })?.access).toBe('free');
  });

  it('без поля access ориентируется на признаки самого материала', () => {
    expect(mapSasflixTopic({ ...TOPIC, access: undefined, paid: true })?.access).toBe('paid');
    expect(mapSasflixTopic({ ...TOPIC, access: undefined, closed: true })?.access).toBe('paid');
    expect(mapSasflixTopic({ ...TOPIC, access: undefined })?.access).toBe('free');
  });

  it('пропускает материалы без видео', () => {
    expect(mapSasflixTopic({ ...TOPIC, has_video: false })).toBeNull();
    expect(mapSasflixTopic({ ...TOPIC, uuid: undefined })).toBeNull();
  });
});

describe('mapSasflixTopicList', () => {
  it('выбрасывает неактивные записи', () => {
    const items = mapSasflixTopicList([TOPIC, { ...TOPIC, uuid: 'other', active: false }]);
    expect(items).toHaveLength(1);
  });
});

describe('buildSasflixManifestUrl', () => {
  it('строит ссылку на HLS-манифест', () => {
    expect(buildSasflixManifestUrl('abc')).toBe('https://sasflix.ru/api/video/abc');
  });
});
