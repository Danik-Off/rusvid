/**
 * История просмотров и избранное.
 *
 * Хранятся снимки {@link VideoSummary}, а не только id: карточка должна
 * рисоваться офлайн и оставаться читаемой, даже если платформа удалила видео.
 */

import type { VideoSummary } from '../../core/model/media';
import type { KeyValueStore } from '../storage/KeyValueStore';

const HISTORY_KEY = 'library/history/v1';
const FAVORITES_KEY = 'library/favorites/v1';

export interface HistoryEntry {
  readonly video: VideoSummary;
  /** Unix-время последнего просмотра, мс. */
  readonly watchedAt: number;
  /** Позиция воспроизведения в секундах — для «продолжить просмотр». */
  readonly positionSec: number;
}

export interface FavoriteEntry {
  readonly video: VideoSummary;
  readonly addedAt: number;
}

export class LibraryRepository {
  constructor(private readonly store: KeyValueStore) {}

  async loadHistory(): Promise<HistoryEntry[]> {
    return this.store.read<HistoryEntry[]>(HISTORY_KEY, []);
  }

  /**
   * Записывает просмотр, схлопывая повтор того же видео в одну запись
   * и обрезая список до `limit`.
   */
  async recordWatch(
    video: VideoSummary,
    positionSec: number,
    limit: number,
    now = Date.now(),
  ): Promise<HistoryEntry[]> {
    const current = await this.loadHistory();
    const withoutDuplicate = current.filter((entry) => entry.video.uid !== video.uid);
    const next: HistoryEntry[] = [
      { video, watchedAt: now, positionSec: Math.max(0, Math.floor(positionSec)) },
      ...withoutDuplicate,
    ].slice(0, limit);
    await this.store.write(HISTORY_KEY, next);
    return next;
  }

  async clearHistory(): Promise<void> {
    await this.store.write<HistoryEntry[]>(HISTORY_KEY, []);
  }

  async loadFavorites(): Promise<FavoriteEntry[]> {
    return this.store.read<FavoriteEntry[]>(FAVORITES_KEY, []);
  }

  /** Переключает избранное и возвращает новый список. */
  async toggleFavorite(video: VideoSummary, now = Date.now()): Promise<FavoriteEntry[]> {
    const current = await this.loadFavorites();
    const exists = current.some((entry) => entry.video.uid === video.uid);
    const next = exists
      ? current.filter((entry) => entry.video.uid !== video.uid)
      : [{ video, addedAt: now }, ...current];
    await this.store.write(FAVORITES_KEY, next);
    return next;
  }

  async clearFavorites(): Promise<void> {
    await this.store.write<FavoriteEntry[]>(FAVORITES_KEY, []);
  }
}
