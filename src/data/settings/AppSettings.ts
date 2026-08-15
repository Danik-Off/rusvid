import { PROVIDER_IDS, type ProviderId } from '../../core/model/media';

export interface AppSettings {
  /** Какие платформы участвуют в агрегации. Порядок не важен. */
  readonly enabledProviders: readonly ProviderId[];
  /** Писать ли историю просмотров. */
  readonly historyEnabled: boolean;
  /**
   * Пытаться ли играть нативно там, где платформа отдаёт прямой поток.
   * Выключение принудительно отправляет всё в веб-плеер платформы —
   * полезно, если у устройства проблемы с ExoPlayer/кодеками.
   */
  readonly preferNativePlayer: boolean;
  /** Максимум записей в истории просмотров. */
  readonly historyLimit: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  enabledProviders: [...PROVIDER_IDS],
  historyEnabled: true,
  preferNativePlayer: true,
  historyLimit: 200,
};

/**
 * Приводит прочитанные с диска настройки к валидному виду.
 * Нужен, потому что структура настроек меняется между версиями приложения,
 * а на диске лежит то, что записала предыдущая версия.
 */
export function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  if (!raw) {
    return DEFAULT_SETTINGS;
  }
  const known = new Set<string>(PROVIDER_IDS);
  const enabled = Array.isArray(raw.enabledProviders)
    ? raw.enabledProviders.filter((id): id is ProviderId => known.has(id))
    : DEFAULT_SETTINGS.enabledProviders;

  return {
    // Пустой список означал бы «нигде ничего не искать» — считаем это сбоем.
    enabledProviders: enabled.length > 0 ? enabled : DEFAULT_SETTINGS.enabledProviders,
    historyEnabled: raw.historyEnabled ?? DEFAULT_SETTINGS.historyEnabled,
    preferNativePlayer: raw.preferNativePlayer ?? DEFAULT_SETTINGS.preferNativePlayer,
    historyLimit:
      typeof raw.historyLimit === 'number' && raw.historyLimit > 0
        ? Math.min(raw.historyLimit, 1000)
        : DEFAULT_SETTINGS.historyLimit,
  };
}
