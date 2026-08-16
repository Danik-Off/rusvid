import type { VideoSummary } from '../../../core/model/media';
import { mergeWatch, type FavoriteEntry, type HistoryEntry } from '../../../data/library/LibraryRepository';
import { isFavoriteIn, progressIn } from '../libraryStore';

const video = (uid: string, durationSec?: number): VideoSummary =>
  ({
    uid,
    providerId: 'vk',
    id: uid,
    title: `Видео ${uid}`,
    isLive: false,
    access: 'free',
    durationSec,
  }) as VideoSummary;

const entry = (
  item: VideoSummary,
  positionSec: number,
  completed = false,
): HistoryEntry => ({ video: item, watchedAt: 1, positionSec, completed });

describe('progressIn', () => {
  it('считает долю просмотра', () => {
    const item = video('a', 100);
    expect(progressIn([entry(item, 25)], item)).toBeCloseTo(0.25);
  });

  it('досмотренное — всегда единица', () => {
    const item = video('a', 100);
    expect(progressIn([entry(item, 3, true)], item)).toBe(1);
  });

  /**
   * У карточки из истории длительность есть, а у карточки VK из плеера её
   * может не быть. Раньше в таком случае полоска пропадала, хотя данные для
   * неё лежали рядом — в самой записи истории.
   */
  it('берёт длительность из истории, если её нет у карточки', () => {
    expect(progressIn([entry(video('a', 200), 50)], video('a'))).toBeCloseTo(0.25);
  });

  it('без длительности и без записи — ничего не показывает', () => {
    expect(progressIn([], video('a', 100))).toBeUndefined();
    expect(progressIn([entry(video('a'), 50)], video('a'))).toBeUndefined();
  });
});

describe('isFavoriteIn', () => {
  const favorites: FavoriteEntry[] = [{ video: video('a'), addedAt: 1 }];

  it('находит по uid', () => {
    expect(isFavoriteIn(favorites, 'a')).toBe(true);
    expect(isFavoriteIn(favorites, 'b')).toBe(false);
  });
});

describe('открытие видео не должно терять позицию', () => {
  /**
   * Регрессия, которую легко внести: писать в историю по факту открытия
   * нулевой позицией. Тогда достаточно выключить «продолжать с места
   * остановки», чтобы каждое повторное открытие обнуляло прогресс.
   * `noteOpened` передаёт в `mergeWatch` прошлую позицию — проверяем именно
   * это поведение слияния.
   */
  it('перезапись прошлой позицией сохраняет прогресс', () => {
    const item = video('a', 100);
    const history = [entry(item, 60)];
    const previous = history.find((it) => it.video.uid === item.uid);

    const merged = mergeWatch(history, item, previous?.positionSec ?? 0, 200);

    expect(merged[0].positionSec).toBe(60);
    expect(progressIn(merged, item)).toBeCloseTo(0.6);
  });
});
