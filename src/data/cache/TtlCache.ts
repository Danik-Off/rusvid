/**
 * Кэш с TTL в памяти + дедупликация одновременных запросов.
 *
 * Используется провайдерами для «дорогих» и редко меняющихся ответов
 * (списки категорий, детали видео). Ссылки на воспроизведение сюда не кладём:
 * они подписаны и живут считаные минуты.
 */

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 200,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.entries.size >= this.maxEntries) {
      // Простой FIFO-вытеснитель: Map сохраняет порядок вставки.
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /**
   * Вернуть из кэша или вычислить. Параллельные вызовы с одним ключом
   * разделяют один запрос к сети.
   */
  async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }
    const promise = load()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
