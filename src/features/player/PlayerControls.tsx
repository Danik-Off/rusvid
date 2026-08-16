import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatClock } from '../../core/utils/format';
import { Icon, type IconName } from '../../ui/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../ui/theme';
import { clamp, usePlayerStore } from './playerStore';
import { Seekbar } from './Seekbar';
import { useSettingsStore } from '../settings/settingsStore';

/** Через сколько бездействия элементы управления уезжают с кадра. */
const AUTO_HIDE_MS = 3200;

/** Окно, в которое второй тап считается двойным. */
const DOUBLE_TAP_MS = 280;

/** Удержание дольше этого включает ускоренную перемотку «как в YouTube». */
const LONG_PRESS_MS = 400;

const BOOST_RATE = 2;

/** Насколько вертикальный свайп должен быть длиннее горизонтального, чтобы считаться жестом громкости. */
const GESTURE_SLOP = 12;

interface Props {
  /** Полноэкранный режим: меняются отступы и появляется заголовок. */
  readonly fullscreen: boolean;
  /** Свернуть плеер в полоску (стрелка вниз и свайп вниз). */
  readonly onCollapse: () => void;
  /**
   * Переключить полноэкранный режим.
   *
   * Приходит снаружи, а не берётся из стора: вместе с режимом меняются
   * ориентация активности и системные полосы, а этим ведает `useFullscreenMode`.
   */
  readonly onToggleFullscreen: () => void;
  readonly onOpenSettings: () => void;
  readonly accentColor: string;
  readonly title: string;
}

type VerticalGesture = 'none' | 'volume' | 'brightness';

/**
 * Слой управления поверх кадра.
 *
 * Собственный, а не системный `controls` у `react-native-video`: системный
 * рисуется средствами ExoPlayer, поэтому его нельзя ни покрасить в тему
 * приложения, ни дополнить очередью, качеством и жестами, ни синхронизировать
 * со свёрнутым плеером.
 */
