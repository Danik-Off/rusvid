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
  /**
   * Досмотрено до конца (≥ {@link COMPLETED_RATIO} длительности).
   *
   * Отдельный флаг, а не сравнение позиции с длительностью на лету: у части
   * платформ `durationSec` приходит только в ленте, и в истории его может
   * не быть вовсе. Досмотренное видео не предлагается «продолжить» —
   * иначе оно открывалось бы на титрах.
   */
  readonly completed?: boolean;
}

/** Доля длительности, после которой видео считается досмотренным. */
export const COMPLETED_RATIO = 0.95;

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
    const next = mergeWatch(await this.loadHistory(), video, positionSec, limit, now);
    await this.saveHistory(next);
    return next;
  }

  /**
   * Записать уже посчитанный список.
   *
   * Плеер обновляет позицию по таймеру во время просмотра, и читать ради
   * этого весь журнал с диска каждый раз незачем: актуальный список и так
   * лежит в сторе.
   */
  async saveHistory(history: readonly HistoryEntry[]): Promise<void> {
    await this.store.write(HISTORY_KEY, history);
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

/**
 * Возвращает историю с обновлённой записью о видео: повтор схлопывается
 * в одну запись, она поднимается наверх, список обрезается до `limit`.
 */
export function mergeWatch(
  current: readonly HistoryEntry[],
  video: VideoSummary,
  positionSec: number,
  limit: number,
  now = Date.now(),
): HistoryEntry[] {
  const previous = current.find((entry) => entry.video.uid === video.uid);
  return [
    {
      // Карточка из ленты полнее карточки из истории (у неё есть длительность
      // и превью), поэтому при перезаписи берём более свежую.
      video,
      watchedAt: now,
      positionSec: Math.max(0, Math.floor(positionSec)),
      // Однажды досмотренное видео остаётся досмотренным, даже если его
      // потом открыли и сразу закрыли на первой секунде.
      completed: isCompleted(positionSec, video.durationSec) || previous?.completed === true,
    },
    ...current.filter((entry) => entry.video.uid !== video.uid),
  ].slice(0, limit);
}

export function isCompleted(positionSec: number, durationSec: number | undefined): boolean {
  if (!durationSec || durationSec <= 0) {
    return false;
  }
  return positionSec / durationSec >= COMPLETED_RATIO;
}
