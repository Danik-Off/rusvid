import type { KeyValueStore } from '../storage/KeyValueStore';
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from './AppSettings';

const SETTINGS_KEY = 'settings/v1';

export class SettingsRepository {
  constructor(private readonly store: KeyValueStore) {}

  async load(): Promise<AppSettings> {
    const raw = await this.store.read<Partial<AppSettings> | null>(SETTINGS_KEY, null);
    return normalizeSettings(raw);
  }

  async save(settings: AppSettings): Promise<void> {
    await this.store.write(SETTINGS_KEY, settings);
  }

  async reset(): Promise<AppSettings> {
    await this.store.write(SETTINGS_KEY, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
}