export const PlayerControls: React.FC<Props> = ({
  fullscreen,
  onCollapse,
  onToggleFullscreen,
  onOpenSettings,
  accentColor,
  title,
}) => {
  const insets = useSafeAreaInsets();
  const player = usePlayerStore();
  const gesturesEnabled = useSettingsStore((state) => state.settings.playerGestures);
  const seekStep = useSettingsStore((state) => state.settings.seekStepSec);

  const [visible, setVisible] = useState(true);
  const [scrubSec, setScrubSec] = useState<number | null>(null);
  const [precision, setPrecision] = useState<number | null>(null);
  const [boost, setBoost] = useState(false);
  const [seekHint, setSeekHint] = useState<{ side: 'left' | 'right'; amount: number } | null>(null);
  const [gestureHint, setGestureHint] = useState<{ kind: VerticalGesture; value: number } | null>(
    null,
  );

  const fade = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    // На паузе и в конце ролика элементы не прячем: там пользователь как раз
    // и решает, что делать дальше, а пустой кадр ему ничего не подсказывает.
    if (!usePlayerStore.getState().paused && !usePlayerStore.getState().ended) {
      hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    }
  }, []);

  useEffect(() => {
    show();
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [show, player.paused, player.ended]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, fade]);

  // Ширина кадра нужна жестам (левая половина / правая половина), а замыкание
  // `PanResponder` создаётся один раз — поэтому ref, а не state.
  const surfaceWidth = useRef(1);

  const gestureLayer = useTouchLayer({
    enabled: gesturesEnabled,
    // Громкость и затемнение — только в полноэкранном режиме: в обычном
    // вертикальный свайп по кадру уже занят сворачиванием плеера, и два
    // жеста на одном движении гарантированно дрались бы.
    verticalEnabled: gesturesEnabled && fullscreen,
    seekStep,
    surfaceWidth,
    onToggleControls: () => (visible ? setVisible(false) : show()),
    onSeekHint: setSeekHint,
    onGestureHint: setGestureHint,
    onBoost: setBoost,
  });

  /**
   * Заблокированный экран — отдельная ветка, а не `pointerEvents: none` поверх
   * обычной: под блокировкой не должно остаться ни одной активной цели, иначе
   * смысл теряется. Кнопка снятия прячется по тому же таймеру, что и остальное,
   * чтобы кадр оставался чистым.
   */
  if (player.locked) {
    return (
      <View style={styles.fill}>
        <Pressable style={styles.fill} onPress={show} accessibilityLabel="Показать снятие блокировки" />
        <Animated.View pointerEvents={visible ? 'box-none' : 'none'} style={[styles.lockLayer, { opacity: fade }]}>
          <Pressable
            onPress={() => {
              player.setLocked(false);
              show();
            }}
            accessibilityRole="button"
            accessibilityLabel="Снять блокировку"
            style={({ pressed }) => [styles.lockButton, pressed && styles.pressed]}>
            <Icon name="lock" size={22} color={colors.white} />
            <Text style={styles.lockLabel}>Разблокировать</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  const shownSec = scrubSec ?? player.positionSec;
  const remaining = Math.max(0, player.durationSec - shownSec);
  // В полноэкранном режиме нижний ряд обязан обойти системную навигацию,
  // в обычном её просто нет под кадром.
  const bottomPadding = fullscreen ? insets.bottom + spacing.xs : 0;

  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        onLayout={(event) => {
          surfaceWidth.current = Math.max(1, event.nativeEvent.layout.width);
        }}
        {...gestureLayer.panHandlers}
      />

      {/* Программная «яркость»: системную без нативного модуля не тронуть,
          а затемнить кадр в тёмной комнате пользователю нужно всё равно. */}
      {player.dim > 0 ? (
        <View pointerEvents="none" style={[styles.dim, { opacity: player.dim }]} />
      ) : null}

      {player.buffering && !player.ended ? (
        <View pointerEvents="none" style={styles.centered}>
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      ) : null}

      {seekHint ? (
        <View
          pointerEvents="none"
          style={[styles.seekHint, seekHint.side === 'left' ? styles.seekHintLeft : styles.seekHintRight]}>
          <Icon name={seekHint.side === 'left' ? 'rewind' : 'forward'} size={26} color={colors.white} />
          <Text style={styles.seekHintText}>{seekHint.amount} сек</Text>
        </View>
      ) : null}

      {gestureHint ? (
        <View pointerEvents="none" style={styles.gestureHint}>
          <Icon
            name={gestureHint.kind === 'volume' ? volumeIcon(gestureHint.value) : 'brightness'}
            size={20}
            color={colors.white}
          />
          <View style={styles.gestureTrack}>
            <View
              style={[styles.gestureFill, { width: `${Math.round(gestureHint.value * 100)}%` }]}
            />
          </View>
          <Text style={styles.gestureValue}>{Math.round(gestureHint.value * 100)}%</Text>
        </View>
      ) : null}

      {/* Пока идёт перемотка — крупное время по центру кадра и текущая
          точность: смотреть на цифры в углу, ведя палец, невозможно. */}
      {scrubSec !== null ? (
        <View pointerEvents="none" style={styles.scrubPreview}>
          <Text style={styles.scrubTime}>{formatClock(scrubSec)}</Text>
          <Text style={styles.scrubDelta}>
            {formatSignedSeconds(scrubSec - player.positionSec)}
          </Text>
          {precision !== null && precision < 1 ? (
            <Text style={styles.scrubPrecision}>{`точность ×${1 / precision}`}</Text>
          ) : null}
        </View>
      ) : null}

      {boost ? (
        <View pointerEvents="none" style={styles.boost}>
          <Icon name="forward" size={14} color={colors.white} />
          <Text style={styles.boostText}>{BOOST_RATE}× ускорение</Text>
        </View>
      ) : null}

      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={[styles.fill, { opacity: fade }]}>
        <View pointerEvents="none" style={styles.scrimTop} />
        <View pointerEvents="none" style={styles.scrimBottom} />

        <View style={[styles.topBar, { paddingTop: fullscreen ? insets.top + spacing.xs : spacing.xs }]}>
          <ControlButton
            icon="chevronDown"
            label={fullscreen ? 'Выйти из полноэкранного режима' : 'Свернуть плеер'}
            onPress={onCollapse}
          />
          {fullscreen ? (
            <Text style={styles.topTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <View style={styles.flexSpacer} />
          )}
          {player.sleepTimer.kind !== 'off' ? (
            <View style={styles.badge}>
              <Icon name="timer" size={12} color={colors.white} />
            </View>
          ) : null}
          {player.rate !== 1 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{String(player.rate).replace('.', ',')}×</Text>
            </View>
          ) : null}
          {/* Блокировка только в полноэкранном режиме: в обычном под кадром
              и так есть описание и очередь, и «мёртвый» экран сбивал бы с толку. */}
          {fullscreen ? (
            <ControlButton
              icon="lockOpen"
              label="Заблокировать управление"
              size={20}
              onPress={() => player.setLocked(true)}
            />
          ) : null}
          <ControlButton icon="more" label="Настройки плеера" onPress={onOpenSettings} />
        </View>

        <View style={styles.centerRow} pointerEvents="box-none">
          <ControlButton
            icon="skipPrevious"
            label="Предыдущее видео"
            size={26}
            disabled={player.queueIndex <= 0 && player.positionSec <= 5}
            onPress={player.playPrevious}
          />
          <ControlButton
            icon="rewind"
            label={`Назад на ${seekStep} секунд`}
            size={26}
            onPress={() => player.seekBy(-seekStep)}
          />
          <Pressable
            onPress={player.togglePlay}
            accessibilityRole="button"
            accessibilityLabel={player.paused ? 'Воспроизвести' : 'Пауза'}
            style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
            <Icon
              name={player.ended ? 'refresh' : player.paused ? 'playFilled' : 'pause'}
              size={30}
              color={colors.white}
            />
          </Pressable>
          <ControlButton
            icon="forward"
            label={`Вперёд на ${seekStep} секунд`}
            size={26}
            onPress={() => player.seekBy(seekStep)}
          />
          <ControlButton
            icon="skipNext"
            label="Следующее видео"
            size={26}
            disabled={player.queueIndex >= player.queue.length - 1}
            onPress={player.playNext}
          />
        </View>

        <View style={[styles.bottomBar, { paddingBottom: bottomPadding }]}>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatClock(shownSec)}</Text>
            <Text style={styles.timeMuted}>{` / ${formatClock(player.durationSec)}`}</Text>
            <View style={styles.flexSpacer} />
            <Text style={styles.timeMuted}>{`−${formatClock(remaining)}`}</Text>
            <ControlButton
              icon={player.muted ? 'volumeOff' : 'volume'}
              label={player.muted ? 'Включить звук' : 'Выключить звук'}
              size={18}
              onPress={() => player.setMuted(!player.muted)}
            />
            <ControlButton
              icon={fullscreen ? 'fullscreenExit' : 'fullscreen'}
              label={fullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
              size={20}
              onPress={onToggleFullscreen}
            />
          </View>
          <Seekbar
            positionSec={player.positionSec}
            durationSec={player.durationSec}
            bufferedSec={player.bufferedSec}
            accentColor={accentColor}
            onScrub={setScrubSec}
            onPrecisionChange={setPrecision}
            onSeek={(sec) => {
              player.seekTo(sec);
              show();
            }}
          />
        </View>
      </Animated.View>

      {player.pendingNext ? <UpNextCard /> : null}
    </View>
  );
};

