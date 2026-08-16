import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProviderMeta } from '../../app/container/providerMeta';
import { Icon } from '../../ui/components/Icon';
import { MINI_PLAYER_HEIGHT, MINI_PLAYER_VIDEO_WIDTH, useTabBarHeight } from '../../ui/layout';
import { absoluteFill, colors, spacing, typography } from '../../ui/theme';
import { useLibraryStore } from '../library/libraryStore';
import { PlayerControls } from './PlayerControls';
import { PlayerDetails } from './PlayerDetails';
import { PlayerSettingsSheet } from './PlayerSettingsSheet';
import { PlayerSurface } from './PlayerSurface';
import { clamp, getVideoRef, usePlayerStore } from './playerStore';
import { useFullscreenMode } from './useFullscreenMode';
import { usePlayback } from './usePlayback';

/** Смещение, после которого палец точно «тянет», а не промахнулся по кнопке. */
const DRAG_SLOP = 14;

/** Доля высоты, после которой отпущенный плеер сворачивается, а не возвращается. */
const COLLAPSE_RATIO = 0.28;

/**
 * Единственный плеер приложения — поверх навигатора, а не внутри него.
 *
 * Это принципиально: экран стека размонтируется на «назад», обрывая звук и
 * теряя позицию. Здесь же `<Video>` смонтирован ровно один раз на весь сеанс,
 * а режимы (`mini` / `full` / `fullscreen`) — это анимация геометрии одного и
 * того же поддерева.
 */
