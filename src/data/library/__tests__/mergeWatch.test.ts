import type { VideoSummary } from '../../../core/model/media';
import { isCompleted, mergeWatch, type HistoryEntry } from '../LibraryRepository';

function video(uid: string, durationSec?: number): VideoSummary {
  return { uid, providerId: 'rutube', id: uid, title: uid, isLive: false, access: 'free', durationSec };
}

describe('mergeWatch', () => {
  it('поднимает повторно открытое видео наверх без дубликата', () => {
    const history = mergeWatch(
      [
        { video: video('a'), watchedAt: 1, positionSec: 10 },
        { video: video('b'), watchedAt: 2, positionSec: 20 },
      ],
      video('b'),
      55,
      10,
      3,
    );

    expect(history.map((entry) => entry.video.uid)).toEqual(['b', 'a']);
    expect(history[0]).toMatchObject({ positionSec: 55, watchedAt: 3 });
  });

  it('обрезает журнал до лимита', () => {
    const previous: HistoryEntry[] = [
      { video: video('a'), watchedAt: 1, positionSec: 0 },
      { video: video('b'), watchedAt: 2, positionSec: 0 },
    ];
    expect(mergeWatch(previous, video('c'), 0, 2).map((entry) => entry.video.uid)).toEqual([
      'c',
      'a',
    ]);
  });

  it('помечает досмотренным при позиции у самого конца', () => {
    expect(mergeWatch([], video('a', 100), 96, 10)[0].completed).toBe(true);
    expect(mergeWatch([], video('a', 100), 50, 10)[0].completed).toBe(false);
  });

  it('не снимает отметку «досмотрено» при повторном открытии', () => {
    const previous: HistoryEntry[] = [
      { video: video('a', 100), watchedAt: 1, positionSec: 99, completed: true },
    ];
    expect(mergeWatch(previous, video('a', 100), 2, 10)[0].completed).toBe(true);
  });

  it('без длительности не считает видео досмотренным', () => {
    expect(isCompleted(9999, undefined)).toBe(false);
    expect(isCompleted(9999, 0)).toBe(false);
  });
});