/** Карточка «следующее видео через N» — её отсчёт можно остановить. */
const UpNextCard: React.FC = () => {
  const pendingNext = usePlayerStore((state) => state.pendingNext);
  const playNext = usePlayerStore((state) => state.playNext);
  const cancelPendingNext = usePlayerStore((state) => state.cancelPendingNext);
  const [left, setLeft] = useState(5);

  useEffect(() => {
    if (!pendingNext) {
      return;
    }
    setLeft(5);
    const timer = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          clearInterval(timer);
          playNext();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pendingNext, playNext]);

  if (!pendingNext) {
    return null;
  }

  return (
    <View style={styles.upNext}>
      <Text style={styles.upNextLabel}>{`Далее через ${left}…`}</Text>
      <Text style={styles.upNextTitle} numberOfLines={2}>
        {pendingNext.title}
      </Text>
      <View style={styles.upNextActions}>
        <Pressable onPress={cancelPendingNext} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.upNextCancel}>Отмена</Text>
        </Pressable>
        <Pressable onPress={playNext} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.upNextPlay}>Смотреть</Text>
        </Pressable>
      </View>
    </View>
  );
};

const ControlButton: React.FC<{
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly size?: number;
  readonly disabled?: boolean;
}> = ({ icon, label, onPress, size = 22, disabled = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    style={({ pressed }) => [styles.controlButton, pressed && styles.pressed, disabled && styles.disabled]}>
    <Icon name={icon} size={size} color={colors.white} />
  </Pressable>
);

interface TouchLayerOptions {
  readonly enabled: boolean;
  readonly verticalEnabled: boolean;
  readonly seekStep: number;
  readonly surfaceWidth: React.MutableRefObject<number>;
  readonly onToggleControls: () => void;
  readonly onSeekHint: (hint: { side: 'left' | 'right'; amount: number } | null) => void;
  readonly onGestureHint: (hint: { kind: VerticalGesture; value: number } | null) => void;
  readonly onBoost: (active: boolean) => void;
}

/**
 * Жесты на кадре: одиночный тап, двойной тап (перемотка), удержание
 * (ускорение) и вертикальные свайпы (громкость справа, затемнение слева).
 *
 * Всё на одном `PanResponder`: разные распознаватели на вложенных `Pressable`
 * дрались бы за жест, и на практике двойной тап регулярно проглатывался бы
 * одиночным.
 */
function useTouchLayer({
  enabled,
  verticalEnabled,
  seekStep,
  surfaceWidth,
  onToggleControls,
  onSeekHint,
  onGestureHint,
  onBoost,
}: TouchLayerOptions) {
  const state = useRef({
    startX: 0,
    startY: 0,
    lastTapAt: 0,
    lastTapSide: 'left' as 'left' | 'right',
    streak: 0,
    vertical: 'none' as VerticalGesture,
    startValue: 0,
    boosted: false,
    rateBeforeBoost: 1,
  }).current;

  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = useRef<TouchLayerOptions>({
    enabled,
    verticalEnabled,
    seekStep,
    surfaceWidth,
    onToggleControls,
    onSeekHint,
    onGestureHint,
    onBoost,
  });
  options.current = {
    enabled,
    verticalEnabled,
    seekStep,
    surfaceWidth,
    onToggleControls,
    onSeekHint,
    onGestureHint,
    onBoost,
  };

  useEffect(
    () => () => {
      [singleTapTimer, longPressTimer, hintTimer].forEach((timer) => {
        if (timer.current) {
          clearTimeout(timer.current);
        }
      });
    },
    [],
  );

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          options.current.verticalEnabled && Math.abs(gesture.dy) > GESTURE_SLOP,
        onPanResponderGrant: (event) => {
          state.startX = event.nativeEvent.locationX;
          state.startY = event.nativeEvent.locationY;
          state.vertical = 'none';
          state.boosted = false;

          if (!options.current.enabled) {
            return;
          }
          longPressTimer.current = setTimeout(() => {
            const player = usePlayerStore.getState();
            if (player.paused) {
              return;
            }
            state.boosted = true;
            state.rateBeforeBoost = player.rate;
            player.setRate(BOOST_RATE);
            options.current.onBoost(true);
          }, LONG_PRESS_MS);
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6) {
            clearTimer(longPressTimer);
          }
          if (!options.current.verticalEnabled) {
            return;
          }
          if (state.vertical === 'none') {
            if (Math.abs(gesture.dy) < GESTURE_SLOP || Math.abs(gesture.dy) < Math.abs(gesture.dx)) {
              return;
            }
            const player = usePlayerStore.getState();
            // Правая половина кадра — громкость, левая — затемнение:
            // раскладка совпадает с привычной по мобильным плеерам.
            state.vertical =
              state.startX > options.current.surfaceWidth.current / 2 ? 'volume' : 'brightness';
            state.startValue = state.vertical === 'volume' ? player.volume : 1 - player.dim;
          }
          // 220 логических точек по вертикали = весь диапазон: меньше — слишком
          // резко, больше — до края экрана не хватает хода.
          const delta = -gesture.dy / 220;
          const value = clamp(state.startValue + delta, 0, 1);
          const player = usePlayerStore.getState();
          if (state.vertical === 'volume') {
            player.setVolume(value);
          } else {
            player.setDim(1 - value);
          }
          options.current.onGestureHint({ kind: state.vertical, value });
        },
        onPanResponderRelease: (event, gesture) => {
          clearTimer(longPressTimer);

          if (state.boosted) {
            usePlayerStore.getState().setRate(state.rateBeforeBoost);
            options.current.onBoost(false);
            return;
          }
          if (state.vertical !== 'none') {
            state.vertical = 'none';
            clearTimer(hintTimer);
            hintTimer.current = setTimeout(() => options.current.onGestureHint(null), 700);
            return;
          }
          const moved = Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10;
          if (moved) {
            return;
          }

          const x = event.nativeEvent.locationX;
          const side: 'left' | 'right' = x > options.current.surfaceWidth.current / 2 ? 'right' : 'left';
          const now = Date.now();
          const isDouble =
            options.current.enabled &&
            now - state.lastTapAt < DOUBLE_TAP_MS &&
            side === state.lastTapSide;

          if (isDouble) {
            clearTimer(singleTapTimer);
            // Серия тапов копится: три тапа подряд — 30 секунд, как в YouTube.
            state.streak += 1;
            const amount = options.current.seekStep * state.streak;
            usePlayerStore
              .getState()
              .seekBy(side === 'left' ? -options.current.seekStep : options.current.seekStep);
            options.current.onSeekHint({ side, amount });
            clearTimer(hintTimer);
            hintTimer.current = setTimeout(() => {
              options.current.onSeekHint(null);
              state.streak = 0;
            }, 650);
          } else {
            state.streak = 0;
            clearTimer(singleTapTimer);
            // Одиночный тап откладывается: иначе он успевал бы переключить
            // панель до того, как палец коснётся экрана второй раз.
            singleTapTimer.current = setTimeout(
              () => options.current.onToggleControls(),
              options.current.enabled ? DOUBLE_TAP_MS : 0,
            );
          }
          state.lastTapAt = now;
          state.lastTapSide = side;
        },
        onPanResponderTerminate: () => {
          clearTimer(longPressTimer);
          if (state.boosted) {
            usePlayerStore.getState().setRate(state.rateBeforeBoost);
            options.current.onBoost(false);
            state.boosted = false;
          }
        },
      }),
    [state],
  );
}