export const PlayerOverlay: React.FC = () => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();

  const mode = usePlayerStore((state) => state.mode);
  const current = usePlayerStore((state) => state.current);
  const setMode = usePlayerStore((state) => state.setMode);
  const close = usePlayerStore((state) => state.close);

  const playback = usePlayback(current);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const videoHeight = Math.round((width * 9) / 16);
  const collapsedTop = height - tabBarHeight - MINI_PLAYER_HEIGHT;
  const fullscreen = mode === 'fullscreen';
  const visible = mode !== 'hidden' && current !== null;

  const progress = useRef(new Animated.Value(1)).current;
  const dismissX = useRef(new Animated.Value(0)).current;
  // Замыкания PanResponder создаются один раз — актуальную геометрию читаем из ref.
  const geometry = useRef({ collapsedTop, width });
  geometry.current = { collapsedTop, width };

  const settle = useCallback(
    (expanded: boolean) => {
      setMode(expanded ? 'full' : 'mini');
      Animated.spring(progress, {
        toValue: expanded ? 1 : 0,
        useNativeDriver: false,
        bounciness: 0,
        speed: 14,
      }).start();
    },
    [progress, setMode],
  );

  useEffect(() => {
    if (mode === 'hidden') {
      return;
    }
    Animated.spring(progress, {
      toValue: mode === 'mini' ? 0 : 1,
      useNativeDriver: false,
      bounciness: 0,
      speed: 14,
    }).start();
    dismissX.setValue(0);
  }, [mode, progress, dismissX]);

  // Полноэкранный режим — отдельный автомат: ориентация активности, системные
  // полосы и правила автоповорота. См. useFullscreenMode.
  const fullscreenMode = useFullscreenMode({ mode, setMode, width, height, active: visible });

  // Уход в фон и убийство приложения из недавних — самые частые способы
  // закончить просмотр, поэтому позицию дожимаем на диск именно здесь.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        const player = usePlayerStore.getState();
        if (player.current) {
          void useLibraryStore.getState().noteProgress(player.current, player.positionSec, true);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // Аппаратная «назад»: полноэкранный → обычный → свёрнутый. Из свёрнутого
  // событие не перехватываем — оно должно достаться навигации.
  useEffect(() => {
    if (!visible) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const state = usePlayerStore.getState();
      // Заблокированный экран «назад» не выключает — иначе блокировка
      // не защищала бы от главного источника случайных нажатий.
      if (state.locked) {
        state.setLocked(false);
        return true;
      }
      if (state.mode === 'fullscreen') {
        fullscreenMode.exit();
        return true;
      }
      if (state.mode === 'full') {
        settle(false);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [visible, settle, fullscreenMode]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Capture: жест надо забрать у слоя управления, который лежит выше
        // и уже держит касание. Полоса перемотки при этом не отпускает
        // касание сама (`onPanResponderTerminationRequest: false`).
        onMoveShouldSetPanResponderCapture: (_event, gesture) => {
          const state = usePlayerStore.getState();
          if (state.mode === 'fullscreen') {
            return false;
          }
          if (state.mode === 'mini') {
            return Math.abs(gesture.dx) > DRAG_SLOP || Math.abs(gesture.dy) > DRAG_SLOP;
          }
          return (
            Math.abs(gesture.dy) > DRAG_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4
          );
        },
        onPanResponderMove: (_event, gesture) => {
          const { collapsedTop: travel } = geometry.current;
          if (usePlayerStore.getState().mode === 'mini') {
            if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
              dismissX.setValue(gesture.dx);
              return;
            }
            progress.setValue(clamp(-gesture.dy / travel, 0, 1));
            return;
          }
          progress.setValue(clamp(1 - gesture.dy / travel, 0, 1));
        },
        onPanResponderRelease: (_event, gesture) => {
          const { collapsedTop: travel, width: screenWidth } = geometry.current;
          const state = usePlayerStore.getState();

          if (state.mode === 'mini' && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
            const dismissed = Math.abs(gesture.dx) > screenWidth * 0.3 || Math.abs(gesture.vx) > 0.6;
            if (dismissed) {
              Animated.timing(dismissX, {
                toValue: Math.sign(gesture.dx) * screenWidth,
                duration: 160,
                useNativeDriver: false,
              }).start(() => usePlayerStore.getState().close());
              return;
            }
            Animated.spring(dismissX, { toValue: 0, useNativeDriver: false }).start();
            return;
          }

          const dragged = state.mode === 'mini' ? -gesture.dy : gesture.dy;
          const ratio = dragged / travel;
          // Быстрый флик важнее пройденного расстояния: короткий резкий свайп
          // вниз должен сворачивать, даже если палец прошёл десятую часть.
          if (Math.abs(gesture.vy) > 0.55) {
            settle(gesture.vy < 0);
            return;
          }
          settle(state.mode === 'mini' ? ratio > COLLAPSE_RATIO : ratio < COLLAPSE_RATIO);
        },
      }),
    [dismissX, progress, settle],
  );

  if (!visible || !current) {
    return null;
  }

  const provider = getProviderMeta(current.providerId);
  const clampRange = { extrapolate: 'clamp' as const };
  const miniOpacity = progress.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0], ...clampRange });
  const detailsOpacity = progress.interpolate({
    inputRange: [0.45, 1],
    outputRange: [0, 1],
    ...clampRange,
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <StatusBar hidden={fullscreen} barStyle="light-content" />
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [collapsedTop, 0],
                  ...clampRange,
                }),
              },
              { translateX: dismissX },
            ],
          },
        ]}
        pointerEvents="box-none">
        <Animated.View
          pointerEvents="none"
          style={[styles.background, { opacity: progress }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.miniBackground, { opacity: miniOpacity }]}
        />

        <Animated.View
          style={[
            styles.videoBox,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [MINI_PLAYER_VIDEO_WIDTH, width],
                ...clampRange,
              }),
              height: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [MINI_PLAYER_HEIGHT, videoHeight],
                ...clampRange,
              }),
              marginTop: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, insets.top],
                ...clampRange,
              }),
            },
            // Полноэкранный режим — та же ветка дерева, только с другой
            // геометрией: отдельный рендер размонтировал бы `<Video>` и
            // перезапустил поток с нуля посреди просмотра.
            fullscreen && styles.videoBoxFullscreen,
            fullscreen && { width, height },
          ]}
          {...pan.panHandlers}>
          {renderSurface(playback, provider.title)}
          {mode !== 'mini' && playback.status === 'ready' && !playback.isEmbed ? (
            <PlayerControls
              fullscreen={fullscreen}
              title={current.title}
              accentColor={provider.accentColor}
              onCollapse={() => (fullscreen ? fullscreenMode.exit() : settle(false))}
              onToggleFullscreen={fullscreenMode.toggle}
              onOpenSettings={() => setSettingsVisible(true)}
            />
          ) : null}
          {/* У встроенного плеера платформы свои элементы управления внутри
              WebView, поэтому свои мы не рисуем — но выход наружу дать обязаны:
              жест по WebView до нас не всегда доходит. */}
          {mode === 'full' && playback.isEmbed ? (
            <View style={styles.embedBar}>
              <Pressable
                onPress={() => settle(false)}
                hitSlop={10}
                style={styles.embedButton}
                accessibilityRole="button"
                accessibilityLabel="Свернуть плеер">
                <Icon name="chevronDown" size={22} color={colors.white} />
              </Pressable>
              <Text style={styles.embedLabel} numberOfLines={1}>
                {`Плеер ${provider.title}`}
              </Text>
            </View>
          ) : null}
          {mode === 'mini' ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => settle(true)}
              accessibilityRole="button"
              accessibilityLabel="Развернуть плеер"
            />
          ) : null}
        </Animated.View>

        {/* Те же жесты, что и на кадре: свёрнутый плеер должен разворачиваться
            и закрываться свайпом по всей полоске, а не только по превью. */}
        <Animated.View
          style={[styles.miniRow, { opacity: miniOpacity }]}
          pointerEvents={mode === 'mini' ? 'auto' : 'none'}
          {...pan.panHandlers}>
          <Pressable style={styles.miniText} onPress={() => settle(true)} accessibilityRole="button">
            <Text style={styles.miniTitle} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={styles.miniSubtitle} numberOfLines={1}>
              {current.author?.name ?? provider.title}
            </Text>
          </Pressable>
          <MiniPlayPause />
          <Pressable
            onPress={close}
            hitSlop={10}
            style={styles.miniButton}
            accessibilityRole="button"
            accessibilityLabel="Закрыть плеер">
            <Icon name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[styles.details, { opacity: detailsOpacity }]}
          pointerEvents={mode === 'full' ? 'auto' : 'none'}>
          <PlayerDetails
            video={current}
            bottomSpace={insets.bottom}
            onOpenSettings={() => setSettingsVisible(true)}
          />
        </Animated.View>
      </Animated.View>

      <PlayerSettingsSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onPictureInPicture={enterPictureInPicture}
      />
    </View>
  );
};

