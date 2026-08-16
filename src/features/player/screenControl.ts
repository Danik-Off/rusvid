import NativeScreenControl from '../../specs/NativeScreenControl';

export type OrientationMode = 'auto' | 'landscape' | 'portrait';

/**
 * Обёртка над нативным модулем экрана.
 *
 * Все вызовы безопасны при отсутствии модуля: если он почему-то не попал в
 * сборку, полноэкранный режим деградирует до «кадр на весь экран, поворот —
 * как решит система», а не роняет приложение.
 */
export const screenControl = {
  /** Собрался ли нативный модуль. */
  available: NativeScreenControl !== null,

  setOrientation(mode: OrientationMode): void {
    NativeScreenControl?.setOrientation(mode);
  },

  setImmersive(enabled: boolean): void {
    NativeScreenControl?.setImmersive(enabled);
  },
};
