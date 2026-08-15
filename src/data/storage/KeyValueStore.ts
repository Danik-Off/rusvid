/**
 * Обёртка над AsyncStorage с JSON-сериализацией.
 *
 * Смысл слоя — изолировать остальной код от конкретной библиотеки хранения
 * и от того, что она умеет падать (заполнен диск, повреждённая запись).
 * Любая ошибка чтения трактуется как «значения нет».
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface KeyValueStore {
  read<T>(key: string, fallback: T): Promise<T>;
  write<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class AsyncStorageKeyValueStore implements KeyValueStore {
  constructor(private readonly namespace = 'rusvid') {}

  async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(this.fullKey(key));
      if (raw === null) {
        return fallback;
      }
      return JSON.parse(raw) as T;
    } catch {
      // Повреждённое значение не должно ломать запуск приложения.
      return fallback;
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(this.fullKey(key), JSON.stringify(value));
    } catch {
      // Потеря настройки не критична — молча игнорируем.
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.fullKey(key));
    } catch {
      // см. выше
    }
  }

  private fullKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
}

/** Реализация для тестов и для окружений без нативного модуля. */
export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, string>();

  async read<T>(key: string, fallback: T): Promise<T> {
    const raw = this.map.get(key);
    return raw === undefined ? fallback : (JSON.parse(raw) as T);
  }

  async write<T>(key: string, value: T): Promise<void> {
    this.map.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}