/** Кнопка play/pause свёрнутого плеера — единственный элемент управления в полоске. */
const MiniPlayPause: React.FC = () => {
  const paused = usePlayerStore((state) => state.paused);
  const ended = usePlayerStore((state) => state.ended);
  const togglePlay = usePlayerStore((state) => state.togglePlay);

  return (
    <Pressable
      onPress={togglePlay}
      hitSlop={10}
      style={styles.miniButton}
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Воспроизвести' : 'Пауза'}>
      <Icon
        name={ended ? 'refresh' : paused ? 'playFilled' : 'pause'}
        size={22}
        color={colors.textPrimary}
      />
    </Pressable>
  );
};

function enterPictureInPicture(): void {
  getVideoRef()?.enterPictureInPicture();
}

function renderSurface(
  playback: ReturnType<typeof usePlayback>,
  providerTitle: string,
): React.ReactNode {
  if (playback.status === 'resolving' || playback.status === 'idle') {
    return (
      <View style={styles.message}>
        <ActivityIndicator color={colors.white} />
        <Text style={styles.messageText}>Получаем ссылку на видео…</Text>
      </View>
    );
  }
  if (playback.status === 'error' || !playback.source) {
    /**
     * Компактное сообщение вместо общего `ErrorView`: кадр — это полоса 16:9,
     * а `ErrorView` рассчитан на пустой экран, и его иконка с отступами
     * в неё просто не помещается.
     */
    return (
      <View style={styles.message}>
        <Icon name="alert" size={22} color={colors.danger} />
        <Text style={styles.messageText} numberOfLines={3}>
          {playback.error ?? 'Не удалось загрузить видео'}
        </Text>
        <View style={styles.messageActions}>
          <Pressable onPress={playback.retry} hitSlop={8} accessibilityRole="button">
            <Text style={styles.messageAction}>Повторить</Text>
          </Pressable>
          {playback.canUseEmbed ? (
            <Pressable onPress={playback.useEmbed} hitSlop={8} accessibilityRole="button">
              <Text style={styles.messageAction}>{`Плеер ${providerTitle}`}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
  return <PlayerSurface source={playback.source} onFailure={playback.reportPlaybackFailure} />;
}

const styles = StyleSheet.create({
  sheet: {
    ...absoluteFill,
  },
  background: {
    ...absoluteFill,
    backgroundColor: colors.background,
  },
  miniBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: MINI_PLAYER_HEIGHT,
    backgroundColor: colors.surfaceSunken,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  videoBox: {
    backgroundColor: colors.black,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoBoxFullscreen: {
    marginTop: 0,
  },
  miniRow: {
    position: 'absolute',
    top: 0,
    left: MINI_PLAYER_VIDEO_WIDTH,
    right: 0,
    height: MINI_PLAYER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  miniText: {
    flex: 1,
    gap: spacing.xxs,
    paddingRight: spacing.xs,
  },
  miniTitle: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  miniSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  miniButton: {
    padding: spacing.sm,
  },
  details: {
    flex: 1,
  },
  embedBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  embedButton: {
    padding: spacing.xs,
  },
  embedLabel: {
    ...typography.caption,
    color: colors.white,
    flex: 1,
  },
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  messageText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  messageActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  messageAction: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
  },
});