function clearTimer(ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>): void {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

function volumeIcon(value: number): IconName {
  return value <= 0.01 ? 'volumeOff' : 'volume';
}

/** «+1:20» / «−0:45» — насколько перемотка сместит позицию от текущей. */
export function formatSignedSeconds(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return '±0:00';
  }
  return `${rounded > 0 ? '+' : '−'}${formatClock(Math.abs(rounded))}`;
}

const styles = StyleSheet.create({
  fill: {
    ...absoluteFill,
  },
  dim: {
    ...absoluteFill,
    backgroundColor: colors.black,
  },
  lockLayer: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lockLabel: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  centered: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 88,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 96,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  topTitle: {
    ...typography.subtitle,
    color: colors.white,
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  flexSpacer: {
    flex: 1,
  },
  centerRow: {
    ...absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  playButton: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButton: {
    padding: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.3,
  },
  bottomBar: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: 0,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  time: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  timeMuted: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    ...typography.badge,
    color: colors.white,
  },
  seekHint: {
    position: 'absolute',
    top: '50%',
    marginTop: -34,
    width: 96,
    height: 68,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  seekHintLeft: {
    left: '8%',
  },
  seekHintRight: {
    right: '8%',
  },
  seekHintText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  gestureHint: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  gestureTrack: {
    width: 96,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  gestureFill: {
    height: 4,
    backgroundColor: colors.white,
  },
  gestureValue: {
    ...typography.caption,
    color: colors.white,
    minWidth: 36,
    textAlign: 'right',
  },
  scrubPreview: {
    position: 'absolute',
    alignSelf: 'center',
    top: '32%',
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  scrubTime: {
    ...typography.title,
    color: colors.white,
    fontVariant: ['tabular-nums'],
  },
  scrubDelta: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
    fontVariant: ['tabular-nums'],
  },
  scrubPrecision: {
    ...typography.badge,
    color: colors.accent,
    letterSpacing: 0.4,
  },
  boost: {
    position: 'absolute',
    alignSelf: 'center',
    top: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  boostText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  upNext: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.xl,
    maxWidth: 260,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  upNextLabel: {
    ...typography.overline,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  upNextTitle: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  upNextActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  upNextCancel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
  },
  upNextPlay: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
  },
});
