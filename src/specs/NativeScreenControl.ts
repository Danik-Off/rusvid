/**
 * Управление ориентацией экрана и системными полосами.
 *
 * Своя нативная спецификация, потому что в React Native таких API нет
 * вообще: `StatusBar` умеет спрятать только статус-бар, а ни повернуть
 * активность, ни убрать панель навигации из JS нельзя. Без этого
 * «полноэкранный режим» оставался бы вертикальным окном с чёрными полями
 * сверху и снизу и клавишами навигации поверх кадра.
 *
 * Кодогенерация собирает из этого файла абстрактный класс
 * `NativeScreenControlSpec` (см. `codegenConfig` в package.json), который
 * реализует `android/app/src/main/java/com/rusvid/screen/ScreenControlModule.kt`.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Ориентация активности.
   * - `landscape` — обе альбомные стороны, экран следует за поворотом;
   * - `portrait`  — жёстко книжная;
   * - `auto`      — как решит система (значение по умолчанию для приложения).
   */
  setOrientation(mode: string): void;

  /**
   * Скрыть статус-бар и панель навигации (Android immersive sticky).
   * Полосы возвращаются свайпом от края и снова прячутся сами.
   */
  setImmersive(enabled: boolean): void;
}

/**
 * `get`, а не `getEnforcing`: если модуль почему-то не собрался, приложение
 * должно остаться рабочим — плеер просто вернётся к прежнему поведению
 * «развернуться на весь экран и следовать системному повороту».
 */
export default TurboModuleRegistry.get<Spec>('ScreenControl');
