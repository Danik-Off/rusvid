import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { ProviderId } from '../../core/model/media';

/**
 * Плеера здесь намеренно нет.
 *
 * Он живёт оверлеем над навигатором (`PlayerOverlay`), потому что экран стека
 * размонтируется при переходе «назад»: воспроизведение обрывалось бы, а
 * свернуть плеер и продолжить листать ленту было бы невозможно. Открывается
 * плеер через `usePlayerStore().open(video, queue)`.
 */
export type RootStackParamList = {
  /** Вложенные табы: позволяет открыть конкретную вкладку из любого экрана. */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** Экран входа универсален: платформа определяется параметром. */
  Auth: { providerId: ProviderId };
  Diagnostics: undefined;
  /** Условия использования и отказ от ответственности — из настроек. */
  Legal: undefined;
};

export type TabParamList = {
  Feed: undefined;
  Search: undefined;
  Library: undefined;
  Settings: undefined;
};

export type AuthScreenProps = NativeStackScreenProps<RootStackParamList, 'Auth'>;
