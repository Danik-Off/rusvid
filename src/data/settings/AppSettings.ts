import { PROVIDER_IDS, type ProviderId } from '../../core/model/media';

/** Предпочитаемое качество: `auto` или максимальная высота кадра в пикселях. */
export type QualityPreference = 'auto' | 480 | 720 | 1080;

export const QUALITY_PREFERENCES: readonly QualityPreference[] = ['auto', 480, 720, 1080];

/** Допустимые скорости воспроизведения — те же, что у больших плееров. */
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

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

  /** Продолжать с позиции, на которой видео закрыли в прошлый раз. */
  readonly resumePlayback: boolean;
  /** Запускать следующее видео из очереди, когда текущее закончилось. */
  readonly autoplayNext: boolean;
  /** Не глушить звук, когда приложение уходит в фон (аудиорежим). */
  readonly backgroundPlayback: boolean;
  /** Сворачиваться в системную «картинку в картинке» при выходе из приложения. */
  readonly pictureInPicture: boolean;
  /** Жесты на кадре: двойной тап — перемотка, вертикальный свайп — звук и яркость. */
  readonly playerGestures: boolean;
  /** На сколько секунд перематывает двойной тап и кнопки перемотки. */
  readonly seekStepSec: number;
  /** Скорость, с которой стартует каждое новое видео. */
  readonly defaultRate: number;
  /** Потолок качества: экономит трафик и помогает на слабой сети. */
  readonly preferredQuality: QualityPreference;
}

export const DEFAULT_SETTINGS: AppSettings = {
  enabledProviders: [...PROVIDER_IDS],
  historyEnabled: true,
  preferNativePlayer: true,
  historyLimit: 200,

  resumePlayback: true,
  autoplayNext: true,
  // Фоновое воспроизведение по умолчанию выключено: оно держит foreground-сервис
  // и уведомление, а большинство открывает приложение ради картинки, не звука.
  backgroundPlayback: false,
  pictureInPicture: true,
  playerGestures: true,
  seekStepSec: 10,
  defaultRate: 1,
  preferredQuality: 'auto',
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

    resumePlayback: raw.resumePlayback ?? DEFAULT_SETTINGS.resumePlayback,
    autoplayNext: raw.autoplayNext ?? DEFAULT_SETTINGS.autoplayNext,
    backgroundPlayback: raw.backgroundPlayback ?? DEFAULT_SETTINGS.backgroundPlayback,
    pictureInPicture: raw.pictureInPicture ?? DEFAULT_SETTINGS.pictureInPicture,
    playerGestures: raw.playerGestures ?? DEFAULT_SETTINGS.playerGestures,
    seekStepSec: pickFrom([5, 10, 15, 30], raw.seekStepSec, DEFAULT_SETTINGS.seekStepSec),
    defaultRate: pickFrom(PLAYBACK_RATES, raw.defaultRate, DEFAULT_SETTINGS.defaultRate),
    preferredQuality: QUALITY_PREFERENCES.includes(raw.preferredQuality as QualityPreference)
      ? (raw.preferredQuality as QualityPreference)
      : DEFAULT_SETTINGS.preferredQuality,
  };
}

/**
 * Значение из белого списка или запасное.
 *
 * Числовые настройки плеера идут прямо в ExoPlayer (скорость) и в жесты
 * (шаг перемотки), поэтому мусор с диска здесь опаснее, чем в булевых полях:
 * `rate: 0` намертво остановил бы воспроизведение без единой ошибки.
 */
function pickFrom(allowed: readonly number[], value: unknown, fallback: number): number {
  return typeof value === 'number' && allowed.includes(value) ? value : fallback;
}
