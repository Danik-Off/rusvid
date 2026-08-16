/**
 * Размеры «системных» полос интерфейса в одном месте.
 *
 * Раньше высота таб-бара была прописана числом прямо в `RootNavigator`, и это
 * ломало edge-to-edge: с `edgeToEdgeEnabled=true` приложение рисуется под
 * системной навигацией, а фиксированная высота отменяла отступ, который
 * react-navigation берёт из safe-area. На телефонах с тремя клавишами
 * («назад / домой / меню») таб-бар уезжал прямо под них.
 *
 * Правило простое: ни одна панель не задаёт высоту числом — только
 * «база + системный inset».
 */

import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Высота таб-бара без учёта системной навигации. */
export const TAB_BAR_BASE_HEIGHT = 58;

/** Высота свёрнутого плеера — полоски, которая живёт над таб-баром. */
export const MINI_PLAYER_HEIGHT = 64;

/** Ширина превью в свёрнутом плеере: те же 16:9, что и у развёрнутого. */
export const MINI_PLAYER_VIDEO_WIDTH = Math.round((MINI_PLAYER_HEIGHT * 16) / 9);

/** Высота таб-бара вместе с системной навигацией. */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_BASE_HEIGHT + insets.bottom;
}
