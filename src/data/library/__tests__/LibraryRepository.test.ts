import type { VideoSummary } from '../../../core/model/media';
import { InMemoryKeyValueStore } from '../../storage/KeyValueStore';
import { LibraryRepository } from '../LibraryRepository';

function video(uid: string): VideoSummary {
  return { uid, providerId: 'rutube', id: uid, title: uid, isLive: false, access: 'free' };
}

describe('LibraryRepository', () => {
  it('схлопывает повторный просмотр в одну запись и поднимает её наверх', async () => {
    const repository = new LibraryRepository(new InMemoryKeyValueStore());

    await repository.recordWatch(video('a'), 10, 10, 1);
    await repository.recordWatch(video('b'), 20, 10, 2);
    const history = await repository.recordWatch(video('a'), 55, 10, 3);

    expect(history.map((entry) => entry.video.uid)).toEqual(['a', 'b']);
    expect(history[0].positionSec).toBe(55);
    expect(history[0].watchedAt).toBe(3);
  });

  it('обрезает историю до лимита', async () => {
    const repository = new LibraryRepository(new InMemoryKeyValueStore());

    for (const uid of ['a', 'b', 'c', 'd']) {
      await repository.recordWatch(video(uid), 0, 2);
    }
    const history = await repository.loadHistory();

    expect(history.map((entry) => entry.video.uid)).toEqual(['d', 'c']);
  });

  it('переключает избранное туда и обратно', async () => {
    const repository = new LibraryRepository(new InMemoryKeyValueStore());

    expect(await repository.toggleFavorite(video('a'))).toHaveLength(1);
    expect(await repository.toggleFavorite(video('a'))).toHaveLength(0);
  });

  it('на пустом хранилище отдаёт пустые списки', async () => {
    const repository = new LibraryRepository(new InMemoryKeyValueStore());
    expect(await repository.loadHistory()).toEqual([]);
    expect(await repository.loadFavorites()).toEqual([]);
  });
});
