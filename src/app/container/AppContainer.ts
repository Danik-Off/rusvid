/**
 * Composition root: единственное место сборки зависимостей.
 *
 * Ни один экран и ни один store не создаёт репозитории и провайдеры сам —
 * все берут их отсюда. Это даёт две вещи: (1) подмену на моки в тестах через
 * `setAppContainer`, (2) один взгляд на весь граф зависимостей приложения.
 */

import { AggregatorService } from '../../core/aggregator/AggregatorService';
import type { ProviderRegistry } from '../../core/provider/ProviderRegistry';
import { CredentialsStore } from '../../data/credentials/CredentialsStore';
import { LibraryRepository } from '../../data/library/LibraryRepository';
import { SettingsRepository } from '../../data/settings/SettingsRepository';
import {
  AsyncStorageKeyValueStore,
  type KeyValueStore,
} from '../../data/storage/KeyValueStore';
import { registerProviders } from '../../providers/registerProviders';

export interface AppContainer {
  readonly store: KeyValueStore;
  readonly settings: SettingsRepository;
  readonly library: LibraryRepository;
  readonly credentials: CredentialsStore;
  readonly registry: ProviderRegistry;
  readonly aggregator: AggregatorService;
}

export function createAppContainer(store: KeyValueStore = new AsyncStorageKeyValueStore()): AppContainer {
  const credentials = new CredentialsStore(store);
  return {
    store,
    credentials,
    settings: new SettingsRepository(store),
    library: new LibraryRepository(store),
    registry: registerProviders(credentials),
    aggregator: new AggregatorService(),
  };
}

let container: AppContainer | null = null;

export function getAppContainer(): AppContainer {
  if (!container) {
    container = createAppContainer();
  }
  return container;
}

/** Подмена графа зависимостей — только для тестов. */
export function setAppContainer(next: AppContainer | null): void {
  container = next;
}
