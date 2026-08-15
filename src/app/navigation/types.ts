import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { ProviderId, VideoSummary } from '../../core/model/media';

export type RootStackParamList = {
  /** Вложенные табы: позволяет открыть конкретную вкладку из любого экрана. */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /**
   * Карточка передаётся целиком, а не по id: список уже знает заголовок и
   * превью, поэтому плеер открывается без пустого экрана-заглушки, пока
   * подгружаются детали.
   */
  Player: { video: VideoSummary };
  /** Экран входа универсален: платформа определяется параметром. */
  Auth: { providerId: ProviderId };
  Diagnostics: undefined;
};

export type TabParamList = {
  Feed: undefined;
  Search: undefined;
  Library: undefined;
  Settings: undefined;
};

export type PlayerScreenProps = NativeStackScreenProps<RootStackParamList, 'Player'>;
export type AuthScreenProps = NativeStackScreenProps<RootStackParamList, 'Auth'>;
