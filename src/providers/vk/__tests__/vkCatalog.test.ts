import {
  decodeVkCursor,
  encodeVkCursor,
  readVkCatalogPage,
  readVkSections,
} from '../vkCatalog';

const video = (ownerId: number, id: number, title: string) => ({
  owner_id: ownerId,
  id,
  title,
  duration: 60,
});

describe('readVkCatalogPage', () => {
  it('расставляет видео в порядке блоков раздела', () => {
    const page = readVkCatalogPage({
      section: {
        id: 'sec',
        blocks: [
          { data_type: 'search_filter' },
          { data_type: 'videos', videos_ids: ['-1_20', '-1_10'] },
        ],
      },
      videos: [video(-1, 10, 'первое в массиве'), video(-1, 20, 'второе в массиве')],
    });

    expect(page.videos.map((item) => item.title)).toEqual([
      'второе в массиве',
      'первое в массиве',
    ]);
  });

  /**
   * Раскладка блоков у VK плавающая. Если карточка приехала, но ни в один
   * блок не попала, потерять её нельзя — иначе смена вёрстки на стороне
   * платформы превращается в пустой экран.
   */
  it('не теряет видео, которых нет ни в одном блоке', () => {
    const page = readVkCatalogPage({
      section: { id: 'sec', blocks: [{ data_type: 'videos', videos_ids: ['-1_10'] }] },
      videos: [video(-1, 10, 'из блока')],
      catalog_videos: [{ video: video(-2, 30, 'мимо блока') }],
    });

    expect(page.videos.map((item) => item.title)).toEqual(['из блока', 'мимо блока']);
  });

  it('схлопывает повторы одного видео', () => {
    const page = readVkCatalogPage({
      section: { id: 'sec', blocks: [{ videos_ids: ['-1_10', '-1_10'] }] },
      videos: [video(-1, 10, 'ролик')],
      catalog_videos: [{ video: video(-1, 10, 'ролик') }],
    });

    expect(page.videos).toHaveLength(1);
  });

  /**
   * У витрины (`catalog.getVideo`) первый раздел приходит с пустыми блоками:
   * приняв его за источник, приложение выдало бы курсор в пустоту.
   */
  it('берёт раздел, в котором действительно есть видео', () => {
    const page = readVkCatalogPage({
      catalog: {
        sections: [
          { id: 'пустой', blocks: [], next_from: 'нет смысла' },
          { id: 'полный', blocks: [{ videos_ids: ['-1_10'] }], next_from: 'дальше' },
        ],
      },
      videos: [video(-1, 10, 'ролик')],
    });

    expect(page.sectionId).toBe('полный');
    expect(page.nextFrom).toBe('дальше');
  });

  it('находит авторов по owner_id: у сообществ он отрицательный', () => {
    const page = readVkCatalogPage({
      section: { id: 'sec', blocks: [{ videos_ids: ['-99_10', '5_11'] }] },
      videos: [video(-99, 10, 'от сообщества'), video(5, 11, 'от человека')],
      groups: [{ id: 99, name: 'Клуб', screen_name: 'club_slug', photo_200: 'g.jpg' }],
      profiles: [{ id: 5, first_name: 'Иван', last_name: 'Петров', photo_100: 'p.jpg' }],
    });

    expect(page.owners.get(-99)).toEqual({
      id: '-99',
      name: 'Клуб',
      avatarUrl: 'g.jpg',
      url: 'https://vk.com/club_slug',
    });
    expect(page.owners.get(5)?.name).toBe('Иван Петров');
  });

  it('переживает ответ без единого знакомого поля', () => {
    const page = readVkCatalogPage({});
    expect(page.videos).toEqual([]);
    expect(page.sectionId).toBeNull();
    expect(page.nextFrom).toBeNull();
  });
});

describe('курсор', () => {
  it('переживает круг: раздел и позиция нужны оба', () => {
    const cursor = encodeVkCursor({
      videos: [video(-1, 10, 'ролик')],
      owners: new Map(),
      sectionId: 'sec',
      nextFrom: 'позиция',
    });

    expect(decodeVkCursor(cursor as string)).toEqual({ sectionId: 'sec', startFrom: 'позиция' });
  });

  it('без позиции или без карточек страниц больше нет', () => {
    const base = { videos: [video(-1, 10, 'ролик')], owners: new Map(), sectionId: 'sec' };
    expect(encodeVkCursor({ ...base, nextFrom: null })).toBeNull();
    expect(encodeVkCursor({ ...base, videos: [], nextFrom: 'позиция' })).toBeNull();
  });

  /** Курсор приходит из сохранённого состояния списка — чужой формат не повод падать. */
  it('чужой курсор означает «начать сначала», а не ошибку', () => {
    expect(decodeVkCursor(undefined)).toBeNull();
    expect(decodeVkCursor('0')).toBeNull();
    expect(decodeVkCursor('{не json')).toBeNull();
    expect(decodeVkCursor('{"s":"sec"}')).toBeNull();
  });
});

describe('readVkSections', () => {
  it('отдаёт только разделы, которые можно показать и открыть', () => {
    const sections = readVkSections({
      catalog: {
        sections: [
          { id: 'a', title: 'Все' },
          { id: 'b' },
          { title: 'Без идентификатора' },
        ],
      },
    });

    expect(sections.map((section) => section.id)).toEqual(['a']);
  });
});
