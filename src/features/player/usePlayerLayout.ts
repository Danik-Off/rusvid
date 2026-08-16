import { MINI_PLAYER_HEIGHT, useTabBarHeight } from '../../ui/layout';
import { spacing } from '../../ui/theme';
import { usePlayerStore } from './playerStore';

/**
 * Сколько места снизу занято чужими элементами: системная навигация,
 * таб-бар и свёрнутый плеер, если он показан.
 *
 * Списки добавляют это к `contentContainerStyle.paddingBottom` — иначе
 * последняя карточка прячется под панелями и по ней нельзя попасть пальцем.
 */
export function useBottomSpace(): number {
  const tabBar = useTabBarHeight();
  const miniVisible = usePlayerStore((state) => state.mode === 'mini');
  return tabBar + (miniVisible ? MINI_PLAYER_HEIGHT : 0) + spacing.md;
}
